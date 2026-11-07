"""Détection d'une combinaison jouée sur la télécommande Zigbee 4 boutons (MOES, Tuya TS004F en mode « event »).

Logique pure (sans MQTT ni réseau) pour être testée facilement : on lui donne les appuis et l'heure,
elle renvoie les actions à déclencher.

  - chaque appui court ajoute le numéro du bouton (1 à 4) à la saisie en cours ;
  - un double appui compte pour deux appuis (option `double_counts_as_two`), car la télécommande
    regroupe deux appuis rapides sur le même bouton en un seul message « double » ;
  - un appui long efface la saisie (option `hold_resets`) ;
  - dès que la saisie se termine par une combinaison connue, son action est déclenchée et la saisie
    repart de zéro (les joueurs peuvent donc se tromper au début sans devoir attendre) ;
  - sans appui pendant `reset_seconds`, la saisie est effacée ; si elle comptait au moins autant
    d'appuis que la plus courte combinaison, l'action « raté » (`wrong_action`) est déclenchée.
"""

import re
from dataclasses import dataclass, field

from pydantic import BaseModel, Field, field_validator, model_validator

ACTION_MIN, ACTION_MAX = 1, 10  # actions du backend (POST /api/devices/actions/{n})
BUTTONS = (1, 2, 3, 4)
_ACTION_RE = re.compile(r"^([1-4])_(single|double|hold)$")


class SequenceConfig(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    buttons: list[int] = Field(min_length=2, max_length=20)
    action: int = Field(ge=ACTION_MIN, le=ACTION_MAX)

    @field_validator("buttons")
    @classmethod
    def _check_buttons(cls, v: list[int]) -> list[int]:
        bad = [b for b in v if b not in BUTTONS]
        if bad:
            raise ValueError(f"boutons inconnus {bad} : seuls 1, 2, 3 et 4 existent")
        return v


class RemoteConfig(BaseModel):
    # Nom de l'appareil dans Zigbee2MQTT (friendly_name), ou « * » pour accepter n'importe quelle télécommande.
    device: str = Field(default="telecommande", min_length=1)
    reset_seconds: float = Field(default=4.0, gt=0.5, le=60)
    double_counts_as_two: bool = True
    hold_resets: bool = True
    wrong_action: int | None = Field(default=None, ge=ACTION_MIN, le=ACTION_MAX)
    sequences: list[SequenceConfig] = Field(min_length=1)

    @model_validator(mode="after")
    def _check_unique(self) -> "RemoteConfig":
        seen: dict[tuple[int, ...], str] = {}
        for seq in self.sequences:
            key = tuple(seq.buttons)
            if key in seen:
                raise ValueError(f"combinaisons « {seen[key]} » et « {seq.name} » identiques")
            seen[key] = seq.name
        return self


@dataclass(frozen=True)
class Trigger:
    action: int
    kind: str  # "success" | "wrong"
    name: str
    presses: tuple[int, ...]


def parse_action(value: object) -> tuple[int, str] | None:
    """« 3_double » -> (3, "double") ; toute autre valeur (batterie, chaîne vide…) -> None."""
    if not isinstance(value, str):
        return None
    m = _ACTION_RE.match(value)
    return (int(m.group(1)), m.group(2)) if m else None


@dataclass
class SequenceDetector:
    config: RemoteConfig
    presses: list[int] = field(default_factory=list)
    last_press: float | None = None

    def __post_init__(self) -> None:
        # La plus longue d'abord : si une combinaison en termine une autre, la plus précise gagne.
        self._sequences = sorted(self.config.sequences, key=lambda s: len(s.buttons), reverse=True)
        self._max_len = len(self._sequences[0].buttons)
        self._min_len = min(len(s.buttons) for s in self._sequences)

    def handle(self, button: int, kind: str, now: float) -> list[Trigger]:
        triggers = self.tick(now)
        if kind == "hold":
            if self.config.hold_resets:
                self._clear()
            return triggers
        count = 2 if kind == "double" and self.config.double_counts_as_two else 1
        for _ in range(count):
            self.presses.append(button)
            self.last_press = now
            hit = self._match()
            if hit:
                triggers.append(Trigger(hit.action, "success", hit.name, tuple(hit.buttons)))
                self._clear()
        # Conserver juste assez d'historique pour reconnaître la plus longue combinaison.
        del self.presses[:-self._max_len]
        return triggers

    def tick(self, now: float) -> list[Trigger]:
        """À appeler régulièrement : efface une saisie abandonnée (et déclenche « raté » si configuré)."""
        if not self.presses or self.last_press is None or now - self.last_press < self.config.reset_seconds:
            return []
        attempt = tuple(self.presses)
        self._clear()
        if self.config.wrong_action is not None and len(attempt) >= self._min_len:
            return [Trigger(self.config.wrong_action, "wrong", "raté", attempt)]
        return []

    def _match(self) -> SequenceConfig | None:
        for seq in self._sequences:
            n = len(seq.buttons)
            if len(self.presses) >= n and self.presses[-n:] == seq.buttons:
                return seq
        return None

    def _clear(self) -> None:
        self.presses.clear()
        self.last_press = None
