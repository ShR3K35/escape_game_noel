/**
 * Dessin de « La tournée du traîneau » sur un canvas 2D.
 * Les éléments fixes (ciel, collines, attelage, obstacles) sont pré-dessinés dans des canvas hors écran
 * à chaque redimensionnement : chaque image ne fait que les recopier (fluide sur une tablette ancienne).
 */
import {
  GROUND, KINDS, LANE_H, SKY_TOP, SLEIGH_H, SLEIGH_W, SLEIGH_X,
  laneCenter, livesLeft, progress, type ObstacleKind, type World,
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

function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, w: number) {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = "round";
  c.stroke();
}

function heartPath(c: Ctx, x: number, y: number, s: number) {
  c.beginPath();
  c.moveTo(x, y + s * 0.35);
  c.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  c.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  c.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  c.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.35);
}

// ------------------------------------------------------------------ attelage
/** Renne vu de profil, tourné vers la droite. Unité : hauteur de couloir ; origine : arrière du corps. */
function reindeer(c: Ctx, x: number, frame: number, lead: boolean) {
  const bob = [0, -0.015, 0, 0.015][frame];
  const swing = [0.35, 0.1, -0.3, 0.1][frame];
  c.save();
  c.translate(x, bob);
  // pattes (deux plans : arrière plus sombre)
  const leg = (lx: number, a: number, col: string) => line(c, lx, 0.04, lx + Math.sin(a) * 0.15, 0.04 + Math.cos(a) * 0.15, col, 0.035);
  leg(0.05, swing, C.brownDark);
  leg(0.24, -swing, C.brownDark);
  leg(0.08, -swing * 0.8, C.brown);
  leg(0.27, swing * 0.8, C.brown);
  // queue, corps, cou, tête
  circle(c, -0.01, -0.03, 0.03, "#f3eadc");
  ellipse(c, 0.16, 0, 0.16, 0.075, C.brown);
  ellipse(c, 0.16, 0.03, 0.11, 0.04, "#b07a45");
  poly(c, [0.24, -0.04, 0.3, -0.15, 0.36, -0.13, 0.32, 0.0], C.brown);
  ellipse(c, 0.36, -0.15, 0.065, 0.045, C.brown, 0.25);
  circle(c, 0.35, -0.17, 0.011, "#1a1a1a");
  // museau / nez
  circle(c, 0.42, -0.135, lead ? 0.024 : 0.016, lead ? "#ff2a2a" : "#2a1a10");
  if (lead) circle(c, 0.42, -0.135, 0.045, "rgba(255,60,60,0.25)");
  // oreille et bois
  poly(c, [0.32, -0.19, 0.29, -0.22, 0.33, -0.2], C.brownDark);
  const antler = "#d9b98a";
  line(c, 0.33, -0.19, 0.3, -0.32, antler, 0.022);
  line(c, 0.31, -0.27, 0.25, -0.3, antler, 0.018);
  line(c, 0.3, -0.32, 0.34, -0.37, antler, 0.018);
  line(c, 0.36, -0.19, 0.38, -0.31, antler, 0.022);
  line(c, 0.375, -0.27, 0.43, -0.29, antler, 0.018);
  // harnais
  line(c, 0.1, -0.06, 0.1, 0.06, C.red, 0.03);
  circle(c, 0.1, 0.0, 0.017, C.gold);
  c.restore();
}

