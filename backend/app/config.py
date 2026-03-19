"""Application settings loaded from environment variables."""

import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = ""
    hub_api_url: str = ""
    hub_api_key: str = ""
    hub_client_slug: str = ""
    hub_jwks_url: str = ""
    hub_issuer: str = "igarahub"
    hub_audience: str = "igaralead"
    nexus_url: str = ""
    entity_url: str = ""
    hub_url: str = ""
    file_storage_path: str = "/var/lib/amplex/files"

    model_config = {"env_prefix": "AMPLEX_"}


settings = Settings()

if not settings.database_url:
    if os.getenv("ENVIRONMENT") == "production":
        raise RuntimeError("AMPLEX_DATABASE_URL must be set in production")
    settings.database_url = "postgresql://amplex:amplex@db:5432/amplex"
