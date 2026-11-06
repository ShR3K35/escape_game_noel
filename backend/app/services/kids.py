"""Mini-jeux des lutins : progression séquentielle, validation côté serveur, indices progressifs."""

import random

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from app.core.game_config import KIDS_GAMES, LONE_SYMBOL, MEMORY_SYMBOLS, AppConfig
from app.models import KidsProgress
from app.services.common import Clock, GameError, iso, log_event


class ConstellationAnswer(BaseModel):
    """Manche « placement » : les cases choisies ; manche « paires » : les paires trouvées (indices de cartes)."""

    round: int = Field(ge=0, le=10)
    cells: list[tuple[int, int]] | None = Field(None, max_length=60)
    pairs: list[tuple[int, int]] | None = Field(None, max_length=30)


class MachineAnswer(BaseModel):
    order: int = Field(ge=0, le=50)
    answer: int = Field(ge=-100_000, le=100_000)


class TourneeAnswer(BaseModel):
    """Bilan d'un vol : le jeu tourne sur la tablette, le serveur vérifie la cohérence avec le niveau joué."""

    level: str = Field(pattern=r"^[a-z0-9_-]{1,20}$")
    finished: bool             # le traîneau est arrivé au bout du parcours
    hits: int = Field(ge=0, le=99)
    seconds: float = Field(ge=0, le=600)
    progress: float = Field(ge=0, le=1)
    gifts: int = Field(0, ge=0, le=999)


class CodeAnswer(BaseModel):
    code: str = Field(pattern=r"^\d{1,8}$")


ANSWER_MODELS = {"constellation": ConstellationAnswer, "machine": MachineAnswer,
                 "tournee": TourneeAnswer, "code": CodeAnswer}