/** Traîneau, Père Noël et sa hotte. Origine : coin arrière du traîneau, y = 0 au centre de la zone de choc. */
function sleigh(c: Ctx) {
  // patins
  c.beginPath();
  c.moveTo(-0.02, 0.24);
  c.lineTo(0.58, 0.24);
  c.quadraticCurveTo(0.7, 0.24, 0.7, 0.12);
  c.strokeStyle = C.gold;
  c.lineWidth = 0.04;
  c.lineCap = "round";
  c.stroke();
  line(c, 0.12, 0.12, 0.12, 0.24, C.goldDark, 0.03);
  line(c, 0.48, 0.12, 0.48, 0.24, C.goldDark, 0.03);
  // hotte et cadeaux
  ellipse(c, 0.13, -0.15, 0.12, 0.14, "#7b4a26");
  poly(c, [0.03, -0.27, 0.13, -0.33, 0.23, -0.27, 0.13, -0.22], "#9b6334");
  poly(c, [0.05, -0.36, 0.13, -0.36, 0.13, -0.27, 0.05, -0.27], "#2f7fd8");
  poly(c, [0.12, -0.4, 0.22, -0.4, 0.22, -0.29, 0.12, -0.29], C.green);
  line(c, 0.17, -0.4, 0.17, -0.29, C.gold, 0.018);
  line(c, 0.09, -0.36, 0.09, -0.27, C.gold, 0.018);
  // Père Noël
  ellipse(c, 0.33, -0.12, 0.12, 0.14, C.red);
  poly(c, [0.23, -0.06, 0.43, -0.06, 0.43, -0.02, 0.23, -0.02], "#2a1a10");
  line(c, 0.38, -0.16, 0.5, -0.1, C.red, 0.06);
  circle(c, 0.52, -0.1, 0.03, "#2a1a10");
  circle(c, 0.35, -0.32, 0.075, C.skin);
  ellipse(c, 0.36, -0.26, 0.085, 0.07, "#ffffff");
  circle(c, 0.38, -0.32, 0.01, "#1a1a1a");
  circle(c, 0.405, -0.3, 0.017, "#f29b8f");
  poly(c, [0.27, -0.36, 0.43, -0.38, 0.33, -0.5, 0.2, -0.47], C.red);
  ellipse(c, 0.35, -0.37, 0.09, 0.028, "#ffffff", -0.1);
  circle(c, 0.2, -0.47, 0.03, "#ffffff");
  // caisse du traîneau
  c.beginPath();
  c.moveTo(0.0, -0.24);
  c.quadraticCurveTo(-0.06, -0.26, -0.02, -0.3);
  c.quadraticCurveTo(0.06, -0.3, 0.07, -0.18);
  c.lineTo(0.08, -0.02);
  c.lineTo(0.58, -0.02);
  c.quadraticCurveTo(0.66, -0.1, 0.72, -0.1);
  c.quadraticCurveTo(0.74, 0.06, 0.6, 0.13);
  c.lineTo(0.08, 0.13);
  c.quadraticCurveTo(0.0, 0.1, 0.0, -0.24);
  c.closePath();
  c.fillStyle = C.red;
  c.fill();
  c.lineWidth = 0.02;
  c.strokeStyle = C.redDark;
  c.stroke();
  line(c, 0.1, 0.02, 0.58, 0.02, C.gold, 0.02);
  circle(c, 0.33, 0.07, 0.03, C.gold);
}

/** Attelage complet (4 images de galop), pré-dessiné. */
function teamFrames(L: number): { frames: HTMLCanvasElement[]; ox: number; oy: number } {
  const pad = 0.55; // marge au-dessus (bonnet, bois)
  const w = (SLEIGH_W + 0.25) * L;
  const h = (SLEIGH_H + pad + 0.35) * L;
  const ox = 0.08 * L;
  const oy = (pad + SLEIGH_H / 2) * L;
  const frames = [0, 1, 2, 3].map((f) => {
    const [cv, c] = canvas(w, h);
    if (!c) return cv;
    c.translate(ox, oy);
    c.scale(L, L);
    // rênes et traits
    line(c, 0.52, -0.1, 1.2, -0.12, "#5b3716", 0.012);
    line(c, 0.68, -0.02, 1.25, 0.0, C.gold, 0.02);
    reindeer(c, 0.78, f, false);
    reindeer(c, 1.15, (f + 2) % 4, true);
    sleigh(c);
    return cv;
  });
  return { frames, ox, oy };
}

// ------------------------------------------------------------------ obstacles
const WALLS = ["#e7d3b0", "#b9d3e6", "#efbcae"];

function maison(c: Ctx, v: number) {
  // Bande d'un couloir : y de 0 (haut du couloir) à 1 (sol).
  const wall = WALLS[v % 3];
  poly(c, [0.1, 0.5, 0.95, 0.5, 0.95, 1.0, 0.1, 1.0], wall, "#6b4a35", 0.02);
  // cheminée (l'obstacle !)
  poly(c, [0.64, 0.06, 0.84, 0.06, 0.84, 0.45, 0.64, 0.45], "#b23a2a", "#5a1a12", 0.02);
  for (let y = 0.14; y < 0.44; y += 0.08) line(c, 0.645, y, 0.835, y, "#7d2418", 0.008);
  poly(c, [0.6, 0.0, 0.88, 0.0, 0.88, 0.07, 0.6, 0.07], C.snow, C.snowShade, 0.01);
  // toit enneigé
  poly(c, [0.0, 0.55, 0.52, 0.16, 1.05, 0.55], "#7a2a2a", "#4a1414", 0.02);
  poly(c, [0.02, 0.52, 0.52, 0.14, 1.03, 0.52, 0.95, 0.56, 0.52, 0.24, 0.1, 0.56], C.snow);
  // fenêtres et porte
  poly(c, [0.2, 0.62, 0.38, 0.62, 0.38, 0.78, 0.2, 0.78], C.window, "#6b4a35", 0.02);
  line(c, 0.29, 0.62, 0.29, 0.78, "#6b4a35", 0.015);
  poly(c, [0.6, 0.66, 0.8, 0.66, 0.8, 1.0, 0.6, 1.0], "#5a3018");
  circle(c, 0.75, 0.84, 0.018, C.gold);
  // guirlande lumineuse
  for (let i = 0; i < 6; i++) circle(c, 0.16 + i * 0.15, 0.58, 0.02, ["#ff4d4d", "#ffd84d", "#4dff88"][i % 3]);
}

