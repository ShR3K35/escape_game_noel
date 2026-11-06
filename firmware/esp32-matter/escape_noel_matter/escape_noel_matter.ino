// Escape de Noël — boîtier Matter ESP32 DevKit V1 : 10 boutons virtuels + 5 lampes RGB virtuelles.
// Aucun câblage : tout se passe dans l'application domotique (Smart Life, Google Home...).
//
// Endpoints Matter (dans cet ordre, l'application les nomme dans l'ordre de création) :
//   1-10  « Action 1..10 »  prise On/Off momentanée : l'allumer depuis l'application appelle
//                           POST {SERVER_BASE_URL}/api/devices/actions/N puis elle se rééteint.
//   11-15 « Lampe 1..5 »    lampe couleur virtuelle (on/off + couleur), sans LED physique :
//                           son état est seulement mémorisé par Matter et affiché sur le port série.
//
// Carte « ESP32 Dev Module », Partition Scheme « Huge APP (3MB No OTA/1MB SPIFFS) ».
// Voir firmware/esp32-matter/README.md.

#include <Matter.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <esp_random.h>

#if __has_include("config.h")
#include "config.h"
#else
#error "Copier config.example.h en config.h et l'adapter"
#endif

#ifndef ACTION_COUNT
#define ACTION_COUNT 10
#endif
// RAM de l'ESP32 classique : ~2,6 Ko par action, ~11,5 Ko par lampe couleur. 10 + 10 plante au démarrage ;
// 10 + 5 laisse ~66 Ko libres, la marge nécessaire à l'appairage. Modifiable dans config.h.
#ifndef LAMP_COUNT
#define LAMP_COUNT 5
#endif
constexpr uint8_t COUNT = ACTION_COUNT;
constexpr uint8_t RESET_BUTTON_PIN = 0;  // bouton BOOT de la carte
constexpr uint8_t STATUS_LED_PIN = 2;    // LED bleue de la carte
constexpr uint8_t HTTP_ATTEMPTS = 3;

MatterOnOffPlugin actions[COUNT];
MatterColorLight lamps[LAMP_COUNT > 0 ? LAMP_COUNT : 1];

// --- File d'attente des actions -------------------------------------------------
// Les callbacks Matter tournent dans la tâche Matter : on n'y fait aucun appel réseau,
// on dépose le numéro dans une file traitée par loop().
QueueHandle_t actionQueue;
volatile uint32_t autoOffAt[COUNT];

void queueAction(uint8_t i) {
  autoOffAt[i] = millis() + ACTION_AUTO_OFF_MS;
  if (xQueueSend(actionQueue, &i, 0) != pdTRUE) {
    Serial.printf("[action %u] file pleine, appui ignoré\n", i + 1);
  }
}

// --- Lampes virtuelles ---------------------------------------------------------------
bool onLampChange(uint8_t i, bool on, espHsvColor_t hsv) {
  espRgbColor_t rgb = espHsvColorToRgbColor(hsv);
  Serial.printf("[lampe %u] %s rgb(%u, %u, %u)\n", i + 1, on ? "allumée" : "éteinte", rgb.r, rgb.g, rgb.b);
  return true;  // accepte toujours le nouvel état
}

// --- Appel du serveur --------------------------------------------------------------
String newIdempotencyKey(uint8_t index) {
  char key[40];
  snprintf(key, sizeof key, "%s-%u-%08lx%08lx", DEVICE_NAME, index + 1, (unsigned long)esp_random(),
           (unsigned long)esp_random());
  return String(key);
}

