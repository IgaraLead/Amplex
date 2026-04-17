"""Test settings — SQLite, no external dependencies."""

import os

os.environ["ENVIRONMENT"] = "test"
os.environ["POSTGRES_HOST"] = "localhost"
os.environ.setdefault(
    "SECRET_KEY_BASE",
    "test-secret-key-64chars-long-aabbccddeeff00112233445566778899",
)
os.environ.setdefault("AMPLEX_RATE_LIMIT_RPM", "10000")
os.environ.setdefault("AMPLEX_AUTH_RATE_LIMIT_RPM", "10000")
os.environ.setdefault("HUB_API_KEY", "test-api-key")

from amplex.settings import *  # noqa: F403

DATABASES = {
    "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": "./test_amplex.db"},
}

# Disable WhiteNoise in tests to avoid missing static dir warnings
MIDDLEWARE = [m for m in MIDDLEWARE if "whitenoise" not in m.lower()]  # noqa: F405
STATICFILES_STORAGE = "django.contrib.staticfiles.storage.StaticFilesStorage"
