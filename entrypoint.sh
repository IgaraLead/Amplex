#!/bin/sh
set -e

echo "[entrypoint] Running migrations..."
python manage.py migrate --noinput

if [ "${ENVIRONMENT:-production}" = "development" ]; then
  echo "[entrypoint] Development seed (admin/org from env)..."
  python manage.py amplex_bootstrap
else
  echo "[entrypoint] Seed skipped (ENVIRONMENT=${ENVIRONMENT:-production})"
fi

echo "[entrypoint] Collecting static files..."
python manage.py collectstatic --noinput

echo "[entrypoint] Starting server..."
exec "$@"