// Renvoie le code HTTP (négatif = erreur réseau).
int postAction(uint8_t index, const String &key) {
  HTTPClient http;
  String url = String(SERVER_BASE_URL) + "/api/devices/actions/" + String(index + 1);
  if (!http.begin(url)) return -1;
  http.setTimeout(3000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", DEVICE_TOKEN);
  http.addHeader("Idempotency-Key", key);
  int code = http.POST(String("{\"source\":\"matter\",\"device\":\"") + DEVICE_NAME + "\"}");
  if (code > 0) {
    Serial.printf("[action %u] HTTP %d %s\n", index + 1, code, http.getString().c_str());
  } else {
    Serial.printf("[action %u] erreur réseau : %s\n", index + 1, http.errorToString(code).c_str());
  }
  http.end();
  return code;
}

void sendAction(uint8_t index) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("[action %u] Wi-Fi non connecté, appui perdu\n", index + 1);
    return;
  }
  // Même clé à chaque tentative : le serveur n'exécute l'action qu'une seule fois.
  String key = newIdempotencyKey(index);
  for (uint8_t attempt = 1; attempt <= HTTP_ATTEMPTS; attempt++) {
    int code = postAction(index, key);
    if (code > 0 && code < 500) return;  // succès ou refus définitif (jeton, numéro...)
    delay(250 * attempt);
  }
}

// --- Boucle ------------------------------------------------------------------------
void releaseActions() {
  uint32_t now = millis();
  for (uint8_t i = 0; i < COUNT; i++) {
    if (autoOffAt[i] != 0 && (int32_t)(now - autoOffAt[i]) >= 0) {
      autoOffAt[i] = 0;
      if (actions[i].getOnOff()) actions[i].setOnOff(false);
    }
  }
}

void handleFactoryReset() {
  static uint32_t pressedAt = 0;
  if (digitalRead(RESET_BUTTON_PIN) == LOW) {
    if (pressedAt == 0) pressedAt = millis();
    if (millis() - pressedAt >= FACTORY_RESET_HOLD_MS) {
      Serial.println("Effacement de l'appairage Matter...");
      Matter.decommission();  // redémarre en mode appairage
      pressedAt = 0;
    }
  } else {
    pressedAt = 0;
  }
}

void updateStatusLed() {
  // Clignote : en attente d'appairage ; fixe : appairé et connecté ; éteinte : appairé hors ligne.
  bool on;
  if (!Matter.isDeviceCommissioned()) on = (millis() / 500) % 2;
  else on = Matter.isDeviceConnected();
  digitalWrite(STATUS_LED_PIN, on);
}

void printPairingInfo() {
  Serial.println();
  Serial.println("Boîtier non appairé. Dans l'application : ajouter un appareil Matter.");
  Serial.printf("Code manuel : %s\n", Matter.getManualPairingCode().c_str());
  Serial.printf("QR code     : %s\n", Matter.getOnboardingQRCodeUrl().c_str());
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\nEscape de Noël — boîtier Matter virtuel");

  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);
  actionQueue = xQueueCreate(16, sizeof(uint8_t));

#if !CONFIG_ENABLE_CHIPOBLE
  // Sans BLE, le Wi-Fi doit être connu à l'avance.
  WiFi.enableIPv6(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
#endif

  for (uint8_t i = 0; i < COUNT; i++) {
    actions[i].begin(false);
    actions[i].onChange([i](bool on) {
      if (on) queueAction(i);
      return true;
    });
  }
  for (uint8_t i = 0; i < LAMP_COUNT; i++) {
    lamps[i].begin(false, {0, 254, 254});
    lamps[i].onChange([i](bool on, espHsvColor_t hsv) { return onLampChange(i, on, hsv); });
  }

  Serial.printf("Endpoints : %u actions + %u lampes, RAM libre avant Matter : %u o\n", ACTION_COUNT, LAMP_COUNT,
                ESP.getFreeHeap());
  Matter.begin();
  Serial.printf("RAM libre après Matter : %u o (bloc max %u o)\n", ESP.getFreeHeap(), ESP.getMaxAllocHeap());
  if (!Matter.isDeviceCommissioned()) printPairingInfo();
}

void loop() {
  static bool wasCommissioned = false;
  bool commissioned = Matter.isDeviceCommissioned();
  if (commissioned && !wasCommissioned) {
    Serial.printf("Appairé. IP : %s — serveur : %s\n", WiFi.localIP().toString().c_str(), SERVER_BASE_URL);
  }
  wasCommissioned = commissioned;

  releaseActions();
  handleFactoryReset();
  updateStatusLed();

  uint8_t index;
  if (xQueueReceive(actionQueue, &index, 0) == pdTRUE) sendAction(index);

  delay(5);
}
