from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models import EventLog

Clock = Callable[[], datetime]


def utcnow() -> datetime:
    """UTC sans fuseau (format stocké en base)."""
    return datetime.now(UTC).replace(tzinfo=None)


def iso(dt: datetime | None) -> str | None:
    return dt.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z") if dt else None


class GameError(Exception):
    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def log_event(s: Session, clock: Clock, type_: str, message: str, data: dict | None = None,
              source: str = "system") -> EventLog:
    entry = EventLog(ts=clock(), type=type_, source=source, message=message[:300], data=data)
    s.add(entry)
    return entry
