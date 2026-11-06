"""Schéma et chargement de `config/game.yaml` (équipes, vidéos, messages, planning, mini-jeux)."""

import ast
import re
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, field_validator, model_validator

HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
SAFE_FILE = re.compile(r"^[A-Za-z0-9_.-]+\.(mp4|webm)$")

PHASES = ("PREPARATION", "INTRO", "ENQUETE", "FINALE", "VICTOIRE", "SECOURS", "FIN")
KIDS_GAMES = ("constellation", "machine", "tournee", "code")


def _check_hhmm(value: str) -> str:
    if not HHMM.match(value):
        raise ValueError(f"horaire invalide « {value} » (format HH:MM attendu)")
    return value


def _unique(items: list, label: str) -> None:
    ids = [i.id for i in items]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise ValueError(f"identifiants {label} dupliqués : {sorted(dupes)}")


class GameSettingsCfg(BaseModel):
    title: str = "Cluedo Escape de Noël"
    timezone: str = "Europe/Paris"
    start_time: str = "20:00"
    end_time: str = "21:30"
    demo_time_scale: float = Field(30, gt=0)
    auto_advance: bool = True

    _hhmm = field_validator("start_time", "end_time")(_check_hhmm)


class TeamCfg(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_-]+$")
    name: str
    theme: str
    color: str
    enigma: str
    description: str = ""


class VideoCfg(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_-]+$")
    file: str
    title: str
    kind: Literal["loop", "message"] = "message"
    fallback_text: str = ""
    fallback_seconds: int = Field(10, ge=2, le=600)

    @field_validator("file")
    @classmethod
    def _safe_file(cls, v: str) -> str:
        if not SAFE_FILE.match(v):
            raise ValueError(f"nom de fichier vidéo invalide : {v}")
        return v


class MessageCfg(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_-]+$")
    title: str
    text: str
    duration: int = Field(20, ge=3, le=600)


class ScheduleItemCfg(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_-]+$")
    label: str
    at: str
    anchor: Literal["start", "clock"] = "start"
    action: Literal["video", "phase", "message"]
    target: str
    enabled: bool = True

    _hhmm = field_validator("at")(_check_hhmm)


class RewardCfg(BaseModel):
    symbol: str
    label: str
    digit: int = Field(ge=0, le=9)


# Symboles des cartes de « La constellation » (illustrations dans frontend/src/assets/constellation/).
# L'étoile dorée est réservée à la carte seule d'un memory au nombre de cartes impair.
MEMORY_SYMBOLS = (
    "sapin", "boule", "sucre-orge", "bonhomme-neige", "cloche", "cadeau", "bonnet", "chaussette",
    "renne", "flocon", "bougie", "houx", "pain-epices", "lune", "traineau", "moufle", "chocolat",
    "pomme-pin", "ourson", "lanterne", "cheval-bascule", "maison-pain-epices", "tambour",
)
LONE_SYMBOL = "etoile"


class PlacementLevelCfg(BaseModel):
    """Manche « symboles à replacer » : des symboles s'affichent puis disparaissent, on retrouve leurs cases."""

    count: int = Field(ge=2, le=len(MEMORY_SYMBOLS))
    cols: int = Field(ge=3, le=10)
    rows: int = Field(ge=3, le=6)
    memorize_seconds: int = Field(10, ge=2, le=60)

    @model_validator(mode="after")
    def _fits(self):
        if self.count * 2 > self.cols * self.rows:
            raise ValueError(f"{self.count} symboles : grille {self.cols}×{self.rows} trop petite")
        return self


