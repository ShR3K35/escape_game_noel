"""Télécommande Zigbee : détection des combinaisons et pont MQTT -> backend."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import REPO_ROOT
from app.remote.bridge import Bridge, device_from_topic, extract_press, load_config
from app.remote.sequence import RemoteConfig, SequenceDetector, parse_action


def make(**kw) -> SequenceDetector:
    data = {"sequences": [{"name": "code", "buttons": [1, 3, 3, 2], "action": 6}]} | kw
    return SequenceDetector(RemoteConfig.model_validate(data))


def play(det: SequenceDetector, presses: list[str], start: float = 0.0, gap: float = 0.5):
    out = []
    for i, p in enumerate(presses):
        button, kind = parse_action(p)
        out += det.handle(button, kind, start + i * gap)
    return out


def test_parse_action():
    assert parse_action("3_double") == (3, "double")
    assert parse_action("4_hold") == (4, "hold")
    for bad in ("", "5_single", "1_triple", None, 12, "brightness_up"):
        assert parse_action(bad) is None


def test_exact_sequence_triggers_once_and_resets():
    det = make()
    [t] = play(det, ["1_single", "3_single", "3_single", "2_single"])
    assert (t.action, t.kind, t.presses) == (6, "success", (1, 3, 3, 2))
    assert det.presses == []


def test_double_counts_as_two_presses():
    det = make()
    [t] = play(det, ["1_single", "3_double", "2_single"])
    assert t.action == 6


def test_double_as_one_press_when_disabled():
    det = make(double_counts_as_two=False)
    assert play(det, ["1_single", "3_double", "2_single"]) == []


def test_wrong_start_is_forgiven_without_waiting():
    det = make()
    [t] = play(det, ["4_single", "2_single", "1_single", "3_single", "3_single", "2_single"])
    assert t.kind == "success"


def test_pause_resets_the_attempt():
    det = make(reset_seconds=4)
    play(det, ["1_single", "3_single"])
    assert play(det, ["3_single", "2_single"], start=10) == []


def test_hold_clears_the_attempt():
    det = make()
    assert play(det, ["1_single", "3_single", "1_hold", "3_single", "2_single"]) == []


def test_abandoned_attempt_triggers_wrong_action():
    det = make(wrong_action=7)
    play(det, ["2_single", "2_single", "2_single", "2_single"])
    assert det.tick(1.0) == []  # délai pas encore écoulé
    [t] = det.tick(10.0)
    assert (t.action, t.kind, t.presses) == (7, "wrong", (2, 2, 2, 2))
    assert det.tick(20.0) == []


def test_short_abandoned_attempt_is_not_a_wrong_code():
    det = make(wrong_action=7)
    play(det, ["2_single"])
    assert det.tick(10.0) == []


def test_new_press_after_timeout_reports_wrong_then_counts():
    det = make(wrong_action=7)
    play(det, ["2_single", "2_single", "2_single", "2_single"])
    triggers = play(det, ["1_single", "3_single", "3_single", "2_single"], start=10)
    assert [(t.kind, t.action) for t in triggers] == [("wrong", 7), ("success", 6)]


def test_longest_sequence_wins_and_several_sequences():
    det = SequenceDetector(RemoteConfig.model_validate({"sequences": [
        {"name": "court", "buttons": [3, 2], "action": 6},
        {"name": "long", "buttons": [1, 3, 2], "action": 8},
        {"name": "autre", "buttons": [4, 4], "action": 9},
    ]}))
    assert [t.name for t in play(det, ["1_single", "3_single", "2_single"])] == ["long"]
    assert [t.name for t in play(det, ["4_double"], start=20)] == ["autre"]


@pytest.mark.parametrize("bad", [
    {"sequences": []},
    {"sequences": [{"name": "x", "buttons": [1, 5], "action": 6}]},
    {"sequences": [{"name": "x", "buttons": [1, 2], "action": 11}]},
    {"sequences": [{"name": "x", "buttons": [1, 2], "action": 6}, {"name": "y", "buttons": [1, 2], "action": 7}]},
])
def test_invalid_configs_are_rejected(bad):
    with pytest.raises(ValidationError):
        RemoteConfig.model_validate(bad)


def test_shipped_config_is_valid():
    cfg = load_config(Path(REPO_ROOT) / "config" / "telecommande.yaml")
    assert cfg.device == "telecommande" and cfg.sequences


def test_topic_and_payload_parsing():
    assert device_from_topic("zigbee2mqtt/telecommande", "zigbee2mqtt") == "telecommande"
    assert device_from_topic("zigbee2mqtt/bridge", "zigbee2mqtt") is None
    assert device_from_topic("zigbee2mqtt/bridge/state", "zigbee2mqtt") is None
    assert device_from_topic("autre/telecommande", "zigbee2mqtt") is None
    assert extract_press(b'{"action": "2_single", "battery": 90}') == (2, "single")
    assert extract_press(b'{"battery": 90, "linkquality": 120}') is None
    assert extract_press(b"pas du json") is None
    assert extract_press(b"[1, 2]") is None


class FakeApi:
    def __init__(self):
        self.calls = []

    def trigger(self, number):
        self.calls.append(number)
        return {"action": number}


def test_bridge_filters_device_and_triggers_api():
    cfg = RemoteConfig.model_validate({"device": "telecommande",
                                       "sequences": [{"name": "code", "buttons": [1, 2], "action": 6}]})
    api = FakeApi()
    bridge = Bridge(cfg, api)
    msg = lambda a: json.dumps({"action": a}).encode()  # noqa: E731
    bridge.on_message("zigbee2mqtt/autre", msg("1_single"))
    bridge.on_message("zigbee2mqtt/telecommande", msg("1_single"))
    bridge.on_message("zigbee2mqtt/telecommande", b'{"battery": 80}')
    bridge.on_message("zigbee2mqtt/telecommande", msg("2_single"))
    while not bridge.presses.empty():
        bridge.step(timeout=0)
    assert api.calls == [6]


def test_bridge_end_to_end_with_backend(client):
    """Le pont appelle la vraie route /api/devices/actions/{n} (jeton facultatif en test)."""
    class TestClientApi:
        def trigger(self, number):
            r = client.post(f"/api/devices/actions/{number}", json={"source": "bouton", "device": "telecommande"},
                            headers={"Idempotency-Key": "telecommande-test-01"})
            assert r.status_code == 200
            return r.json()

    cfg = RemoteConfig.model_validate({"sequences": [{"name": "rouge", "buttons": [4, 1], "action": 1}]})
    bridge = Bridge(cfg, TestClientApi())
    for a in ("4_single", "1_single"):
        bridge.on_message("zigbee2mqtt/telecommande", json.dumps({"action": a}).encode())
        bridge.step(timeout=0)
    assert client.get("/api/devices/actions").status_code == 200
