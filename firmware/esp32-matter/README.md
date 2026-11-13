# Boîtier Matter ESP32 : 10 boutons + 5 lampes RGB virtuels + 3 capteurs de porte + 1 relais

Un ESP32 DevKit V1 (ESP32-WROOM-32) exposé en **Matter over Wi-Fi** : les boutons et les lampes n'existent que dans
l'application domotique. Le seul câblage concerne les 3 capteurs de porte et le relais (voir plus bas).

| Endpoints | Dans l'application (Smart Life, Google Home, Apple Maison, Home Assistant…) | Effet |
|---|---|---|
| 1 à 10 | 10 prises « Action 1 » … « Action 10 » (à renommer dans l'application) | Allumer → `POST /api/devices/actions/N` sur le Raspberry Pi, puis la prise se rééteint seule après 1 s |
| 11 à 15 | 5 lampes couleur « Lampe 1 » … « Lampe 5 » | lampes virtuelles : on/off et couleur mémorisés par Matter, affichés sur le port série, aucune LED |

```text
 Smart Life ──Matter (Wi-Fi)──▶ ESP32 ──HTTP POST /api/devices/actions/N──▶ Raspberry Pi (FastAPI)
                                          X-Device-Token + Idempotency-Key
```

## Capteurs de porte et relais

Trois contacts magnétiques (NO/NC) sont branchés sur la carte. Quand les trois portes sont **fermées dans le bon
ordre**, l'ESP32 **colle le relais pendant 5 s** (`RELAY_PULSE_MS`), sans appeler le serveur. Les capteurs et le relais
fonctionnent même si le boîtier n'est pas appairé en Matter, et même sans réseau.

| Capteur | GPIO (DevKit V1) | Câblage |
|---|---|---|
| 1 | D32 | COM → GND, NO → D32 |
| 2 | D33 | COM → GND, NO → D33 |
| 3 | D25 | COM → GND, NO → D25 |

Aucune résistance n'est nécessaire, la pull-up interne est activée. Avec un aimant contre le capteur (porte fermée),
le contact NO se ferme et le GPIO passe à LOW. Pour un câblage sur NC, mettre `DOOR_CLOSED_IS_LOW 0`.

Règles de la séquence (ordre par défaut 1 → 2 → 3, réglable avec `DOOR_SEQUENCE`) :

- Seule une **fermeture** (passage ouvert → fermé, anti-rebond 50 ms) compte comme une étape. L'état des portes
  au démarrage n'est pas compté.
- Fermer une porte qui n'est pas la suivante attendue remet la séquence à zéro. Si cette porte est la première
  de la séquence, elle compte comme nouveau départ.
- Rouvrir une porte déjà comptée remet aussi la séquence à zéro : il faut finir avec les trois portes fermées.
- `DOOR_SEQUENCE_TIMEOUT_MS` limite en option le délai entre deux fermetures (0 = illimité).
- Une fois la séquence réussie, elle repart de zéro. La réussir à nouveau pendant l'impulsion la prolonge de 5 s.

Le moniteur série affiche chaque ouverture et fermeture (`[porte 2] fermée`, `[portes] séquence 2/3`…), ce qui
permet de tester le câblage.

### Relais JQC3F-05VDC-C

Le relais 5 V se branche **sous forme de module** (carte avec transistor, diode et LED) : une broche d'ESP32 ne peut
pas alimenter la bobine directement.

| Module relais | ESP32 DevKit V1 |
|---|---|
| VCC (ou DC+) | VIN (5 V de l'USB) |
| GND (ou DC−) | GND |
| IN | D26 |

Côté puissance, l'appareil à commander se branche entre **COM** et **NO** (fermé pendant les 5 s). La plupart des
modules collent quand IN est à LOW (`RELAY_ACTIVE_LOW 1`, valeur par défaut) ; si le relais reste collé au repos et
se relâche pendant l'impulsion, mettre `RELAY_ACTIVE_LOW 0`. Le niveau de repos est fixé avant que la broche passe en
sortie, pour éviter un clic au démarrage.

Le moniteur série affiche `[relais] collé pour 5000 ms` puis `[relais] relâché`.

Les capteurs et le relais se règlent dans `config.h` (`DOOR_PINS`, `DOOR_SEQUENCE`, `RELAY_PIN`, `RELAY_ACTIVE_LOW`,
`RELAY_PULSE_MS`…). Sans ces lignes, les valeurs par défaut ci-dessus s'appliquent.

## Carte

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
| 5 | **protocole d'urgence** : tant que le MJ ne l'a pas autorisé (onglet Partie, « 🚨 Autoriser le protocole d'urgence »), la TV affiche « Soyez patients mes lutins, laissez encore un peu de temps aux adultes de résoudre l'enquête » ; une fois autorisé, lance toujours la vidéo du secours des lutins, même si les équipes n'ont pas fini (en enquête ou en finale, la partie passe aussi en phase Secours puis Fin) |
| 6 à 10 | rien pour l'instant : réponse `{"action": n, "defined": false, "changed": false}` |

Valider une équipe déjà validée est sans effet (`"changed": false`). La validation passe par les mêmes étapes
journalisées qu'au téléphone du MJ (source `device`) et s'affiche aussitôt sur tous les écrans. Le boîtier envoie un
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
