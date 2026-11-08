"""Génère un PDF A4 de cartes « Mission secrète » à partir d'une liste de missions.

Chaque carte : format carte à jouer 63 × 88 mm. Le dos et la face sont reliés par le bord long avec un espace
de 1 mm (dos | 1 mm | face = 127 × 88 mm), à découper d'un seul tenant puis plier au milieu de l'espace.
3 paires par page A4, autant de pages que nécessaire.

Niveaux : facile (★, 1 pt), moyen (★★, 2 pts), difficile (★★★, 3 pts).

Entrée : fichier .yaml/.yml/.json, ou .txt avec une mission par ligne « niveau : texte ».
    missions:
      - niveau: facile
        texte: "Fais dire à ta cible « Ça dépend »."

    uv run --with reportlab --with pillow --with pyyaml python .claude/skills/cartes-mission/generer.py \\
        missions.yaml -o assets/cartes-mission.pdf
    ... generer.py --mission "facile: Fais citer un film à ta cible." --mission "difficile: ..." -o out.pdf
"""

import argparse
import io
import json
import math
import re
import sys
import unicodedata
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import registerFont, stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

RES = Path(__file__).resolve().parent / "ressources"

CARD_W, CARD_H = 63 * mm, 88 * mm
GAP = 1 * mm            # espace entre le dos et la face (ligne de pliage au milieu)
ROW_GAP = 6 * mm        # espace entre deux paires sur la page
PAIRS_PER_PAGE = 3

# niveau -> (badge de difficulté, étiquette de points)
LEVELS = {
    "facile": ("badge-facile.png", "points-1.png"),
    "moyen": ("badge-moyen.png", "points-2.png"),
    "difficile": ("badge-difficile.png", "points-3.png"),
}
ALIASES = {"1": "facile", "2": "moyen", "3": "difficile", "easy": "facile", "medium": "moyen", "hard": "difficile",
           "moyenne": "moyen"}
INK = HexColor("#1f2a1c")
MIN_TEXT_SIZE = 8.0
MAX_TEXT_SIZE = 14.0


# --- Lecture des missions --------------------------------------------------------------------------
def normalize_level(raw: object) -> str:
    key = unicodedata.normalize("NFKD", str(raw).strip().lower())
    key = "".join(ch for ch in key if not unicodedata.combining(ch)).replace("★", "")
    key = ALIASES.get(key, key)
    if key not in LEVELS:
        raise ValueError(f"niveau inconnu : {raw!r} (facile, moyen ou difficile)")
    return key


def parse_line(line: str) -> tuple[str, str]:
    for sep in (":", "|", ";", "\t"):
        if sep in line:
            level, text = line.split(sep, 1)
            return normalize_level(level), text.strip()
    raise ValueError(f"ligne sans niveau : {line!r} (format « niveau : texte »)")


def load_missions(path: Path | None, inline: list[str]) -> list[tuple[str, str]]:
    missions: list[tuple[str, str]] = []
    if path:
        raw = path.read_text(encoding="utf-8")
        if path.suffix.lower() in (".yaml", ".yml", ".json"):
            if path.suffix.lower() == ".json":
                data = json.loads(raw)
            else:
                import yaml
                data = yaml.safe_load(raw)
            items = data.get("missions", data) if isinstance(data, dict) else data
            for item in items:
                if isinstance(item, str):
                    missions.append(parse_line(item))
                else:
                    level = item.get("niveau", item.get("difficulte", item.get("difficulté")))
                    missions.append((normalize_level(level), str(item["texte"]).strip()))
        else:
            for line in raw.splitlines():
                if line.strip() and not line.lstrip().startswith("#"):
                    missions.append(parse_line(line))
    missions += [parse_line(m) for m in inline]
    if not missions:
        raise ValueError("aucune mission")
    for _, text in missions:
        if not text:
            raise ValueError("mission sans texte")
    return missions


