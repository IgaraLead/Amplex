"""IgaraLead ecosystem URL derivation for Amplex."""

from __future__ import annotations

import os

DOMAIN = os.getenv("IGARALEAD_DOMAIN", "igaralead.com.br")

_FALLBACKS = {
    "hub": "http://localhost:8001",
    "nexus": "http://localhost:3000",
    "entity": "http://localhost:8000",
    "amplex": "http://localhost:8000",
}

_SUBDOMAINS = {
    "entity": "cnpj",
}


def product_url(name: str, fallback: str | None = None) -> str:
    """Return the base URL for a product."""
    env = os.getenv("ENVIRONMENT", "development")
    if env == "production":
        sub = _SUBDOMAINS.get(name, name)
        return f"https://{sub}.{DOMAIN}"
    return fallback if fallback is not None else _FALLBACKS.get(name, "")
