# Installation sur Raspberry Pi 4 / 5

Cible : Raspberry Pi OS **64 bits** avec bureau (Bookworm ou plus récent), TV branchée en HDMI.

## 1. Préparer la carte SD

Avec Raspberry Pi Imager : Raspberry Pi OS (64-bit), nom d'hôte `noel2026`, utilisateur, Wi-Fi (ou Ethernet,
plus fiable le soir de la fête), SSH activé.

## 2. Installer (Internet requis pour cette étape uniquement)

```bash
sudo apt-get update && sudo apt-get install -y git
git clone <url-du-dépôt> ~/noel2026      # ou copier le dossier par clé USB / scp
cd ~/noel2026
./scripts/deploy-pi.sh --kiosk
```

Le script (relançable sans risque) :

1. installe Docker Engine + Compose si absents et active le service au démarrage ;
2. règle le nom d'hôte `noel2026` et installe/active **Avahi** (mDNS) ;
3. crée `.env` : demande le mot de passe du MJ et n'enregistre que son **hash** ;
4. construit l'image ARM64 et démarre `compose.prod.yml` (`restart: unless-stopped`, healthcheck, logs limités) ;
5. avec `--kiosk` : installe Chromium et la police emoji, lance `/tv` en plein écran à l'ouverture de session,
   active la connexion automatique et désactive la mise en veille de l'écran ;
6. affiche les adresses d'accès.

Redémarrez (`sudo reboot`) : la TV doit afficher le bureau du Père Noël toute seule.

## 3. Déposer les vidéos

```bash
scp *.mp4 pi@noel2026.local:~/noel2026/media/videos/
docker compose -f compose.prod.yml exec app python -m app.cli check-config
```

Format recommandé : MP4 H.264 (profil High, 1080p max) + AAC, `-movflags +faststart`. Le Pi 4/5 décode le
H.264 matériellement dans Chromium ; évitez le HEVC/H.265.

## Accès réseau

| Méthode | Adresse | Remarque |
|---|---|---|
| mDNS (Avahi) | `http://noel2026.local/admin` | iPhone, Mac, Windows 10/11, Linux, la plupart des Android récents |
| IP de secours | `http://192.168.x.y/admin` | `./scripts/show-ip.sh` l'affiche |
| DNS local | `http://noel2026.home.arpa/admin` | si la box le permet (voir ci-dessous) |

N'utilisez pas `.localhost` : ce nom désigne toujours la machine elle-même, jamais le Pi.

### Adresse fixe et nom `noel2026.home.arpa`

1. Dans l'interface de la box, créez une **réservation DHCP** (bail statique) pour l'adresse MAC du Pi
   (`ip link show eth0` ou `wlan0`) : son IP ne changera plus.
2. Si la box (ou un Pi-hole / AdGuard / dnsmasq) gère un DNS local, ajoutez l'entrée
   `noel2026.home.arpa → <IP réservée>`. `home.arpa` est le domaine réservé aux réseaux domestiques (RFC 8375).
3. Notez l'IP sur une étiquette : c'est la solution de secours si mDNS ne fonctionne pas sur un téléphone.

### Hors ligne

Après l'installation, plus aucun accès Internet n'est nécessaire : polices et code sont embarqués dans l'image,
aucune ressource externe n'est chargée. Seul le réseau local (Wi-Fi de la maison) est utilisé.
Ne créez **aucune** redirection de port vers le Pi sur la box.

## Son et lecture automatique (autoplay)

- Les navigateurs bloquent la lecture d'une vidéo **avec son** sans interaction de l'utilisateur. Le kiosk lance
  Chromium avec `--autoplay-policy=no-user-gesture-required`, ce qui lève cette restriction.
- Dans un navigateur normal (tests sur PC), si le son est bloqué, la vidéo démarre en muet et un bouton
  « 🔊 Activer le son » apparaît sur la TV : un clic suffit.
- Sortie audio HDMI : `sudo raspi-config` → *System Options* → *Audio* → HDMI, ou clic droit sur l'icône
  volume du bureau. Réglez le volume du Pi à 100 % et ajustez avec la télécommande de la TV.
- Si la TV n'affiche rien au démarrage : vérifiez l'entrée HDMI, puis `~/.local/bin/noel-kiosk.sh` à la main.

