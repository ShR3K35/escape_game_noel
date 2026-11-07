# Télécommande Zigbee 4 boutons (ZiGate)

Une combinaison jouée sur la télécommande MOES ESW-0ZAA-EU (reconnue par Zigbee2MQTT comme `TS004F_1`) déclenche une action de la partie :
les mêmes actions 1 à 10 que le boîtier ESP32 Matter.

```
MOES 4 boutons ──Zigbee──► ZiGate ──► zigbee2mqtt ──MQTT──► mosquitto ──► telecommande ──HTTP──► app
                                                                          (combinaisons)      POST /api/devices/actions/{n}
```

| Conteneur      | Rôle                                                                   |
|----------------|------------------------------------------------------------------------|
| `zigbee2mqtt`  | pilote la ZiGate, publie chaque appui sur `zigbee2mqtt/telecommande`   |
| `mosquitto`    | broker MQTT, interne à Docker (aucun port publié)                     |
| `telecommande` | `python -m app.remote.bridge` : reconnaît les combinaisons, appelle l'API avec `DEVICE_TOKEN` |

Les trois conteneurs appartiennent au profil Compose `zigbee` : sans lui, l'application démarre comme avant.

## Combinaisons

Fichier `config/telecommande.yaml` (commenté). Règles :

- un appui court = un chiffre ; un **double appui compte pour deux** (la télécommande regroupe deux appuis
  rapides sur le même bouton) ;
- un **appui long efface** la saisie ;
- la combinaison est reconnue **dès le dernier bouton**, même après des erreurs ;
- après `reset_seconds` sans appui la saisie est effacée ; `wrong_action` (facultatif) est alors déclenchée
  si la saisie était au moins aussi longue que la plus courte combinaison.

## Bouton d'urgence

Le bouton IKEA TRADFRI E1812 (friendly_name `urgence`) est déclaré dans la section `buttons` de
`config/telecommande.yaml` : un appui court (`action: on`) appelle l'**action 5**, exactement comme le boîtier
Matter. Le backend applique les règles du protocole d'urgence : sans autorisation du MJ, message de patience sur
la TV ; avec autorisation, vidéo du secours des lutins (sans la relancer si elle passe déjà). Les appuis
répétés dans les `cooldown_seconds` (3 s) qui suivent sont ignorés.

Après modification : `docker compose -f compose.prod.yml restart telecommande`.

## Installation sur le Pi

1. Brancher la ZiGate et repérer son port :
   - ZiGate USB : `ls -l /dev/serial/by-id/` → en général `/dev/ttyUSB0` ;
   - PiZiGate (GPIO) : `sudo scripts/zigbee/setup-pizigate.sh` puis `sudo reboot`. Le script active l'UART,
     coupe le Bluetooth (il occupe l'UART sur un Pi 3), retire la console série et installe `pizigate.service`
     qui met la ZiGate en mode normal (GPIO 27 haut, impulsion sur GPIO 17) avant Docker.
     Port : `readlink -f /dev/serial0` (en général `/dev/ttyAMA0`).
2. Dans `~/noel2026/.env` : `COMPOSE_PROFILES=zigbee` et `ZIGBEE_SERIAL_PORT=<port>`.
3. `scripts/deploy-pi.sh --no-build` (crée `zigbee/data/configuration.yaml` au premier lancement).
4. Vérifier : `docker compose -f compose.prod.yml logs -f zigbee2mqtt` doit afficher
   `Zigbee2MQTT started`.

## Appairage de la télécommande

1. Ouvrir `http://noel2026.local:8081` → **Permit join (All)**.
2. Appuyer **5 secondes** sur un bouton de la MOES jusqu'au clignotement rapide de la LED.
3. L'appareil apparaît (`TS004F_1`, « Moes Wireless switch with 4 buttons ») : le **renommer `telecommande`** (sinon mettre `device: "*"` dans
   `config/telecommande.yaml`), puis couper **Permit join**.
4. Tester : `docker compose -f compose.prod.yml logs -f telecommande` affiche chaque appui
   (`appui 1_single -> saisie [1]`) puis `combinaison « … » -> action N`.

Les appareils appairés et la clé réseau sont dans `zigbee/data/` (non versionné) : **ne pas supprimer ce dossier**,
sinon il faut tout réappairer.

## Limites connues

- Le `TS004F` a deux modes (`operation_mode`) : il doit rester en **`event`** (actions `1_single`, `2_double`…).
  En mode `command`, il envoie des ordres on/off/variation que le pont ignore : le remettre en `event`
  dans l'onglet *Exposes* de l'appareil sur http://noel2026.local:8081.
- Une télécommande encore appairée à une autre passerelle (SilverCrest/Lidl Home) n'apparaît pas :
  la supprimer de l'autre application et débrancher cette passerelle pendant l'appairage.
- Si la ZiGate a déjà servi ailleurs, son ancien réseau peut bloquer les nouveaux appareils : l'effacer
  (commande ZiGate 0x0012 « Erase Persistent Data », Zigbee2MQTT arrêté) puis redémarrer Zigbee2MQTT.

- La prise en charge ZiGate dans Zigbee2MQTT est marquée « non maintenue » : en cas de souci d'appairage,
  mettre à jour le firmware ZiGate (3.21 ou plus).
- La télécommande est sur pile et s'endort : le premier appui peut arriver avec un léger retard.
- `zigbee2mqtt` prend environ 100 à 150 Mo de RAM sur le Pi 3 B (1 Go).
