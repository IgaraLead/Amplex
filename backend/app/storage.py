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
    # Prevent path traversal
    real_path = os.path.realpath(storage_path)
    real_base = os.path.realpath(settings.file_storage_path)
    if not real_path.startswith(real_base + os.sep):
        raise ValueError("Invalid storage path")
    with open(real_path, "rb") as f:
        return f.read()


def delete_file(storage_path: str) -> None:
    """Delete file from disk if it exists."""
    if not storage_path:
        return
    real_path = os.path.realpath(storage_path)
    real_base = os.path.realpath(settings.file_storage_path)
    if not real_path.startswith(real_base + os.sep):
        raise ValueError("Invalid storage path")
    if os.path.exists(real_path):
        os.remove(real_path)