function sapin(c: Ctx) {
  // Bande de deux couloirs : y de 0 à 2 (sol).
  poly(c, [0.4, 1.75, 0.55, 1.75, 0.55, 2.0, 0.4, 2.0], C.brownDark);
  const tiers: [number, number, number][] = [[1.85, 0.48, 0.55], [1.4, 0.4, 0.5], [0.95, 0.32, 0.45]];
  for (const [base, half, height] of tiers) {
    poly(c, [0.475 - half, base, 0.475, base - height - 0.15, 0.475 + half, base], C.green, C.greenDark, 0.02);
    poly(c, [0.475 - half, base, 0.475 - half * 0.6, base - 0.06, 0.475, base - 0.02, 0.475 + half * 0.6, base - 0.06, 0.475 + half, base], C.snow);
  }
  const balls: [number, number, string][] = [[0.3, 1.6, "#ff4d4d"], [0.65, 1.55, "#ffd84d"], [0.45, 1.2, "#4db8ff"], [0.6, 0.95, "#ff4d4d"], [0.35, 0.85, "#ffd84d"]];
  for (const [x, y, col] of balls) circle(c, x, y, 0.035, col);
  // étoile au sommet
  const s = 0.09;
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? s * 0.45 : s;
    pts.push(0.475 + Math.cos(a) * r, 0.25 + Math.sin(a) * r);
  }
  poly(c, pts, C.gold, C.goldDark, 0.01);
}

function clocher(c: Ctx) {
  // Bande de deux couloirs : y de 0 à 2 (sol).
  poly(c, [0.15, 0.62, 0.7, 0.62, 0.7, 2.0, 0.15, 2.0], "#c8c0b4", "#6b6358", 0.02);
  for (let y = 0.8; y < 2; y += 0.2) line(c, 0.16, y, 0.69, y, "#a59c8f", 0.008);
  // flèche enneigée
  poly(c, [0.08, 0.64, 0.425, 0.04, 0.77, 0.64], "#3b4f7a", "#1e2a44", 0.02);
  poly(c, [0.08, 0.64, 0.425, 0.04, 0.47, 0.12, 0.2, 0.6, 0.77, 0.64, 0.77, 0.68, 0.08, 0.68], C.snow);
  line(c, 0.425, 0.04, 0.425, -0.06, C.goldDark, 0.02);
  line(c, 0.38, -0.02, 0.47, -0.02, C.goldDark, 0.02);
  // horloge, cloche, porte
  circle(c, 0.425, 0.85, 0.12, "#f8f2e2");
  line(c, 0.425, 0.85, 0.425, 0.77, "#222", 0.02);
  line(c, 0.425, 0.85, 0.48, 0.87, "#222", 0.02);
  poly(c, [0.3, 1.15, 0.55, 1.15, 0.55, 1.4, 0.3, 1.4], "#2b2b3a");
  ellipse(c, 0.425, 1.3, 0.07, 0.08, C.gold);
  poly(c, [0.33, 1.7, 0.52, 1.7, 0.52, 2.0, 0.33, 2.0], "#5a3018");
  poly(c, [0.2, 1.5, 0.27, 1.5, 0.27, 1.62, 0.2, 1.62], C.window);
  poly(c, [0.58, 1.5, 0.65, 1.5, 0.65, 1.62, 0.58, 1.62], C.window);
}

