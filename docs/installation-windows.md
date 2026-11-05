# Installation sous Windows 11

## Prérequis

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (backend WSL 2), démarré.
- Git (ou une copie du dossier du projet).
- Rien d'autre : Python et Node.js tournent dans les conteneurs.

## Version complète (comme en production)

```powershell
cd C:\chemin\vers\noel2026
docker compose up --build
```

- Application : <http://localhost:8080>
- Admin : <http://localhost:8080/admin> — mot de passe de développement `noel2026`
- Arrêt : `Ctrl+C` puis `docker compose down`

La base SQLite est dans le volume Docker `noel2026_noel-data` (les partages de fichiers Windows posent des
problèmes de verrouillage à SQLite). Pour repartir de zéro : `docker compose down -v`.

## Mode développement (rechargement automatique)

```powershell
.\scripts\dev.ps1              # backend uvicorn --reload + Vite HMR -> http://localhost:8080
.\scripts\dev.ps1 -Mode demo   # idem, planning accéléré ×30 (30 min de jeu = 1 min)
.\scripts\dev.ps1 -Mode full   # version complète en arrière-plan
.\scripts\dev.ps1 -Mode seed   # données de démo dans la version complète (partie en cours)
.\scripts\dev.ps1 -Mode stop
```

Si PowerShell refuse le script : `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

Les modifications de `backend/app`, `config/` et `frontend/src` sont prises en compte automatiquement
(scrutation activée car les notifications de fichiers ne traversent pas toujours les montages Windows).

## Tests

```powershell
.\scripts\test.ps1         # ruff + pytest, puis typecheck + Vitest (dans des conteneurs)
.\scripts\test.ps1 -E2E    # + Playwright contre http://localhost:8080 (image officielle Playwright)
```

Les tests E2E réinitialisent la partie.

## Accès depuis le téléphone pendant le développement

`dev.ps1` affiche l'adresse IP du PC (ex. `http://192.168.1.20:8080/admin`). Autorisez Docker Desktop
dans le pare-feu Windows pour les réseaux privés si la page ne s'ouvre pas.

## Mot de passe personnalisé

```powershell
docker compose run --rm app python -m app.cli hash-password
copy .env.example .env      # puis coller le hash dans ADMIN_PASSWORD_HASH
docker compose up -d
```

## Vidéos

Copiez les MP4 dans `media\videos\`. `docker compose exec app python -m app.cli check-config` liste les
fichiers présents/manquants. Sans vidéo, la TV affiche le décor animé et des écrans de substitution.
