"""
HS256 JWT access/refresh tokens for Amplex (platform-local signing).

``auth_kind`` distinguishes legacy shared-DB sessions from fully local Amplex users.
"""

import time

from django.conf import settings
from jose import JWTError, jwt

from .models import AmplexOrganization, SharedOrganization

_HS256_SECRET = settings.SECRET_KEY

ACCESS_EXPIRE_SECONDS = getattr(settings, "SESSION_EXPIRE_HOURS", 1) * 3600
REFRESH_EXPIRE_DAYS = getattr(settings, "REFRESH_EXPIRE_DAYS", 30)

AUTH_KIND_SHARED = "shared"
AUTH_KIND_AMPLEX_LOCAL = "amplex_local"


def create_access_token(
    user_id: str, extra_claims: dict | None = None, *, auth_kind: str = AUTH_KIND_SHARED
) -> str:
    """Create an HS256 access token for the given subject."""
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iss": "amplex",
        "aud": "igaralead",
        "auth_kind": auth_kind,
        "iat": now,
        "exp": now + ACCESS_EXPIRE_SECONDS,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, _HS256_SECRET, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    """Decode an HS256 access token. Raises ValueError on failure."""
    try:
        payload = jwt.decode(
            token,
            _HS256_SECRET,
            algorithms=["HS256"],
            audience="igaralead",
            issuer="amplex",
        )
        if payload.get("type") != "access":
            raise ValueError("Not an access token")
        return payload
    except JWTError as e:
        raise ValueError("Token inválido") from e


def create_refresh_token(user, auth_kind: str = AUTH_KIND_SHARED) -> str:
    """Create an HS256 refresh token (never leaves Amplex)."""
    now = int(time.time())
    payload = {
        "sub": str(user.id),
        "type": "refresh",
        "auth_kind": auth_kind,
        "exp": now + REFRESH_EXPIRE_DAYS * 86400,
        "iat": now,
    }
    return jwt.encode(payload, _HS256_SECRET, algorithm="HS256")


def decode_refresh_token(token: str) -> dict:
    """Decode an HS256 refresh token. Raises ValueError on failure."""
    try:
        return jwt.decode(token, _HS256_SECRET, algorithms=["HS256"])
    except JWTError as e:
        raise ValueError("Refresh token inválido") from e


def validate_client_slug(slug: str) -> bool:
    """True if ``slug`` matches an Amplex org or legacy shared organization."""
    if AmplexOrganization.objects.filter(slug=slug, active=True).exists():
        return True
    return SharedOrganization.objects.filter(slug=slug).exists()
