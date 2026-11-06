# Boîtier Matter ESP32 : 10 boutons + 5 lampes RGB virtuels

Un ESP32 DevKit V1 (ESP32-WROOM-32) exposé en **Matter over Wi-Fi**, **sans aucun câblage** : les boutons et les
lampes n'existent que dans l'application domotique.

| Endpoints | Dans l'application (Smart Life, Google Home, Apple Maison, Home Assistant…) | Effet |
|---|---|---|
| 1 à 10 | 10 prises « Action 1 » … « Action 10 » (à renommer dans l'application) | Allumer → `POST /api/devices/actions/N` sur le Raspberry Pi, puis la prise se rééteint seule après 1 s |
| 11 à 15 | 5 lampes couleur « Lampe 1 » … « Lampe 5 » | lampes virtuelles : on/off et couleur mémorisés par Matter, affichés sur le port série, aucune LED |

```text
 Smart Life ──Matter (Wi-Fi)──▶ ESP32 ──HTTP POST /api/devices/actions/N──▶ Raspberry Pi (FastAPI)
                                          X-Device-Token + Idempotency-Key
```

Seuls les éléments de la carte sont utilisés : le bouton **BOOT** (appui de 5 s = effacer l'appairage Matter) et
la **LED bleue** (clignote : à appairer · fixe : connecté · éteinte : hors ligne). Il suffit d'alimenter la carte en USB.

## Compilation

1. Arduino IDE 2 → Gestionnaire de cartes → **esp32 par Espressif Systems ≥ 3.1** (bibliothèque Matter incluse).
2. Copier `escape_noel_matter/config.example.h` en `escape_noel_matter/config.h` et renseigner `SERVER_BASE_URL`
   et `DEVICE_TOKEN`, ainsi que **`WIFI_SSID` / `WIFI_PASSWORD`** (Wi-Fi 2,4 GHz, obligatoires) ;
   `config.h` est ignoré par git.
3. Carte **ESP32 Dev Module**, Partition Scheme **Huge APP (3MB No OTA/1MB SPIFFS)**,
   **Erase All Flash Before Sketch Upload : Enabled** au premier téléversement.
4. Téléverser, puis ouvrir le moniteur série à 115200 bauds : le code d'appairage et le lien du QR code s'affichent.

En ligne de commande :

```bash
arduino-cli compile --fqbn esp32:esp32:esp32:PartitionScheme=huge_app firmware/esp32-matter/escape_noel_matter
arduino-cli upload  --fqbn esp32:esp32:esp32:PartitionScheme=huge_app -p /dev/ttyUSB0 firmware/esp32-matter/escape_noel_matter
```

Sous WSL2, le port USB n'est pas visible sans `usbipd` : le plus simple est de téléverser depuis l'Arduino IDE Windows.

## Côté serveur (Raspberry Pi)

Dans le `.env` du Raspberry Pi, définir le même jeton que dans `config.h`, puis redémarrer :

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(24))"   # → DEVICE_TOKEN=...
```

Sans `DEVICE_TOKEN`, les routes `/api/devices/*` répondent 503 en production (en développement elles sont ouvertes).

| Route | Rôle |
|---|---|
| `GET /api/devices/actions` | liste les actions 1-10 et indique si elles sont définies |
| `POST /api/devices/actions/{n}` | déclenche l'action n ; corps facultatif `{"source": "matter"\|"test", "device": "esp32-escape"}` |

Chaque appui est journalisé (`device_action`, visible dans le journal de l'admin), puis l'action est exécutée :

| Action | Effet |
|---|---|
| 1 | valide la mission de l'**équipe Rouge** |
| 2 | valide la mission de l'**équipe Verte** |
| 3 | valide la mission de l'**équipe Bleue** |
| 4 | valide la mission de l'**équipe Or** |
| 5 | **protocole d'urgence** : tant que le MJ ne l'a pas autorisé (onglet Partie, « 🚨 Autoriser le protocole d'urgence »), la TV affiche « Soyez patients mes lutins, laissez encore un peu de temps aux adultes de résoudre l'enquête » ; une fois autorisé, lance la phase Secours des lutins et sa vidéo (en enquête ou en finale uniquement) |
| 6 à 10 | rien pour l'instant : réponse `{"action": n, "defined": false, "changed": false}` |

Valider une équipe déjà validée est sans effet (`"changed": false`). La validation passe par les mêmes étapes
journalisées qu'au téléphone du MJ (source `device`) et s'affiche aussitôt sur tous les écrans. Le boîtier envoie un Le boîtier envoie un
`Idempotency-Key` par appui : ses nouvelles tentatives réseau ne rejouent pas l'action.

Pour brancher une action, ajouter une fonction dans `ActionsService.handlers`
(`backend/app/services/actions.py`) : elle reçoit la session SQL, le numéro et la source, et renvoie un dict avec
`"changed": True` si l'état de la partie change (les écrans sont alors notifiés).

Test sans le boîtier :

```bash
curl -X POST http://192.168.1.5/api/devices/actions/1 \
  -H "X-Device-Token: <jeton>" -H "Content-Type: application/json" -d '{"source":"test"}'
```

## Appairage et points d'attention

- Le firmware utilise les identifiants Matter **de test** (VID 0xFFF1) : les applications affichent « appareil non
  certifié », il faut confirmer. Google Home exige en plus de déclarer un projet sur la Google Home Developer Console.
- Smart Life accepte les appareils Matter Wi-Fi depuis le téléphone ; si l'ajout échoue, appairer d'abord dans
  une autre application (Google Home, Apple Maison, Home Assistant), puis partager l'appareil vers Smart Life
  (« Associer à une autre application » / multi-admin).
- **Pas d'appairage Bluetooth** sur l'ESP32 classique (le core Arduino ESP32 3.3 n'active pas `CONFIG_ENABLE_CHIPOBLE`
  pour cette puce) : le boîtier se connecte au Wi-Fi de `config.h` et s'appaire **par le réseau**. Le téléphone doit
  être sur le même Wi-Fi. Apple Maison et Home Assistant gèrent cet appairage « déjà sur le réseau » ; si une
  application cherche le boîtier en Bluetooth sans le trouver, appairer avec l'une d'elles puis partager.
- Tant que le Wi-Fi n'est pas joint, le moniteur série affiche des points et la LED bleue reste éteinte.
- **Mémoire** : sur l'ESP32 classique (320 Ko de RAM), une prise coûte ~2,6 Ko et une lampe couleur ~11,5 Ko.
  Mesuré sur la carte : 10 + 10 plante au démarrage (abort dans `color_control`), 10 + 5 laisse ~66 Ko libres
  (`ACTION_COUNT` / `LAMP_COUNT` dans `config.h`). Pour 10 lampes couleur, passer sur un ESP32-S3 ou ESP32-C6.
- Le Raspberry Pi doit garder la même IP (bail DHCP réservé sur la box) : `SERVER_BASE_URL` est une IP fixe.