function cloud(c: Ctx, cx: number, cy: number, s: number) {
  const puffs: [number, number, number][] = [[-0.45, 0.1, 0.28], [-0.15, -0.08, 0.36], [0.2, -0.12, 0.38], [0.48, 0.06, 0.3], [0.05, 0.14, 0.32]];
  for (const [x, y, r] of puffs) circle(c, cx + x * s, cy + y * s + 0.03 * s, r * s, "#3c4358");
  for (const [x, y, r] of puffs) circle(c, cx + x * s, cy + y * s, r * s, "#646d86");
  for (const [x, y, r] of puffs) circle(c, cx + x * s - 0.05 * s, cy + y * s - 0.08 * s, r * s * 0.6, "#7f89a3");
  // visage grognon
  circle(c, cx - 0.12 * s, cy + 0.02 * s, 0.05 * s, "#1c2030");
  circle(c, cx + 0.14 * s, cy + 0.02 * s, 0.05 * s, "#1c2030");
  line(c, cx - 0.2 * s, cy - 0.08 * s, cx - 0.05 * s, cy - 0.04 * s, "#1c2030", 0.035 * s);
  line(c, cx + 0.22 * s, cy - 0.08 * s, cx + 0.07 * s, cy - 0.04 * s, "#1c2030", 0.035 * s);
}

function bolt(c: Ctx, x: number, y: number, s: number) {
  poly(c, [x, y, x + 0.12 * s, y, x + 0.04 * s, y + 0.18 * s, x + 0.14 * s, y + 0.18 * s, x - 0.04 * s, y + 0.45 * s, x + 0.0 * s, y + 0.24 * s, x - 0.09 * s, y + 0.24 * s], "#ffe14d", "#c79a00", 0.012 * s);
}

function nuage(c: Ctx) {
  // Bande d'un couloir, largeur 1.25
  bolt(c, 0.38, 0.55, 0.8);
  bolt(c, 0.82, 0.58, 0.7);
  cloud(c, 0.62, 0.42, 0.8);
}

function orage(c: Ctx) {
  // Bande de deux couloirs, largeur 1.6
  bolt(c, 0.5, 1.3, 1.25);
  bolt(c, 1.1, 1.35, 1.1);
  cloud(c, 0.86, 1.12, 0.92);
  cloud(c, 0.75, 0.45, 1.0);
}

function montgolfiere(c: Ctx) {
  // Bande d'un couloir, largeur 0.85
  const cx = 0.425;
  const cy = 0.38;
  const r = 0.33;
  c.save();
  c.beginPath();
  c.moveTo(cx - r * 0.45, cy + r * 0.85);
  c.bezierCurveTo(cx - r * 1.35, cy + r * 0.2, cx - r * 1.1, cy - r * 1.05, cx, cy - r * 1.05);
  c.bezierCurveTo(cx + r * 1.1, cy - r * 1.05, cx + r * 1.35, cy + r * 0.2, cx + r * 0.45, cy + r * 0.85);
  c.closePath();
  c.fillStyle = C.red;
  c.fill();
  c.clip();
  for (let i = -2; i <= 2; i += 2) poly(c, [cx + (i - 0.5) * r * 0.42, cy - r * 1.2, cx + (i + 0.5) * r * 0.42, cy - r * 1.2, cx + (i + 0.5) * r * 0.22, cy + r, cx + (i - 0.5) * r * 0.22, cy + r], "#fff4e0");
  poly(c, [cx - r * 1.4, cy + r * 0.05, cx + r * 1.4, cy + r * 0.05, cx + r * 1.4, cy + r * 0.2, cx - r * 1.4, cy + r * 0.2], C.gold);
  c.restore();
  line(c, cx - r * 0.42, cy + r * 0.85, cx - 0.08, 0.84, "#5b3716", 0.012);
  line(c, cx + r * 0.42, cy + r * 0.85, cx + 0.08, 0.84, "#5b3716", 0.012);
  poly(c, [cx - 0.1, 0.84, cx + 0.1, 0.84, cx + 0.08, 0.96, cx - 0.08, 0.96], "#9b6334", "#5b3716", 0.012);
}

function obstacleSprite(kind: ObstacleKind, variant: number, L: number): HTMLCanvasElement {
  const { w, lanes } = KINDS[kind];
  const bandH = lanes[1] - lanes[0] + 1;
  const pad = 0.15; // flèche, éclairs, fumée qui dépassent un peu
  const [cv, c] = canvas(w * L, (bandH + pad) * L);
  if (!c) return cv;
  c.translate(0, pad * L);
  c.scale(L, L);
  if (kind === "maison") maison(c, variant);
  else if (kind === "sapin") sapin(c);
  else if (kind === "clocher") clocher(c);
  else if (kind === "nuage") nuage(c);
  else if (kind === "orage") orage(c);
  else montgolfiere(c);
  return cv;
}

