"""Avancement affiché sur la TV."""

import sqlite3

from alembic import command
from alembic.config import Config

from app.models.migrate import BACKEND_DIR


def test_public_state_exposes_progress_without_solutions(client):
    state = client.get("/api/public/state").json()
    assert state["tv"]["show_progress"] is True
    games = state["kids_games"]
    assert [g["id"] for g in games] == ["constellation", "machine", "cadeaux", "code"]
    assert set(games[0]) == {"id", "title", "status"}
    assert games[0]["status"] == "available"


def test_progress_follows_teams_and_kids(admin):
    admin.post("/api/admin/teams/verte", json={"status": "VALIDEE"})
    admin.post("/api/admin/kids/constellation/complete")
    state = admin.get("/api/public/state").json()
    assert {t["id"]: t["status"] for t in state["teams"]}["verte"] == "VALIDEE"
    assert state["kids_games"][0]["status"] == "completed"
    assert state["kids_summary"]["completed"] == 1


def test_toggle_progress_overlay(admin, client):
    assert admin.post("/api/admin/tv/progress", json={"visible": False}).json()["changed"] is True
    assert admin.get("/api/public/state").json()["tv"]["show_progress"] is False
    assert admin.post("/api/admin/tv/progress", json={"visible": False}).json()["changed"] is False
    admin.post("/api/admin/game/reset", json={"confirm": True})
    assert admin.get("/api/public/state").json()["tv"]["show_progress"] is False  # réglage conservé
    assert admin.post("/api/admin/tv/progress", json={"visible": "peut-être"}).status_code == 422


def test_toggle_requires_admin(client):
    assert client.post("/api/admin/tv/progress", json={"visible": False}).status_code == 401


def test_migration_from_v1_database(tmp_path, make_client):
    """Une base créée par la V1 (révision 0001) est migrée au démarrage sans perte."""
    db = tmp_path / "data" / "noel2026.db"
    db.parent.mkdir(parents=True)
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db}")
    command.upgrade(cfg, "0001")
    with sqlite3.connect(db) as conn:
        conn.execute("insert into game_state (id, phase, tv_ambient) values (1, 'ENQUETE', 'neige')")
    c = make_client()
    state = c.get("/api/public/state").json()
    assert state["phase"] == "ENQUETE"
    assert state["tv"]["show_progress"] is True


def test_migration_traces_to_machine(tmp_path, make_client):
    """Base en 0002 avec l'ancien jeu « traces » réussi : reprise en « machine », questions tirées."""
    db = tmp_path / "data" / "noel2026.db"
    db.parent.mkdir(parents=True)
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db}")
    command.upgrade(cfg, "0002")
    with sqlite3.connect(db) as conn:
        for gid in ("constellation", "traces"):
            conn.execute("insert into kids_progress (game_id, completed, completed_by_admin, attempts, failures, step)"
                         " values (?, 1, 0, 3, 2, 0)", (gid,))
    c = make_client()
    games = {g["id"]: g for g in c.get("/api/kids/state").json()["games"]}
    assert list(games) == ["constellation", "machine", "cadeaux", "code"]
    assert games["machine"]["status"] == "completed"
    assert games["cadeaux"]["status"] == "available"
    with sqlite3.connect(db) as conn:
        assert conn.execute("select count(*) from kids_progress where game_id = 'traces'").fetchone() == (0,)
        assert conn.execute("select data from kids_progress where game_id = 'machine'").fetchone()[0] is not None
