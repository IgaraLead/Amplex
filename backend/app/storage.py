"""File storage utilities — stores files on MinIO/S3."""

from __future__ import annotations

import os
import uuid

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.config import settings


def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4"),
    )


def ensure_bucket() -> None:
    """Create the storage bucket if it does not exist. Called at startup."""
    client = _client()
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("404", "NoSuchBucket"):
            client.create_bucket(Bucket=settings.s3_bucket)
        else:
            raise


def save_file(data: bytes, original_filename: str) -> tuple[str, int]:
    """Upload file to S3, return (object_key, file_size)."""
    ext = os.path.splitext(original_filename)[1] if original_filename else ""
    key = f"{uuid.uuid4().hex}{ext}"
    _client().put_object(Bucket=settings.s3_bucket, Key=key, Body=data)
    return key, len(data)


def read_file(storage_path: str) -> bytes:
    """Download file from S3 by object key."""
    response = _client().get_object(Bucket=settings.s3_bucket, Key=storage_path)
    return response["Body"].read()


def delete_file(storage_path: str) -> None:
    """Delete file from S3 if key is set."""
    if not storage_path:
        return
    _client().delete_object(Bucket=settings.s3_bucket, Key=storage_path)
