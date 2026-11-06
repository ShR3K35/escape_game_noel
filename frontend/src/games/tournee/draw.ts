/**
 * Dessin de « La tournée du traîneau » sur un canvas 2D.
 * Les éléments fixes (ciel, collines, attelage, obstacles) sont pré-dessinés dans des canvas hors écran
 * à chaque redimensionnement : chaque image ne fait que les recopier (fluide sur une tablette ancienne).
 */
import attelageUrl from "../../assets/tournee/attelage.webp";
import cadeauUrl from "../../assets/tournee/cadeau.webp";
import clocherUrl from "../../assets/tournee/clocher.webp";
import maisonUrl from "../../assets/tournee/maison.webp";
import montgolfiereUrl from "../../assets/tournee/montgolfiere.webp";
import nuageUrl from "../../assets/tournee/nuage.webp";
import orageUrl from "../../assets/tournee/orage.webp";
import sapinUrl from "../../assets/tournee/sapin.webp";
import {
  GROUND, KINDS, LANE_H, SKY_TOP, SLEIGH_W, SLEIGH_X,
  enoughGifts, laneCenter, livesLeft, progress, type ObstacleKind, type World,
} from "./engine";

type Ctx = CanvasRenderingContext2D;

const C = {
  skyTop: "#0a1433",
  skyBottom: "#33508f",
  snow: "#f4f8ff",
  snowShade: "#c9d8ee",
  red: "#c8102e",
  redDark: "#7a0a1a",
  gold: "#e3b341",
  goldDark: "#9a7420",
  green: "#1f7a3a",
  greenDark: "#12502a",
  brown: "#8b5a2b",
  brownDark: "#5b3716",
  skin: "#f6c9a8",
  window: "#ffd866",
};

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx | null] {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return [cv, cv.getContext("2d")];
}

function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

function circle(c: Ctx, x: number, y: number, r: number, fill: string) {
  ellipse(c, x, y, r, r, fill);
}

function poly(c: Ctx, pts: number[], fill: string, stroke?: string, lw = 0.02) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.lineWidth = lw;
    c.strokeStyle = stroke;
    c.stroke();
  }
}

function heartPath(c: Ctx, x: number, y: number, s: number) {
  c.beginPath();
  c.moveTo(x, y + s * 0.35);
  c.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  c.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  c.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  c.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.35);
}

// ------------------------------------------------------------------ sprites
// Illustrations générées (GPT Image), recadrées et converties en WebP transparent.
const SOURCES = {
  attelage: attelageUrl, maison: maisonUrl, sapin: sapinUrl, clocher: clocherUrl,
  nuage: nuageUrl, orage: orageUrl, montgolfiere: montgolfiereUrl, cadeau: cadeauUrl,
};
type SpriteName = keyof typeof SOURCES;
const images: Partial<Record<SpriteName, HTMLImageElement>> = {};
let loading: Promise<void> | null = null;

/** Charge les illustrations une seule fois (avant le premier vol). */
export function loadSprites(): Promise<void> {
  loading ??= Promise.all(
    (Object.keys(SOURCES) as SpriteName[]).map(
      (name) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            images[name] = img;
            resolve();
          };
          img.onerror = () => resolve(); // image absente : l'objet n'est simplement pas dessiné
          img.src = SOURCES[name];
        }),
    ),
  ).then(() => undefined);
  return loading;
}

