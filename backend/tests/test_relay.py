"""Commande admin du relais de l'ESP8266 des capteurs de porte."""

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from tests.conftest import PASSWORD


class FakeRelay(BaseHTTPRequestHandler):
    calls: list[tuple[str, str | None]] = []
    status = 200

    def do_POST(self):  # noqa: N802
        FakeRelay.calls.append((self.path, self.headers.get("X-Device-Token")))
        body = json.dumps({"relay": "on", "pulse_ms": 5000}).encode()
        self.send_response(FakeRelay.status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture
def relay_url():
    FakeRelay.calls = []
    FakeRelay.status = 200
    server = HTTPServer(("127.0.0.1", 0), FakeRelay)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()


def login(client):
    assert client.post("/api/auth/login", json={"password": PASSWORD}).status_code == 200


def events(client, type_):
    return [e for e in client.get("/api/admin/events").json() if e["type"] == type_]


def test_pulse_calls_relay_with_device_token(make_client, relay_url):
    client = make_client(relay_url=relay_url, device_token="jeton-relais")
    login(client)
    r = client.post("/api/admin/relay/pulse")
    assert r.status_code == 200
    assert r.json() == {"changed": True, "pulse_ms": 5000}
    assert FakeRelay.calls == [("/relay/pulse", "jeton-relais")]
    (event,) = events(client, "relay_pulse")
    assert event["source"] == "admin" and event["data"] == {"pulse_ms": 5000}


def test_pulse_requires_admin(make_client, relay_url):
    client = make_client(relay_url=relay_url)
    assert client.post("/api/admin/relay/pulse").status_code == 401
    assert FakeRelay.calls == []


def test_pulse_without_relay_url_is_503(make_client):
    client = make_client(relay_url="")
    login(client)
    r = client.post("/api/admin/relay/pulse")
    assert r.status_code == 503 and "RELAY_URL" in r.json()["detail"]


def test_relay_refusal_is_502_and_logged(make_client, relay_url):
    FakeRelay.status = 401
    client = make_client(relay_url=relay_url)
    login(client)
    r = client.post("/api/admin/relay/pulse")
    assert r.status_code == 502 and "HTTP 401" in r.json()["detail"]
    assert len(events(client, "relay_failed")) == 1


def test_unreachable_relay_is_502(make_client):
    client = make_client(relay_url="http://127.0.0.1:9")
    login(client)
    assert client.post("/api/admin/relay/pulse").status_code == 502

