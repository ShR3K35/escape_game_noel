# 🎄 Noël 2026 — La Clé des Étoiles

Application de pilotage du Cluedo Escape de Noël 2026 (version 1, sans domotique).

| Interface | Route | Pour qui |
|---|---|---|
| Maître du jeu | `/admin` | téléphone du MJ (mot de passe) |
| Télévision | `/tv` | Raspberry Pi en HDMI, plein écran |
| Lutins | `/lutins` | tablette des 3 enfants : 4 mini-jeux |
| État du jeu | `/status` | résumé en lecture seule |
| Santé | `/api/health` | supervision technique |

Stack : FastAPI + SQLAlchemy + Alembic + SQLite · React + TypeScript + Vite + Tailwind · WebSocket · Docker Compose.

## Démarrage rapide (Windows 11 + Docker Desktop)

```powershell
docker compose up --build          # version complète -> http://localhost:8080
.\scripts\dev.ps1                  # développement avec rechargement automatique -> http://localhost:8080
.\scripts\test.ps1                 # tests backend + frontend (ajouter -E2E pour Playwright)
```

Mot de passe admin de développement : `noel2026` (uniquement quand `ADMIN_PASSWORD_HASH` n'est pas défini et `APP_ENV` ≠ `production`).

Pour essayer : ouvrez `/admin` dans un navigateur et `/tv` dans un autre, cliquez sur « Démarrer la partie ».

## Production (Raspberry Pi 4/5, Raspberry Pi OS 64 bits)

```bash
git clone <dépôt> ~/noel2026 && cd ~/noel2026
./scripts/deploy-pi.sh             # Docker, nom d'hôte noel2026, Avahi, mot de passe
```

Puis `http://noel2026.local/admin` depuis le téléphone (ou l'IP affichée par `./scripts/show-ip.sh`).

## Vidéos

Déposer les MP4 (H.264 + AAC) dans `media/videos/` avec les noms du manifeste `config/game.yaml` :
`00_loop_bureau.mp4`, `01_intro_2000.mp4`, `02_relance_2030.mp4`, `03_alerte_2050.mp4`,
`04_finale_2115.mp4`, `05_victoire.mp4`, `06_secours_lutins.mp4`, `07_appel_lutins_2300.mp4`.

Une vidéo absente est remplacée par un écran de substitution (texte du Père Noël). Des vidéos de démonstration
peuvent être générées avec `./scripts/generate-demo-videos.sh` (ffmpeg ou Docker ; vos fichiers ne sont jamais écrasés).

## Documentation

- [Architecture](docs/architecture.md)
- [Installation Windows](docs/installation-windows.md)
- [Installation Raspberry Pi](docs/installation-raspberry.md)
- [Exploitation le soir de la fête](docs/exploitation-soiree.md)

## Arborescence

```text
backend/    FastAPI : app/{api,core,models,services}, alembic/, tests/ (pytest)
frontend/   React : src/{pages,components,games,hooks,services}, tests/{unit (Vitest), e2e (Playwright)}
config/     game.yaml : équipes, vidéos, messages, planning, contenu des mini-jeux
media/      videos/ : MP4 locaux (non versionnés)
scripts/    dev.ps1, test.ps1, test.sh, deploy-pi.sh, backup.sh, show-ip.sh, generate-demo-videos.sh
compose.yml / compose.dev.yml / compose.prod.yml / Dockerfile / .env.example
```
