"""Appel HTTP du relais de l'ESP8266 des capteurs de porte (firmware/esp8266-portes-relais)."""

import json
import urllib.error
import urllib.request

RELAY_TIMEOUT = 3.0


class RelayError(Exception):
    pass


def pulse_relay(base_url: str, token: str, timeout: float = RELAY_TIMEOUT) -> dict:
    """POST {base_url}/relay/pulse : l'ESP8266 colle le relais pendant RELAY_PULSE_MS (5 s)."""
    url = base_url.rstrip("/") + "/relay/pulse"
    req = urllib.request.Request(url, data=b"", headers={"X-Device-Token": token}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
    except urllib.error.HTTPError as exc:
        raise RelayError(f"HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RelayError(str(getattr(exc, "reason", exc))) from exc
    try:
        data = json.loads(body or b"{}")
    except ValueError:
        data = {}
    return {"pulse_ms": data.get("pulse_ms")} if isinstance(data, dict) else {}
