"""File storage utilities — stores files on disk, not base64 in DB."""
from __future__ import annotations

import os
import uuid

from app.config import settings


def save_file(data: bytes, original_filename: str) -> tuple[str, int]:
    """Save file to disk, return (storage_path, file_size)."""
    os.makedirs(settings.file_storage_path, exist_ok=True)
    ext = os.path.splitext(original_filename)[1] if original_filename else ""
    unique_name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(settings.file_storage_path, unique_name)
    with open(path, "wb") as f:
        f.write(data)
    return path, len(data)


def read_file(storage_path: str) -> bytes:
    """Read file from disk."""
    with open(storage_path, "rb") as f:
        return f.read()


def delete_file(storage_path: str) -> None:
    """Delete file from disk if it exists."""
    if storage_path and os.path.exists(storage_path):
        os.remove(storage_path)
