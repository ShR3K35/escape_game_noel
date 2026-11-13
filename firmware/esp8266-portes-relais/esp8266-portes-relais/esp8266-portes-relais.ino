// Escape de Noël — ESP8266 autonome : 3 capteurs de porte magnétiques + 1 relais.
// Fermer les portes dans l'ordre DOOR_SEQUENCE colle le relais pendant RELAY_PULSE_MS.
// L'admin peut aussi forcer le relais : le serveur appelle POST http://<ip>/relay/pulse
// (en-tête X-Device-Token = DEVICE_TOKEN). Sans Wi-Fi, les portes et le relais fonctionnent quand même.
//
// Réglages réseau dans config.h (copier config.example.h, jamais commité).
//
// Câblage (NodeMCU / Wemos D1 mini) :
//   Capteur 1 : COM → GND, NO → D5 (GPIO14)
//   Capteur 2 : COM → GND, NO → D6 (GPIO12)
//   Capteur 3 : COM → GND, NO → D7 (GPIO13)
//   Module relais JQC3F-05VDC-C : VCC → VIN/5V, GND → GND, IN → D1 (GPIO5)
// Éviter D3, D4, D8 (broches de démarrage) et D0 (pas de pull-up interne).
//
// Carte « NodeMCU 1.0 (ESP-12E Module) » ou « LOLIN(WEMOS) D1 mini ». Moniteur série 115200 bauds.

#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>

#if __has_include("config.h")
#include "config.h"
#else
#error "Copier config.example.h en config.h et l'adapter"
#endif

// --- Réglages ----------------------------------------------------------------------------
const uint8_t DOOR_PINS[] = {14, 12, 13};  // D5, D6, D7
const uint8_t DOOR_SEQUENCE[] = {1, 2, 3};  // ordre de fermeture attendu (numéros de capteur)
const uint32_t DOOR_SEQUENCE_TIMEOUT_MS = 0;  // délai max entre deux fermetures, 0 = illimité
const bool DOOR_CLOSED_IS_LOW = true;       // true si câblé sur NO, false si câblé sur NC
const uint32_t DOOR_DEBOUNCE_MS = 50;

const uint8_t RELAY_PIN = 5;                // D1
const bool RELAY_ACTIVE_LOW = true;         // la plupart des modules collent quand IN est à LOW
const uint32_t RELAY_PULSE_MS = 5000;
// -----------------------------------------------------------------------------------------

constexpr uint8_t DOOR_COUNT = sizeof(DOOR_PINS);
constexpr uint8_t SEQ_LEN = sizeof(DOOR_SEQUENCE);

bool doorClosed[DOOR_COUNT];   // état stable (anti-rebond appliqué)
bool doorRaw[DOOR_COUNT];      // dernière lecture brute
uint32_t doorRawSince[DOOR_COUNT];
uint8_t seqProgress = 0;       // nombre de fermetures correctes enchaînées
uint32_t seqLastStepAt = 0;

bool relayOn = false;
uint32_t relayOnSince = 0;

// --- Relais ------------------------------------------------------------------------------
void writeRelay(bool on) { digitalWrite(RELAY_PIN, on != RELAY_ACTIVE_LOW ? HIGH : LOW); }

void setupRelay() {
  writeRelay(false);  // niveau de repos fixé avant de passer en sortie : pas de clic au démarrage
  pinMode(RELAY_PIN, OUTPUT);
  writeRelay(false);
}

void pulseRelay() {
  writeRelay(true);
  relayOn = true;
  relayOnSince = millis();  // une nouvelle réussite pendant l'impulsion la prolonge
  Serial.printf("[relais] collé pour %lu ms\n", (unsigned long)RELAY_PULSE_MS);
}

void releaseRelay() {
  if (relayOn && millis() - relayOnSince >= RELAY_PULSE_MS) {
    relayOn = false;
    writeRelay(false);
    Serial.println("[relais] relâché");
  }
}

// --- Capteurs de porte -------------------------------------------------------------------
// --- Wi-Fi et commande HTTP --------------------------------------------------------------
ESP8266WebServer server(80);

bool tokenOk() {
  if (strlen(DEVICE_TOKEN) == 0) return true;  // jeton vide : pas de contrôle (essais uniquement)
  String got = server.header("X-Device-Token");
  const char *want = DEVICE_TOKEN;
  if (got.length() != strlen(want)) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < got.length(); i++) diff |= got[i] ^ want[i];
  return diff == 0;
}

void handlePulse() {
  if (!tokenOk()) {
    server.send(401, "application/json", "{\"detail\":\"jeton invalide\"}");
    Serial.println("[http] jeton invalide");
    return;
  }
  Serial.println("[http] relais forcé depuis l'admin");
  pulseRelay();
  server.send(200, "application/json", String("{\"relay\":\"on\",\"pulse_ms\":") + RELAY_PULSE_MS + "}");
}

