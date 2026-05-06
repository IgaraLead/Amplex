"""
Django settings for IgaraLead Amplex (CRM Pipeline).

All environment variables are centralised here.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

APP_VERSION = "2.0.0"

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# ── Environment ──────────────────────────────────────────

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# ── Security ─────────────────────────────────────────────

SECRET_KEY = os.getenv("SECRET_KEY_BASE", "")
if not SECRET_KEY:
    import warnings

    warnings.warn(
        "SECRET_KEY_BASE not set — using insecure random secret "
        "(DO NOT use in production)",
        stacklevel=2,
    )
    import secrets as _secrets

    SECRET_KEY = _secrets.token_urlsafe(64)

DEBUG = ENVIRONMENT != "production"

if ENVIRONMENT == "production":
    _required = ["POSTGRES_PASSWORD", "SECRET_KEY_BASE"]
    _missing = [v for v in _required if not os.getenv(v)]
    if _missing:
        raise RuntimeError(f"Production requires these env vars: {', '.join(_missing)}")

ALLOWED_HOSTS = ["*"]
if ENVIRONMENT == "production":
    _trusted = os.getenv("AMPLEX_TRUSTED_HOSTS", "")
    if _trusted:
        ALLOWED_HOSTS = [h.strip() for h in _trusted.split(",") if h.strip()]

# ── Application ──────────────────────────────────────────

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "corsheaders",
    "api",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "api.middleware.SecurityHeadersMiddleware",
    "api.middleware.BodyLimitMiddleware",
    "api.middleware.RateLimitMiddleware",
    "api.middleware.AmplexCsrfMiddleware",
    "django.middleware.common.CommonMiddleware",
    "api.middleware.RequestLoggingMiddleware",
]

ROOT_URLCONF = "amplex.urls"

TEMPLATES = []

WSGI_APPLICATION = "amplex.wsgi.application"

# ── Database (Amplex standalone) ─────────────────────────

_PG_USER = os.getenv("POSTGRES_USERNAME", "postgres")
_PG_PASS = os.getenv("POSTGRES_PASSWORD", "postgres")
_PG_PORT = os.getenv("POSTGRES_PORT", "5432")
_PG_HOST = os.getenv("POSTGRES_HOST", "localhost")
_PG_DB = os.getenv("POSTGRES_DATABASE", "amplex")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": _PG_DB,
        "USER": _PG_USER,
        "PASSWORD": _PG_PASS,
        "HOST": _PG_HOST,
        "PORT": _PG_PORT,
    },
}

CONN_MAX_AGE = 600
CONN_HEALTH_CHECKS = True

if ENVIRONMENT == "production":
    _sslmode = os.getenv("POSTGRES_SSLMODE", "require")
    DATABASES["default"].setdefault("OPTIONS", {})
    DATABASES["default"]["OPTIONS"]["sslmode"] = _sslmode

DATABASE_ROUTERS = ["api.db_router.AmplexRouter"]

# ── Cache (Redis) ────────────────────────────────────────

REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")
_REDIS_AUTH = f":{REDIS_PASSWORD}@" if REDIS_PASSWORD else ""
REDIS_URL = os.getenv("REDIS_URL", f"redis://{_REDIS_AUTH}localhost:6379/3")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
        "TIMEOUT": 300,
        "KEY_PREFIX": "amplex",
        "OPTIONS": {
            "socket_connect_timeout": 5,
        },
    }
}

if ENVIRONMENT == "test":
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

# ── CORS ─────────────────────────────────────────────────

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("AMPLEX_CORS_ORIGINS", FRONTEND_URL).split(",")
    if o.strip()
] or [FRONTEND_URL]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
]
CORS_ALLOW_HEADERS = [
    "authorization",
    "content-type",
    "x-request-id",
    "x-csrf-token",
    "x-api-key",
]

# ── Custom settings (used by api app) ───────────────────

RATE_LIMIT_RPM = int(os.getenv("AMPLEX_RATE_LIMIT_RPM", "120"))
AUTH_RATE_LIMIT_RPM = int(os.getenv("AMPLEX_AUTH_RATE_LIMIT_RPM", "10"))
MAX_REQUEST_BODY = int(os.getenv("AMPLEX_MAX_REQUEST_BODY", str(2 * 1024 * 1024)))

# Session / Cookie
SESSION_EXPIRE_HOURS = int(os.getenv("AMPLEX_SESSION_EXPIRE_HOURS", "1"))
REFRESH_EXPIRE_DAYS = int(os.getenv("AMPLEX_REFRESH_EXPIRE_DAYS", "30"))
COOKIE_SECURE = ENVIRONMENT == "production"
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", None)

# Storage / MinIO
STORAGE_ENDPOINT = os.getenv("STORAGE_ENDPOINT", "http://minio:9000")
STORAGE_ACCESS_KEY_ID = os.getenv("STORAGE_ACCESS_KEY_ID", "")
STORAGE_SECRET_ACCESS_KEY = os.getenv("STORAGE_SECRET_ACCESS_KEY", "")
STORAGE_BUCKET_NAME = os.getenv("STORAGE_BUCKET_NAME", "amplex")
STORAGE_REGION = os.getenv("STORAGE_REGION", "us-east-1")

# ── Internationalisation ─────────────────────────────────

LANGUAGE_CODE = "pt-br"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

# ── Static files ─────────────────────────────────────────

STATIC_URL = "/assets/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]

STATICFILES_STORAGE = (
    "whitenoise.storage.CompressedManifestStaticFilesStorage"
    if ENVIRONMENT == "production"
    else "django.contrib.staticfiles.storage.StaticFilesStorage"
)
WHITENOISE_ROOT = BASE_DIR / "static"

# ── Logging ──────────────────────────────────────────────

import json as _json  # noqa: E402
import logging as _logging  # noqa: E402


class _JsonFormatter(_logging.Formatter):
    def format(self, record):
        return _json.dumps(
            {
                "ts": self.formatTime(record),
                "level": record.levelname,
                "logger": record.name,
                "msg": record.getMessage(),
            }
        )


LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {"()": _JsonFormatter},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "amplex": {"level": "DEBUG" if DEBUG else "INFO"},
        "django": {"level": "WARNING"},
    },
}
