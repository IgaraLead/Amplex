"""
Django middleware for Amplex.

Provides: security headers, body size limit, rate limiting (cache-backed),
custom CSRF (amplex_access/amplex_csrf cookies), and request logging.
"""

import hmac
import logging
import re
import time
import uuid

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse

logger = logging.getLogger("amplex")
_SLUG_PATH_RE = re.compile(r"/id/([^/]+)/")

try:
    from redis.exceptions import RedisError
except ImportError:  # pragma: no cover - redis may be unavailable in tests

    class RedisError(Exception):
        """Fallback redis exception type when redis package is unavailable."""


def _get_client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


# ── Security Headers ─────────────────────────────────────


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response["X-Content-Type-Options"] = "nosniff"
        response["X-Frame-Options"] = "DENY"
        response["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if settings.ENVIRONMENT == "production":
            response["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )
            response["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "font-src 'self'; "
                "frame-ancestors 'none'"
            )
        return response


# ── Body Size Limit ──────────────────────────────────────


class BodyLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        content_length = request.META.get("CONTENT_LENGTH")
        if content_length:
            try:
                if int(content_length) > settings.MAX_REQUEST_BODY:
                    return JsonResponse(
                        {"detail": "Request body muito grande."}, status=413
                    )
            except (ValueError, TypeError):
                pass
        return self.get_response(request)


# ── Rate Limiting (Django cache backed) ──────────────────

_AUTH_RATE_PATHS = {
    "/amplex/api/auth/login",
}


def _is_rate_limited(prefix, ip, limit):
    window = 60
    key = f"rl:{prefix}:{ip}"
    try:
        count = cache.get(key, 0)
        if count >= limit:
            return True
        # Use add for atomic first-set, incr for subsequent
        if count == 0:
            cache.set(key, 1, timeout=window)
        else:
            cache.incr(key)
    except (ConnectionError, OSError, ValueError, RedisError):
        pass
    return False


class RateLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path
        if path in ("/amplex/api/health", "/"):
            return self.get_response(request)

        ip = _get_client_ip(request)
        _rate_429 = JsonResponse(
            {
                "detail": "Limite de requisições excedido. "
                "Tente novamente em instantes."
            },
            status=429,
        )

        if path in _AUTH_RATE_PATHS and _is_rate_limited(
            "auth", ip, settings.AUTH_RATE_LIMIT_RPM
        ):
            return _rate_429

        if _is_rate_limited("global", ip, settings.RATE_LIMIT_RPM):
            return _rate_429

        return self.get_response(request)


# ── CSRF (amplex_access / amplex_csrf cookies) ───────────

_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class AmplexCsrfMiddleware:
    """Custom CSRF protection for cookie-based auth."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method in _CSRF_SAFE_METHODS:
            return self.get_response(request)

        has_cookie_auth = "amplex_access" in request.COOKIES
        has_bearer = request.META.get("HTTP_AUTHORIZATION", "").startswith("Bearer ")

        if has_cookie_auth and not has_bearer:
            csrf_header = request.headers.get("X-CSRF-Token", "")
            csrf_cookie = request.COOKIES.get("amplex_csrf", "")
            if (
                not csrf_header
                or not csrf_cookie
                or not hmac.compare_digest(csrf_header, csrf_cookie)
            ):
                return JsonResponse({"detail": "CSRF token inválido"}, status=403)

        return self.get_response(request)


# ── Request Logging ──────────────────────────────────────


class RequestLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex[:12])
        start = time.time()
        slug_match = _SLUG_PATH_RE.search(request.path or "")
        client_slug = slug_match.group(1) if slug_match else ""

        response = self.get_response(request)

        duration = round((time.time() - start) * 1000, 1)
        response["X-Request-ID"] = request_id
        logger.info(
            "request_id=%s client_slug=%s method=%s path=%s status_code=%d latency_ms=%s ip=%s",
            request_id,
            client_slug,
            request.method,
            request.path,
            response.status_code,
            duration,
            _get_client_ip(request),
        )
        return response
