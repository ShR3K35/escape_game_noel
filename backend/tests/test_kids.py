"""Mini-jeux des lutins."""

import random
import re

from app.core.config import REPO_ROOT
from app.core.game_config import load_game_config

MACHINE = load_game_config(REPO_ROOT / "config").kids.machine
BY_TEXT = {q.text: q for q in MACHINE.questions}
TOURNEE = load_game_config(REPO_ROOT / "config").kids.tournee


def flight(level="normal", **kw):
    return {"level": level, "finished": True, "hits": 0, "seconds": TOURNEE.duration, "progress": 1.0,
            "gifts": TOURNEE.levels.get(level, TOURNEE.levels["normal"]).gifts_required} | kw


def attempt(client, game, answer):
    return client.post(f"/api/kids/games/{game}/attempt", json={"answer": answer})


def games(client):
    return {g["id"]: g for g in client.get("/api/kids/state").json()["games"]}


def memory_answer(client, wrong=False):
    """Réponse à la manche en cours de « La constellation », lue dans le contenu envoyé à la tablette."""
    c = games(client)["constellation"]["content"]
    lay = c["layout"]
    if lay["kind"] == "placement":
        cells = lay["cells"][:-1] + [[c2, r] for r in range(lay["rows"]) for c2 in range(lay["cols"])
                                     if [c2, r] not in lay["cells"]][:1] if wrong else lay["cells"]
        return {"round": c["round"], "cells": cells}
    by_symbol: dict[str, list[int]] = {}
    for i, s in enumerate(lay["cards"]):
        if s != "etoile":
            by_symbol.setdefault(s, []).append(i)
    pairs = list(by_symbol.values())
    if wrong:
        pairs = pairs[:-1]
    return {"round": c["round"], "pairs": pairs}


def solve_constellation(client):
    r = None
    for _ in range(3):
        r = attempt(client, "constellation", memory_answer(client)).json()
        assert r["correct"]
    return r


def current_order(client):
    content = games(client)["machine"]["content"]
    return content, BY_TEXT[content["order"]["text"]]

def solve_machine(client):
    r = None
    for i in range(MACHINE.total_orders):
        _, q = current_order(client)
        r = attempt(client, "machine", {"order": i, "answer": q.answer}).json()
        assert r["correct"]
    return r

def solve_all(client):
    assert solve_constellation(client)["completed"]
    assert solve_machine(client)["completed"]
    assert attempt(client, "tournee", flight()).json()["completed"]
    return attempt(client, "code", {"code": "742"}).json()


def test_initial_kids_state(client):
    g = games(client)
    assert g["constellation"]["status"] == "available"
    c = g["constellation"]["content"]
    assert (c["round"], c["total"], c["rounds"]) == (0, 3, ["placement", "paires", "placement"])
    lay = c["layout"]
    assert lay["kind"] == "placement" and lay["level"] == 8
    assert len(lay["cells"]) == len(set(map(tuple, lay["cells"]))) == 8
    assert len(set(lay["symbols"])) == 8
    assert g["machine"]["status"] == "locked" and g["machine"]["content"] is None
    assert g["code"]["status"] == "locked"


def test_solutions_not_exposed(client, admin):
    admin.post("/api/admin/kids/constellation/complete")
    admin.post("/api/admin/kids/machine/complete")
    admin.post("/api/admin/kids/tournee/complete")
    g = games(client)
    content = g["machine"]["content"]
    assert set(content) == {"title", "instructions", "intro", "total", "eliminated", "order"}
    assert set(content["order"]) == {"text", "choices", "level"}
    assert "code" not in g["code"]["content"] and g["code"]["content"]["length"] == 3


def test_full_progression_and_final_screen(client):
    result = solve_all(client)
    assert result["completed"] is True
    state = client.get("/api/kids/state").json()
    assert state["all_completed"] is True
    assert state["final"]["message"].startswith("Bravo")
    assert games(client)["machine"]["reward"]["digit"] == 7


