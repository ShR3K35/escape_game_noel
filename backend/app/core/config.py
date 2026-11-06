"""Paramètres techniques lus depuis les variables d'environnement.

Le même code tourne sur Windows (Docker Desktop) et sur le Raspberry Pi :
seules les variables d'environnement changent.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> racine du dépôt
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    app_env: str = "development"  # development | production | test
    data_dir: Path = REPO_ROOT / "data"
    database_url: str | None = None
    config_dir: Path = REPO_ROOT / "config"
    media_dir: Path = REPO_ROOT / "media"
    static_dir: Path | None = None

    admin_password_hash: str = ""
    secret_key: str = ""
    session_hours: int = 12
    cookie_secure: bool = False

    # Jeton partagé avec le boîtier ESP32 Matter (en-tête X-Device-Token). Obligatoire en production.
    device_token: str = ""

    demo_mode: bool = False
    time_scale: float | None = None
    scheduler_enabled: bool = True
    scheduler_interval_seconds: float = 1.0

    login_max_attempts: int = 5
    login_window_seconds: int = 300

    log_level: str = "INFO"
    log_format: str = "json"  # json | text

    @property
    def db_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{(self.data_dir / 'noel2026.db').as_posix()}"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"
