"""Outils en ligne de commande.

    python -m app.cli hash-password            # demande le mot de passe, affiche ADMIN_PASSWORD_HASH
    python -m app.cli check-config             # valide config/game.yaml et liste les vidéos manquantes
    python -m app.cli backup [--output DIR]    # sauvegarde cohérente de la base SQLite
    python -m app.cli seed-demo                # état de démonstration (partie en cours d'enquête)
"""

import argparse
import getpass
import sys
from pathlib import Path

from app.core.config import Settings
from app.core.game_config import load_game_config
from app.core.security import hash_password
from app.models import create_db_engine, make_session_factory
from app.models.migrate import run_migrations
from app.services.common import utcnow
from app.services.container import Services, backup_sqlite


def _services() -> Services:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    run_migrations(settings.db_url)
    svc = Services(settings, load_game_config(settings.config_dir),
                   make_session_factory(create_db_engine(settings.db_url)), utcnow)
    svc.bootstrap()
    return svc


def cmd_hash_password(args) -> int:
    password = args.password or getpass.getpass("Mot de passe admin : ")
    if not args.password and password != getpass.getpass("Confirmation : "):
        print("Les mots de passe ne correspondent pas.", file=sys.stderr)
        return 1
    if len(password) < 8:
        print("8 caractères minimum.", file=sys.stderr)
        return 1
    print(hash_password(password))
    return 0


def cmd_check_config(_args) -> int:
    settings = Settings()
    cfg = load_game_config(settings.config_dir)
    print(f"Configuration valide : {cfg.game.title}")
    missing = 0
    for v in cfg.videos:
        ok = (settings.media_dir / "videos" / v.file).is_file()
        missing += not ok
        print(f"  [{'ok' if ok else 'MANQUANTE'}] {v.file:28s} {v.title}")
    if missing:
        print(f"{missing} vidéo(s) manquante(s) : un écran de substitution sera affiché.")
    return 0


def cmd_backup(args) -> int:
    settings = Settings()
    target = Path(args.output) if args.output else settings.data_dir / "backups"
    print(backup_sqlite(settings.db_url, target, utcnow()))
    return 0


def cmd_seed_demo(_args) -> int:
    svc = _services()

    def seed(s):
        svc.reset_all(s)
        svc.game.set_phase(s, "INTRO", source="demo")
        svc.game.stop_video(s, source="demo")
        svc.game.set_phase(s, "ENQUETE", source="demo")
        teams = [t.id for t in svc.cfg.teams]
        svc.game.set_team_status(s, teams[0], "VALIDEE", source="demo")
        svc.game.set_team_status(s, teams[1], "EN_COURS", source="demo")
        svc.game.set_team_status(s, teams[2], "EN_COURS", source="demo")
        svc.kids.admin_complete(s, "constellation")
        return {"changed": True}

    svc.run(seed)
    print("Données de démonstration chargées : partie en ENQUÊTE, 1 équipe validée, 1 mini-jeu réussi.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("hash-password")
    p.add_argument("--password", help="mot de passe (sinon saisie masquée)")
    p.set_defaults(fn=cmd_hash_password)
    sub.add_parser("check-config").set_defaults(fn=cmd_check_config)
    p = sub.add_parser("backup")
    p.add_argument("--output")
    p.set_defaults(fn=cmd_backup)
    sub.add_parser("seed-demo").set_defaults(fn=cmd_seed_demo)
    args = parser.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
