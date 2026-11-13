// Copier ce fichier en « config.h » (même dossier, jamais commité) puis l'adapter.
#pragma once

// --- Wi-Fi (2,4 GHz) ---------------------------------------------------------
#define WIFI_SSID ""
#define WIFI_PASSWORD ""

// Nom réseau de la carte.
#define DEVICE_NAME "esp8266-portes"

// Même valeur que DEVICE_TOKEN dans le .env du Raspberry Pi : le serveur l'envoie dans
// l'en-tête X-Device-Token quand l'admin force le relais. Vide = aucun contrôle (essais seulement).
#define DEVICE_TOKEN "a-remplacer"

// IP fixe (facultatif, sinon réserver le bail DHCP sur la box). RELAY_URL=http://<cette IP> dans le .env du Pi.
// #define STATIC_IP "192.168.1.60"
// #define STATIC_GATEWAY "192.168.1.1"
// #define STATIC_SUBNET "255.255.255.0"
