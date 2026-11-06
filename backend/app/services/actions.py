"""Actions déclenchées par les objets connectés (boîtier ESP32 Matter : 10 boutons + 10 lampes virtuels).

Chaque appui sur le bouton virtuel « Action N » dans l'application domotique arrive sur
POST /api/devices/actions/{n}. L'appui est toujours journalisé ; l'effet réel sur la partie
sera branché plus tard dans HANDLERS (une fonction par numéro d'action).
"""

from collections.abc import Callable

from sqlalchemy.orm import Session

from app.services.common import Clock, GameError, log_event

ACTION_COUNT = 10

# (session, numéro, source) -> détail renvoyé au boîtier. Le résultat doit contenir "changed": bool
# (True = l'état de la partie a changé, les écrans sont alors notifiés).
ActionHandler = Callable[[Session, int, str], dict]


class ActionsService:
    def __init__(self, clock: Clock):
        self.clock = clock
        # À compléter quand les actions seront définies, ex. : {1: lambda s, n, src: game.start(s)}
        self.handlers: dict[int, ActionHandler] = {}

    def catalog(self) -> list[dict]:
        return [{"action": n, "defined": n in self.handlers} for n in range(1, ACTION_COUNT + 1)]

    def trigger(self, s: Session, number: int, source: str, device: str) -> dict:
        if not 1 <= number <= ACTION_COUNT:
            raise GameError(f"action inconnue : {number} (1 à {ACTION_COUNT})", 404)
        handler = self.handlers.get(number)
        log_event(s, self.clock, "device_action",
                  f"Action {number} reçue de {device} ({source})"
                  + ("" if handler else " : aucune action définie"),
                  {"action": number, "source": source, "device": device, "defined": handler is not None},
                  "device")
        if handler is None:
            return {"action": number, "defined": False, "changed": False}
        result = handler(s, number, source)
        return {"action": number, "defined": True, "changed": bool(result.get("changed"))} | result
