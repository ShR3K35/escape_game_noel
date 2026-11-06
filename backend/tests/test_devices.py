"""Routes du boîtier ESP32 Matter (/api/devices)."""

import pytest

from app.models import EventLog, TeamProgress

TOKEN = "jeton-esp32-de-test"


def team_status(svc, team_id: str) -> str:
    with svc.sf() as s:
        return s.get(TeamProgress, team_id).status


def test_catalog_lists_ten_actions_first_five_defined(client):
    r = client.get("/api/devices/actions")
    assert r.status_code == 200
    actions = r.json()["actions"]
    assert [a["action"] for a in actions] == list(range(1, 11))
    assert [a["action"] for a in actions if a["defined"]] == [1, 2, 3, 4, 5]


@pytest.mark.parametrize(("number", "team_id"), [(1, "rouge"), (2, "verte"), (3, "bleue"), (4, "or")])
def test_actions_1_to_4_validate_team_mission(client, svc, number, team_id):
    r = client.post(f"/api/devices/actions/{number}", json={"source": "matter"})
    assert r.status_code == 200
    assert r.json() == {"action": number, "defined": True, "changed": True, "effect": "team_validated",
                        "team": team_id, "status": "VALIDEE"}
    assert team_status(svc, team_id) == "VALIDEE"
    others = {"rouge", "verte", "bleue", "or"} - {team_id}
    assert all(team_status(svc, t) == "NON_COMMENCE" for t in others)
    with svc.sf() as s:
        steps = [e.data["to"] for e in s.query(EventLog).filter_by(type="team_changed").order_by(EventLog.id)]
        assert steps == ["EN_COURS", "VALIDEE"]
        assert {e.source for e in s.query(EventLog).filter_by(type="team_changed")} == {"device"}


def test_validating_twice_changes_nothing(client, svc):
    client.post("/api/devices/actions/1")
    again = client.post("/api/devices/actions/1").json()
    assert again["changed"] is False and again["status"] == "VALIDEE"


def test_trigger_undefined_action_is_logged(client, svc):
    r = client.post("/api/devices/actions/7", json={"source": "bouton", "device": "esp32-salon"})
    assert r.status_code == 200
    assert r.json() == {"action": 7, "defined": False, "changed": False}
    with svc.sf() as s:
        entry = s.query(EventLog).filter_by(type="device_action").one()
        assert entry.data == {"action": 7, "source": "bouton", "device": "esp32-salon", "defined": False}


def test_trigger_without_body_defaults_to_matter(client):
    assert client.post("/api/devices/actions/1").json()["action"] == 1


def test_unknown_action_and_bad_source(client):
    assert client.post("/api/devices/actions/0").status_code == 404
    assert client.post("/api/devices/actions/11").status_code == 404
    assert client.post("/api/devices/actions/1", json={"source": "pirate"}).status_code == 422


def test_defined_handler_runs_once_per_idempotency_key(client, svc):
    calls = []
    svc.actions.handlers[2] = lambda s, n, src: calls.append((n, src)) or {"changed": True, "effet": "test"}
    headers = {"Idempotency-Key": "appui-0001-abcd"}
    first = client.post("/api/devices/actions/2", json={"source": "matter"}, headers=headers).json()
    again = client.post("/api/devices/actions/2", json={"source": "matter"}, headers=headers).json()
    assert first == {"action": 2, "defined": True, "changed": True, "effet": "test"}
    assert again["replayed"] is True
    assert calls == [(2, "matter")]


def test_token_required_when_configured(make_client):
    c = make_client(device_token=TOKEN)
    assert c.post("/api/devices/actions/1").status_code == 401
    assert c.post("/api/devices/actions/1", headers={"X-Device-Token": "mauvais"}).status_code == 401
    assert c.post("/api/devices/actions/1", headers={"X-Device-Token": TOKEN}).status_code == 200


def test_production_without_token_refuses(make_client):
    c = make_client(app_env="production")
    assert c.post("/api/devices/actions/1").status_code == 503
