"""Application settings loaded from environment variables."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://amplex:amplex@db:5432/amplex"
    hub_api_url: str = ""
    hub_api_key: str = ""
    hub_client_slug: str = ""
    nexus_url: str = ""
    entity_url: str = ""
    hub_url: str = ""
    file_storage_path: str = "/var/lib/amplex/files"

    model_config = {"env_prefix": "AMPLEX_"}


settings = Settings()
