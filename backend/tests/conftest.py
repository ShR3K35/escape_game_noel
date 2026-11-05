import shutil
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import REPO_ROOT, Settings
from app.core.security import hash_password
from app.main import create_app

PASSWORD = "secret-de-test"
_HASH = hash_password(PASSWORD)


class FakeClock:
    def __init__(self, start: datetime = datetime(2026, 12, 24, 19, 0, 0)):  # 20h00 à Paris
        self.now = start

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kw) -> None:
        self.now += timedelta(**kw)


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def media_dir(tmp_path: Path) -> Path:
    videos = tmp_path / "media" / "videos"
    videos.mkdir(parents=True)
    # Quelques vidéos « présentes », les autres manquantes (écran de substitution).
    for name in ("00_loop_bureau.mp4", "01_intro_2000.mp4", "05_victoire.mp4"):
        (videos / name).write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64)
    return tmp_path / "media"


@pytest.fixture
def settings(tmp_path: Path, media_dir: Path) -> Settings:
    return Settings(app_env="test", data_dir=tmp_path / "data", config_dir=REPO_ROOT / "config",
                    media_dir=media_dir, admin_password_hash=_HASH, secret_key="test-secret",
                    scheduler_enabled=False, log_format="text", log_level="WARNING")


@pytest.fixture
def make_client(settings: Settings, clock: FakeClock):
    clients = []

    def _make(**overrides) -> TestClient:
        s = settings.model_copy(update=overrides)
        client = TestClient(create_app(s, clock=clock))
        client.__enter__()
        clients.append(client)
        return client

    yield _make
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def client(make_client) -> TestClient:
    return make_client()


@pytest.fixture
def admin(client: TestClient) -> TestClient:
    r = client.post("/api/auth/login", json={"password": PASSWORD})
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
def svc(client: TestClient):
    return client.app.state.services


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    d = tmp_path / "dist"
    (d / "assets").mkdir(parents=True)
    (d / "index.html").write_text("<!doctype html><title>Noël</title><div id=root></div>")
    (d / "assets" / "app.js").write_text("console.log('noel')")
    return d


def copy_config(tmp_path: Path) -> Path:
    target = tmp_path / "config"
    shutil.copytree(REPO_ROOT / "config", target)
    return target
