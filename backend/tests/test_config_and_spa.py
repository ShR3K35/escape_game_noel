"""Validation de la configuration et service du frontend compilé."""

import pytest
import yaml
from pydantic import ValidationError

from app.core.config import REPO_ROOT
from app.core.game_config import AppConfig, load_game_config


def raw():
    return yaml.safe_load((REPO_ROOT / "config" / "game.yaml").read_text(encoding="utf-8"))


def test_repository_config_is_valid():
    cfg = load_game_config(REPO_ROOT / "config")
    assert [t.id for t in cfg.teams] == ["rouge", "verte", "bleue", "or"]
    assert [v.file for v in cfg.videos] == [
        "00_loop_bureau.mp4", "01_intro_2000.mp4", "02_relance_2030.mp4", "03_alerte_2050.mp4",
        "04_finale_2115.mp4", "05_victoire.mp4", "06_secours_lutins.mp4", "07_appel_lutins_2300.mp4"]


def test_sleigh_code_matches_rewards():
    k = load_game_config(REPO_ROOT / "config").kids
    assert k.code.code == f"{k.machine.reward.digit}{k.constellation.reward.digit}{k.tournee.reward.digit}"


@pytest.mark.parametrize("mutate", [
    lambda d: d["schedule"].append({"id": "x", "label": "x", "at": "24:00", "action": "video", "target": "intro"}),
    lambda d: d["schedule"].append({"id": "y", "label": "y", "at": "20:00", "action": "video", "target": "absente"}),
    lambda d: d["videos"].append({"id": "z", "file": "../etc/passwd", "title": "z"}),
    lambda d: d["teams"].append(dict(d["teams"][0])),
    lambda d: d["kids"]["machine"]["questions"][0].update(answer=21),
    lambda d: d["kids"]["machine"]["questions"][0].update(calc="40 / 2"),
    lambda d: d["kids"]["machine"].update(orders_per_level=[20, 3, 2]),
    lambda d: d["kids"]["constellation"]["stars"].append([9, 9]),
    lambda d: d["kids"]["tournee"].update(duration=150),  # 2 minutes maximum
    lambda d: d["kids"]["tournee"]["levels"]["facile"].update(gifts_required=90),  # plus que les cadeaux proposés
    lambda d: d["kids"]["tournee"].update(difficulty="extreme"),
])
def test_invalid_configs_rejected(mutate):
    data = raw()
    mutate(data)
    with pytest.raises(ValidationError):
        AppConfig.model_validate(data)


def test_spa_served_with_fallback(make_client, static_dir):
    c = make_client(static_dir=static_dir)
    for path in ("/", "/admin", "/tv", "/lutins", "/status"):
        r = c.get(path)
        assert r.status_code == 200 and "<div id=root>" in r.text
    assert c.get("/assets/app.js").headers["cache-control"].startswith("public")
    assert c.get("/api/inexistant").status_code == 404
    assert "<div id=root>" in c.get("/../../etc/passwd").text
