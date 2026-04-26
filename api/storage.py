"""
S3-compatible object storage (MinIO) for Amplex.
"""

import logging
import os

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

STORAGE_ENDPOINT = os.getenv("STORAGE_ENDPOINT", "http://localhost:9000")
STORAGE_ACCESS_KEY_ID = os.getenv("STORAGE_ACCESS_KEY_ID", "")
STORAGE_SECRET_ACCESS_KEY = os.getenv("STORAGE_SECRET_ACCESS_KEY", "")
STORAGE_BUCKET_NAME = os.getenv("STORAGE_BUCKET_NAME", "amplex")
STORAGE_REGION = os.getenv("STORAGE_REGION", "us-east-1")
PRESIGN_EXPIRY = int(os.getenv("STORAGE_PRESIGN_EXPIRY", "3600"))

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=STORAGE_ENDPOINT,
            aws_access_key_id=STORAGE_ACCESS_KEY_ID,
            aws_secret_access_key=STORAGE_SECRET_ACCESS_KEY,
            region_name=STORAGE_REGION,
            config=Config(signature_version="s3v4"),
        )
        _ensure_bucket()
    return _client


def _ensure_bucket():
    client = _client
    try:
        client.head_bucket(Bucket=STORAGE_BUCKET_NAME)
    except ClientError:
        try:
            client.create_bucket(Bucket=STORAGE_BUCKET_NAME)
            logger.info("Created S3 bucket: %s", STORAGE_BUCKET_NAME)
        except ClientError as e:
            logger.error("Failed to create S3 bucket %s: %s", STORAGE_BUCKET_NAME, e)
            raise


def upload_bytes(key: str, data: bytes, content_type: str = "application/octet-stream"):
    client = _get_client()
    client.put_object(
        Bucket=STORAGE_BUCKET_NAME,
        Key=key,
        Body=data,
        ContentType=content_type,
    )


def upload_fileobj(key: str, fileobj, content_type: str = "application/octet-stream"):
    client = _get_client()
    client.upload_fileobj(
        fileobj,
        STORAGE_BUCKET_NAME,
        key,
        ExtraArgs={"ContentType": content_type},
    )


def download_bytes(key: str) -> bytes:
    client = _get_client()
    resp = client.get_object(Bucket=STORAGE_BUCKET_NAME, Key=key)
    return resp["Body"].read()


def delete_object(key: str):
    client = _get_client()
    client.delete_object(Bucket=STORAGE_BUCKET_NAME, Key=key)


def presigned_url(
    key: str, filename: str | None = None, expiry: int = PRESIGN_EXPIRY
) -> str:
    client = _get_client()
    params: dict = {"Bucket": STORAGE_BUCKET_NAME, "Key": key}
    if filename:
        # Sanitize filename: strip path traversal, remove dangerous chars
        safe_name = os.path.basename(filename)
        safe_name = safe_name.replace('"', "").replace("\\", "").replace("\n", "")
        if safe_name:
            params["ResponseContentDisposition"] = f'attachment; filename="{safe_name}"'
    return client.generate_presigned_url(
        "get_object",
        Params=params,
        ExpiresIn=expiry,
    )