class KidsService:
    def __init__(self, cfg: AppConfig, clock: Clock, rng: random.Random | None = None):
        self.cfg = cfg
        self.clock = clock
        self.rng = rng or random.Random()

    def bootstrap(self, s: Session) -> None:
        for gid in KIDS_GAMES:
            row = s.get(KidsProgress, gid)
            if row is None:
                row = KidsProgress(game_id=gid, completed=False, completed_by_admin=False,
                                   attempts=0, failures=0, step=0, updated_at=self.clock())
                s.add(row)
            if gid == "machine" and not self._draw_valid(row):
                self._new_draw(row)
            if gid == "constellation" and not self._memory_valid(row):
                self._memory_draw(row, from_round=0)

    def _rows(self, s: Session) -> dict[str, KidsProgress]:
        # Filtré : une ligne d'un ancien jeu restée en base ne doit pas bloquer la fin de mission.
        return {r.game_id: r for r in s.query(KidsProgress).all() if r.game_id in KIDS_GAMES}

    # ------------------------------------------------------ machine à cadeaux
    def _new_draw(self, row: KidsProgress) -> None:
        """Tire les commandes de la partie : au hasard dans chaque niveau, difficulté croissante."""
        m = self.cfg.kids.machine
        ids: list[str] = []
        for level, count in enumerate(m.orders_per_level, start=1):
            pool = [q.id for q in m.questions if q.level == level]
            ids += self.rng.sample(pool, count)
        row.data = {"questions": ids, "misses": []}
        if not row.completed:
            row.step = 0

    def _draw_valid(self, row: KidsProgress) -> bool:
        """Faux si aucun tirage n'existe ou si `game.yaml` a changé depuis (questions supprimées, nombre)."""
        known = {q.id for q in self.cfg.kids.machine.questions}
        ids = (row.data or {}).get("questions") or []
        return len(ids) == self.cfg.kids.machine.total_orders and all(i in known for i in ids)

    def _machine_order(self, row: KidsProgress):
        """Question en cours (la dernière si le jeu est terminé)."""
        by_id = {q.id: q for q in self.cfg.kids.machine.questions}
        ids = row.data["questions"]
        return by_id[ids[min(row.step, len(ids) - 1)]]

    def _misses(self, row: KidsProgress) -> list[int]:
        return list((row.data or {}).get("misses", []))

    # ---------------------------------------------------- la constellation
    def memory_difficulty(self, row: KidsProgress) -> dict[str, int]:
        """Niveaux choisis par le maître du jeu (conservés en base), sinon ceux de `game.yaml`."""
        c = self.cfg.kids.constellation
        chosen = (row.data or {}).get("difficulty") or {}
        placement, paires = chosen.get("placement"), chosen.get("paires")
        return {"placement": placement if c.placement.level(placement or -1) else c.placement.difficulty,
                "paires": paires if c.paires.level(paires or -1) else c.paires.difficulty}

    def _memory_round_draw(self, kind: str, difficulty: dict[str, int]) -> dict:
        c = self.cfg.kids.constellation
        layout_id = f"{self.rng.getrandbits(32):08x}"
        if kind == "placement":
            lv = c.placement.level(difficulty["placement"])
            cells = self.rng.sample([(x, y) for y in range(lv.rows) for x in range(lv.cols)], lv.count)
            return {"kind": kind, "id": layout_id, "level": lv.count, "cols": lv.cols, "rows": lv.rows,
                    "memorize_seconds": lv.memorize_seconds, "cells": [list(x) for x in sorted(cells)],
                    "symbols": self.rng.sample(MEMORY_SYMBOLS, lv.count)}
        lv = c.paires.level(difficulty["paires"])
        cards = [s for s in self.rng.sample(MEMORY_SYMBOLS, lv.cards // 2) for _ in range(2)]
        self.rng.shuffle(cards)
        if lv.cards % 2:  # l'étoile seule, au centre du ciel
            cards.insert(lv.cards // 2, LONE_SYMBOL)
        return {"kind": kind, "id": layout_id, "level": lv.cards, "cols": lv.cols, "rows": lv.rows, "cards": cards}

    def _memory_draw(self, row: KidsProgress, from_round: int) -> None:
        """Tire à nouveau les manches à partir de `from_round` (les manches déjà réussies sont conservées)."""
        data = dict(row.data or {})
        difficulty = self.memory_difficulty(row)
        old = data.get("rounds") or []
        rounds = [old[i] if i < from_round and i < len(old) else self._memory_round_draw(kind, difficulty)
                  for i, kind in enumerate(self.cfg.kids.constellation.rounds)]
        row.data = data | {"rounds": rounds, "misses": 0}

    def _memory_valid(self, row: KidsProgress) -> bool:
        """Faux si aucun tirage n'existe ou si `game.yaml` a changé depuis (manches, niveaux)."""
        c = self.cfg.kids.constellation
        rounds = (row.data or {}).get("rounds") or []
        if [r.get("kind") for r in rounds] != list(c.rounds):
            return False
        levels = {"placement": c.placement.level, "paires": c.paires.level}
        return all(levels[r["kind"]](r.get("level", -1)) is not None for r in rounds)

    def _memory_round(self, row: KidsProgress) -> dict:
        """Manche en cours (la dernière si le jeu est terminé)."""
        rounds = row.data["rounds"]
        return rounds[min(row.step, len(rounds) - 1)]

    def set_memory_difficulty(self, s: Session, kind: str, level: int) -> dict:
        c = self.cfg.kids.constellation
        levels = {"placement": c.placement, "paires": c.paires}[kind]
        if levels.level(level) is None:
            raise GameError(f"niveau inconnu : {level}", 404)
        row = s.get(KidsProgress, "constellation")
        if self.memory_difficulty(row)[kind] == level:
            return {"changed": False}
        row.data = {**(row.data or {}), "difficulty": self.memory_difficulty(row) | {kind: level}}
        if not row.completed:  # les manches pas encore réussies passent tout de suite au nouveau niveau
            self._memory_draw(row, from_round=row.step)
        row.updated_at = self.clock()
        what = f"{level} symboles à replacer" if kind == "placement" else f"memory de {level} cartes"
        log_event(s, self.clock, "kids_difficulty", f"Maître du jeu : « {c.title} » : {what}",
                  {"game": "constellation", "kind": kind, "level": level}, "admin")
        return {"changed": True}

    @staticmethod
    def _where(cell: list[int], rows: int) -> str:
        col, r = cell
        line = ("tout en haut" if r == 0 else "tout en bas" if r == rows - 1
                else f"sur la ligne n°{r + 1} en partant du haut")
        return f"Un symbole se cachait {line}, dans la case n°{col + 1} en partant de la gauche."

    def _memory_hints(self, row: KidsProgress) -> list[str]:
        rnd = self._memory_round(row)
        if row.completed or rnd["kind"] != "placement":
            return []
        hints = [f"Il y a {len(rnd['cells'])} symboles à retrouver : comptez-les bien !"]
        hints += [self._where(cell, rnd["rows"]) for cell in rnd["cells"][::-1][:2]]
        level = min(len(hints), (row.data or {}).get("misses", 0) // self.cfg.kids.attempts_per_hint)
        return hints[:level]

    def _check_memory(self, answer: ConstellationAnswer, row: KidsProgress) -> bool:
        if answer.round != row.step:
            raise GameError("cette manche est déjà terminée", 409)
        rnd = self._memory_round(row)
        if rnd["kind"] == "placement":
            cells = answer.cells or []
            return len(cells) == len(rnd["cells"]) and set(cells) == {tuple(x) for x in rnd["cells"]}
        cards, used = rnd["cards"], set()
        for a, b in answer.pairs or []:
            if a == b or {a, b} & used or not (0 <= a < len(cards) and 0 <= b < len(cards)):
                return False
            if cards[a] != cards[b] or cards[a] == LONE_SYMBOL:
                return False
            used |= {a, b}
        return len(used) == sum(card != LONE_SYMBOL for card in cards)

    # ------------------------------------------------- tournée du traîneau
    def difficulty(self, row: KidsProgress) -> str:
        """Niveau choisi par le maître du jeu (conservé en base), sinon celui de `game.yaml`."""
        t = self.cfg.kids.tournee
        chosen = (row.data or {}).get("difficulty")
        return chosen if chosen in t.levels else t.difficulty

    def set_difficulty(self, s: Session, level: str) -> dict:
        t = self.cfg.kids.tournee
        if level not in t.levels:
            raise GameError(f"niveau inconnu : {level}", 404)
        row = s.get(KidsProgress, "tournee")
        if self.difficulty(row) == level:
            return {"changed": False}
        row.data = {**(row.data or {}), "difficulty": level}
        row.updated_at = self.clock()
        log_event(s, self.clock, "kids_difficulty",
                  f"Maître du jeu : « {t.title} » en niveau {t.levels[level].label}", {"level": level}, "admin")
        return {"changed": True}

    def _game_cfg(self, gid: str):
        return getattr(self.cfg.kids, gid)

    def _status(self, rows: dict[str, KidsProgress], gid: str) -> str:
        if rows[gid].completed:
            return "completed"
        first_open = next((g for g in KIDS_GAMES if not rows[g].completed), None)
        return "available" if gid == first_open else "locked"

    def _hints(self, gid: str, row: KidsProgress) -> list[str]:
        if gid == "machine":  # un indice propre à chaque commande, après 2 erreurs sur celle-ci
            if row.completed or len(self._misses(row)) < self.cfg.kids.attempts_per_hint:
                return []
            return [self._machine_order(row).hint]
        if gid == "constellation":  # indices propres à la manche en cours
            return self._memory_hints(row)
        hints = self._game_cfg(gid).hints
        level = min(len(hints), row.failures // self.cfg.kids.attempts_per_hint)
        return hints[:level]

    # -------------------------------------------------------------- contenu
    def _content(self, gid: str, row: KidsProgress) -> dict:
        c = self._game_cfg(gid)
        base = {"title": c.title, "instructions": c.instructions}
        if gid == "machine":
            # Seule la commande en cours est envoyée, jamais sa réponse.
            q = self._machine_order(row)
            return base | {"intro": c.intro, "total": c.total_orders, "eliminated": self._misses(row),
                           "order": {"text": q.text, "choices": sorted(q.choices), "level": q.level}}
        if gid == "constellation":
            # Les symboles de la manche sont visibles pendant la mémorisation : rien à cacher ici.
            return base | {"round": min(row.step, len(c.rounds) - 1), "total": len(c.rounds),
                           "rounds": list(c.rounds), "layout": self._memory_round(row)}
        if gid == "tournee":
            level = self.difficulty(row)
            return base | {"level": level, "settings": c.settings(level)}
        return base | {"riddle": c.riddle, "length": len(c.code)}

    def view(self, s: Session, include_stats: bool = False) -> dict:
        rows = self._rows(s)
        games = []
        for gid in KIDS_GAMES:
            row, c = rows[gid], self._game_cfg(gid)
            status = self._status(rows, gid)
            entry = {"id": gid, "status": status, "step": row.step, "hints": self._hints(gid, row),
                     "reward": c.reward.model_dump() if gid != "code" and row.completed else None,
                     "content": self._content(gid, row) if status != "locked" else None,
                     "title": c.title}
            if include_stats:
                entry |= {"attempts": row.attempts, "failures": row.failures,
                          "completed_by_admin": row.completed_by_admin,
                          "completed_at": iso(row.completed_at)}
                if gid == "machine" and not row.completed:  # pour aider les enfants : réservé au MJ
                    q = self._machine_order(row)
                    entry["current_order"] = {"number": row.step + 1, "total": c.total_orders,
                                              "text": q.text, "calc": q.calc, "answer": q.answer}
                if gid == "constellation":
                    chosen = self.memory_difficulty(row)
                    entry["memory"] = {
                        "round": min(row.step + 1, len(c.rounds)), "total": len(c.rounds), "rounds": list(c.rounds),
                        "placement": {"current": chosen["placement"],
                                      "levels": [lv.count for lv in c.placement.levels]},
                        "paires": {"current": chosen["paires"], "levels": [lv.cards for lv in c.paires.levels]}}
                if gid == "tournee":
                    entry["difficulty"] = {
                        "current": self.difficulty(row), "last_run": (row.data or {}).get("last"),
                        "duration": c.duration,
                        "levels": [{"id": k, "label": v.label, "lives": v.lives, "gifts_required": v.gifts_required}
                                   for k, v in c.levels.items()]}
            games.append(entry)
        done = all(r.completed for r in rows.values())
        return {"games": games, "completed_count": sum(r.completed for r in rows.values()),
                "total": len(KIDS_GAMES), "all_completed": done,
                "final": {"title": self.cfg.kids.final_title, "message": self.cfg.kids.final_message}
                if done else None}

    # ----------------------------------------------------------- vérification
    def _check(self, gid: str, answer: BaseModel, row: KidsProgress) -> bool:
        c = self._game_cfg(gid)
        if gid == "constellation":
            return self._check_memory(answer, row)
        if gid == "machine":
            if answer.order != row.step:
                raise GameError("cette commande est déjà terminée", 409)
            return answer.answer == self._machine_order(row).answer
        if gid == "tournee":
            level = c.levels.get(answer.level)
            if level is None:
                raise GameError(f"niveau inconnu : {answer.level}", 422)
            row.data = {**(row.data or {}), "last": {
                "level": answer.level, "finished": answer.finished, "hits": answer.hits,
                "progress": round(answer.progress, 2), "gifts": answer.gifts}}
            # Tolérance de 3 s : le chronomètre de la tablette s'arrête pendant les pauses.
            return (answer.finished and answer.hits < level.lives and answer.seconds >= c.duration - 3
                    and answer.gifts >= level.gifts_required)
        return answer.code == c.code

    def attempt(self, s: Session, gid: str, raw_answer: dict) -> dict:
        if gid not in KIDS_GAMES:
            raise GameError(f"jeu inconnu : {gid}", 404)
        try:
            answer = ANSWER_MODELS[gid].model_validate(raw_answer)
        except ValidationError as exc:
            raise GameError(f"réponse invalide : {exc.errors()[0]['msg']}", 422) from exc
        rows = self._rows(s)
        row = rows[gid]
        status = self._status(rows, gid)
        if status == "completed":
            return {"correct": True, "completed": True, "already_completed": True, "step": row.step,
                    "hints": self._hints(gid, row)}
        if status == "locked":
            raise GameError("ce jeu n'est pas encore débloqué", 409)
        correct = self._check(gid, answer, row)
        row.attempts += 1
        row.updated_at = self.clock()
        title = self._game_cfg(gid).title
        if correct:
            if gid == "machine":
                row.step += 1
                row.data = {**row.data, "misses": []}
                finished = row.step >= self.cfg.kids.machine.total_orders
            elif gid == "constellation":
                row.step += 1
                row.data = {**row.data, "misses": 0}
                finished = row.step >= len(self.cfg.kids.constellation.rounds)
            else:
                finished = True
            if finished:
                self._complete(s, row, by_admin=False)
                log_event(s, self.clock, "kids_completed", f"Lutins : « {title} » réussi !",
                          {"game": gid, "attempts": row.attempts}, "kids")
            else:
                what = f"manche {row.step}" if gid == "constellation" else f"commande {row.step}"
                log_event(s, self.clock, "kids_step", f"Lutins : « {title} » {what} réussie",
                          {"game": gid, "step": row.step}, "kids")
        else:
            row.failures += 1
            if gid == "machine" and answer.answer in self._machine_order(row).choices \
                    and answer.answer not in self._misses(row):
                row.data = {**row.data, "misses": [*self._misses(row), answer.answer]}
            if gid == "constellation":
                row.data = {**row.data, "misses": row.data.get("misses", 0) + 1}
            detail = ""
            if gid == "tournee":
                detail = (f" ({round(answer.progress * 100)} % du parcours, {answer.hits} choc(s), "
                          f"{answer.gifts}/{self.cfg.kids.tournee.levels[answer.level].gifts_required} cadeaux)")
            log_event(s, self.clock, "kids_failed", f"Lutins : essai manqué sur « {title} »{detail}",
                      {"game": gid, "failures": row.failures}, "kids")
        reward = self._game_cfg(gid).reward.model_dump() if row.completed and gid != "code" else None
        result = {"correct": correct, "completed": row.completed, "step": row.step,
                  "hints": self._hints(gid, row), "reward": reward}
        if gid == "machine":
            result["eliminated"] = self._misses(row)
        return result

    def _complete(self, s: Session, row: KidsProgress, by_admin: bool) -> None:
        row.completed = True
        row.completed_at = self.clock()
        row.completed_by_admin = by_admin
        row.updated_at = self.clock()
        if row.game_id == "machine":
            row.step = self.cfg.kids.machine.total_orders
            row.data = {**row.data, "misses": []}
        if row.game_id == "constellation":
            row.step = len(self.cfg.kids.constellation.rounds)
            row.data = {**row.data, "misses": 0}
        if all(r.completed for r in self._rows(s).values()):
            log_event(s, self.clock, "kids_all_completed", "Les lutins ont terminé leur mission !", None, "kids")

    # ------------------------------------------------------------------ admin
    def admin_complete(self, s: Session, gid: str) -> dict:
        if gid not in KIDS_GAMES:
            raise GameError(f"jeu inconnu : {gid}", 404)
        row = s.get(KidsProgress, gid)
        if row.completed:
            return {"changed": False}
        log_event(s, self.clock, "kids_unlocked", f"Maître du jeu : « {self._game_cfg(gid).title} » débloqué",
                  {"game": gid}, "admin")
        self._complete(s, row, by_admin=True)
        return {"changed": True}

    def reset_game(self, s: Session, gid: str, source: str = "admin", log_it: bool = True) -> dict:
        if gid not in KIDS_GAMES:
            raise GameError(f"jeu inconnu : {gid}", 404)
        row = s.get(KidsProgress, gid)
        row.completed = row.completed_by_admin = False
        row.completed_at = None
        row.attempts = row.failures = row.step = 0
        row.updated_at = self.clock()
        if gid == "machine":  # nouvelles commandes à chaque réinitialisation
            self._new_draw(row)
        if gid == "constellation":  # nouvelles manches, mais le niveau choisi par le maître du jeu est conservé
            self._memory_draw(row, from_round=0)
        if gid == "tournee":  # le niveau choisi par le maître du jeu est conservé
            row.data = {"difficulty": row.data["difficulty"]} if (row.data or {}).get("difficulty") else None
        if log_it:
            log_event(s, self.clock, "kids_reset", f"Jeu « {self._game_cfg(gid).title} » réinitialisé",
                      {"game": gid}, source)
        return {"changed": True}

    def reset_all(self, s: Session, source: str = "admin") -> None:
        for gid in KIDS_GAMES:
            self.reset_game(s, gid, log_it=False)
        log_event(s, self.clock, "kids_reset", "Progression des lutins réinitialisée", None, source)
