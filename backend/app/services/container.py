"""Regroupe les services, gère les transactions, l'idempotence et les vues envoyées aux écrans."""

import asyncio
import logging
import sqlite3
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from app import __version__
from app.core.config import Settings
from app.core.game_config import AppConfig
from app.models import EventLog, ProcessedCommand
from app.services.actions import ActionsService
from app.services.common import Clock, iso, log_event
from app.services.game import AMBIENTS, GameService
from app.services.kids import KidsService
from app.services.schedule import ScheduleService

log = logging.getLogger("noel2026")
IDEMPOTENCY_TTL = timedelta(hours=24)


class Services:
    def __init__(self, settings: Settings, cfg: AppConfig, session_factory: sessionmaker[Session], clock: Clock):
        self.settings = settings
        self.cfg = cfg
        self.sf = session_factory
        self.clock = clock
        self.time_scale = settings.time_scale or (cfg.game.demo_time_scale if settings.demo_mode else 1.0)
        self.game = GameService(cfg, settings.media_dir, clock)
        self.kids = KidsService(cfg, clock)
        self.schedule = ScheduleService(cfg, self.game, clock, self.time_scale)
        self.actions = ActionsService(clock, self.game)
        # Sérialise les commandes : une seule mutation à la fois.
        self.lock = asyncio.Lock()

    def bootstrap(self) -> None:
        with self.sf.begin() as s:
            self.game.bootstrap(s)
            self.kids.bootstrap(s)
            self.schedule.bootstrap(s)
            s.flush()
            log_event(s, self.clock, "server_started", "Serveur démarré",
                      {"version": __version__, "phase": self.game.state(s).phase}, "system")

    def run(self, fn: Callable[[Session], Any], idempotency_key: str | None = None) -> Any:
        """Exécute `fn` dans une transaction. Une clé déjà vue renvoie la réponse enregistrée."""
        with self.sf.begin() as s:
            if idempotency_key:
                done = s.get(ProcessedCommand, idempotency_key)
                if done is not None:
                    return (done.response or {}) | {"replayed": True}
            result = fn(s)
            if idempotency_key:
                s.add(ProcessedCommand(key=idempotency_key, created_at=self.clock(),
                                       response=result if isinstance(result, dict) else None))
                s.query(ProcessedCommand).filter(
                    ProcessedCommand.created_at < self.clock() - IDEMPOTENCY_TTL).delete()
            return result

    def read(self, fn: Callable[[Session], Any]) -> Any:
        with self.sf() as s:
            return fn(s)

    def reset_all(self, s: Session) -> dict:
        self.game.reset(s)
        self.kids.reset_all(s, source="admin")
        self.schedule.reset(s)
        return {"changed": True}

    # ------------------------------------------------------------------ vues
    def public_view(self, s: Session) -> dict:
        st = self.game.state(s)
        kids = self.kids.view(s)
        return {"server_time": iso(self.clock()), "title": self.cfg.game.title, "phase": st.phase,
                "phase_changed_at": iso(st.phase_changed_at), "started_at": iso(st.started_at),
                "tv": self.game.tv_view(s),
                "teams": [{k: t[k] for k in ("id", "name", "theme", "color", "status")}
                          for t in self.game.teams_view(s)],
                "kids_summary": {"completed": kids["completed_count"], "total": kids["total"]},
                "kids_games": [{"id": g["id"], "title": g["title"], "status": g["status"]} for g in kids["games"]],
                "emergency_authorized": bool(st.emergency_authorized)}

    def kids_view(self, s: Session) -> dict:
        return {"server_time": iso(self.clock()), "phase": self.game.state(s).phase, **self.kids.view(s)}

    def events(self, s: Session, limit: int = 50) -> list[dict]:
        rows = s.query(EventLog).order_by(EventLog.id.desc()).limit(limit).all()
        return [{"id": e.id, "ts": iso(e.ts), "type": e.type, "source": e.source, "message": e.message,
                 "data": e.data} for e in rows]

    def admin_view(self, s: Session, connections: dict[str, int] | None = None) -> dict:
        public = self.public_view(s)
        return public | {
            "teams": self.game.teams_view(s),
            "kids": self.kids.view(s, include_stats=True),
            "schedule": self.schedule.view(s),
            "videos": [self.game.video_payload(v.id) | {"kind": v.kind} for v in self.cfg.videos],
            "messages": [m.model_dump() for m in self.cfg.messages],
            "ambients": list(AMBIENTS),
            "events": self.events(s, 40),
            "time_scale": self.time_scale,
            "demo_mode": self.settings.demo_mode,
            "game": self.cfg.game.model_dump(),
            "connections": connections or {},
        }

    # ------------------------------------------------------------ technique
    def health(self) -> dict:
        db_ok = True
        try:
            with self.sf() as s:
                s.execute(text("SELECT 1"))
        except Exception:  # pragma: no cover - dépend de l'environnement
            db_ok = False
            log.exception("health: base indisponible")
        videos = {v.file: self.game.video_available(v.file) for v in self.cfg.videos}
        return {"status": "ok" if db_ok else "degraded", "version": __version__, "database": db_ok,
                "videos_available": sum(videos.values()), "videos_total": len(videos),
                "missing_videos": [f for f, ok in videos.items() if not ok],
                "time": iso(self.clock()), "demo_mode": self.settings.demo_mode, "time_scale": self.time_scale}

    def backup(self, target_dir: Path | None = None) -> Path:
        return backup_sqlite(self.settings.db_url, target_dir or self.settings.data_dir / "backups", self.clock())


def backup_sqlite(db_url: str, target_dir: Path, now) -> Path:
    """Copie cohérente de la base SQLite (API de sauvegarde en ligne de SQLite), utilisable à chaud."""
    if not db_url.startswith("sqlite:///"):
        raise RuntimeError("sauvegarde disponible uniquement pour SQLite")
    source = Path(db_url.removeprefix("sqlite:///"))
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"noel2026-{now.strftime('%Y%m%d-%H%M%S-%f')}.db"
    src, dst = sqlite3.connect(source), sqlite3.connect(target)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    return target
