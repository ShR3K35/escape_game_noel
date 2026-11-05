"""Tables SQLite. Toutes les dates sont stockées en UTC (sans fuseau)."""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.db import Base


class GameState(Base):
    """Ligne unique (id=1) : phase de la partie et état de la télévision."""

    __tablename__ = "game_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phase: Mapped[str] = mapped_column(String(20), default="PREPARATION")
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    phase_changed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tv_play_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    tv_video_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    tv_play_started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tv_message_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    tv_message_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tv_message_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    tv_message_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tv_ambient: Mapped[str] = mapped_column(String(20), default="neige")
    tv_show_progress: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class TeamProgress(Base):
    __tablename__ = "team_progress"

    team_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    status: Mapped[str] = mapped_column(String(20), default="NON_COMMENCE")
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class KidsProgress(Base):
    __tablename__ = "kids_progress"

    game_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_by_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    failures: Mapped[int] = mapped_column(Integer, default=0)
    step: Mapped[int] = mapped_column(Integer, default=0)
    # État propre à un jeu (machine à cadeaux : questions tirées pour la partie, réponses déjà écartées).
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ScheduleState(Base):
    """Surcharges du planning (horaire, activation) et statut d'exécution."""

    __tablename__ = "schedule_state"

    item_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    at_override: Mapped[str | None] = mapped_column(String(5), nullable=True)
    enabled_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | done | skipped
    fired_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)


class EventLog(Base):
    __tablename__ = "event_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    type: Mapped[str] = mapped_column(String(40), index=True)
    source: Mapped[str] = mapped_column(String(20))
    message: Mapped[str] = mapped_column(String(300))
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class ProcessedCommand(Base):
    """Clés d'idempotence : une commande rejouée renvoie le même résultat sans être réexécutée."""

    __tablename__ = "processed_command"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    response: Mapped[dict | None] = mapped_column(JSON, nullable=True)
