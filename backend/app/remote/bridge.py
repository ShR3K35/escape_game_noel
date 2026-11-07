"""Pont télécommande Zigbee -> backend : écoute Zigbee2MQTT, reconnaît les combinaisons et déclenche les actions.

Lancement (conteneur « telecommande » de compose.prod.yml) :  python -m app.remote.bridge

Variables d'environnement :
  MQTT_HOST / MQTT_PORT       broker Mosquitto (défaut mosquitto:1883)
  MQTT_BASE_TOPIC             préfixe Zigbee2MQTT (défaut zigbee2mqtt)
  API_URL                     backend (défaut http://app:8080)
  DEVICE_TOKEN                jeton partagé avec le backend (en-tête X-Device-Token)
  REMOTE_CONFIG               fichier des combinaisons (défaut /app/config/telecommande.yaml)
"""

import json
import logging
import os
import queue
import signal
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

import paho.mqtt.client as mqtt
import yaml

from app.remote.sequence import RemoteConfig, SequenceDetector, Trigger, parse_action

log = logging.getLogger("telecommande")


def load_config(path: Path) -> RemoteConfig:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return RemoteConfig.model_validate(data.get("telecommande", data))


def device_from_topic(topic: str, base: str) -> str | None:
    """« zigbee2mqtt/telecommande » -> « telecommande » ; les sujets du pont Z2M sont ignorés."""
    prefix = base.rstrip("/") + "/"
    if not topic.startswith(prefix):
        return None
    name = topic[len(prefix):]
    return None if not name or "/" in name or name == "bridge" else name


def extract_press(payload: bytes) -> tuple[int, str] | None:
    try:
        data = json.loads(payload)
    except (ValueError, UnicodeDecodeError):
        return None
    return parse_action(data.get("action")) if isinstance(data, dict) else None


class ApiClient:
    def __init__(self, base_url: str, token: str, device: str = "telecommande", timeout: float = 5.0):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.device = device
        self.timeout = timeout

    def trigger(self, number: int, attempts: int = 3) -> dict | None:
        """Même Idempotency-Key à chaque tentative : un réessai réseau ne rejoue pas l'action."""
        body = json.dumps({"source": "bouton", "device": self.device}).encode()
        headers = {"Content-Type": "application/json", "Idempotency-Key": uuid.uuid4().hex}
        if self.token:
            headers["X-Device-Token"] = self.token
        url = f"{self.base_url}/api/devices/actions/{number}"
        for attempt in range(1, attempts + 1):
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.loads(resp.read() or b"{}")
            except urllib.error.HTTPError as exc:
                log.error("action %s refusée par le backend : HTTP %s %s", number, exc.code, exc.read()[:200])
                return None  # 4xx/5xx : réessayer ne changerait rien
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                log.warning("backend injoignable (tentative %s/%s) : %s", attempt, attempts, exc)
                time.sleep(attempt)
        return None


class Bridge:
    def __init__(self, config: RemoteConfig, api: ApiClient, base_topic: str = "zigbee2mqtt"):
        self.config = config
        self.api = api
        self.base_topic = base_topic
        self.detector = SequenceDetector(config)
        self.presses: queue.Queue[tuple[int, str]] = queue.Queue()

    def on_message(self, topic: str, payload: bytes) -> None:
        """Appelé par le fil MQTT : on se contente de mettre l'appui en file."""
        device = device_from_topic(topic, self.base_topic)
        if device is None or (self.config.device != "*" and device != self.config.device):
            return
        press = extract_press(payload)
        if press:
            self.presses.put(press)

    def step(self, timeout: float = 0.2) -> list[Trigger]:
        try:
            button, kind = self.presses.get(timeout=timeout)
        except queue.Empty:
            triggers = self.detector.tick(time.monotonic())
        else:
            triggers = self.detector.handle(button, kind, time.monotonic())
            log.info("appui %s_%s -> saisie %s", button, kind, self.detector.presses)
        for t in triggers:
            label = f"combinaison « {t.name} »" if t.kind == "success" else "combinaison ratée"
            log.info("%s %s -> action %s", label, list(t.presses), t.action)
            result = self.api.trigger(t.action)
            if result is not None:
                log.info("réponse du backend : %s", result)
        return triggers


def main() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
    config = load_config(Path(os.environ.get("REMOTE_CONFIG", "/app/config/telecommande.yaml")))
    base_topic = os.environ.get("MQTT_BASE_TOPIC", "zigbee2mqtt")
    api = ApiClient(os.environ.get("API_URL", "http://app:8080"), os.environ.get("DEVICE_TOKEN", ""))
    bridge = Bridge(config, api, base_topic)
    log.info("combinaisons : %s", {s.name: s.buttons for s in config.sequences})

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="noel2026-telecommande")
    topic = f"{base_topic}/{'+' if config.device == '*' else config.device}"

    def on_connect(c, _userdata, _flags, reason_code, _props):
        if reason_code.is_failure:
            log.error("connexion MQTT refusée : %s", reason_code)
            return
        c.subscribe(topic)
        log.info("abonné à %s", topic)

    client.on_connect = on_connect
    client.on_message = lambda _c, _u, msg: bridge.on_message(msg.topic, msg.payload)
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    client.connect_async(os.environ.get("MQTT_HOST", "mosquitto"), int(os.environ.get("MQTT_PORT", "1883")))
    client.loop_start()

    stop = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    try:
        while not stop.is_set():
            bridge.step()
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
