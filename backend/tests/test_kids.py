"""Mini-jeux des lutins."""

import random
import re

from app.core.config import REPO_ROOT
from app.core.game_config import load_game_config

MACHINE = load_game_config(REPO_ROOT / "config").kids.machine
BY_TEXT = {q.text: q for q in MACHINE.questions}
STARS = [[0, 2], [1, 0], [2, 3], [3, 1], [4, 3], [5, 0]]
GIFTS = {
    "color": {"g1": "rouge", "g2": "vert", "g3": "bleu", "g4": "rouge", "g5": "vert", "g6": "bleu"},
    "size": {"g1": "grand", "g2": "petit", "g3": "grand", "g4": "petit", "g5": "grand", "g6": "petit"},
    "symbol": {"g1": "etoile", "g2": "sapin", "g3": "cloche", "g4": "sapin", "g5": "cloche", "g6": "etoile"},
}


def attempt(client, game, answer):
    return client.post(f"/api/kids/games/{game}/attempt", json={"answer": answer})


def games(client):
    return {g["id"]: g for g in client.get("/api/kids/state").json()["games"]}


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
    assert attempt(client, "constellation", {"cells": STARS}).json()["completed"]
    assert solve_machine(client)["completed"]
    for i, rule in enumerate(("color", "size", "symbol")):
        assert attempt(client, "cadeaux", {"round": i, "placement": GIFTS[rule]}).json()["correct"]
    return attempt(client, "code", {"code": "742"}).json()


def test_initial_kids_state(client):
    g = games(client)
    assert g["constellation"]["status"] == "available"
    assert g["constellation"]["content"]["stars"] == STARS
    assert g["machine"]["status"] == "locked" and g["machine"]["content"] is None
    assert g["code"]["status"] == "locked"


def test_solutions_not_exposed(client, admin):
    admin.post("/api/admin/kids/constellation/complete")
    admin.post("/api/admin/kids/machine/complete")
    admin.post("/api/admin/kids/cadeaux/complete")
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


def test_constellation_order_independent_and_wrong_answer(client):
    assert attempt(client, "constellation", {"cells": STARS[:-1]}).json()["correct"] is False
    assert attempt(client, "constellation", {"cells": list(reversed(STARS))}).json()["correct"] is True


def test_locked_game_refused(client):
    assert attempt(client, "machine", {"order": 0, "answer": 42}).status_code == 409


def test_progressive_hints(client):
    r = None
    for _ in range(2):
        r = attempt(client, "constellation", {"cells": [[0, 0]]}).json()
    assert len(r["hints"]) == 1
    for _ in range(2):
        r = attempt(client, "constellation", {"cells": [[0, 0]]}).json()
    assert len(r["hints"]) == 2
    for _ in range(10):
        r = attempt(client, "constellation", {"cells": [[0, 0]]}).json()
    assert len(r["hints"]) == 3  # plafonné au nombre d'indices configurés


def test_cadeaux_rounds(client):
    attempt(client, "constellation", {"cells": STARS})
    solve_machine(client)
    wrong = dict(GIFTS["color"], g1="vert")
    assert attempt(client, "cadeaux", {"round": 0, "placement": wrong}).json()["correct"] is False
    r = attempt(client, "cadeaux", {"round": 0, "placement": GIFTS["color"]}).json()
    assert r["correct"] and r["step"] == 1 and not r["completed"]
    assert attempt(client, "cadeaux", {"round": 0, "placement": GIFTS["color"]}).status_code == 409
    attempt(client, "cadeaux", {"round": 1, "placement": GIFTS["size"]})
    r = attempt(client, "cadeaux", {"round": 2, "placement": GIFTS["symbol"]}).json()
    assert r["completed"] and r["reward"]["digit"] == 2


def test_invalid_answer_shape(client):
    assert attempt(client, "constellation", {"cells": "abc"}).status_code == 422
    assert attempt(client, "inconnu", {}).status_code == 404


def test_completed_game_attempt_is_idempotent(client):
    attempt(client, "constellation", {"cells": STARS})
    r = attempt(client, "constellation", {"cells": []}).json()
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
    assert g["cadeaux"]["status"] == "available"

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
