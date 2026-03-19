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


def get_db():
    """FastAPI dependency that yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
