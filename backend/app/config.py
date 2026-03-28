"""Application settings loaded from environment variables."""

import os

from pydantic_settings import BaseSettings

# URL derivation: per-product custom domain > IGARALEAD_DOMAIN > empty
_DOMAIN = os.getenv("IGARALEAD_DOMAIN", "")
_SUBDOMAINS = {"entity": "cnpj"}


def _url(product: str) -> str:
    custom = os.getenv(f"{product.upper()}_DOMAIN", "")
    if custom:
        return f"https://{custom}" if not custom.startswith("http") else custom
    sub = _SUBDOMAINS.get(product, product)
    return f"https://{sub}.{_DOMAIN}" if _DOMAIN else ""


_HUB = _url("hub")


class Settings(BaseSettings):
    database_url: str = ""
    hub_api_url: str = _HUB
    hub_api_key: str = ""
    hub_client_slug: str = "amplex"
    hub_jwks_url: str = f"{_HUB}/.well-known/jwks.json" if _HUB else ""
    hub_issuer: str = "igarahub"
    hub_audience: str = "igaralead"
    nexus_url: str = _url("nexus")
    entity_url: str = _url("entity")
    hub_url: str = _HUB

    # S3 / MinIO
    s3_endpoint: str = "http://minio:9000"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "amplex"
    s3_region: str = "us-east-1"

    model_config = {"env_prefix": "AMPLEX_"}


settings = Settings()

if not settings.database_url:
    if os.getenv("ENVIRONMENT") == "production":
        raise RuntimeError("AMPLEX_DATABASE_URL must be set in production")
    settings.database_url = "postgresql://amplex:amplex@db:5432/amplex"
