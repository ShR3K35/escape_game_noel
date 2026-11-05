"""Compte à rebours affiché sur la TV avant la vidéo d'introduction."""


def public(client):
    return client.get("/api/public/state").json()


def tick(svc):
    return svc.run(svc.game.tick_countdown)


def test_countdown_shown_on_tv_then_starts_intro(admin, svc, clock):
    assert public(admin)["tv"]["countdown"] is None
    r = admin.post("/api/admin/game/countdown", json={"seconds": 120})
    assert r.status_code == 200, r.text
    state = public(admin)
    assert state["phase"] == "PREPARATION"
    assert state["tv"]["countdown"]["until"] == "2026-12-24T19:02:00Z"

    clock.advance(seconds=119)
    assert tick(svc) is False
    assert public(admin)["phase"] == "PREPARATION"

    clock.advance(seconds=1)
    assert tick(svc) is True
    state = public(admin)
    assert state["phase"] == "INTRO"
    assert state["tv"]["countdown"] is None
    assert state["tv"]["play"]["video"]["id"] == "intro"
    types = [e["type"] for e in admin.get("/api/admin/events").json()]
    assert "countdown_started" in types and "countdown_ended" in types


def test_countdown_can_be_restarted_and_cancelled(admin, svc, clock):
    admin.post("/api/admin/game/countdown", json={"seconds": 60})
    admin.post("/api/admin/game/countdown", json={"seconds": 300})
    assert public(admin)["tv"]["countdown"]["until"] == "2026-12-24T19:05:00Z"
    assert admin.post("/api/admin/game/countdown/cancel").json()["changed"] is True
    assert public(admin)["tv"]["countdown"] is None
    clock.advance(minutes=10)
    assert tick(svc) is False
    assert public(admin)["phase"] == "PREPARATION"


def test_manual_start_clears_countdown(admin, svc, clock):
    admin.post("/api/admin/game/countdown", json={"seconds": 60})
    admin.post("/api/admin/game/start")
    assert public(admin)["tv"]["countdown"] is None
    clock.advance(seconds=90)
    tick(svc)
    assert public(admin)["phase"] == "INTRO"


def test_countdown_rejected_after_start_or_invalid(admin):
    assert admin.post("/api/admin/game/countdown", json={"seconds": 2}).status_code == 422
    assert admin.post("/api/admin/game/countdown", json={"seconds": 99999}).status_code == 422
    admin.post("/api/admin/game/start")
    assert admin.post("/api/admin/game/countdown", json={"seconds": 60}).status_code == 409


def test_countdown_requires_admin(client):
    assert client.post("/api/admin/game/countdown", json={"seconds": 60}).status_code == 401


def test_reset_clears_countdown(admin):
    admin.post("/api/admin/game/countdown", json={"seconds": 60})
    admin.post("/api/admin/game/reset", json={"confirm": True})
    assert public(admin)["tv"]["countdown"] is None


def test_countdown_missed_during_outage_does_not_start_intro(admin, svc, clock):
    admin.post("/api/admin/game/countdown", json={"seconds": 60})
    clock.advance(minutes=10)
    assert tick(svc) is True
    state = public(admin)
    assert state["phase"] == "PREPARATION"
    assert state["tv"]["countdown"] is None


def test_countdown_survives_restart(make_client, clock):
    first = make_client()
    first.post("/api/auth/login", json={"password": "secret-de-test"})
    first.post("/api/admin/game/countdown", json={"seconds": 600})
    second = make_client()
    assert public(second)["tv"]["countdown"]["until"] == "2026-12-24T19:10:00Z"
