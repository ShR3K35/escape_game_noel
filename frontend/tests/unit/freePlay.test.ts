import { describe, expect, it } from "vitest";

import { freeAttempt, freeGame, initialFreeState } from "../../src/games/freePlay";
import type { FreePlayData } from "../../src/services/types";

const base = { title: "T", instructions: "I", level: "facile", attempts_per_hint: 2 };

const machine: FreePlayData = {
  ...base,
  id: "machine",
  intro: "intro",
  orders: [
    { text: "2 × 3 ?", choices: [5, 6, 7, 8], level: 1, answer: 6, hint: "table de 2" },
    { text: "4 + 4 ?", choices: [7, 8, 9, 10], level: 1, answer: 8, hint: "double" },
  ],
};

describe("jeu libre : machine à cadeaux", () => {
  it("élimine les mauvaises réponses, donne l'indice après 2 erreurs, puis termine", () => {
    let st = initialFreeState();
    let r = freeAttempt(machine, st, { order: 0, answer: 5 });
    expect(r.result).toMatchObject({ correct: false, eliminated: [5], hints: [] });
    r = freeAttempt(machine, r.state, { order: 0, answer: 7 });
    expect(r.result.hints).toEqual(["table de 2"]);
    expect(freeGame(machine, r.state).content).toMatchObject({ eliminated: [5, 7], order: { text: "2 × 3 ?" } });
    r = freeAttempt(machine, r.state, { order: 0, answer: 6 });
    expect(r.result).toMatchObject({ correct: true, completed: false, step: 1, eliminated: [], hints: [] });
    expect(() => freeAttempt(machine, r.state, { order: 0, answer: 6 })).toThrow(); // double clic
    st = r.state;
    r = freeAttempt(machine, st, { order: 1, answer: 8 });
    expect(r.result).toMatchObject({ correct: true, completed: true, reward: null });
    // la réponse n'est jamais dans le contenu passé au jeu
    expect(JSON.stringify(freeGame(machine, initialFreeState()).content)).not.toContain("answer");
  });
});

describe("jeu libre : constellation", () => {
  const data: FreePlayData = {
    ...base,
    id: "constellation",
    rounds: ["placement", "paires"],
    layouts: [
      { kind: "placement", id: "a", level: 2, cols: 4, rows: 3, memorize_seconds: 5, cells: [[0, 0], [3, 2]], symbols: ["x", "y"] },
      { kind: "paires", id: "b", level: 5, cols: 5, rows: 1, cards: ["x", "y", "etoile", "y", "x"] },
    ],
  };

  it("vérifie les cases, donne les indices de position, puis les paires", () => {
    let r = freeAttempt(data, initialFreeState(), { round: 0, cells: [[0, 0], [1, 1]] });
    expect(r.result.correct).toBe(false);
    r = freeAttempt(data, r.state, { round: 0, cells: [[0, 0], [1, 1]] });
    expect(r.result.hints).toEqual(["Il y a 2 symboles à retrouver : comptez-les bien !"]);
    r = freeAttempt(data, r.state, { round: 0, cells: [[3, 2], [0, 0]] });
    expect(r.result).toMatchObject({ correct: true, step: 1, completed: false, hints: [] });
    expect(freeGame(data, r.state).content).toMatchObject({ round: 1, layout: { kind: "paires" } });
    expect(freeAttempt(data, r.state, { round: 1, pairs: [[0, 4], [1, 2]] }).result.correct).toBe(false);
    expect(freeAttempt(data, r.state, { round: 1, pairs: [[0, 4], [1, 3]] }).result).toMatchObject({ correct: true, completed: true });
  });
});

describe("jeu libre : tournée du traîneau", () => {
  const data: FreePlayData = {
    ...base,
    id: "tournee",
    hints: ["h1", "h2"],
    settings: { label: "Facile", duration: 120, gifts_required: 25, lives: 5, speed_start: 0.2, speed_end: 0.3, gap_start: 2, gap_end: 2, double_chance: 0, gifts_per_gap: 2 },
  };

  it("applique les règles du niveau et les indices après les vols manqués", () => {
    const run = { level: "facile", finished: true, hits: 4, seconds: 118, progress: 1, gifts: 25 };
    let r = freeAttempt(data, initialFreeState(), { ...run, gifts: 24 });
    r = freeAttempt(data, r.state, { ...run, hits: 5 });
    expect(r.result).toMatchObject({ correct: false, hints: ["h1"] });
    expect(freeAttempt(data, r.state, run).result).toMatchObject({ correct: true, completed: true });
  });
});
