"""Hub JWT token authentication via JWKS and user resolution."""

from __future__ import annotations

import logging
import os
import secrets
import time as _time
from dataclasses import dataclass
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, Request, Response
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Organization, OrgMember, User

logger = logging.getLogger(__name__)

# Cookie settings
_COOKIE_SECURE = os.getenv("ENVIRONMENT") == "production"
_COOKIE_DOMAIN = os.getenv("AMPLEX_COOKIE_DOMAIN", None)
_COOKIE_SAMESITE = "lax"
_ACCESS_MAX_AGE = 3600  # 1 hour
_REFRESH_MAX_AGE = 30 * 86400  # 30 days

# JWKS cache
_jwks_cache: dict = {}
_jwks_cache_time: float = 0
_JWKS_CACHE_TTL = 300  # 5 minutes


def _fetch_jwks() -> dict:
    """Fetch JWKS from Hub and cache it."""
    global _jwks_cache, _jwks_cache_time
    if not settings.hub_jwks_url:
        return {}
    try:
        resp = httpx.get(settings.hub_jwks_url, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        _jwks_cache = {k["kid"]: k for k in data.get("keys", [])}
        _jwks_cache_time = _time.time()
        return _jwks_cache
    except Exception as e:
        logger.warning("Failed to fetch JWKS from Hub: %s", e)
        return _jwks_cache


def _get_signing_key(token: str) -> Optional[dict]:
    """Extract kid from token header and look up in JWKS."""
    headers = jwt.get_unverified_headers(token)
    kid = headers.get("kid")
    if not kid:
        return None
    if _time.time() - _jwks_cache_time > _JWKS_CACHE_TTL:
        _fetch_jwks()
    key = _jwks_cache.get(kid)
    if not key:
        _fetch_jwks()
        key = _jwks_cache.get(kid)
    return key


def decode_hub_token(token: str) -> dict:
    """Decode and validate a Hub-issued RS256 JWT via JWKS."""
    signing_key = _get_signing_key(token)
    if not signing_key:
        raise HTTPException(
            status_code=401, detail="Chave de assinatura Hub não encontrada"
        )
    try:
        return jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=settings.hub_audience,
            issuer=settings.hub_issuer,
        )
    except JWTError as e:
        logger.warning("Hub JWT validation failed: %s", e)
        raise HTTPException(status_code=401, detail="Token Hub inválido") from e


def set_auth_cookies(
    response: Response, access_token: str, refresh_token: str = ""
) -> None:
    response.set_cookie(
        "amplex_access",
        access_token,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite=_COOKIE_SAMESITE,
        domain=_COOKIE_DOMAIN,
        max_age=_ACCESS_MAX_AGE,
        path="/",
    )
    if refresh_token:
        response.set_cookie(
            "amplex_refresh",
            refresh_token,
            httponly=True,
            secure=_COOKIE_SECURE,
            samesite=_COOKIE_SAMESITE,
            domain=_COOKIE_DOMAIN,
            max_age=_REFRESH_MAX_AGE,
            path="/amplex/api/auth/refresh",
        )
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        "amplex_csrf",
        csrf_token,
        httponly=False,
        secure=_COOKIE_SECURE,
        samesite=_COOKIE_SAMESITE,
        domain=_COOKIE_DOMAIN,
        max_age=_ACCESS_MAX_AGE,
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("amplex_access", path="/", domain=_COOKIE_DOMAIN)
    response.delete_cookie(
        "amplex_refresh", path="/amplex/api/auth/refresh", domain=_COOKIE_DOMAIN
    )
    response.delete_cookie("amplex_csrf", path="/", domain=_COOKIE_DOMAIN)


@dataclass
class CurrentUser:
    user_id: int
    name: str
    email: str
    role: str  # 'admin' | 'user'
    hub_id: Optional[str]
    org_id: Optional[int] = None  # set by get_org_context
    is_super_admin: bool = False


