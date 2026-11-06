"""Actions déclenchées par les objets connectés (boîtier ESP32 Matter : 10 boutons + 5 lampes virtuels).

Chaque appui sur le bouton virtuel « Action N » dans l'application domotique arrive sur
POST /api/devices/actions/{n}. L'appui est toujours journalisé, puis la fonction associée au numéro
dans `handlers` est exécutée ; un numéro sans fonction ne fait rien.

Actions définies :
  1 à 4  valider la mission de l'équipe rouge, verte, bleue, or
  5      protocole d'urgence : secours des lutins si le MJ l'a autorisé, sinon message de patience
"""

from collections.abc import Callable

from sqlalchemy.orm import Session

from app.services.common import Clock, GameError, log_event
from app.services.game import GameService

ACTION_COUNT = 10

# Action N -> équipe dont elle valide la mission (identifiants de config/game.yaml).
TEAM_VALIDATION_ACTIONS = {1: "rouge", 2: "verte", 3: "bleue", 4: "or"}
EMERGENCY_ACTION = 5

# (session, numéro, source) -> détail renvoyé au boîtier. Le résultat doit contenir "changed": bool
# (True = l'état de la partie a changé, les écrans sont alors notifiés).
ActionHandler = Callable[[Session, int, str], dict]


class ActionsService:
    def __init__(self, clock: Clock, game: GameService):
        self.clock = clock
        self.game = game
        self.handlers: dict[int, ActionHandler] = {
            number: self._validate_team(team_id) for number, team_id in TEAM_VALIDATION_ACTIONS.items()
        }
        self.handlers[EMERGENCY_ACTION] = lambda s, _number, _source: self.game.trigger_emergency(s, "device")

    def _validate_team(self, team_id: str) -> ActionHandler:
        """Passe l'équipe à VALIDEE (étapes intermédiaires journalisées). Déjà validée : sans effet."""
        def handler(s: Session, _number: int, _source: str) -> dict:
            result = self.game.set_team_status(s, team_id, "VALIDEE", source="device")
            return {"effect": "team_validated", "team": team_id} | result
        return handler

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
