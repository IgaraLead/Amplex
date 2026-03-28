"""SQLAlchemy engine & session factory."""

import os as _os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

_connect_args: dict = {}
if _os.getenv("ENVIRONMENT") == "production":
    _connect_args["sslmode"] = _os.getenv("AMPLEX_DB_SSLMODE", "require")

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    connect_args=_connect_args,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


# ── Shared igaralead DB (org/user/subscription data managed by Hub) ──

_shared_url = _os.getenv("SHARED_DATABASE_URL", "")
if not _shared_url:
    # Dev fallback: derive from IGARALEAD_DOMAIN or use localhost
    _shared_url = "postgresql://postgres:postgres@localhost:5432/igaralead"

_shared_connect_args: dict = {}
if _os.getenv("ENVIRONMENT") == "production":
    _shared_connect_args["sslmode"] = _os.getenv("SHARED_DB_SSLMODE", "require")

shared_engine = create_engine(
    _shared_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=900,
    connect_args=_shared_connect_args,
)
SharedSessionLocal = sessionmaker(
    bind=shared_engine, autoflush=False, expire_on_commit=False
)


class SharedBase(DeclarativeBase):
    pass


def get_shared_db():
    """FastAPI dependency that yields a shared igaralead DB session."""
    db = SharedSessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db():
    """FastAPI dependency that yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
