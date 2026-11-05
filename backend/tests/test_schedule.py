"""Planning de la soirée et mode démonstration."""

from datetime import datetime


def schedule(client):
    return {i["id"]: i for i in client.get("/api/admin/state").json()["schedule"]}


def tick(client):
    svc = client.app.state.services
    return svc.run(svc.schedule.tick)


def test_nothing_fires_before_start(admin, clock):
    clock.advance(hours=4)
    assert tick(admin) == []


def test_relative_schedule_fires_on_time(admin, clock):
    admin.post("/api/admin/game/start")  # 20h00 Paris
    clock.advance(minutes=29)
    assert tick(admin) == []
    clock.advance(minutes=1, seconds=1)
    assert tick(admin) == ["relance"]
    assert schedule(admin)["relance"]["status"] == "done"
    assert admin.get("/api/public/state").json()["tv"]["play"]["video"]["id"] == "relance"
    assert tick(admin) == []  # jamais déclenché deux fois


def test_late_start_shifts_relative_items(admin, clock):
    clock.advance(minutes=10)  # démarrage à 20h10
    admin.post("/api/admin/game/start")
    item = schedule(admin)["relance"]
    assert item["due_at"] == "2026-12-24T19:40:00Z"  # 20h40 Paris


def test_clock_anchor_is_absolute(admin, clock):
    clock.advance(minutes=10)
    admin.post("/api/admin/game/start")
    assert schedule(admin)["appel_lutins"]["due_at"] == "2026-12-24T22:00:00Z"  # 23h00 Paris


def test_phase_action_and_missed_items(admin, clock):
    admin.post("/api/admin/game/start")
    admin.post("/api/admin/game/phase", json={"phase": "ENQUETE"})
    clock.advance(minutes=75, seconds=30)  # 21h15m30 : relance/alerte/rappel_30 ratés, finale à l'heure
    handled = tick(admin)
    assert set(handled) == {"relance", "alerte", "rappel_30", "finale"}
    items = schedule(admin)
    assert items["relance"]["status"] == "skipped"
    assert items["finale"]["status"] == "done"
    assert admin.get("/api/admin/state").json()["phase"] == "FINALE"


def test_invalid_phase_action_is_skipped(admin, clock):
    admin.post("/api/admin/game/start")  # reste en INTRO : FINALE interdite
    clock.advance(minutes=75)
    for item_id in ("relance", "alerte", "rappel_30"):
        admin.post(f"/api/admin/schedule/{item_id}", json={"enabled": False})
    tick(admin)
    assert schedule(admin)["finale"]["status"] == "skipped"
    assert admin.get("/api/admin/state").json()["phase"] == "INTRO"


def test_disable_edit_and_manual_fire(admin, clock):
    admin.post("/api/admin/game/start")
    admin.post("/api/admin/schedule/relance", json={"enabled": False})
    clock.advance(minutes=31)
    assert "relance" not in tick(admin)
    admin.post("/api/admin/schedule/alerte", json={"at": "20:35"})
    clock.advance(minutes=5)
    assert tick(admin) == ["alerte"]
    assert admin.post("/api/admin/schedule/rappel_10/fire").status_code == 200
    assert schedule(admin)["rappel_10"]["status"] == "done"
    assert admin.get("/api/public/state").json()["tv"]["message"]["title"] == "Il reste 10 minutes"
    assert admin.post("/api/admin/schedule/relance", json={"at": "25:00"}).status_code == 422
    assert admin.post("/api/admin/schedule/inconnu/fire").status_code == 404


def test_demo_mode_accelerates(make_client, clock):
    from tests.conftest import PASSWORD

    c = make_client(demo_mode=True)
    c.post("/api/auth/login", json={"password": PASSWORD})
    assert c.get("/api/admin/state").json()["time_scale"] == 30
    c.post("/api/admin/game/start")
    clock.advance(seconds=61)  # 30 minutes de jeu / 30
    assert "relance" in tick(c)


def test_due_at_after_midnight(svc):
    item = svc.cfg.schedule_item("appel_lutins")
    due = svc.schedule.due_at(item, "00:30", datetime(2026, 12, 24, 19, 0))
    assert due == datetime(2026, 12, 24, 23, 30)
