"""Amplex CRM Backend — FastAPI application entry point."""

import hmac as _hmac
import json
import logging
import os
import time
import uuid
from collections import defaultdict

from fastapi import Depends, FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import Base, engine, get_db
from app.routers import (
    attachments,
    auth_routes,
    config,
    contacts,
    custom_fields,
    dashboard,
    export,
    hub_users,
    integrations,
    interactions,
    leads,
    lost_reasons,
    notifications,
    orgs,
    permissions,
    pipeline,
    sources,
    stages,
    tags,
    users,
)

# ── Structured JSON logging ─────────────────────────────────


class _JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "ts": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry, ensure_ascii=False)


_handler = logging.StreamHandler()
_handler.setFormatter(_JSONFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_handler])
logger = logging.getLogger("amplex")


# ── Environment validation ───────────────────────────────────

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

if ENVIRONMENT == "production":
    _required = ["DATABASE_URL", "AMPLEX_SECRET_KEY"]
    _missing = [v for v in _required if not os.getenv(v)]
    if _missing:
        raise RuntimeError(f"Production requires these env vars: {', '.join(_missing)}")

FRONTEND_URL = os.getenv("AMPLEX_FRONTEND_URL", "http://localhost:5173")
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("AMPLEX_CORS_ORIGINS", FRONTEND_URL).split(",")
    if o.strip()
] or [FRONTEND_URL]

RATE_LIMIT_RPM = int(os.getenv("AMPLEX_RATE_LIMIT_RPM", "120"))
AUTH_RATE_LIMIT_RPM = int(os.getenv("AMPLEX_AUTH_RATE_LIMIT_RPM", "10"))
MAX_REQUEST_BODY = int(os.getenv("AMPLEX_MAX_REQUEST_BODY", str(2 * 1024 * 1024)))
_AUTH_RATE_PATHS = {"/amplex/api/auth/login", "/amplex/api/auth/register"}

_rate_buckets: dict[str, list[float]] = defaultdict(list)
_auth_rate_buckets: dict[str, list[float]] = defaultdict(list)


def _is_rate_limited(buckets: dict, ip: str, limit: int) -> bool:
    now = time.time()
    buckets[ip] = [t for t in buckets[ip] if now - t < 60]
    if len(buckets[ip]) >= limit:
        return True
    buckets[ip].append(now)
    return False


app = FastAPI(
    title="Amplex CRM",
    version="1.0.0",
    docs_url="/amplex/api/docs" if ENVIRONMENT != "production" else None,
    redoc_url="/amplex/api/redoc" if ENVIRONMENT != "production" else None,
    openapi_url="/amplex/api/openapi.json" if ENVIRONMENT != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-CSRF-Token"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = (
            "max-age=63072000; includeSubDomains"
        )
    return response


_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    if request.method in _CSRF_SAFE_METHODS:
        return await call_next(request)
    has_cookie_auth = "amplex_access" in request.cookies
    has_bearer = request.headers.get("authorization", "").startswith("Bearer ")
    if has_cookie_auth and not has_bearer:
        csrf_header = request.headers.get("x-csrf-token", "")
        csrf_cookie = request.cookies.get("amplex_csrf", "")
        if (
            not csrf_header
            or not csrf_cookie
            or not _hmac.compare_digest(csrf_header, csrf_cookie)
        ):
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "CSRF token inválido"},
            )
    return await call_next(request)


@app.middleware("http")
async def request_body_limit_middleware(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_BODY:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"detail": "Request body muito grande."},
        )
    return await call_next(request)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path in ("/amplex/api/health",):
        return await call_next(request)
    ip = request.client.host if request.client else "unknown"
    _rate_429 = JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={
            "detail": "Limite de requisições excedido. Tente novamente em instantes."
        },
    )
    if request.url.path in _AUTH_RATE_PATHS and _is_rate_limited(
        _auth_rate_buckets, ip, AUTH_RATE_LIMIT_RPM
    ):
        return _rate_429
    if _is_rate_limited(_rate_buckets, ip, RATE_LIMIT_RPM):
        return _rate_429
    return await call_next(request)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex[:12])
    start = time.time()
    response: Response = await call_next(request)
    duration = round((time.time() - start) * 1000, 1)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "req=%s method=%s path=%s status=%d duration=%sms ip=%s",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        duration,
        request.client.host if request.client else "-",
    )
    return response


# Register routers
app.include_router(auth_routes.router)
app.include_router(dashboard.router)
app.include_router(pipeline.router)
app.include_router(leads.router)
app.include_router(interactions.router)
app.include_router(contacts.router)
app.include_router(stages.router)
app.include_router(users.router)
app.include_router(hub_users.router)
app.include_router(tags.router)
app.include_router(lost_reasons.router)
app.include_router(sources.router)
app.include_router(notifications.router)
app.include_router(export.router)
app.include_router(integrations.router)
app.include_router(custom_fields.router)
app.include_router(attachments.router)
app.include_router(config.router)
app.include_router(permissions.router)
app.include_router(orgs.router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    logger.info("Amplex CRM backend started — tables ensured")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Erro interno do servidor."},
    )


@app.get("/amplex/api/health")
def health(db: Session = Depends(get_db)):
    checks = {"api": "ok"}
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"

    healthy = all(v in ("ok", "unavailable") for v in checks.values())
    return JSONResponse(
        status_code=status.HTTP_200_OK
        if healthy
        else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "status": "ok" if healthy else "degraded",
            "product": "amplex",
            "version": "1.0.0",
            "checks": checks,
        },
    )
