"""
JWT access and refresh tokens — HS256, signed with SECRET_KEY (standalone Amplex).
"""

import time

from django.conf import settings
from jose import JWTError, jwt

_HS256_SECRET = settings.SECRET_KEY

ACCESS_EXPIRE_SECONDS = getattr(settings, "SESSION_EXPIRE_HOURS", 1) * 3600


def create_access_token(user_id: str, extra_claims: dict | None = None) -> str:
    """Create an HS256 access token for the given Amplex user id."""
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iss": "amplex",
        "aud": "amplex",
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
            audience="amplex",
            issuer="amplex",
        )
        if payload.get("type") != "access":
            raise ValueError("Not an access token")
        return payload
    except JWTError as e:
        raise ValueError("Token inválido") from e


REFRESH_EXPIRE_DAYS = getattr(settings, "REFRESH_EXPIRE_DAYS", 30)


def create_refresh_token(user) -> str:
    """Create an HS256 refresh token."""
    now = int(time.time())
    payload = {
        "sub": str(user.id),
        "type": "refresh",
        "exp": now + REFRESH_EXPIRE_DAYS * 86400,
        "iat": now,
    }
    return jwt.encode(payload, _HS256_SECRET, algorithm="HS256")


def decode_refresh_token(token: str) -> dict:
    """Decode refresh token. Raises ValueError on failure."""
    try:
        return jwt.decode(token, _HS256_SECRET, algorithms=["HS256"])
    except JWTError as e:
        raise ValueError("Refresh token inválido") from e