# --- Dessin ----------------------------------------------------------------------------------------
def card_image(name: str) -> ImageReader:
    """Image 2:3 sans sa fine marge haute/basse ; étirée en 63 × 88 mm au dessin."""
    img = Image.open(RES / name).convert("RGB")
    w, h = img.size
    trim = round(h * 0.012)
    buf = io.BytesIO()
    img.crop((0, trim, w, h - trim)).save(buf, "JPEG", quality=93)
    buf.seek(0)
    return ImageReader(buf)


_stickers: dict[str, ImageReader] = {}


def sticker(c: Canvas, name: str, x: float, cy: float, max_h: float, max_w: float, align: str) -> None:
    """PNG transparent centré verticalement sur cy, calé à gauche ou à droite de x."""
    if name not in _stickers:
        buf = io.BytesIO()
        Image.open(RES / name).convert("RGBA").save(buf, "PNG")
        buf.seek(0)
        _stickers[name] = ImageReader(buf)
    reader = _stickers[name]
    w, h = reader.getSize()
    scale = min(max_h / h, max_w / w)
    dw, dh = w * scale, h * scale
    c.drawImage(reader, x if align == "left" else x - dw, cy - dh / 2, dw, dh, mask="auto")


def star(c: Canvas, cx: float, cy: float, r: float) -> None:
    p = c.beginPath()
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5
        rr = r if k % 2 == 0 else r * 0.42
        x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
        p.moveTo(x, y) if k == 0 else p.lineTo(x, y)
    p.close()
    c.drawPath(p, stroke=0, fill=1)


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    # Espaces insécables : guillemets collés au mot, petits mots jamais en fin de ligne.
    nbsp = "\u00a0"
    text = " ".join(text.split())
    text = text.replace("« ", "«" + nbsp).replace(" »", nbsp + "»")
    text = re.sub(r" ([?!:;])", nbsp + r"\1", text)
    # Citation courte (3 mots max) gardée sur une seule ligne.
    text = re.sub(r"«[^»]*»", lambda m: m.group(0).replace(" ", nbsp) if m.group(0).count(" ") <= 2 else m.group(0), text)
    for _ in range(2):  # deux passes pour « à ta »
        text = re.sub(r"(^|\s)(à|ta|ton|tes|sa|son|ses) ", r"\1\2" + nbsp, text)
    lines, cur = [], ""
    for word in text.split(" "):
        test = f"{cur} {word}".strip()
        if stringWidth(test, font, size) <= width or not cur:
            cur = test
        else:
            lines.append(cur)
            cur = word
    lines.append(cur)
    return lines


def draw_face(c: Canvas, x: float, y: float, level: str, text: str) -> bool:
    """Badge, points, texte et filet étoilé. Renvoie False si le texte déborde même en petite taille."""
    badge, points = LEVELS[level]
    row = y + CARD_H - 29.5 * mm
    sticker(c, badge, x + 6.5 * mm, row, 7.6 * mm, 31 * mm, "left")
    sticker(c, points, x + CARD_W - 6.5 * mm, row, 10 * mm, 18 * mm, "right")

    box_w, box_top, box_bottom = 48 * mm, row - 8.5 * mm, y + 30 * mm
    size = MAX_TEXT_SIZE
    while True:
        lines = wrap(text, "MW-XB", size, box_w)
        lead = size * 1.25
        fits = len(lines) * lead <= box_top - box_bottom and all(
            stringWidth(line, "MW-XB", size) <= box_w for line in lines)
        if fits or size <= MIN_TEXT_SIZE:
            break
        size -= 0.5
    block = len(lines) * lead
    ty = box_bottom + (box_top - box_bottom + block) / 2 - size * 0.95
    c.setFillColor(INK)
    c.setFont("MW-XB", size)
    for line in lines:
        c.drawCentredString(x + CARD_W / 2, ty, line)
        ty -= lead

    ly, cx = y + 27 * mm, x + CARD_W / 2
    c.setStrokeColor(INK)
    c.setLineWidth(0.7)
    c.line(cx - 15 * mm, ly, cx - 2.6 * mm, ly)
    c.line(cx + 2.6 * mm, ly, cx + 15 * mm, ly)
    c.setFillColor(INK)
    star(c, cx, ly - 0.1 * mm, 1.5 * mm)
    return fits


