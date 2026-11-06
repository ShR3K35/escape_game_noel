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
// Inutile en temps normal : l'application (Smart Life, Google Home...) transmet le Wi-Fi
// pendant l'appairage Matter en Bluetooth. Ne sert que si le BLE Matter est désactivé.
#define WIFI_SSID ""
#define WIFI_PASSWORD ""

// --- Comportement ------------------------------------------------------------
// Durée pendant laquelle « Action N » reste allumée dans l'application après un appui (ms).
#define ACTION_AUTO_OFF_MS 1000
// Appui long sur le bouton BOOT (GPIO0) pour effacer l'appairage Matter (ms).
#define FACTORY_RESET_HOLD_MS 5000
