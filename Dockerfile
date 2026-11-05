# syntax=docker/dockerfile:1.7
# Image unique : frontend compilé + backend FastAPI. Multi-architecture (amd64 / arm64).
# Bases officielles multi-arch : node:22-alpine et python:3.12-slim.

# ---------------------------------------------------------------- frontend
# Le JS compilé est indépendant de l'architecture : on le construit sur la plateforme hôte
# (rapide même en cross-build buildx vers arm64).
FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ------------------------------------------------------- backend (commun)
FROM python:3.12-slim AS backend-base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TZ=Europe/Paris \
    DATA_DIR=/data \
    CONFIG_DIR=/app/config \
    MEDIA_DIR=/media
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

# ------------------------------------------- développement (rechargement auto)
FROM backend-base AS backend-dev
COPY backend/requirements-dev.txt ./
RUN pip install -r requirements-dev.txt
ENV APP_ENV=development LOG_FORMAT=text WATCHFILES_FORCE_POLLING=true
EXPOSE 8000
CMD ["uvicorn", "app.main:get_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "/app/backend/app", "--reload-dir", "/app/config"]

# ------------------------------------------------------------- production
FROM backend-base AS runtime
ENV APP_ENV=production STATIC_DIR=/app/static
COPY backend/alembic.ini ./
COPY backend/alembic ./alembic
COPY backend/app ./app
COPY config /app/config
COPY --from=frontend /build/dist /app/static
RUN useradd --uid 1000 --user-group --no-create-home noel \
    && mkdir -p /data /media/videos \
    && chown -R 1000:1000 /data
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=4).status == 200 else 1)"]
CMD ["uvicorn", "app.main:get_app", "--factory", "--host", "0.0.0.0", "--port", "8080", "--no-access-log", "--ws-ping-interval", "20"]
