"""Mini-jeux des lutins : progression séquentielle, validation côté serveur, indices progressifs."""

import random

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from app.core.game_config import KIDS_GAMES, AppConfig
from app.models import KidsProgress
from app.services.common import Clock, GameError, iso, log_event


class ConstellationAnswer(BaseModel):
    cells: list[tuple[int, int]] = Field(max_length=60)


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
            return base | {"cols": c.cols, "rows": c.rows, "stars": [list(x) for x in c.stars],
                           "memorize_seconds": c.memorize_seconds}
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
            return set(answer.cells) == set(c.stars) and len(answer.cells) == len(c.stars)
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
            else:
                finished = True
            if finished:
                self._complete(s, row, by_admin=False)
                log_event(s, self.clock, "kids_completed", f"Lutins : « {title} » réussi !",
                          {"game": gid, "attempts": row.attempts}, "kids")
            else:
                log_event(s, self.clock, "kids_step", f"Lutins : « {title} » commande {row.step} réussie",
                          {"game": gid, "step": row.step}, "kids")
        else:
            row.failures += 1
            if gid == "machine" and answer.answer in self._machine_order(row).choices \
                    and answer.answer not in self._misses(row):
                row.data = {**row.data, "misses": [*self._misses(row), answer.answer]}
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
