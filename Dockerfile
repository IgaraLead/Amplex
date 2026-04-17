# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ .
RUN npm run build

# ── Stage 2: Production runtime ──────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Dependências Python (layer cacheável)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código backend
COPY api/ ./api/
COPY amplex/ ./amplex/
COPY manage.py .

# Diretórios de trabalho
RUN mkdir -p /app/staticfiles

# Frontend estático — Django/WhiteNoise serve via catch-all
COPY --from=frontend-build /build/dist ./static/

# Entrypoint
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Segurança: rodar como non-root
RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/amplex/api/health')"

ENTRYPOINT ["./entrypoint.sh"]
CMD ["gunicorn", "amplex.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
