#!/bin/sh
set -e

echo "[entrypoint] Running migrations..."
python manage.py migrate --noinput

echo "[entrypoint] Bootstrap (optional admin/org from env)..."
python manage.py amplex_bootstrap

echo "[entrypoint] Collecting static files..."
python manage.py collectstatic --noinput

echo "[entrypoint] Starting server..."
exec "$@"