def marks(c: Canvas, x: float, y: float) -> None:
    """Traits de coupe aux coins de la paire et repères de pliage au milieu de l'espace de 1 mm."""
    w, h, off, ln = 2 * CARD_W + GAP, CARD_H, 1.5 * mm, 4 * mm
    c.setStrokeColor(HexColor("#555555"))
    c.setLineWidth(0.3)
    c.setDash()
    for cx in (x, x + w):
        for cy in (y, y + h):
            dx = -1 if cx == x else 1
            dy = -1 if cy == y else 1
            c.line(cx + dx * off, cy, cx + dx * (off + ln), cy)
            c.line(cx, cy + dy * off, cx, cy + dy * (off + ln))
    fx = x + CARD_W + GAP / 2
    c.setDash(1.2, 1.2)
    c.line(fx, y - off, fx, y - off - ln)
    c.line(fx, y + h + off, fx, y + h + off + ln)
    c.setDash()


def build(missions: list[tuple[str, str]], out: Path) -> list[int]:
    """Écrit le PDF ; renvoie les numéros (1..n) des missions dont le texte déborde."""
    registerFont(TTFont("MW-XB", str(RES / "polices/Merriweather-ExtraBold.ttf")))
    registerFont(TTFont("MW-B", str(RES / "polices/Merriweather-Bold.ttf")))
    back, face = card_image("dos.jpg"), card_image("face-fond.jpg")
    page_w, page_h = A4
    pair_w = 2 * CARD_W + GAP
    x = (page_w - pair_w) / 2
    top = (page_h + PAIRS_PER_PAGE * CARD_H + (PAIRS_PER_PAGE - 1) * ROW_GAP) / 2
    out.parent.mkdir(parents=True, exist_ok=True)
    c = Canvas(str(out), pagesize=A4)
    c.setTitle("Cartes Mission secrète")
    overflow = []
    for i, (level, text) in enumerate(missions):
        slot = i % PAIRS_PER_PAGE
        if i and slot == 0:
            c.showPage()
        y = top - (slot + 1) * CARD_H - slot * ROW_GAP
        c.drawImage(back, x, y, CARD_W, CARD_H)
        fx = x + CARD_W + GAP
        c.drawImage(face, fx, y, CARD_W, CARD_H)
        if not draw_face(c, fx, y, level, text):
            overflow.append(i + 1)
        marks(c, x, y)
        if slot == PAIRS_PER_PAGE - 1 or i == len(missions) - 1:
            c.setFont("MW-B", 6.5)
            c.setFillColor(HexColor("#777777"))
            c.drawCentredString(page_w / 2, 5 * mm, "Imprimer à 100 % (taille réelle). Découper chaque paire, "
                                                    "plier sur les pointillés, coller.")
    c.save()
    return overflow


def main() -> int:
    ap = argparse.ArgumentParser(description="PDF de cartes « Mission secrète » (63 × 88 mm, dos | 1 mm | face).")
    ap.add_argument("fichier", nargs="?", type=Path, help="missions .yaml/.json/.txt")
    ap.add_argument("--mission", action="append", default=[], help="« niveau: texte », répétable")
    ap.add_argument("-o", "--out", type=Path, default=Path("assets/cartes-mission.pdf"))
    args = ap.parse_args()
    try:
        missions = load_missions(args.fichier, args.mission)
    except (ValueError, KeyError, OSError) as exc:
        print(f"Erreur : {exc}", file=sys.stderr)
        return 2
    overflow = build(missions, args.out)
    pages = math.ceil(len(missions) / PAIRS_PER_PAGE)
    counts = {lvl: sum(1 for m in missions if m[0] == lvl) for lvl in LEVELS}
    print(f"{args.out.resolve()}  ({len(missions)} cartes, {pages} page(s) ; "
          + ", ".join(f"{n} {lvl}" for lvl, n in counts.items() if n) + ")")
    if overflow:
        print(f"Attention : texte trop long, il déborde sur la ou les carte(s) {overflow} ; le raccourcir.",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