def test_constellation_three_rounds(client):
    first = memory_answer(client)
    assert attempt(client, "constellation", memory_answer(client, wrong=True)).json()["correct"] is False
    r = attempt(client, "constellation", {**first, "cells": list(reversed(first["cells"]))}).json()
    assert r["correct"] and not r["completed"] and r["step"] == 1
    assert attempt(client, "constellation", first).status_code == 409  # double clic sur une manche finie
    # manche 2 : memory de 36 cartes, 18 paires
    lay = games(client)["constellation"]["content"]["layout"]
    assert lay["kind"] == "paires" and len(lay["cards"]) == 36 and (lay["cols"], lay["rows"]) == (9, 4)
    assert all(lay["cards"].count(x) == 2 for x in lay["cards"])
    answer = memory_answer(client)
    a, b = answer["pairs"][0][0], answer["pairs"][1][0]
    cheat = {**answer, "pairs": [[a, b]] + answer["pairs"][2:]}  # deux cartes différentes
    assert attempt(client, "constellation", cheat).json()["correct"] is False
    assert attempt(client, "constellation", memory_answer(client, wrong=True)).json()["correct"] is False
    assert attempt(client, "constellation", memory_answer(client)).json()["step"] == 2
    r = attempt(client, "constellation", memory_answer(client)).json()
    assert r["correct"] and r["completed"] and r["reward"]["digit"] == 4


def test_locked_game_refused(client):
    assert attempt(client, "machine", {"order": 0, "answer": 42}).status_code == 409


def test_progressive_hints(client):
    r = None
    for _ in range(2):
        r = attempt(client, "constellation", {"round": 0, "cells": [[0, 0]]}).json()
    assert r["hints"] == ["Il y a 8 symboles à retrouver : comptez-les bien !"]
    for _ in range(12):
        r = attempt(client, "constellation", {"round": 0, "cells": [[0, 0]]}).json()
    assert len(r["hints"]) == 3  # puis la position de deux symboles, plafonné
    assert all(h.startswith("Un symbole se cachait") for h in r["hints"][1:])
    r = attempt(client, "constellation", memory_answer(client)).json()
    assert r["hints"] == []  # nouvelle manche : plus d'indice


def test_constellation_difficulty_set_by_admin(admin):
    first = games(admin)["constellation"]["content"]["layout"]
    body = {"kind": "placement", "level": 10}
    assert admin.post("/api/admin/kids/constellation/difficulty", json=body).json()["changed"] is True
    assert admin.post("/api/admin/kids/constellation/difficulty", json=body).json()["changed"] is False
    for wrong, status in (({"kind": "placement", "level": 7}, 404), ({"kind": "autre", "level": 6}, 422)):
        assert admin.post("/api/admin/kids/constellation/difficulty", json=wrong).status_code == status
    lay = games(admin)["constellation"]["content"]["layout"]  # la manche en cours est tirée à nouveau
    assert lay["id"] != first["id"] and len(lay["cells"]) == 10 and (lay["cols"], lay["rows"]) == (8, 4)
    attempt(admin, "constellation", memory_answer(admin))
    admin.post("/api/admin/kids/constellation/difficulty", json={"kind": "paires", "level": 27})
    lay = games(admin)["constellation"]["content"]["layout"]
    assert len(lay["cards"]) == 27 and lay["cards"][13] == "etoile" and lay["cards"].count("etoile") == 1
    stats = {g["id"]: g for g in admin.get("/api/admin/state").json()["kids"]["games"]}["constellation"]
    assert stats["memory"] == {"round": 2, "total": 3, "rounds": ["placement", "paires", "placement"],
                               "placement": {"current": 10, "levels": [6, 8, 10]},
                               "paires": {"current": 27, "levels": [27, 36, 40]}}
    # l'étoile seule n'est pas une paire
    assert attempt(admin, "constellation", memory_answer(admin)).json()["step"] == 2
    admin.post("/api/admin/kids/constellation/difficulty", json={"kind": "paires", "level": 40})
    assert games(admin)["constellation"]["content"]["round"] == 2  # manche déjà réussie conservée
    # « Recommencer » : nouvelles manches, mêmes niveaux
    admin.post("/api/admin/kids/constellation/reset")
    c = games(admin)["constellation"]["content"]
    assert c["round"] == 0 and len(c["layout"]["cells"]) == 10
    admin.cookies.clear()
    assert "memory" not in games(admin)["constellation"]
    assert admin.post("/api/admin/kids/constellation/difficulty", json=body).status_code == 401


