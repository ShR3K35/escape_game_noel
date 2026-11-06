/**
 * Moteur de « La tournée du traîneau » : un endless runner à 3 couloirs, sans dessin.
 *
 * Unités : x en largeur d'écran (0 = bord gauche, 1 = bord droit), y en hauteur d'écran.
 * Les tailles des objets sont exprimées en hauteur de couloir puis converties avec `aspect` (largeur / hauteur).
 * Il reste toujours au moins un couloir libre, et l'écart entre deux obstacles laisse le temps de changer de couloir.
 */
import type { TourneeSettings } from "../../services/types";

export const LANES = 3;
/** Haut du couloir supérieur et niveau du sol (fractions de la hauteur). */
export const SKY_TOP = 0.08;
export const GROUND = 0.9;
export const LANE_H = (GROUND - SKY_TOP) / LANES;
/** Centre horizontal du traîneau. */
export const SLEIGH_X = 0.2;
/** Taille de l'attelage (traîneau + rennes), en hauteur de couloir. */
export const SLEIGH_W = 1.55;
export const SLEIGH_H = 0.6;
/** Zone de choc réduite : un frôlement ne compte pas (plus indulgent pour les enfants). */
const HIT_SHRINK_X = 0.7;
const HIT_SHRINK_Y = 0.7;
export const INVINCIBLE_S = 1.6;
const LANE_SPEED = 7; // couloirs par seconde
const REACTION_S = 0.85; // temps minimal laissé à l'enfant entre deux obstacles
const FIRST_OBSTACLE_S = 1.4;
export const OUTRO_S = 1.6;

export type ObstacleKind = "maison" | "sapin" | "clocher" | "nuage" | "orage" | "montgolfiere";

/** Largeur (en hauteur de couloir) et couloirs occupés [haut, bas] de chaque obstacle. */
export const KINDS: Record<ObstacleKind, { w: number; lanes: [number, number] }> = {
  nuage: { w: 1.25, lanes: [0, 0] },
  montgolfiere: { w: 0.85, lanes: [1, 1] },
  maison: { w: 1.1, lanes: [2, 2] },
  orage: { w: 1.6, lanes: [0, 1] },
  sapin: { w: 0.95, lanes: [1, 2] },
  clocher: { w: 0.85, lanes: [1, 2] },
};

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  /** Bord gauche, en largeur d'écran. */
  x: number;
  hit: boolean;
  variant: number;
}

export interface Bonus {
  id: number;
  x: number;
  lane: number;
  taken: boolean;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  age: number;
  good: boolean;
}

export type WorldEvent = "hit" | "gift" | "won" | "lost" | "move";

export interface World {
  s: TourneeSettings;
  aspect: number;
  /** Temps de vol écoulé (s), hors pauses. */
  t: number;
  /** Distance parcourue (largeurs d'écran) : sert au défilement du décor. */
  dist: number;
  /** Couloir visé (0 = haut) et position réelle (glisse vers le couloir visé). */
  lane: number;
  y: number;
  hits: number;
  gifts: number;
  invincible: number;
  shake: number;
  obstacles: Obstacle[];
  bonuses: Bonus[];
  popups: Popup[];
  nextSpawn: number;
  nextId: number;
  lastSingle: number[];
  /** Ligne d'arrivée (x), affichée à la fin du parcours. */
  finishX: number | null;
  status: "playing" | "won" | "lost";
  /** Temps écoulé depuis la fin (animation de victoire ou de chute). */
  outro: number;
  rand: () => number;
}

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

export function createWorld(s: TourneeSettings, aspect: number, seed = Date.now()): World {
  return {
    s, aspect, t: 0, dist: 0, lane: 1, y: 1, hits: 0, gifts: 0, invincible: 0, shake: 0,
    obstacles: [], bonuses: [], popups: [], nextSpawn: FIRST_OBSTACLE_S, nextId: 1, lastSingle: [],
    finishX: null, status: "playing", outro: 0, rand: seeded(seed),
  };
}

