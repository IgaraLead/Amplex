"""Deprecated module name — re-exports ``api.access_tokens``."""

from .access_tokens import (  # noqa: F401
    ACCESS_EXPIRE_SECONDS,
    AUTH_KIND_AMPLEX_LOCAL,
    AUTH_KIND_SHARED,
    REFRESH_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    validate_client_slug,
)
