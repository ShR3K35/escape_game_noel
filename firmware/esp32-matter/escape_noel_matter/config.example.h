// Copier ce fichier en « config.h » (même dossier, jamais commité) puis l'adapter.
#pragma once

// --- Serveur Escape de Noël (Raspberry Pi) ----------------------------------
// IP fixe conseillée (bail DHCP réservé sur la box) : l'ESP32 ne résout pas les noms « .local ».
#define SERVER_BASE_URL "http://192.168.1.5"
// Même valeur que DEVICE_TOKEN dans le .env du Raspberry Pi.
#define DEVICE_TOKEN "a-remplacer"
// Nom du boîtier dans le journal du serveur.
#define DEVICE_NAME "esp32-escape"

// --- Wi-Fi -------------------------------------------------------------------
// OBLIGATOIRE sur l'ESP32 classique : le core Arduino n'y active pas l'appairage Matter par
// Bluetooth, le boîtier rejoint donc ce Wi-Fi (2,4 GHz) puis s'appaire par le réseau.
#define WIFI_SSID ""
#define WIFI_PASSWORD ""

// --- Comportement ------------------------------------------------------------
// Durée pendant laquelle « Action N » reste allumée dans l'application après un appui (ms).
#define ACTION_AUTO_OFF_MS 1000
// Appui long sur le bouton BOOT (GPIO0) pour effacer l'appairage Matter (ms).
#define FACTORY_RESET_HOLD_MS 5000

// --- Endpoints ---------------------------------------------------------------
// Nombre de prises « Action » et de lampes couleur. Sur l'ESP32 classique, 10 + 5 est le maximum
// raisonnable (une lampe couleur consomme ~11,5 Ko de RAM, 10 + 10 plante au démarrage).
#define ACTION_COUNT 10
#define LAMP_COUNT 5

// --- Capteurs de porte (contacts magnétiques) ---------------------------------
// Chaque capteur : fil COM sur GND, fil NO sur le GPIO (pull-up interne, aucune résistance).
// Capteur 1, 2, 3 = GPIO 32, 33, 25 (éviter 0, 2, 12, 15 et 34-39).
#define DOOR_PINS {32, 33, 25}
// Ordre de fermeture qui réussit l'énigme (numéros de capteur).
#define DOOR_SEQUENCE {1, 2, 3}
// Action déclenchée : 3 = valider la mission de l'équipe Bleue « Les Témoins ».
#define DOOR_SEQUENCE_ACTION 3
// Délai max entre deux fermetures (ms), 0 = illimité.
#define DOOR_SEQUENCE_TIMEOUT_MS 0
// 1 si câblé sur NO (porte fermée = contact fermé = LOW), 0 si câblé sur NC.
#define DOOR_CLOSED_IS_LOW 1
