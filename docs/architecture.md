# Architecture

## Vue d'ensemble

```text
 Téléphone MJ (/admin) ──┐  REST /api/admin/* (cookie de session)
 Tablette (/lutins) ─────┤  REST /api/kids/*  (essais de mini-jeux uniquement)
 TV Chromium (/tv) ──────┤  REST /api/tv/ended (fin de lecture uniquement)
                         │  WebSocket /ws?channel=admin|tv|kids|status (lecture seule, poussé par le serveur)
                         ▼
               ┌───────────────────────────────┐
               │ Conteneur unique « app »       │
               │ uvicorn + FastAPI              │
               │  ├─ /           frontend compilé (SPA)
               │  ├─ /api        REST          │
               │  ├─ /ws         WebSocket     │
               │  └─ /media      vidéos MP4 (Range / cache)
               │ planificateur asyncio (1 s)   │
               └──────────────┬────────────────┘
                              │ SQLAlchemy + Alembic
                         SQLite (data/noel2026.db, WAL)
```

Un seul processus, un seul port : pas de reverse proxy, pas de broker, pas de microservice.
En développement, Vite (port 8080) sert le frontend avec rechargement à chaud et relaie `/api`, `/ws`, `/media`
vers uvicorn `--reload` (port 8000).

## Backend (`backend/app`)

| Module | Rôle |
|---|---|
| `core/config.py` | paramètres techniques (variables d'environnement) |
| `core/game_config.py` | schéma Pydantic de `config/game.yaml`, validé au démarrage (références croisées, horaires, fichiers, calcul de chaque question de la machine à cadeaux : +, -, × uniquement) |
| `core/security.py` | hash scrypt, jeton de session HMAC, limitation des tentatives de connexion |
| `models/` | tables SQLAlchemy, migrations Alembic appliquées automatiquement au démarrage (0003 : la machine à cadeaux reprend la ligne de l'ancien jeu des traces) |
| `services/game.py` | machine à états de la partie et des équipes, TV (vidéos, messages, ambiance) |
| `services/kids.py` | mini-jeux : progression séquentielle, vérification des réponses côté serveur, indices, tirage des commandes de la machine à cadeaux (conservé en base) |
| `services/schedule.py` | planning de la soirée (relatif au démarrage ou heure fixe, accélération démo) |
| `services/container.py` | transactions, idempotence, vues par écran, sauvegarde |
| `services/realtime.py` | diffusion WebSocket des instantanés d'état |
| `api/` | routes REST et WebSocket |
| `cli.py` | `hash-password`, `check-config`, `backup`, `seed-demo` |

### Machine à états

```text
PREPARATION → INTRO → ENQUETE → FINALE → VICTOIRE ─→ FIN
                         │         └────→ SECOURS ──┘
                         └──→ VICTOIRE / SECOURS (fin anticipée)      SECOURS → VICTOIRE autorisé
```

- PREPARATION : la TV affiche l'écran d'attente « Allocution du Père Noël à venir ». Le MJ peut lancer un compte
  à rebours (`intro_countdown_until`, 5 s à 4 h, relançable / annulable) ; à échéance, le planificateur passe en
  INTRO. Échu pendant une coupure de plus de 2 minutes : annulé (journalisé) sans lancer l'intro.
- Entrée en INTRO / FINALE / VICTOIRE / SECOURS : la vidéo associée (`phase_videos`) est lancée.
- Fin de la vidéo d'intro → ENQUETE ; fin de victoire/secours → FIN (`auto_advance`).
- VICTOIRE et SECOURS exigent `confirm=true` (confirmation dans l'interface).
- Équipes : `NON_COMMENCE → EN_COURS → VALIDEE`, invalidation `VALIDEE → EN_COURS`, remise à zéro
  `EN_COURS → NON_COMMENCE`. Un saut (ex. valider directement) passe par les états intermédiaires, chacun journalisé.
- Toute transition est écrite dans `event_log` avec horodatage UTC.

### Fiabilité

- **Persistance** : chaque commande est une transaction SQLite ; après un redémarrage la partie reprend
  (phase, équipes, mini-jeux, planning, lecture TV en cours).
- **Idempotence** : l'interface envoie un en-tête `Idempotency-Key` par clic ; une requête rejouée renvoie
  la réponse enregistrée sans réexécuter. Les boutons sont verrouillés pendant l'appel. Relancer la même vidéo
  dans les 3 secondes est ignoré.
- **Sérialisation** : un verrou asyncio garantit qu'une seule commande modifie l'état à la fois.
- **Planning après coupure** : un événement en retard de plus de 2 minutes est marqué « manqué » plutôt que
  joué en rattrapage ; le MJ peut le relancer d'un clic.
- **TV** : une nouvelle lecture remplace la précédente (jamais de superposition) ; la fin d'une ancienne lecture
  est ignorée ; au rechargement de la TV, une lecture de plus de 10 minutes n'est pas rejouée.

### Sécurité

- Mot de passe admin stocké uniquement sous forme de hash scrypt (`ADMIN_PASSWORD_HASH`), jamais dans Git.
- Session : cookie `HttpOnly`, `SameSite=Strict`, signé HMAC, expirant (12 h) ; changer le mot de passe invalide
  les sessions. Clé de signature dans `data/secret_key` (générée) ou `SECRET_KEY`.
- 5 échecs de connexion en 5 minutes → blocage temporaire (HTTP 429).
- WebSocket en lecture seule : aucune commande acceptée ; canal admin réservé aux sessions valides de même origine.
- Toutes les entrées sont validées par Pydantic (énumérations, longueurs, formats).
- `/tv`, `/lutins`, `/status` n'exposent aucune commande ; les seules écritures publiques sont un essai de
  mini-jeu et la fin de la lecture TV courante.
- Pas de documentation OpenAPI en production ; aucune redirection de port Internet ; aucune ressource externe
  (polices embarquées, pas de CDN) : fonctionne hors ligne.

## Frontend (`frontend/src`)

| Dossier | Contenu |
|---|---|
| `pages/` | `AdminPage`, `TvPage`, `KidsPage`, `StatusPage`, `HomePage` |
| `components/admin/` | panneaux Partie, TV, Équipes, Lutins, Planning, Journal |
| `components/tv/` | `playback.ts` (logique de lecture), `progress.ts` (détection des succès), scènes, panneau d'avancement, animation de succès |
| `games/` | les 4 mini-jeux, sons Web Audio, composants communs |
| `hooks/useLiveChannel.ts` | abonnement WebSocket avec reconnexion automatique |
| `services/` | client API, types, libellés |

Chaque message WebSocket contient l'état complet du canal : un écran qui se reconnecte est immédiatement à jour.

## Tests

| Suite | Commande | Couverture |
|---|---|---|
| pytest (95) | `pytest` dans `backend/` | moteur, équipes, persistance/redémarrage, vidéos, WebSocket, mini-jeux, planning, démo, authentification, config, SPA |
| Vitest (31) | `npm test` dans `frontend/` | décisions de lecture TV, détection des succès, panneau d'avancement, mini-jeux, utilitaires |
| Playwright (8) | `npx playwright test` | parcours admin ↔ TV en temps réel, avancement + animations de succès sur la TV, victoire, réinitialisation, 4 mini-jeux complets, déblocage à distance |

## Évolutions futures (non développées)

Le code est découpé pour accueillir plus tard d'autres sources d'événements (ex. capteurs) : il suffira d'appeler
les méthodes existantes de `GameService` (`set_phase`, `set_team_status`, `play_video`) depuis un nouveau module.
Aucune abstraction n'est créée à l'avance.
