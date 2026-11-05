"""Machine à états de la partie et des équipes."""


def phase(admin):
    return admin.get("/api/admin/state").json()["phase"]


def test_initial_state_is_preparation(admin):
    state = admin.get("/api/admin/state").json()
    assert state["phase"] == "PREPARATION"
    assert {t["status"] for t in state["teams"]} == {"NON_COMMENCE"}
    assert len(state["teams"]) == 4


def test_nominal_flow_until_victory(admin):
    assert admin.post("/api/admin/game/start").json()["changed"] is True
    assert phase(admin) == "INTRO"
    assert admin.post("/api/admin/game/phase", json={"phase": "ENQUETE"}).status_code == 200
    assert admin.post("/api/admin/game/phase", json={"phase": "FINALE"}).status_code == 200
    assert admin.post("/api/admin/game/phase", json={"phase": "VICTOIRE", "confirm": True}).status_code == 200
    assert admin.post("/api/admin/game/phase", json={"phase": "FIN"}).status_code == 200
    assert phase(admin) == "FIN"


def test_secours_branch(admin):
    admin.post("/api/admin/game/start")
    admin.post("/api/admin/game/phase", json={"phase": "ENQUETE"})
    admin.post("/api/admin/game/phase", json={"phase": "FINALE"})
    r = admin.post("/api/admin/game/phase", json={"phase": "SECOURS", "confirm": True})
    assert r.status_code == 200
    state = admin.get("/api/admin/state").json()
    assert state["phase"] == "SECOURS"
    assert state["tv"]["play"]["video"]["id"] == "secours"


def test_forbidden_transition(admin):
    r = admin.post("/api/admin/game/phase", json={"phase": "FINALE"})
    assert r.status_code == 409
    assert "interdite" in r.json()["detail"]
    assert phase(admin) == "PREPARATION"


def test_critical_transitions_require_confirmation(admin):
    admin.post("/api/admin/game/start")
    admin.post("/api/admin/game/phase", json={"phase": "ENQUETE"})
    assert admin.post("/api/admin/game/phase", json={"phase": "VICTOIRE"}).status_code == 428
    assert admin.post("/api/admin/game/phase", json={"phase": "SECOURS"}).status_code == 428
    assert phase(admin) == "ENQUETE"


def test_same_phase_is_noop(admin):
    admin.post("/api/admin/game/start")
    r = admin.post("/api/admin/game/start")
    assert r.status_code == 200 and r.json()["changed"] is False


def test_transitions_are_logged_with_timestamp(admin):
    admin.post("/api/admin/game/start")
    events = admin.get("/api/admin/events").json()
    change = next(e for e in events if e["type"] == "phase_changed")
    assert change["data"] == {"from": "PREPARATION", "to": "INTRO"}
    assert change["ts"].endswith("Z")


def test_start_plays_intro_and_intro_end_advances(admin):
    admin.post("/api/admin/game/start")
    play = admin.get("/api/public/state").json()["tv"]["play"]
    assert play["video"]["id"] == "intro"
    admin.post("/api/tv/ended", json={"play_id": play["play_id"]})
    state = admin.get("/api/admin/state").json()
    assert state["phase"] == "ENQUETE"
    assert state["tv"]["play"] is None


def test_reset_requires_confirmation_and_resets_everything(admin):
    admin.post("/api/admin/game/start")
    admin.post("/api/admin/teams/rouge", json={"status": "VALIDEE"})
    admin.post("/api/admin/kids/constellation/complete")
    assert admin.post("/api/admin/game/reset", json={}).status_code == 428
    assert admin.post("/api/admin/game/reset", json={"confirm": True}).status_code == 200
    state = admin.get("/api/admin/state").json()
    assert state["phase"] == "PREPARATION"
    assert state["started_at"] is None
    assert {t["status"] for t in state["teams"]} == {"NON_COMMENCE"}
    assert state["kids"]["completed_count"] == 0
    assert {i["status"] for i in state["schedule"]} == {"pending"}


# ------------------------------------------------------------------ équipes
def test_team_progression(admin):
    assert admin.post("/api/admin/teams/verte", json={"status": "EN_COURS"}).json()["changed"]
    assert admin.post("/api/admin/teams/verte", json={"status": "VALIDEE"}).json()["changed"]
    teams = {t["id"]: t for t in admin.get("/api/admin/state").json()["teams"]}
    assert teams["verte"]["status"] == "VALIDEE"
    assert teams["rouge"]["status"] == "NON_COMMENCE"


def test_team_direct_validation_goes_through_en_cours(admin):
    admin.post("/api/admin/teams/or", json={"status": "VALIDEE"})
    changes = [e["data"] for e in admin.get("/api/admin/events").json() if e["type"] == "team_changed"]
    assert {"team": "or", "from": "NON_COMMENCE", "to": "EN_COURS"} in changes
    assert {"team": "or", "from": "EN_COURS", "to": "VALIDEE"} in changes


def test_team_invalidation(admin):
    admin.post("/api/admin/teams/bleue", json={"status": "VALIDEE"})
    admin.post("/api/admin/teams/bleue", json={"status": "EN_COURS"})
    teams = {t["id"]: t["status"] for t in admin.get("/api/admin/state").json()["teams"]}
    assert teams["bleue"] == "EN_COURS"


def test_team_validation_errors(admin):
    assert admin.post("/api/admin/teams/violette", json={"status": "EN_COURS"}).status_code == 404
    assert admin.post("/api/admin/teams/rouge", json={"status": "GAGNEE"}).status_code == 422


def test_idempotency_key_prevents_double_trigger(admin):
    headers = {"Idempotency-Key": "cmd-0001-abcdef"}
    first = admin.post("/api/admin/tv/play", json={"video_id": "relance"}, headers=headers).json()
    second = admin.post("/api/admin/tv/play", json={"video_id": "relance"}, headers=headers).json()
    assert second["replayed"] is True
    assert second["play_id"] == first["play_id"]
    plays = [e for e in admin.get("/api/admin/events").json() if e["type"] == "video_play"]
    assert len(plays) == 1