bool readDoorClosed(uint8_t d) {
  bool low = digitalRead(DOOR_PINS[d]) == LOW;
  return DOOR_CLOSED_IS_LOW ? low : !low;
}

void resetSequence(const char *why) {
  if (seqProgress > 0) Serial.printf("[portes] séquence remise à zéro (%s)\n", why);
  seqProgress = 0;
}

void onDoorChange(uint8_t d, bool closed) {
  uint8_t sensor = d + 1;
  Serial.printf("[porte %u] %s\n", sensor, closed ? "fermée" : "ouverte");
  if (!closed) {
    // Rouvrir une porte déjà comptée annule la séquence : il faut finir avec les portes fermées.
    for (uint8_t k = 0; k < seqProgress; k++) {
      if (DOOR_SEQUENCE[k] == sensor) { resetSequence("porte rouverte"); break; }
    }
    return;
  }
  if (DOOR_SEQUENCE_TIMEOUT_MS > 0 && seqProgress > 0 && millis() - seqLastStepAt > DOOR_SEQUENCE_TIMEOUT_MS) {
    resetSequence("trop lent");
  }
  if (sensor == DOOR_SEQUENCE[seqProgress]) {
    seqProgress++;
  } else {
    resetSequence("mauvais ordre");
    if (sensor == DOOR_SEQUENCE[0]) seqProgress = 1;  // cette fermeture peut commencer une nouvelle séquence
  }
  seqLastStepAt = millis();
  Serial.printf("[portes] séquence %u/%u\n", seqProgress, SEQ_LEN);
  if (seqProgress == SEQ_LEN) {
    Serial.println("[portes] séquence réussie -> relais");
    seqProgress = 0;
    pulseRelay();
  }
}

void handleStatus() {
  if (!tokenOk()) {
    server.send(401, "application/json", "{\"detail\":\"jeton invalide\"}");
    return;
  }
  String json = "{\"relay\":";
  json += relayOn ? "true" : "false";
  json += ",\"sequence\":";
  json += seqProgress;
  json += ",\"doors_closed\":[";
  for (uint8_t d = 0; d < DOOR_COUNT; d++) {
    if (d) json += ",";
    json += doorClosed[d] ? "true" : "false";
  }
  json += "]}";
  server.send(200, "application/json", json);
}

void setupNetwork() {
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.hostname(DEVICE_NAME);
#ifdef STATIC_IP
  IPAddress ip, gw, mask;
  ip.fromString(STATIC_IP);
  gw.fromString(STATIC_GATEWAY);
  mask.fromString(STATIC_SUBNET);
  WiFi.config(ip, gw, mask, gw);
#endif
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);  // non bloquant : les portes marchent pendant la connexion
  server.collectHeaders("X-Device-Token");
  server.on("/relay/pulse", HTTP_POST, handlePulse);
  server.on("/status", HTTP_GET, handleStatus);
  server.onNotFound([] { server.send(404, "application/json", "{\"detail\":\"introuvable\"}"); });
  server.begin();
}

void reportNetwork() {
  static bool wasConnected = false;
  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !wasConnected) {
    Serial.printf("[wifi] connecté, IP %s (RELAY_URL=http://%s)\n", WiFi.localIP().toString().c_str(),
                  WiFi.localIP().toString().c_str());
  } else if (!connected && wasConnected) {
    Serial.println("[wifi] déconnecté, reconnexion automatique");
  }
  wasConnected = connected;
}

void setupDoors() {
  for (uint8_t d = 0; d < DOOR_COUNT; d++) pinMode(DOOR_PINS[d], INPUT_PULLUP);
  delay(20);
  for (uint8_t d = 0; d < DOOR_COUNT; d++) {
    doorClosed[d] = doorRaw[d] = readDoorClosed(d);  // état initial : aucun événement
    doorRawSince[d] = millis();
    Serial.printf("[porte %u] GPIO %u, %s\n", d + 1, DOOR_PINS[d], doorClosed[d] ? "fermée" : "ouverte");
  }
}

void pollDoors() {
  uint32_t now = millis();
  for (uint8_t d = 0; d < DOOR_COUNT; d++) {
    bool raw = readDoorClosed(d);
    if (raw != doorRaw[d]) {
      doorRaw[d] = raw;
      doorRawSince[d] = now;
    } else if (raw != doorClosed[d] && now - doorRawSince[d] >= DOOR_DEBOUNCE_MS) {
      doorClosed[d] = raw;
      onDoorChange(d, raw);
    }
  }
}

// -----------------------------------------------------------------------------------------
void setup() {
  setupRelay();  // en premier pour que le relais reste au repos
  Serial.begin(115200);
  delay(200);
  Serial.println("\nEscape de Noël — ESP8266 portes + relais");
  setupDoors();
  setupNetwork();
}

void loop() {
  pollDoors();
  releaseRelay();
  server.handleClient();
  reportNetwork();
  delay(5);
}
