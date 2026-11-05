"""Sauvegarde des états et reprise après redémarrage (nouvelle instance sur la même base)."""

import sqlite3

from tests.conftest import PASSWORD

STARS = [[0, 2], [1, 0], [2, 3], [3, 1], [4, 3], [5, 0]]


def login(c):
    assert c.post("/api/auth/login", json={"password": PASSWORD}).status_code == 200


def test_state_survives_restart(make_client):
    first = make_client()
    login(first)
    first.post("/api/admin/game/start")
    first.post("/api/admin/game/phase", json={"phase": "ENQUETE"})
    first.post("/api/admin/teams/rouge", json={"status": "VALIDEE"})
    first.post("/api/admin/teams/or", json={"status": "EN_COURS"})
    first.post("/api/admin/schedule/relance", json={"at": "20:40", "enabled": False})
    first.post("/api/kids/games/constellation/attempt", json={"answer": {"cells": STARS}})
    first.post("/api/kids/games/machine/attempt", json={"answer": {"order": 0, "answer": 9999}})
    order = first.get("/api/kids/state").json()["games"][1]["content"]["order"]
    first.__exit__(None, None, None)

    second = make_client()  # « redémarrage du Raspberry Pi »
    login(second)  # la clé de session est conservée dans data/secret_key
    state = second.get("/api/admin/state").json()
    assert state["phase"] == "ENQUETE"
    assert state["started_at"] is not None
    teams = {t["id"]: t["status"] for t in state["teams"]}
    assert teams == {"rouge": "VALIDEE", "verte": "NON_COMMENCE", "bleue": "NON_COMMENCE", "or": "EN_COURS"}
    kids = {g["id"]: g for g in state["kids"]["games"]}
    assert kids["constellation"]["status"] == "completed"
    assert kids["machine"]["failures"] == 1
    assert kids["machine"]["content"]["order"] == order  # mêmes commandes tirées après redémarrage
    relance = next(i for i in state["schedule"] if i["id"] == "relance")
    assert relance["at"] == "20:40" and relance["enabled"] is False
    assert any(e["type"] == "server_started" for e in state["events"])


def test_session_survives_restart(make_client):
    first = make_client()
    login(first)
    cookie = first.cookies.get("noel_session")
    first.__exit__(None, None, None)
    second = make_client()
    second.cookies.set("noel_session", cookie)
    assert second.get("/api/admin/state").status_code == 200


def test_backup_creates_consistent_copy(admin, settings):
    admin.post("/api/admin/game/start")
    name = admin.post("/api/admin/backup").json()["file"]
    path = settings.data_dir / "backups" / name
    with sqlite3.connect(path) as db:
        assert db.execute("select phase from game_state").fetchone() == ("INTRO",)


def test_health(client):
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["database"] is True
    assert h["videos_total"] == 8 and h["videos_available"] == 3
    assert "07_appel_lutins_2300.mp4" in h["missing_videos"]


def test_dev_session_survives_restart_without_configured_hash(make_client):
    first = make_client(admin_password_hash="")
    assert first.post("/api/auth/login", json={"password": "noel2026"}).status_code == 200
    cookie = first.cookies.get("noel_session")
    first.__exit__(None, None, None)
    second = make_client(admin_password_hash="")
    second.cookies.set("noel_session", cookie)
    assert second.get("/api/admin/state").status_code == 200