/** Copie une illustration à la taille exacte d'affichage (contenue dans w × h, alignée en bas ou au centre). */
function fitted(name: SpriteName, w: number, h: number, align: "bottom" | "center", mirror = false): HTMLCanvasElement | null {
  const img = images[name];
  if (!img) return null;
  const k = Math.min(w / img.width, h / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  const [cv, c] = canvas(w, h);
  if (!c) return null;
  c.imageSmoothingQuality = "high";
  if (mirror) {
    c.translate(w, 0);
    c.scale(-1, 1);
  }
  c.drawImage(img, (w - dw) / 2, align === "bottom" ? h - dh : (h - dh) / 2, dw, dh);
  return cv;
}

/** Part de l'attelage occupée par le traîneau (le reste : les rennes, animés à part). */
const SLEIGH_PART = 0.385;
const GROUNDED: ObstacleKind[] = ["maison", "sapin", "clocher"];

// ------------------------------------------------------------------ décor
function skySprite(W: number, H: number): HTMLCanvasElement {
  const [cv, c] = canvas(W, H);
  if (!c) return cv;
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.skyTop);
  g.addColorStop(1, C.skyBottom);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // étoiles fixes (pseudo-aléatoires mais stables)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) circle(c, rnd() * W, rnd() * H * 0.6, (rnd() * 1.2 + 0.4) * (H / 400), `rgba(255,255,255,${0.3 + rnd() * 0.6})`);
  // lune
  const mx = W * 0.82;
  const my = H * 0.2;
  const mr = H * 0.075;
  const halo = c.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 3);
  halo.addColorStop(0, "rgba(255,248,220,0.35)");
  halo.addColorStop(1, "rgba(255,248,220,0)");
  c.fillStyle = halo;
  c.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
  circle(c, mx, my, mr, "#fff6d8");
  circle(c, mx - mr * 0.3, my - mr * 0.2, mr * 0.16, "#ece0b8");
  circle(c, mx + mr * 0.35, my + mr * 0.3, mr * 0.12, "#ece0b8");
  return cv;
}

/** Bande de collines enneigées raccordable (période = largeur). */
function hillsSprite(W: number, H: number, color: string, amp: number, k: number, trees: string | null): HTMLCanvasElement {
  const h = H * 0.42;
  const [cv, c] = canvas(W, h);
  if (!c) return cv;
  const yAt = (x: number) => h * (0.45 + amp * Math.sin((x / W) * Math.PI * 2 * k) + amp * 0.5 * Math.sin((x / W) * Math.PI * 2 * (k + 2) + 1));
  if (trees) {
    for (let i = 0; i < 9 * k; i++) {
      const x = ((i + 0.3) / (9 * k)) * W;
      const s = H * 0.05 * (0.7 + ((i * 37) % 10) / 15);
      poly(c, [x - s * 0.5, yAt(x) + s * 0.2, x, yAt(x) - s * 1.3, x + s * 0.5, yAt(x) + s * 0.2], trees);
    }
  }
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= W; x += 4) c.lineTo(x, yAt(x));
  c.lineTo(W, h);
  c.closePath();
  c.fillStyle = color;
  c.fill();
  return cv;
}

interface Flake {
  x: number;
  y: number;
  r: number;
  vy: number;
  ph: number;
}

export interface Renderer {
  resize: (cssW: number, cssH: number, dpr: number) => void;
  draw: (w: World | null, now: number, idle: boolean) => void;
}