def test_tournee_flight_checked_against_level(client):
    solve_constellation(client)
    solve_machine(client)
    content = games(client)["tournee"]["content"]
    assert content["level"] == "normal"
    assert content["settings"]["duration"] == 120 and content["settings"]["gifts_required"] == 30
    lives = TOURNEE.levels["normal"].lives
    crashed = flight(finished=False, hits=lives, seconds=40, progress=0.45)
    assert attempt(client, "tournee", crashed).json()["correct"] is False
    assert attempt(client, "tournee", flight(hits=lives)).json()["correct"] is False  # trop de chocs
    assert attempt(client, "tournee", flight(seconds=10)).json()["correct"] is False  # vol trop court
    assert attempt(client, "tournee", flight(gifts=29)).json()["correct"] is False  # pas assez de cadeaux
    assert attempt(client, "tournee", flight(level="inconnu")).status_code == 422
    r = attempt(client, "tournee", flight(hits=lives - 1)).json()
    assert r["correct"] and r["completed"] and r["reward"]["digit"] == 2
    assert len(r["hints"]) == 2  # 4 vols manqués : deux indices


def test_tournee_difficulty_set_by_admin(admin):
    admin.post("/api/admin/kids/constellation/complete")
    admin.post("/api/admin/kids/machine/complete")
    assert admin.post("/api/admin/kids/tournee/difficulty", json={"level": "facile"}).json()["changed"] is True
    assert admin.post("/api/admin/kids/tournee/difficulty", json={"level": "facile"}).json()["changed"] is False
    assert admin.post("/api/admin/kids/tournee/difficulty", json={"level": "absent"}).status_code == 404
    content = games(admin)["tournee"]["content"]
    assert content["level"] == "facile" and content["settings"] == TOURNEE.settings("facile")
    assert content["settings"]["duration"] == TOURNEE.duration  # même durée à tous les niveaux
    assert [lv.gifts_required for lv in TOURNEE.levels.values()] == [25, 30, 40]
    # le vol est jugé selon le niveau effectivement joué
    attempt(admin, "tournee", flight(level="facile", finished=False, hits=2, progress=0.5, seconds=20))
    stats = {g["id"]: g for g in admin.get("/api/admin/state").json()["kids"]["games"]}["tournee"]
    assert stats["difficulty"]["current"] == "facile"
    assert [lv["id"] for lv in stats["difficulty"]["levels"]] == ["facile", "normal", "difficile"]
    last = {"level": "facile", "finished": False, "hits": 2, "progress": 0.5, "gifts": 25}
    assert stats["difficulty"]["last_run"] == last
    # « Recommencer » efface le dernier vol mais garde le niveau choisi
    admin.post("/api/admin/kids/tournee/reset")
    stats = {g["id"]: g for g in admin.get("/api/admin/state").json()["kids"]["games"]}["tournee"]
    assert stats["difficulty"]["current"] == "facile" and stats["difficulty"]["last_run"] is None
    admin.cookies.clear()
    assert "difficulty" not in games(admin)["tournee"]
    assert admin.post("/api/admin/kids/tournee/difficulty", json={"level": "facile"}).status_code == 401


def test_invalid_answer_shape(client):
    assert attempt(client, "constellation", {"round": 0, "cells": "abc"}).status_code == 422
    assert attempt(client, "inconnu", {}).status_code == 404


def test_completed_game_attempt_is_idempotent(client):
    solve_constellation(client)
    r = attempt(client, "constellation", {"round": 0, "cells": []}).json()
    assert r["already_completed"] is True


def test_admin_unlock_and_reset(admin):
    admin.post("/api/admin/kids/constellation/complete")
    g = games(admin)
    assert g["constellation"]["status"] == "completed"
    assert g["machine"]["status"] == "available"
    kids = admin.get("/api/admin/state").json()["kids"]
    assert kids["games"][0]["completed_by_admin"] is True
    admin.post("/api/admin/kids/constellation/reset")
    assert games(admin)["constellation"]["status"] == "available"
    assert admin.post("/api/admin/kids/reset", json={}).status_code == 428
    assert admin.post("/api/admin/kids/reset", json={"confirm": True}).status_code == 200


def test_kids_interface_cannot_control_game(client):
    for path in ("/api/admin/game/start", "/api/admin/tv/play", "/api/admin/kids/code/complete"):
        assert client.post(path, json={"video_id": "intro"}).status_code == 401


# ------------------------------------------------------------ machine à cadeaux
FORBIDDEN = re.compile(r"÷|/|divis|partag|répart|moitié|quart|tiers", re.IGNORECASE)

