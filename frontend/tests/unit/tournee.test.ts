import { describe, expect, it } from "vitest";

import {
  KINDS, LANES, SLEIGH_X, blockedLanes, createWorld, laneFromY, livesLeft, setLane, sleighBox, speedAt, step, type World,
} from "../../src/games/tournee/engine";
import type { TourneeSettings } from "../../src/services/types";

const LEVELS: Record<string, TourneeSettings> = {
  facile: { label: "Facile", duration: 60, lives: 5, speed_start: 0.22, speed_end: 0.3, gap_start: 2.6, gap_end: 1.9, double_chance: 0, gifts: true },
  normal: { label: "Normal", duration: 90, lives: 4, speed_start: 0.26, speed_end: 0.38, gap_start: 2.2, gap_end: 1.5, double_chance: 0.25, gifts: true },
  difficile: { label: "Difficile", duration: 120, lives: 3, speed_start: 0.3, speed_end: 0.48, gap_start: 1.8, gap_end: 1.15, double_chance: 0.45, gifts: true },
  // Plus dur que tout ce que propose game.yaml : le jeu doit rester jouable.
  extreme: { label: "x", duration: 120, lives: 1, speed_start: 1, speed_end: 1, gap_start: 0.8, gap_end: 0.8, double_chance: 1, gifts: true },
};

const DT = 1 / 60;

/** Pilote automatique : regarde 0,6 s devant lui et rejoint le couloir libre le plus proche (comme un enfant attentif). */
function autopilot(w: World) {
  const me = sleighBox(w);
  const blocked = blockedLanes(w, me.x0, me.x1 + speedAt(w) * 0.6);
  if (!blocked.has(w.lane)) return;
  const free = [...Array(LANES).keys()].filter((l) => !blocked.has(l));
  free.sort((a, b) => Math.abs(a - w.y) - Math.abs(b - w.y));
  if (free.length) setLane(w, free[0]);
}

function fly(level: TourneeSettings, seed: number, pilot: (w: World) => void, aspect = 2.4) {
  const w = createWorld(level, aspect, seed);
  let guard = 0;
  while (w.status === "playing" && guard++ < 200 * 60) {
    pilot(w);
    step(w, DT);
  }
  return w;
}

describe("moteur de la tournée", () => {
  it("un pilote attentif arrive toujours au bout, sans aucun choc, à tous les niveaux", () => {
    for (const [name, level] of Object.entries(LEVELS)) {
      for (const aspect of [1.6, 2.4, 3]) {
        for (let seed = 1; seed <= 15; seed++) {
          const w = fly(level, seed, autopilot, aspect);
          expect(w.status, `${name} graine ${seed} format ${aspect}`).toBe("won");
          expect(w.hits, `${name} graine ${seed} format ${aspect}`).toBe(0);
          expect(w.t).toBe(level.duration);
        }
      }
    }
  });

  it("il reste toujours au moins un couloir libre", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const w = createWorld(LEVELS.difficile, 2.4, seed);
      for (let i = 0; w.status === "playing"; i++) {
        autopilot(w);
        step(w, DT);
        if (i % 15 === 0) for (let x = 0; x < 1.1; x += 0.02) expect(blockedLanes(w, x, x + 0.001).size).toBeLessThan(LANES);
      }
    }
  });

  it("un enfant qui ne bouge jamais perd des vies puis tombe", () => {
    const w = fly(LEVELS.normal, 3, () => {});
    expect(w.status).toBe("lost");
    expect(w.hits).toBe(LEVELS.normal.lives);
    expect(livesLeft(w)).toBe(0);
    expect(w.t).toBeLessThan(LEVELS.normal.duration);
  });

  it("après un choc, le traîneau clignote et ne peut pas reperdre une vie tout de suite", () => {
    const w = createWorld(LEVELS.facile, 2.4, 1);
    w.obstacles.push({ id: 99, kind: "montgolfiere", x: SLEIGH_X - 0.02, hit: false, variant: 0 });
    w.obstacles.push({ id: 98, kind: "montgolfiere", x: SLEIGH_X + 0.02, hit: false, variant: 0 });
    expect(step(w, DT)).toContain("hit");
    expect(w.hits).toBe(1);
    for (let i = 0; i < 20; i++) step(w, DT);
    expect(w.hits).toBe(1);
  });

  it("les cadeaux bonus se ramassent et ne gênent pas", () => {
    const w = createWorld(LEVELS.facile, 2.4, 1);
    w.bonuses.push({ id: 50, x: SLEIGH_X - 0.01, lane: 1, taken: false });
    expect(step(w, DT)).toContain("gift");
    expect(w.gifts).toBe(1);
    expect(w.hits).toBe(0);
  });

  it("toucher l'écran choisit le couloir", () => {
    expect(laneFromY(0.1)).toBe(0);
    expect(laneFromY(0.5)).toBe(1);
    expect(laneFromY(0.95)).toBe(2);
    expect(laneFromY(-1)).toBe(0);
  });

  it("chaque type d'obstacle occupe 1 ou 2 couloirs", () => {
    for (const k of Object.values(KINDS)) expect(k.lanes[1] - k.lanes[0]).toBeLessThan(2);
  });
});
