"""Protocole d'urgence : action 5 du boîtier Matter, autorisée par le maître du jeu."""

from app.models import EventLog

PATIENCE = "Soyez patients mes lutins, laissez encore un peu de temps aux adultes de résoudre l'enquête"


def to_enquete(admin):
    assert admin.post("/api/admin/game/start").status_code == 200
    assert admin.post("/api/admin/game/phase", json={"phase": "ENQUETE"}).status_code == 200


def test_locked_by_default_shows_patience_message(admin):
    to_enquete(admin)
    assert admin.get("/api/admin/state").json()["emergency_authorized"] is False
    r = admin.post("/api/devices/actions/5")
    assert r.status_code == 200
    assert r.json() == {"action": 5, "defined": True, "changed": True, "effect": "emergency_refused"}
    state = admin.get("/api/admin/state").json()
    assert state["phase"] == "ENQUETE"
    assert state["tv"]["message"]["text"] == PATIENCE
    assert state["tv"]["play"]["video"]["id"] != "secours"


def test_authorized_starts_secours_video(admin, svc):
    to_enquete(admin)
    r = admin.post("/api/admin/game/emergency", json={"authorized": True})
    assert r.json() == {"changed": True, "authorized": True}
    assert admin.get("/api/admin/state").json()["emergency_authorized"] is True
    r = admin.post("/api/devices/actions/5").json()
    assert r["effect"] == "emergency_started" and r["phase"] == "SECOURS"
    state = admin.get("/api/admin/state").json()
    assert state["phase"] == "SECOURS"
    assert state["tv"]["play"]["video"]["id"] == "secours"
    assert state["tv"]["message"] is None
    # Second appui pendant le secours : rien ne se relance.
    again = admin.post("/api/devices/actions/5").json()
    assert again["effect"] == "emergency_running" and again["changed"] is False
    with svc.sf() as s:
        change = s.query(EventLog).filter_by(type="phase_changed").order_by(EventLog.id.desc()).first()
        assert change.data == {"from": "ENQUETE", "to": "SECOURS"} and change.source == "device"


def test_authorized_plays_video_even_with_unfinished_teams(admin):
    to_enquete(admin)
    admin.post("/api/admin/teams/rouge", json={"status": "EN_COURS"})
    admin.post("/api/admin/game/emergency", json={"authorized": True})
    assert admin.post("/api/devices/actions/5").json()["effect"] == "emergency_started"
    state = admin.get("/api/admin/state").json()
    assert state["tv"]["play"]["video"]["id"] == "secours"
    assert {t["status"] for t in state["teams"]} == {"NON_COMMENCE", "EN_COURS"}


def test_authorized_outside_enquete_still_plays_video(admin):
    admin.post("/api/admin/game/emergency", json={"authorized": True})
    r = admin.post("/api/devices/actions/5").json()
    assert r["effect"] == "emergency_video" and r["phase"] == "PREPARATION" and r["changed"] is True
    state = admin.get("/api/admin/state").json()
    assert state["phase"] == "PREPARATION"
    assert state["tv"]["play"]["video"]["id"] == "secours"


def test_secours_phase_replays_video_once_finished(admin):
    to_enquete(admin)
    admin.post("/api/admin/game/emergency", json={"authorized": True})
    admin.post("/api/devices/actions/5")
    admin.post("/api/admin/tv/stop")
    r = admin.post("/api/devices/actions/5").json()
    assert r["effect"] == "emergency_video" and r["phase"] == "SECOURS"
    assert admin.get("/api/admin/state").json()["tv"]["play"]["video"]["id"] == "secours"


def test_lock_again_and_reset_clear_authorization(admin):
    to_enquete(admin)
    admin.post("/api/admin/game/emergency", json={"authorized": True})
    assert admin.post("/api/admin/game/emergency", json={"authorized": False}).json()["changed"] is True
    assert admin.post("/api/devices/actions/5").json()["effect"] == "emergency_refused"
    admin.post("/api/admin/game/emergency", json={"authorized": True})
    assert admin.post("/api/admin/game/reset", json={"confirm": True}).status_code == 200
    assert admin.get("/api/admin/state").json()["emergency_authorized"] is False


def test_emergency_route_requires_admin(client):
    assert client.post("/api/admin/game/emergency", json={"authorized": True}).status_code == 401