export function createRenderer(cv: HTMLCanvasElement): Renderer | null {
  const ctx2d = cv.getContext("2d");
  if (!ctx2d) return null;
  const c: Ctx = ctx2d;
  let W = 0;
  let H = 0;
  let L = 0;
  let sky: HTMLCanvasElement | null = null;
  let hillsFar: HTMLCanvasElement | null = null;
  let hillsNear: HTMLCanvasElement | null = null;
  let sleighImg: HTMLCanvasElement | null = null;
  let deerImg: HTMLCanvasElement | null = null;
  let teamW = 0;
  let teamH = 0;
  let gift: HTMLCanvasElement | null = null;
  const sprites = new Map<string, HTMLCanvasElement>();
  const flakes: Flake[] = Array.from({ length: 45 }, (_, i) => ({
    x: (i * 0.618) % 1, y: (i * 0.37) % 1, r: 0.6 + ((i * 7) % 5) * 0.35, vy: 0.04 + ((i * 3) % 7) * 0.012, ph: i,
  }));
  let last = 0;
  let idleDist = 0;

  const sprite = (kind: ObstacleKind, variant: number) => {
    // Maisons et sapins parfois retournés : un peu de variété.
    const mirror = (kind === "maison" || kind === "sapin") && variant === 1;
    const key = `${kind}-${mirror}`;
    let s = sprites.get(key);
    if (s === undefined) {
      const { w, lanes } = KINDS[kind];
      const band = (lanes[1] - lanes[0] + 1) * L;
      const sky = !GROUNDED.includes(kind);
      s = fitted(kind, w * L, sky ? band * 0.9 : band, sky ? "center" : "bottom", mirror) ?? undefined;
      if (s) sprites.set(key, s);
    }
    return s;
  };

  /** Découpe l'attelage en deux : le traîneau et les rennes, qui galopent avec un léger décalage. */
  const buildTeam = () => {
    const img = images.attelage;
    if (!img) return;
    teamW = SLEIGH_W * L * 1.2; // un peu plus grand que la zone de choc : plus lisible et plus indulgent
    teamH = (teamW * img.height) / img.width;
    const cut = Math.round(img.width * SLEIGH_PART);
    const part = (sx: number, sw: number) => {
      const [cv, c] = canvas((teamW * sw) / img.width, teamH);
      if (!c) return null;
      c.imageSmoothingQuality = "high";
      c.drawImage(img, sx, 0, sw, img.height, 0, 0, cv.width, cv.height);
      return cv;
    };
    sleighImg = part(0, cut);
    deerImg = part(cut, img.width - cut);
  };

  const resize = (cssW: number, cssH: number, dpr: number) => {
    W = Math.round(cssW * dpr);
    H = Math.round(cssH * dpr);
    if (W < 2 || H < 2) return;
    cv.width = W;
    cv.height = H;
    L = LANE_H * H;
    sky = skySprite(W, H);
    hillsFar = hillsSprite(W, H, "#8ea6cf", 0.12, 2, "#5f78a6");
    hillsNear = hillsSprite(W, H, "#dbe6f6", 0.08, 3, "#2f5a4a");
    sprites.clear();
    sleighImg = deerImg = null;
    gift = null;
    void loadSprites().then(() => {
      if (!L) return;
      buildTeam();
      gift = fitted("cadeau", 0.55 * L, 0.55 * L, "center");
    });
  };

  const tile = (img: HTMLCanvasElement, offset: number, y: number) => {
    const o = ((offset % W) + W) % W;
    c.drawImage(img, -o, y);
    c.drawImage(img, W - o, y);
  };

  const draw = (w: World | null, now: number, idle: boolean) => {
    if (!sky || !hillsFar || !hillsNear) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (idle || !w) idleDist += dt * 0.12;
    const dist = w && !idle ? w.dist + idleDist : idleDist;

    c.save();
    if (w && w.shake > 0) {
      const a = (w.shake / 0.35) * H * 0.012;
      c.translate(Math.sin(now / 25) * a, Math.cos(now / 31) * a);
    }
    c.drawImage(sky, 0, 0);
    const groundY = GROUND * H;
    tile(hillsFar, dist * W * 0.12, groundY - hillsFar.height * 0.95);
    tile(hillsNear, dist * W * 0.3, groundY - hillsNear.height * 0.7);
    // sol
    c.fillStyle = C.snow;
    c.fillRect(-20, groundY, W + 40, H - groundY + 20);
    c.fillStyle = C.snowShade;
    const step = H * 0.25;
    const off = (dist * W) % step;
    for (let x = -off; x < W + step; x += step) {
      c.beginPath();
      c.ellipse(x, groundY + H * 0.04, step * 0.3, H * 0.012, 0, 0, Math.PI * 2);
      c.fill();
    }

    if (w) {
      // ligne d'arrivée
      if (w.finishX !== null) {
        const fx = w.finishX * W;
        const top = SKY_TOP * H;
        const sq = L * 0.12;
        for (let y = top, i = 0; y < groundY; y += sq, i++) {
          c.fillStyle = i % 2 ? "#ffffff" : C.red;
          c.fillRect(fx, y, sq, sq);
          c.fillStyle = i % 2 ? C.red : "#ffffff";
          c.fillRect(fx + sq, y, sq, sq);
        }
        c.fillStyle = C.gold;
        c.font = `900 ${Math.round(L * 0.28)}px Nunito, sans-serif`;
        c.textAlign = "left";
        c.fillText("ARRIVÉE ★", fx + sq * 2.6, top + L * 0.35);
      }
      // obstacles
      for (const o of w.obstacles) {
        const img = sprite(o.kind, o.variant);
        if (!img) continue;
        const [top] = KINDS[o.kind].lanes;
        // Les nuages et la montgolfière flottent doucement.
        const float = GROUNDED.includes(o.kind) ? 0 : Math.sin(now / 450 + o.id) * L * 0.04;
        c.drawImage(img, o.x * W, (SKY_TOP + top * LANE_H) * H + float + (GROUNDED.includes(o.kind) ? 0 : 0.05 * L));
      }
      // cadeaux bonus (halo doré + petit rebond)
      for (const b of w.bonuses) {
        if (b.taken || !gift) continue;
        const bob = Math.sin(now / 250 + b.id) * L * 0.05;
        const gx = b.x * W - L * 0.02;
        const gy = laneCenter(b.lane) * H - gift.height / 2 + bob;
        const r = gift.width * 0.75;
        const halo = c.createRadialGradient(gx + gift.width / 2, gy + gift.height / 2, 0, gx + gift.width / 2, gy + gift.height / 2, r);
        halo.addColorStop(0, "rgba(255,225,110,0.55)");
        halo.addColorStop(1, "rgba(255,225,110,0)");
        c.fillStyle = halo;
        c.fillRect(gx + gift.width / 2 - r, gy + gift.height / 2 - r, r * 2, r * 2);
        c.drawImage(gift, gx, gy);
      }
    }

    // attelage
    let tx = SLEIGH_X * W - (SLEIGH_W / 2) * L;
    let ty = laneCenter(w ? w.y : 1) * H + (w ? 0 : Math.sin(now / 400) * L * 0.06);
    let angle = w ? (w.y - w.lane) * 0.25 : 0;
    let alpha = 1;
    if (w?.status === "won") {
      tx += w.outro * W * 0.35;
      ty -= w.outro * w.outro * H * 0.2;
      angle = -0.18;
    } else if (w?.status === "lost") {
      const f = Math.min(1, w.outro / 0.9);
      ty += f * f * (groundY - ty - L * 0.2);
      angle = f * 0.5;
    } else if (w && w.invincible > 0 && Math.floor(w.invincible * 10) % 2 === 0) alpha = 0.35;
    if (sleighImg && deerImg) {
      // Galop : les rennes montent et descendent un peu plus vite que le traîneau.
      const running = w?.status !== "lost";
      const deerBob = running ? Math.sin(now / 95) * L * 0.035 : 0;
      const sleighBob = running ? Math.sin(now / 190 + 1) * L * 0.015 : 0;
      c.save();
      c.globalAlpha = alpha;
      c.translate(tx + (SLEIGH_W / 2) * L, ty);
      c.rotate(angle);
      const x0 = -teamW / 2;
      c.drawImage(sleighImg, x0, -teamH / 2 + sleighBob);
      c.drawImage(deerImg, x0 + sleighImg.width - 1, -teamH / 2 + deerBob);
      c.restore();
    }
    if (w?.status === "won") {
      for (let i = 0; i < 8; i++) {
        const t = (now / 600 + i / 8) % 1;
        c.globalAlpha = 1 - t;
        circle(c, tx - t * L * 1.2, ty + L * 0.2 + Math.sin(i * 2 + now / 200) * L * 0.15, L * 0.04, C.gold);
      }
      c.globalAlpha = 1;
    }

    // flocons
    c.fillStyle = "rgba(255,255,255,0.85)";
    for (const f of flakes) {
      f.y += f.vy * dt;
      f.x -= dt * 0.03;
      if (f.y > 1) f.y -= 1;
      if (f.x < 0) f.x += 1;
      c.beginPath();
      c.arc((f.x + Math.sin(now / 900 + f.ph) * 0.01) * W, f.y * H, f.r * (H / 400), 0, Math.PI * 2);
      c.fill();
    }

    if (w) {
      // messages « Ouille ! » / « +1 »
      c.textAlign = "center";
      c.font = `900 ${Math.round(L * 0.3)}px Nunito, sans-serif`;
      for (const p of w.popups) {
        c.globalAlpha = 1 - p.age;
        c.lineWidth = L * 0.05;
        c.strokeStyle = "rgba(0,0,0,0.55)";
        const y = p.y * H - p.age * L * 0.5;
        c.strokeText(p.text, p.x * W, y);
        c.fillStyle = p.good ? C.gold : "#ff5a5a";
        c.fillText(p.text, p.x * W, y);
      }
      c.globalAlpha = 1;
      if (w.shake > 0) {
        c.fillStyle = `rgba(255,40,40,${(w.shake / 0.35) * 0.25})`;
        c.fillRect(-20, -20, W + 40, H + 40);
      }
    }
    c.restore();
    if (w) hud(w);
  };

  function hud(w: World) {
    const s = Math.max(H * 0.055, 14);
    const y = H * 0.012;
    // cœurs
    for (let i = 0; i < w.s.lives; i++) {
      heartPath(c, s * 0.8 + i * s * 1.15, y, s);
      c.fillStyle = i < livesLeft(w) ? "#ff3b4e" : "rgba(255,255,255,0.15)";
      c.fill();
      c.lineWidth = Math.max(1, s * 0.08);
      c.strokeStyle = "rgba(255,255,255,0.85)";
      c.stroke();
    }
    // cadeaux attrapés
    // cadeaux attrapés / demandés (doré une fois l'objectif atteint)
    const gx = s * 0.8 + w.s.lives * s * 1.15 + s * 0.3;
    if (gift) c.drawImage(gift, gx - s * 0.2, y - s * 0.25, s * 1.5, s * 1.5);
    c.font = `900 ${Math.round(s)}px Nunito, sans-serif`;
    c.textAlign = "left";
    const label = `${w.gifts} / ${w.s.gifts_required}`;
    c.lineWidth = s * 0.15;
    c.strokeStyle = "rgba(0,0,0,0.45)";
    c.strokeText(label, gx + s * 1.4, y + s * 0.9);
    c.fillStyle = enoughGifts(w) ? C.gold : "#ffffff";
    c.fillText(label, gx + s * 1.4, y + s * 0.9);
    // parcours : du traîneau jusqu'au village
    const x0 = W * 0.42;
    const x1 = W * 0.86;
    const by = y + s * 0.5;
    c.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(x0, by - s * 0.22, x1 - x0, s * 0.44, s * 0.22);
    c.fillStyle = C.gold;
    roundRect(x0, by - s * 0.22, (x1 - x0) * progress(w), s * 0.44, s * 0.22);
    // petit traîneau sur la barre
    const px = x0 + (x1 - x0) * progress(w);
    circle(c, px, by, s * 0.42, C.red);
    c.lineWidth = Math.max(1, s * 0.08);
    c.strokeStyle = "#ffffff";
    c.stroke();
    // maison d'arrivée
    poly(c, [x1 + s * 0.3, by + s * 0.45, x1 + s * 0.3, by - s * 0.05, x1 + s * 0.75, by - s * 0.5, x1 + s * 1.2, by - s * 0.05, x1 + s * 1.2, by + s * 0.45], C.window, "#7a4a12", Math.max(1, s * 0.08));
  }

  function roundRect(x: number, y: number, rawW: number, h: number, r: number) {
    const w = Math.max(rawW, h);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    c.fill();
  }

  return { resize, draw };
}
