"""Point d'entrée FastAPI. En production, sert aussi le frontend compilé (même port, même domaine)."""

import asyncio
import contextlib
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.api import admin, auth, devices, public, ws
from app.core.config import Settings
from app.core.game_config import load_game_config
from app.core.logging import setup_logging
from app.core.security import LoginRateLimiter, SessionSigner, hash_password, load_or_create_secret, verify_password
from app.models import create_db_engine, make_session_factory
from app.models.migrate import run_migrations
from app.services.common import Clock, GameError, utcnow
from app.services.container import Services
from app.services.realtime import Hub

log = logging.getLogger("noel2026")
DEV_PASSWORD = "noel2026"


class MediaFiles(StaticFiles):
    """Vidéos locales avec cache navigateur (préchargement par la TV)."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if response.status_code in (200, 206):
            response.headers["Cache-Control"] = "public, max-age=3600"
        return response


def _password_hash(settings: Settings) -> str:
    if settings.admin_password_hash:
        return settings.admin_password_hash
    if settings.is_production:
        raise RuntimeError("ADMIN_PASSWORD_HASH doit être défini en production (voir scripts/hash-password)")
    log.warning("ADMIN_PASSWORD_HASH absent : mot de passe de développement « %s »", DEV_PASSWORD)
    # Hash conservé dans data/ : les sessions survivent aux redémarrages (la clé de session en dépend).
    cached = settings.data_dir / "dev_password_hash"
    if cached.is_file() and verify_password(DEV_PASSWORD, cached.read_text().strip()):
        return cached.read_text().strip()
    value = hash_password(DEV_PASSWORD)
    cached.write_text(value)
    return value


async def _scheduler_loop(app: FastAPI) -> None:
    svc: Services = app.state.services
    while True:
        try:
            async with svc.lock:
                fired = svc.run(svc.schedule.tick)
                expired = svc.run(svc.game.expire_message)
                countdown = svc.run(svc.game.tick_countdown)
            if fired or expired or countdown:
                await app.state.hub.broadcast()
        except Exception:  # la boucle ne doit jamais s'arrêter
            log.exception("erreur dans le planificateur")
        await asyncio.sleep(svc.settings.scheduler_interval_seconds)


def create_app(settings: Settings | None = None, clock: Clock = utcnow) -> FastAPI:
    settings = settings or Settings()
    setup_logging(settings.log_level, settings.log_format)
    settings.data_dir.mkdir(parents=True, exist_ok=True)

    cfg = load_game_config(settings.config_dir)
    run_migrations(settings.db_url)
    engine = create_db_engine(settings.db_url)
    services = Services(settings, cfg, make_session_factory(engine), clock)
    services.bootstrap()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = asyncio.create_task(_scheduler_loop(app)) if settings.scheduler_enabled else None
        log.info("application prête", extra={"version": __version__, "env": settings.app_env,
                                              "demo": settings.demo_mode, "time_scale": services.time_scale})
        yield
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        engine.dispose()

    app = FastAPI(title="Noël 2026", version=__version__, lifespan=lifespan,
                  docs_url=None if settings.is_production else "/api/docs", redoc_url=None,
                  openapi_url=None if settings.is_production else "/api/openapi.json")
    password_hash = _password_hash(settings)
    app.state.settings = settings
    app.state.services = services
    app.state.hub = Hub(services)
    app.state.password_hash = password_hash
    app.state.signer = SessionSigner(load_or_create_secret(settings.secret_key, settings.data_dir),
                                     password_hash, settings.session_hours * 3600)
    app.state.login_limiter = LoginRateLimiter(settings.login_max_attempts, settings.login_window_seconds)

    @app.exception_handler(GameError)
    async def game_error(_request: Request, exc: GameError):
        return JSONResponse({"detail": exc.message}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, exc: RequestValidationError):
        errors = [{"loc": e.get("loc"), "msg": e.get("msg")} for e in exc.errors()]
        return JSONResponse({"detail": "requête invalide", "errors": errors}, status_code=422)

    @app.middleware("http")
    async def access_log(request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/api") and path != "/api/health":
            log.info("http", extra={"method": request.method, "path": path, "status": response.status_code,
                                    "ms": round((time.perf_counter() - start) * 1000, 1)})
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        return response

    app.include_router(auth.router)
    app.include_router(admin.router)
    app.include_router(public.router)
    app.include_router(devices.router)
    app.include_router(ws.router)

    settings.media_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/media", MediaFiles(directory=settings.media_dir), name="media")

    static_dir = settings.static_dir
    if static_dir and (static_dir / "index.html").is_file():
        static_root = static_dir.resolve()
        index = static_root / "index.html"

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa(full_path: str):
            if full_path.startswith(("api/", "ws", "media/")):
                raise HTTPException(status_code=404)
            candidate = (static_root / full_path).resolve()
            if full_path and candidate.is_file() and candidate.is_relative_to(static_root):
                cache = "public, max-age=31536000, immutable" if full_path.startswith("assets/") else "no-cache"
                return FileResponse(candidate, headers={"Cache-Control": cache})
            return FileResponse(index, headers={"Cache-Control": "no-cache"})
    else:
        log.info("frontend non servi par le backend (STATIC_DIR absent) : utilisez le serveur Vite")

    return app


def get_app() -> FastAPI:  # pragma: no cover - utilisé par uvicorn --factory
    return create_app()
