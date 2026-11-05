"""Synchronisation temps réel via WebSocket."""

import pytest
from starlette.websockets import WebSocketDisconnect

from tests.conftest import PASSWORD


def test_tv_receives_initial_snapshot_and_play(admin):
    with admin.websocket_connect("/ws?channel=tv") as ws:
        first = ws.receive_json()
        assert first["type"] == "state" and first["channel"] == "tv"
        assert first["data"]["tv"]["play"] is None
        admin.post("/api/admin/tv/play", json={"video_id": "alerte"})
        update = ws.receive_json()
        assert update["data"]["tv"]["play"]["video"]["id"] == "alerte"
        assert "events" not in update["data"]  # pas de données admin sur la TV


def test_kids_channel_receives_admin_unlock(admin):
    with admin.websocket_connect("/ws?channel=kids") as ws:
        ws.receive_json()
        admin.post("/api/admin/kids/constellation/complete")
        data = ws.receive_json()["data"]
        assert data["games"][0]["status"] == "completed"
        assert "attempts" not in data["games"][0]


def test_admin_channel_requires_session(client):
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws?channel=admin") as ws:
            ws.receive_json()
    assert exc.value.code == 4401


def test_admin_channel_rejects_foreign_origin(client):
    client.post("/api/auth/login", json={"password": PASSWORD})
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws?channel=admin", headers={"origin": "http://evil.example"}) as ws:
            ws.receive_json()


def test_admin_channel_gets_events_and_connection_counts(admin):
    with admin.websocket_connect("/ws?channel=admin") as ws:
        assert "events" in ws.receive_json()["data"]
        with admin.websocket_connect("/ws?channel=tv") as tv:
            tv.receive_json()
            counts = ws.receive_json()["data"]["connections"]
            assert counts["tv"] == 1


def test_inbound_commands_ignored(admin):
    with admin.websocket_connect("/ws?channel=tv") as ws:
        ws.receive_json()
        ws.send_text('{"action": "start"}')
        ws.send_text("ping")
        assert ws.receive_json() == {"type": "pong"}
    assert admin.get("/api/admin/state").json()["phase"] == "PREPARATION"


def test_unknown_channel_rejected(client):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws?channel=hack") as ws:
            ws.receive_json()