export const progress = (w: World) => Math.min(1, w.t / w.s.duration);
export const speedAt = (w: World) => lerp(w.s.speed_start, w.s.speed_end, progress(w));
export const livesLeft = (w: World) => Math.max(0, w.s.lives - w.hits);
/** Centre vertical (fraction de hauteur) d'une position de couloir, éventuellement fractionnaire. */
export const laneCenter = (y: number) => SKY_TOP + (y + 0.5) * LANE_H;
/** Largeur d'écran correspondant à `n` hauteurs de couloir. */
export const laneToX = (w: World, n: number) => (n * LANE_H) / w.aspect;
export const obstacleWidth = (w: World, o: Obstacle) => laneToX(w, KINDS[o.kind].w);

export function setLane(w: World, lane: number): WorldEvent[] {
  if (w.status !== "playing") return [];
  const next = Math.max(0, Math.min(LANES - 1, Math.round(lane)));
  if (next === w.lane) return [];
  w.lane = next;
  return ["move"];
}

export const moveLane = (w: World, delta: number) => setLane(w, w.lane + delta);

/** Couloir correspondant à une position verticale (fraction de hauteur) touchée par l'enfant. */
export function laneFromY(fy: number): number {
  return Math.max(0, Math.min(LANES - 1, Math.floor((fy - SKY_TOP) / LANE_H)));
}

function add(w: World, kind: ObstacleKind, x: number) {
  w.obstacles.push({ id: w.nextId++, kind, x, hit: false, variant: Math.floor(w.rand() * 3) });
}