function giftSprite(L: number): HTMLCanvasElement {
  const s = 0.5 * L;
  const [cv, c] = canvas(s * 1.6, s * 1.6);
  if (!c) return cv;
  const g = c.createRadialGradient(s * 0.8, s * 0.8, 0, s * 0.8, s * 0.8, s * 0.8);
  g.addColorStop(0, "rgba(255,230,120,0.8)");
  g.addColorStop(1, "rgba(255,230,120,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, s * 1.6, s * 1.6);
  c.translate(s * 0.3, s * 0.35);
  c.scale(s, s);
  poly(c, [0, 0.25, 1, 0.25, 1, 1, 0, 1], "#2f7fd8", "#163f73", 0.04);
  poly(c, [-0.05, 0.12, 1.05, 0.12, 1.05, 0.32, -0.05, 0.32], "#3d93f0", "#163f73", 0.04);
  poly(c, [0.42, 0.12, 0.58, 0.12, 0.58, 1, 0.42, 1], C.gold);
  ellipse(c, 0.33, 0.04, 0.17, 0.1, C.gold, 0.4);
  ellipse(c, 0.67, 0.04, 0.17, 0.1, C.gold, -0.4);
  return cv;
}

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
  let team: ReturnType<typeof teamFrames> | null = null;
  let gift: HTMLCanvasElement | null = null;
  const sprites = new Map<string, HTMLCanvasElement>();
  const flakes: Flake[] = Array.from({ length: 45 }, (_, i) => ({
    x: (i * 0.618) % 1, y: (i * 0.37) % 1, r: 0.6 + ((i * 7) % 5) * 0.35, vy: 0.04 + ((i * 3) % 7) * 0.012, ph: i,
  }));
  let last = 0;
  let idleDist = 0;

  const sprite = (kind: ObstacleKind, variant: number) => {
    const key = `${kind}-${kind === "maison" ? variant : 0}`;
    let s = sprites.get(key);
    if (!s) {
      s = obstacleSprite(kind, variant, L);
      sprites.set(key, s);
    }
    return s;
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
    team = teamFrames(L);
    gift = giftSprite(L);
    sprites.clear();
  };

  const tile = (img: HTMLCanvasElement, offset: number, y: number) => {
    const o = ((offset % W) + W) % W;
    c.drawImage(img, -o, y);
    c.drawImage(img, W - o, y);
  };

  const draw = (w: World | null, now: number, idle: boolean) => {
    if (!sky || !team || !gift || !hillsFar || !hillsNear) return;
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
        const top = (SKY_TOP + KINDS[o.kind].lanes[0] * LANE_H - 0.15 * LANE_H) * H;
        c.drawImage(img, o.x * W, top);
        if (o.kind === "maison") {
          // fumée de la cheminée
          for (let i = 0; i < 3; i++) {
            const t = ((now / 1000) * 0.8 + i / 3) % 1;
            const sx = o.x * W + L * (0.74 - t * 0.25);
            const sy = (SKY_TOP + 2 * LANE_H) * H - L * (0.02 + t * 0.35);
            c.globalAlpha = 0.5 * (1 - t);
            circle(c, sx, sy, L * (0.05 + t * 0.08), "#e6e9f2");
          }
          c.globalAlpha = 1;
        }
      }
      // cadeaux bonus
      for (const b of w.bonuses) {
        if (b.taken) continue;
        const bob = Math.sin(now / 250 + b.id) * L * 0.05;
        c.drawImage(gift, b.x * W - gift.width * 0.19, laneCenter(b.lane) * H - gift.height / 2 + bob);
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
    const frame = Math.floor(now / 110) % 4;
    c.save();
    c.globalAlpha = alpha;
    c.translate(tx + (SLEIGH_W / 2) * L, ty);
    c.rotate(angle);
    c.drawImage(team.frames[w?.status === "lost" ? 0 : frame], -(SLEIGH_W / 2) * L - team.ox, -team.oy);
    c.restore();
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
    if (w.s.gifts) {
      const gx = s * 0.8 + w.s.lives * s * 1.15 + s * 0.3;
      c.drawImage(gift!, gx - s * 0.2, y - s * 0.25, s * 1.5, s * 1.5);
      c.font = `900 ${Math.round(s)}px Nunito, sans-serif`;
      c.textAlign = "left";
      c.fillStyle = "#ffffff";
      c.fillText(String(w.gifts), gx + s * 1.25, y + s * 0.9);
    }
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