async def get_current_user(
    request: Request, db: Session = Depends(get_db)
) -> CurrentUser:
    """Validate Hub JWT from cookie or Authorization header.

    Resolve or create local user. Reads the shared `hub_access` cookie
    (set by Hub on the parent domain) first, then falls back to
    `amplex_access` cookie, then Bearer header.
    Token is validated locally via JWKS — no HTTP call per request.
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    else:
        # Prefer the shared Hub cookie, fall back to Amplex-specific cookie
        token = request.cookies.get("hub_access", "") or request.cookies.get(
            "amplex_access", ""
        )
    if not token:
        raise HTTPException(401, "Autenticação necessária")

    # Validate JWT locally via JWKS (no HTTP call)
    if settings.hub_jwks_url:
        claims = decode_hub_token(token)
    else:
        # Fallback: call /userinfo for dev environments without JWKS
        if not settings.hub_api_url:
            raise HTTPException(
                500,
                "Hub not configured (set AMPLEX_HUB_JWKS_URL or AMPLEX_HUB_API_URL)",
            )
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(
                    f"{settings.hub_api_url}/api/v1/auth/userinfo",
                    headers={"Authorization": f"Bearer {token}"},
                )
            except httpx.RequestError:
                raise HTTPException(401, "Token validation failed")
        if resp.status_code != 200:
            raise HTTPException(401, "Invalid token")
        claims = resp.json()

    hub_user_id = claims.get("user_id") or claims.get("sub")
    email = claims.get("email", "")
    name = claims.get("name", "")
    roles = claims.get("roles", [])
    is_super_admin = "super_admin" in roles

    # Platform access check: user must have amplex in at least one org,
    # or be super_admin
    if not is_super_admin:
        has_amplex = any(
            m.get("active_products", {}).get("amplex")
            for m in claims.get("memberships", [])
        )
        if not has_amplex:
            raise HTTPException(403, "Sua organização não possui acesso ao Amplex")

    # Resolve local user
    user: Optional[User] = None
    if hub_user_id:
        user = db.query(User).filter(User.hub_id == str(hub_user_id)).first()
    if not user and email:
        user = db.query(User).filter(User.email == email).first()
    if not user and email:
        user = db.query(User).filter(User.login == email).first()

    if not user:
        # Auto-provision
        display_name = name or email.split("@")[0]
        user = User(
            name=display_name,
            email=email,
            login=email,
            hub_id=str(hub_user_id) if hub_user_id else None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Auto-provisioned user %s (hub_id=%s)", email, hub_user_id)

    # Sync local org memberships from JWT
    _sync_memberships_from_jwt(user, claims.get("memberships", []), db)

    role = "admin" if any(r in ("admin", "super_admin") for r in roles) else "user"
    return CurrentUser(
        user_id=user.id,
        name=name or user.name,
        email=email or user.email,
        role=role,
        hub_id=hub_user_id,
        is_super_admin=is_super_admin,
    )


def _sync_memberships_from_jwt(user: User, hub_memberships: list, db: Session):
    """Sync local Organization + OrgMember from Hub JWT memberships."""
    for m in hub_memberships:
        org_id = m.get("org_id")
        slug = m.get("slug")
        if not org_id or not slug:
            continue
        # Only sync for orgs that have amplex active
        if not m.get("active_products", {}).get("amplex"):
            continue
        org = db.query(Organization).filter(Organization.hub_org_id == org_id).first()
        if not org:
            org = Organization(
                name=m.get("name", slug),
                hub_org_id=org_id,
            )
            db.add(org)
            db.flush()
        member = (
            db.query(OrgMember)
            .filter(
                OrgMember.org_id == org.id,
                OrgMember.user_id == user.id,
            )
            .first()
        )
        if not member:
            member = OrgMember(org_id=org.id, user_id=user.id)
            db.add(member)
    db.commit()


def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Dependency that ensures the user is an admin."""
    if current_user.role != "admin":
        raise HTTPException(403, "Permissão negada")
    return current_user


def get_org_context(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """Resolve organization from path param and verify membership."""
    org = (
        db.query(Organization)
        .filter(Organization.id == org_id, Organization.active.is_(True))
        .first()
    )
    if not org:
        raise HTTPException(404, "Organização não encontrada")

    # Super admins bypass membership check
    if not current_user.is_super_admin:
        membership = (
            db.query(OrgMember)
            .filter(
                OrgMember.org_id == org.id,
                OrgMember.user_id == current_user.user_id,
            )
            .first()
        )
        if not membership:
            raise HTTPException(403, "Sem acesso a esta organização")
        if membership.role == "admin":
            current_user.role = "admin"
    else:
        current_user.role = "admin"

    current_user.org_id = org.id
    return current_user


def require_org_admin(
    current_user: CurrentUser = Depends(get_org_context),
) -> CurrentUser:
    """Dependency that ensures the user is an admin within the organization."""
    if current_user.role != "admin":
        raise HTTPException(403, "Permissão negada")
    return current_user