## Raspberry Pi 3 (1 Go de RAM)

Le jeu tourne sur un Pi 3 B, avec quelques adaptations :

- **Construire l'image sur un PC**, pas sur le Pi (la compilation npm + pip sature 1 Go de RAM) :

  ```bash
  # sur le PC (Docker avec buildx/QEMU)
  docker buildx build --platform linux/arm64 --target runtime -t noel2026:arm64 --load .
  docker save noel2026:arm64 | gzip -1 | ssh pi@noel2026.local 'gunzip | docker load && docker tag noel2026:arm64 noel2026:latest'
  # sur le Pi
  KIOSK_MODE=1280x720 ./scripts/deploy-pi.sh --kiosk --no-build
  ```

- **Affichage en 720p** : `KIOSK_MODE=1280x720` force la résolution HDMI à l'ouverture de session (2,25× moins de
  pixels à composer qu'en 1080p).
- **Vidéos allégées** : Chromium décode la vidéo en logiciel sur le Pi 3. Réencoder en 720p, H.264 Main, 2 Mbit/s max :

  ```bash
  ./scripts/encode-pi.sh media/videos-pi3 media/videos/*.mp4   # les originaux ne sont pas modifiés
  ```

- **Mémoire** : arrêter tout autre service lourd (Nextcloud, etc.) et `sudo systemctl mask --now packagekit`.
- **Alimentation** : bloc officiel 5,1 V / 2,5 A. `vcgencmd get_throttled` doit afficher `0x0` ; sinon le processeur
  est bridé à 600 MHz et les vidéos saccadent.

### Écran en 1024×768 avec bandes noires et sans son

Le Pi n'a pas pu lire l'identité (EDID) de l'écran : écran éteint ou sur une autre entrée au démarrage, câble ou
adaptateur douteux, ou EDID d'usine défectueux (`dmesg | grep -i edid` → « checksum is invalid »). Sans EDID, le Pi
choisit un mode 4:3 de secours et n'envoie pas le son sur le HDMI.

1. Allumer l'écran sur la bonne entrée **avant** le Pi, ou débrancher/rebrancher le câble HDMI.
2. Si l'EDID est défectueux, le lire sur le bus DDC (`/dev/i2c-2` sur Pi 3), corriger l'octet 127 du bloc 0 (somme
   des 128 octets ≡ 0 mod 256), l'installer dans `/lib/firmware/edid/<écran>.bin`, l'inclure dans l'initramfs
   (hook dans `/etc/initramfs-tools/hooks/` puis `sudo update-initramfs -u`) et ajouter à `/boot/firmware/cmdline.txt` :
   `drm.edid_firmware=HDMI-A-1:edid/<écran>.bin`. À retirer si l'écran change.
3. Vérifier la sortie son : `wpctl status` → le sink « HDMI » doit porter l'astérisque (`wpctl set-default <id>`).

### Accès depuis un téléphone Android

Si Chrome affiche `ERR_TOO_MANY_RETRIES` alors que le PC accède au Pi, utilisez **Firefox** (ou désactivez « Toujours
utiliser des connexions sécurisées » et tout VPN / bloqueur de pubs) et tapez l'IP : `http://192.168.x.y/admin`.

## Mise à jour

```bash
cd ~/noel2026
./scripts/deploy-pi.sh --update                 # git pull + reconstruction
# ou équivalent manuel :
docker compose -f compose.prod.yml up -d --build
```

Les données (`data/`), vidéos (`media/`) et la configuration (`config/`) sont des volumes : elles sont conservées.

## Sauvegarde et restauration

```bash
./scripts/backup.sh                    # -> backups/noel2026-AAAAMMJJ-HHMMSS.tar.gz (base + config + .env)
```

Restauration :

```bash
docker compose -f compose.prod.yml down
mkdir /tmp/r && tar -xzf backups/noel2026-....tar.gz -C /tmp/r
cp /tmp/r/noel2026.db data/noel2026.db && rm -f data/noel2026.db-wal data/noel2026.db-shm
docker compose -f compose.prod.yml up -d
```

## Supervision

```bash
docker compose -f compose.prod.yml ps          # état + healthcheck
docker compose -f compose.prod.yml logs -f app # logs JSON
curl http://localhost/api/health
```
