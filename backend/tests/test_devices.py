"""Routes du boîtier ESP32 Matter (/api/devices)."""

from app.models import EventLog

TOKEN = "jeton-esp32-de-test"


def test_catalog_lists_ten_undefined_actions(client):
    r = client.get("/api/devices/actions")
    assert r.status_code == 200
    actions = r.json()["actions"]
    assert [a["action"] for a in actions] == list(range(1, 11))
    assert not any(a["defined"] for a in actions)


def test_trigger_undefined_action_is_logged(client, svc):
    r = client.post("/api/devices/actions/3", json={"source": "bouton", "device": "esp32-salon"})
    assert r.status_code == 200
    assert r.json() == {"action": 3, "defined": False, "changed": False}
    with svc.sf() as s:
        entry = s.query(EventLog).filter_by(type="device_action").one()
        assert entry.data == {"action": 3, "source": "bouton", "device": "esp32-salon", "defined": False}


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