def test_question_bank_is_coherent_and_has_no_division():
    assert len(MACHINE.questions) >= 30
    assert MACHINE.total_orders == 8
    for q in MACHINE.questions:
        # « calc » est évalué au chargement (+, -, × seulement) et doit valoir « answer » : déjà vérifié par le schéma.
        assert "÷" not in q.calc and "/" not in q.calc
        assert not FORBIDDEN.search(q.text) and not FORBIDDEN.search(q.hint), q.id
        assert str(q.answer) not in re.findall(r"\d+", q.hint), f"{q.id} : l'indice donne la réponse"
        assert 0 <= q.answer <= 1000

def test_invalid_question_rejected():
    from pydantic import ValidationError

    from app.core.game_config import MachineQuestionCfg
    base = {"id": "x", "level": 1, "text": "Combien de cadeaux ?", "hint": "h", "choices": [1, 2, 3, 4]}
    for calc, answer in (("2 × 2", 5), ("8 / 2", 4), ("10 - 20 + 12", 2)):
        try:
            MachineQuestionCfg.model_validate(base | {"calc": calc, "answer": answer})
        except ValidationError:
            continue
        raise AssertionError(f"{calc} aurait dû être refusé")

def test_draw_is_random_with_increasing_difficulty(admin):
    admin.post("/api/admin/kids/constellation/complete")
    levels, draws = [], set()
    for _ in range(6):
        ids = []
        for i in range(MACHINE.total_orders):
            _, q = current_order(admin)
            ids.append(q.id)
            levels.append(q.level)
            attempt(admin, "machine", {"order": i, "answer": q.answer})
        assert [BY_TEXT_ID[i].level for i in ids] == [1, 1, 1, 2, 2, 2, 3, 3]
        assert len(set(ids)) == 8
        draws.add(tuple(ids))
        admin.post("/api/admin/kids/machine/reset")
    assert len(draws) > 1  # un nouveau tirage à chaque réinitialisation

BY_TEXT_ID = {q.id: q for q in MACHINE.questions}

def test_machine_wrong_answers_eliminated_then_hint(admin):
    admin.post("/api/admin/kids/constellation/complete")
    content, q = current_order(admin)
    assert content["total"] == 8 and len(content["order"]["choices"]) == 4 and content["eliminated"] == []
    wrong = [c for c in q.choices if c != q.answer]
    r = attempt(admin, "machine", {"order": 0, "answer": wrong[0]}).json()
    assert not r["correct"] and r["eliminated"] == [wrong[0]] and r["hints"] == []
    r = attempt(admin, "machine", {"order": 0, "answer": wrong[1]}).json()
    assert r["hints"] == [q.hint]  # indice après 2 erreurs
    content, _ = current_order(admin)
    assert content["eliminated"] == wrong[:2]
    # au pire 3 erreurs : il ne reste que la bonne réponse, jamais de blocage
    attempt(admin, "machine", {"order": 0, "answer": wrong[2]})
    r = attempt(admin, "machine", {"order": 0, "answer": q.answer}).json()
    assert r["correct"] and r["step"] == 1 and not r["completed"] and r["eliminated"] == [] and r["hints"] == []
    assert attempt(admin, "machine", {"order": 0, "answer": q.answer}).status_code == 409  # double clic
    kids = {g["id"]: g for g in admin.get("/api/admin/state").json()["kids"]["games"]}
    m = kids["machine"]
    assert m["failures"] == 3 and m["step"] == 1
    _, q2 = current_order(admin)
    assert m["current_order"] == {"number": 2, "total": 8, "text": q2.text, "calc": q2.calc, "answer": q2.answer}

def test_machine_answer_not_in_public_or_kids_state(client):
    client.cookies.clear()
    assert "current_order" not in str(client.get("/api/kids/state").json())

def test_machine_admin_unlock(admin):
    admin.post("/api/admin/kids/constellation/complete")
    admin.post("/api/admin/kids/machine/complete")
    g = games(admin)
    assert g["machine"]["status"] == "completed" and g["machine"]["reward"]["symbol"] == "⚙️"
    assert g["tournee"]["status"] == "available"

def test_draw_service_is_seedable():
    from app.models import KidsProgress
    from app.services.kids import KidsService
    cfg = load_game_config(REPO_ROOT / "config")
    rows = []
    for seed in (1, 1, 2):
        row = KidsProgress(game_id="machine", completed=False, step=0)
        KidsService(cfg, clock=lambda: None, rng=random.Random(seed))._new_draw(row)
        rows.append(row.data["questions"])
    assert rows[0] == rows[1]
