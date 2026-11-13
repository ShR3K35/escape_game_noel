# ESP8266 : 3 capteurs de porte + 1 relais

Une carte ESP8266 (NodeMCU ou Wemos D1 mini) autonome, sans Matter :

- fermer les trois portes **dans le bon ordre** (1 → 2 → 3 par défaut) colle le relais pendant **5 s** ;
- le bouton **« ⚡ Forcer le relais (5 s) »** de l'admin (onglet Partie) fait la même chose à distance.

Les portes et le relais fonctionnent même sans Wi-Fi. Le Wi-Fi ne sert qu'au bouton de l'admin.

```text
 Admin (téléphone) ──POST /api/admin/relay/pulse──▶ Raspberry Pi ──POST /relay/pulse──▶ ESP8266 ──▶ relais 5 s
                                                                   X-Device-Token
```

## Câblage

| Élément | Branchement |
|---|---|
| Capteur 1 | COM → GND, NO → D5 (GPIO14) |
| Capteur 2 | COM → GND, NO → D6 (GPIO12) |
| Capteur 3 | COM → GND, NO → D7 (GPIO13) |
| Module relais JQC3F-05VDC-C | VCC → VIN/5V, GND → GND, IN → D1 (GPIO5) |

L'appareil commandé se branche entre **COM** et **NO** du relais. Ne pas utiliser D3, D4, D8 (broches de démarrage)
ni D0 (pas de pull-up interne). Si le relais reste collé au repos et se relâche pendant l'impulsion, mettre
`RELAY_ACTIVE_LOW = false` en haut du `.ino`. Les autres réglages (ordre, durée, NO/NC) sont au même endroit.

## Configuration

1. Copier `esp8266-portes-relais/config.example.h` en `config.h` (ignoré par git) : Wi-Fi 2,4 GHz,
   `DEVICE_TOKEN` (même valeur que dans le `.env` du Pi) et, en option, une IP fixe.
2. Dans le `.env` du Raspberry Pi : `RELAY_URL=http://<IP de l'ESP8266>`, puis redémarrer l'application.
   L'IP s'affiche sur le port série au démarrage (`[wifi] connecté, IP …`). Réserver le bail DHCP sur la box
   (ou définir `STATIC_IP`) pour qu'elle ne change pas.

Sans `RELAY_URL`, le bouton de l'admin répond « RELAY_URL non configuré ». Si l'ESP8266 ne répond pas, il affiche
« relais injoignable » et l'échec est noté dans le journal.

## Routes HTTP de l'ESP8266

| Route | Effet |
|---|---|
| `POST /relay/pulse` | colle le relais 5 s → `{"relay":"on","pulse_ms":5000}` |
| `GET /status` | état : `{"relay":false,"sequence":0,"doors_closed":[true,false,true]}` |

Les deux exigent l'en-tête `X-Device-Token` (401 sinon).

## Compilation et téléversement

```bash
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 --output-dir /tmp/esp8266-build firmware/esp8266-portes-relais/esp8266-portes-relais
esptool.exe --port COM7 --baud 460800 write-flash 0x0 /tmp/esp8266-build/esp8266-portes-relais.ino.bin
```

Moniteur série à 115200 bauds : `[porte 2] fermée`, `[portes] séquence 2/3`, `[relais] collé pour 5000 ms`,
`[http] relais forcé depuis l'admin`…