/** Ajoute un motif d'obstacles au bord droit, puis programme le suivant. */
function spawn(w: World, v: number) {
  const r = w.rand;
  const x = 1.02;
  let widest: number;
  if (r() < w.s.double_chance) {
    const free = Math.floor(r() * LANES);
    if (free === 0) {
      const kind = r() < 0.5 ? "sapin" : "clocher";
      add(w, kind, x);
      widest = KINDS[kind].w;
    } else if (free === 1) {
      add(w, "nuage", x);
      add(w, "maison", x);
      widest = Math.max(KINDS.nuage.w, KINDS.maison.w);
    } else {
      add(w, "orage", x);
      widest = KINDS.orage.w;
    }
  } else {
    // Pas trois fois de suite le même couloir : l'enfant doit bouger.
    let lane = Math.floor(r() * LANES);
    if (w.lastSingle.length >= 2 && w.lastSingle.every((l) => l === lane)) lane = (lane + 1 + Math.floor(r() * 2)) % LANES;
    w.lastSingle = [...w.lastSingle.slice(-1), lane];
    const kind: ObstacleKind = lane === 0 ? "nuage" : lane === 1 ? "montgolfiere" : "maison";
    add(w, kind, x);
    widest = KINDS[kind].w;
  }
  // Temps pendant lequel l'obstacle recouvre le traîneau, plus le temps de réaction.
  const overlap = laneToX(w, widest + SLEIGH_W) / v;
  const gap = Math.max(lerp(w.s.gap_start, w.s.gap_end, progress(w)), overlap + REACTION_S);
  w.nextSpawn = w.t + gap;
  if (w.s.gifts && r() < 0.6) {
    // À mi-chemin entre cet obstacle et le suivant : jamais sur un obstacle.
    const from = x + laneToX(w, widest);
    const to = x + gap * v;
    if (to - from > laneToX(w, 0.8))
      w.bonuses.push({ id: w.nextId++, x: (from + to) / 2, lane: Math.floor(r() * LANES), taken: false });
  }
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function sleighBox(w: World): Box {
  const hw = laneToX(w, SLEIGH_W * HIT_SHRINK_X) / 2;
  const hh = (SLEIGH_H * LANE_H * HIT_SHRINK_Y) / 2;
  const cy = laneCenter(w.y);
  return { x0: SLEIGH_X - hw, x1: SLEIGH_X + hw, y0: cy - hh, y1: cy + hh };
}

export function obstacleBox(w: World, o: Obstacle): Box {
  const [top, bottom] = KINDS[o.kind].lanes;
  const width = obstacleWidth(w, o);
  const mx = width * 0.1;
  const my = LANE_H * 0.08;
  return { x0: o.x + mx, x1: o.x + width - mx, y0: SKY_TOP + top * LANE_H + my, y1: SKY_TOP + (bottom + 1) * LANE_H - my };
}

function bonusBox(w: World, b: Bonus): Box {
  const h = LANE_H * 0.5;
  const cy = laneCenter(b.lane);
  return { x0: b.x, x1: b.x + laneToX(w, 0.5), y0: cy - h / 2, y1: cy + h / 2 };
}

/** Fait avancer le monde de `dt` secondes et renvoie ce qui s'est passé (pour les sons). */
export function step(w: World, rawDt: number): WorldEvent[] {
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  const events: WorldEvent[] = [];
  for (const p of w.popups) p.age += dt;
  w.popups = w.popups.filter((p) => p.age < 1);
  w.shake = Math.max(0, w.shake - dt);
  w.invincible = Math.max(0, w.invincible - dt);

  if (w.status !== "playing") {
    w.outro += dt;
    if (w.status === "won") scroll(w, speedAt(w) * dt);
    return events;
  }

  w.t += dt;
  const v = speedAt(w);
  scroll(w, v * dt);

  // Glissement vers le couloir visé.
  const d = w.lane - w.y;
  w.y += Math.sign(d) * Math.min(Math.abs(d), LANE_SPEED * dt);

  const remaining = w.s.duration - w.t;
  const travel = (1.02 - SLEIGH_X) / v; // temps pour qu'un obstacle atteigne le traîneau
  if (w.t >= w.nextSpawn && remaining > travel + 0.6) spawn(w, v);
  if (w.finishX === null && remaining <= travel) w.finishX = 1.02;

  const me = sleighBox(w);
  for (const o of w.obstacles) {
    if (o.hit || !overlaps(me, obstacleBox(w, o))) continue;
    o.hit = true;
    if (w.invincible > 0) continue;
    w.hits += 1;
    w.invincible = INVINCIBLE_S;
    w.shake = 0.35;
    w.popups.push({ x: SLEIGH_X, y: Math.max(laneCenter(w.y) - LANE_H * 0.5, SKY_TOP + LANE_H * 0.6), text: "Ouille !", age: 0, good: false });
    events.push("hit");
    if (w.hits >= w.s.lives) {
      w.status = "lost";
      events.push("lost");
      return events;
    }
  }
  for (const b of w.bonuses) {
    if (b.taken || !overlaps(me, bonusBox(w, b))) continue;
    b.taken = true;
    w.gifts += 1;
    w.popups.push({ x: b.x, y: Math.max(laneCenter(b.lane) - LANE_H * 0.4, SKY_TOP + LANE_H * 0.6), text: "+1 🎁", age: 0, good: true });
    events.push("gift");
  }

  if (w.t >= w.s.duration) {
    w.t = w.s.duration;
    w.status = "won";
    events.push("won");
  }
  return events;
}

function scroll(w: World, dx: number) {
  w.dist += dx;
  for (const o of w.obstacles) o.x -= dx;
  for (const b of w.bonuses) b.x -= dx;
  if (w.finishX !== null) w.finishX -= dx;
  w.obstacles = w.obstacles.filter((o) => o.x + obstacleWidth(w, o) > -0.05);
  w.bonuses = w.bonuses.filter((b) => b.x > -0.1 && !(b.taken && b.x < SLEIGH_X - 0.1));
}

/** Couloirs bloqués par un obstacle à l'abscisse `x` (largeur d'écran). */
export function blockedLanes(w: World, x0: number, x1: number): Set<number> {
  const out = new Set<number>();
  for (const o of w.obstacles) {
    const b = obstacleBox(w, o);
    if (b.x0 < x1 && x0 < b.x1) {
      const [top, bottom] = KINDS[o.kind].lanes;
      for (let l = top; l <= bottom; l++) out.add(l);
    }
  }
  return out;
}
