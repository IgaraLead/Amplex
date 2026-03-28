# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ .
RUN npm run build

# ── Stage 2: Production runtime ──────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /opt/amplex

# Dependências Python (layer cacheável)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código backend
COPY backend/app/ app/

# Diretório de arquivos
RUN mkdir -p /var/lib/amplex/files

# Frontend estático — FastAPI serve via catch-all route
COPY --from=frontend-build /build/dist ./static/

# Segurança: rodar como non-root
RUN groupadd -r appuser && useradd -r -g appuser -d /opt/amplex appuser \
    && chown -R appuser:appuser /opt/amplex /var/lib/amplex
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/amplex/api/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