class PairsLevelCfg(BaseModel):
    """Manche « paires » : un memory classique ; avec un nombre impair, l'étoile reste seule au centre."""

    cards: int = Field(ge=4, le=len(MEMORY_SYMBOLS) * 2 + 1)
    cols: int = Field(ge=3, le=10)

    @property
    def rows(self) -> int:
        return -(-self.cards // self.cols)

    @model_validator(mode="after")
    def _fits(self):
        if self.rows > 7 or self.cards <= self.cols * (self.rows - 1):
            raise ValueError(f"{self.cards} cartes : {self.cols} colonnes ne conviennent pas")
        return self


class PlacementCfg(BaseModel):
    difficulty: int  # nombre de symboles par défaut ; modifiable en direct dans l'onglet Lutins de l'admin
    levels: list[PlacementLevelCfg] = Field(min_length=1, max_length=6)

    def level(self, count: int) -> PlacementLevelCfg | None:
        return next((lv for lv in self.levels if lv.count == count), None)

    @model_validator(mode="after")
    def _default(self):
        if len({lv.count for lv in self.levels}) != len(self.levels):
            raise ValueError("niveaux de placement dupliqués")
        if self.level(self.difficulty) is None:
            raise ValueError(f"difficulté par défaut {self.difficulty} absente des niveaux de placement")
        return self


class PairsCfg(BaseModel):
    difficulty: int  # nombre de cartes par défaut ; modifiable en direct dans l'onglet Lutins de l'admin
    levels: list[PairsLevelCfg] = Field(min_length=1, max_length=6)

    def level(self, cards: int) -> PairsLevelCfg | None:
        return next((lv for lv in self.levels if lv.cards == cards), None)

    @model_validator(mode="after")
    def _default(self):
        if len({lv.cards for lv in self.levels}) != len(self.levels):
            raise ValueError("niveaux de paires dupliqués")
        if self.level(self.difficulty) is None:
            raise ValueError(f"difficulté par défaut {self.difficulty} absente des niveaux de paires")
        return self


class ConstellationCfg(BaseModel):
    title: str
    instructions: str
    rounds: list[Literal["placement", "paires"]] = Field(min_length=1, max_length=6)
    placement: PlacementCfg
    paires: PairsCfg
    reward: RewardCfg


_CALC = re.compile(r"^[0-9 +\-×()]+$")


def _evaluate(expr: str) -> int:
    """Évalue un calcul de la banque : entiers, +, -, × et parenthèses uniquement (aucune division)."""
    if not _CALC.match(expr):
        raise ValueError(f"calcul « {expr} » : seuls les chiffres, +, -, × et les parenthèses sont permis")
    tree = ast.parse(expr.replace("×", "*"), mode="eval")
    ops = {ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b, ast.Mult: lambda a, b: a * b}

    def ev(node):
        if isinstance(node, ast.Constant) and isinstance(node.value, int):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in ops:
            value = ops[type(node.op)](ev(node.left), ev(node.right))
            if not 0 <= value <= 1000:
                raise ValueError(f"calcul « {expr} » : résultat intermédiaire {value} hors de 0–1000")
            return value
        raise ValueError(f"calcul « {expr} » non pris en charge")

    return ev(tree.body)


class MachineQuestionCfg(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_-]+$")
    level: int = Field(ge=1, le=3)
    text: str = Field(min_length=10, max_length=300)
    calc: str  # calcul attendu, vérifié au chargement (ex. « 7 × 6 »)
    answer: int = Field(ge=0, le=1000)
    choices: list[int] = Field(min_length=4, max_length=4)
    hint: str

    @model_validator(mode="after")
    def _coherent(self):
        if _evaluate(self.calc) != self.answer:
            raise ValueError(f"question {self.id} : {self.calc} ne vaut pas {self.answer}")
        if len(set(self.choices)) != 4 or self.answer not in self.choices:
            raise ValueError(f"question {self.id} : 4 réponses différentes dont la bonne sont attendues")
        if any(c < 0 for c in self.choices):
            raise ValueError(f"question {self.id} : réponse négative")
        return self


class MachineCfg(BaseModel):
    title: str
    instructions: str
    intro: str
    orders_per_level: list[int] = Field(min_length=3, max_length=3)  # commandes tirées par niveau 1, 2, 3
    questions: list[MachineQuestionCfg]
    reward: RewardCfg

    @property
    def total_orders(self) -> int:
        return sum(self.orders_per_level)

    @model_validator(mode="after")
    def _enough_questions(self):
        ids = [q.id for q in self.questions]
        if len(set(ids)) != len(ids):
            raise ValueError("identifiants de questions dupliqués")
        if not 1 <= self.total_orders <= 20:
            raise ValueError("entre 1 et 20 commandes par partie")
        for level, wanted in enumerate(self.orders_per_level, start=1):
            available = sum(q.level == level for q in self.questions)
            if available < wanted:
                raise ValueError(f"niveau {level} : {wanted} commandes demandées, {available} questions disponibles")
        return self


class TourneeLevelCfg(BaseModel):
    """Un niveau de difficulté de « La tournée du traîneau » (endless runner à 3 couloirs)."""

    label: str = Field(min_length=1, max_length=30)
    lives: int = Field(ge=1, le=9)                     # chocs autorisés avant de devoir recommencer
    speed_start: float = Field(ge=0.1, le=1.0)         # vitesse au départ, en largeurs d'écran par seconde
    speed_end: float = Field(ge=0.1, le=1.0)           # vitesse à l'arrivée (accélération progressive)
    gap_start: float = Field(ge=0.8, le=6.0)           # secondes entre deux obstacles au départ
    gap_end: float = Field(ge=0.8, le=6.0)             # … et à l'arrivée
    double_chance: float = Field(0.0, ge=0.0, le=1.0)  # probabilité qu'un obstacle bloque 2 couloirs sur 3
    gifts_required: int = Field(ge=0, le=150)          # cadeaux à attraper pendant le vol pour réussir
    gifts_per_gap: int = Field(2, ge=1, le=3)          # cadeaux alignés entre deux obstacles (même couloir)


class TourneeCfg(BaseModel):
    title: str
    instructions: str
    difficulty: str  # niveau par défaut ; modifiable en direct dans l'onglet Lutins de l'admin
    duration: int = Field(120, ge=30, le=120)  # durée du vol, identique à tous les niveaux : 2 minutes maximum
    levels: dict[str, TourneeLevelCfg] = Field(min_length=1, max_length=6)
    reward: RewardCfg
    hints: list[str] = []

    @model_validator(mode="after")
    def _levels(self):
        for key in self.levels:
            if not re.match(r"^[a-z0-9_-]{1,20}$", key):
                raise ValueError(f"identifiant de niveau invalide : {key}")
        if self.difficulty not in self.levels:
            raise ValueError(f"difficulté par défaut « {self.difficulty} » absente de levels")
        # Une rangée de cadeaux apparaît entre deux obstacles : il faut en proposer bien plus que le nombre demandé.
        for key, lv in self.levels.items():
            offered = self.duration / max(lv.gap_start, lv.gap_end) * lv.gifts_per_gap
            if lv.gifts_required > offered * 0.5:
                raise ValueError(f"niveau {key} : {lv.gifts_required} cadeaux demandés, trop peu en proposés "
                                 f"(au moins {int(offered)} en {self.duration} s)")
        return self

    def settings(self, level: str) -> dict:
        """Réglages envoyés à la tablette : ceux du niveau, plus la durée (commune à tous les niveaux)."""
        return self.levels[level].model_dump() | {"duration": self.duration}


class CodeCfg(BaseModel):
    title: str
    instructions: str
    riddle: str
    code: str = Field(pattern=r"^\d{3,6}$")
    hints: list[str] = []


class KidsCfg(BaseModel):
    attempts_per_hint: int = Field(2, ge=1, le=10)
    final_title: str = "Mission accomplie !"
    final_message: str
    constellation: ConstellationCfg
    machine: MachineCfg
    tournee: TourneeCfg
    code: CodeCfg


class AppConfig(BaseModel):
    game: GameSettingsCfg
    teams: list[TeamCfg]
    videos: list[VideoCfg]
    messages: list[MessageCfg] = []
    phase_videos: dict[str, str] = {}
    schedule: list[ScheduleItemCfg] = []
    kids: KidsCfg

    @model_validator(mode="after")
    def _references(self):
        _unique(self.teams, "équipes")
        _unique(self.videos, "vidéos")
        _unique(self.messages, "messages")
        _unique(self.schedule, "planning")
        video_ids = {v.id for v in self.videos}
        if sum(1 for v in self.videos if v.kind == "loop") != 1:
            raise ValueError("il faut exactement une vidéo de type « loop »")
        for phase, vid in self.phase_videos.items():
            if phase not in PHASES:
                raise ValueError(f"phase inconnue dans phase_videos : {phase}")
            if vid not in video_ids:
                raise ValueError(f"vidéo inconnue dans phase_videos : {vid}")
        message_ids = {m.id for m in self.messages}
        for item in self.schedule:
            valid = {"video": video_ids, "phase": set(PHASES), "message": message_ids}[item.action]
            if item.target not in valid:
                raise ValueError(f"cible inconnue « {item.target} » pour l'événement {item.id}")
        return self

    def video(self, video_id: str) -> VideoCfg | None:
        return next((v for v in self.videos if v.id == video_id), None)

    @property
    def loop_video(self) -> VideoCfg:
        return next(v for v in self.videos if v.kind == "loop")

    def message(self, message_id: str) -> MessageCfg | None:
        return next((m for m in self.messages if m.id == message_id), None)

    def schedule_item(self, item_id: str) -> ScheduleItemCfg | None:
        return next((i for i in self.schedule if i.id == item_id), None)


def load_game_config(config_dir: Path) -> AppConfig:
    path = config_dir / "game.yaml"
    with path.open(encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    return AppConfig.model_validate(raw)
