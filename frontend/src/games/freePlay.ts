/**
 * Jeu libre (salle de jeux) : les jeux des missions rejoués après la mission, au niveau choisi par les lutins.
 * Le serveur envoie toute la partie, réponses comprises ; la tablette vérifie elle-même, comme le ferait
 * le serveur pendant la mission (mêmes règles, mêmes indices), sans toucher à la progression.
 */
import type {
  AttemptResult,
  ConstellationContent,
  FreePlayData,
  KidsGame,
  MachineContent,
  PlacementLayout,
  TourneeContent,
} from "../services/types";

export interface FreeState {
  /** Manche ou commande en cours. */
  step: number;
  /** Machine : mauvaises réponses déjà essayées sur la commande en cours. */
  eliminated: number[];
  /** Constellation : essais manqués sur la manche en cours. */
  misses: number;
  /** Tournée : vols manqués. */
  failures: number;
  completed: boolean;
}

export const initialFreeState = (): FreeState => ({ step: 0, eliminated: [], misses: 0, failures: 0, completed: false });

function where([col, r]: [number, number], rows: number): string {
  const line = r === 0 ? "tout en haut" : r === rows - 1 ? "tout en bas" : `sur la ligne n°${r + 1} en partant du haut`;
  return `Un symbole se cachait ${line}, dans la case n°${col + 1} en partant de la gauche.`;
}

function hints(data: FreePlayData, st: FreeState): string[] {
  if (st.completed) return [];
  const per = data.attempts_per_hint;
  if (data.id === "machine") return st.eliminated.length >= per ? [data.orders[st.step].hint] : [];
  if (data.id === "constellation") {
    const layout = data.layouts[st.step];
    if (layout.kind !== "placement") return [];
    const all = [
      `Il y a ${layout.cells.length} symboles à retrouver : comptez-les bien !`,
      ...[...layout.cells].reverse().slice(0, 2).map((c) => where(c, layout.rows)),
    ];
    return all.slice(0, Math.min(all.length, Math.floor(st.misses / per)));
  }
  return data.hints.slice(0, Math.min(data.hints.length, Math.floor(st.failures / per)));
}

/** La partie vue comme un jeu de mission : les composants des mini-jeux s'utilisent tels quels. */
export function freeGame(data: FreePlayData, st: FreeState): KidsGame {
  const base = { id: data.id, title: data.title, status: "available" as const, step: st.step, reward: null, hints: hints(data, st) };
  if (data.id === "machine") {
    const { text, choices, level } = data.orders[Math.min(st.step, data.orders.length - 1)];
    const content: MachineContent = {
      title: data.title, instructions: data.instructions, intro: data.intro, total: data.orders.length,
      eliminated: st.eliminated, order: { text, choices, level },
    };
    return { ...base, content };
  }
  if (data.id === "constellation") {
    const round = Math.min(st.step, data.rounds.length - 1);
    const content: ConstellationContent = {
      title: data.title, instructions: data.instructions, round, total: data.rounds.length, rounds: data.rounds,
      layout: data.layouts[round],
    };
    return { ...base, content };
  }
  const content: TourneeContent = { title: data.title, instructions: data.instructions, level: data.level, settings: data.settings };
  return { ...base, content };
}

function checkPlacement(layout: PlacementLayout, cells: unknown): boolean {
  if (!Array.isArray(cells) || cells.length !== layout.cells.length) return false;
  const want = new Set(layout.cells.map(([c, r]) => `${c},${r}`));
  const got = new Set(cells.map((x) => (Array.isArray(x) ? `${x[0]},${x[1]}` : "")));
  return got.size === want.size && [...got].every((k) => want.has(k));
}

function checkPairs(cards: string[], pairs: unknown): boolean {
  if (!Array.isArray(pairs)) return false;
  const used = new Set<number>();
  for (const p of pairs) {
    if (!Array.isArray(p)) return false;
    const [a, b] = p as [number, number];
    if (a === b || used.has(a) || used.has(b) || !(a in cards) || !(b in cards)) return false;
    if (cards[a] !== cards[b] || cards[a] === "etoile") return false;
    used.add(a).add(b);
  }
  return used.size === cards.filter((c) => c !== "etoile").length;
}

/** Vérifie un essai et renvoie le nouvel état ; lève une erreur pour un essai périmé (double clic). */
export function freeAttempt(data: FreePlayData, st: FreeState, raw: unknown): { state: FreeState; result: AttemptResult } {
  const answer = (raw ?? {}) as Record<string, unknown>;
  let next: FreeState = { ...st };
  let correct: boolean;
  if (st.completed) {
    correct = true;
  } else if (data.id === "machine") {
    if (answer.order !== st.step) throw new Error("commande déjà terminée");
    const order = data.orders[st.step];
    correct = answer.answer === order.answer;
    if (correct) {
      next = { ...next, step: st.step + 1, eliminated: [], completed: st.step + 1 >= data.orders.length };
    } else if (typeof answer.answer === "number" && order.choices.includes(answer.answer) && !st.eliminated.includes(answer.answer)) {
      next.eliminated = [...st.eliminated, answer.answer];
    }
  } else if (data.id === "constellation") {
    if (answer.round !== st.step) throw new Error("manche déjà terminée");
    const layout = data.layouts[st.step];
    correct = layout.kind === "placement" ? checkPlacement(layout, answer.cells) : checkPairs(layout.cards, answer.pairs);
    next = correct
      ? { ...next, step: st.step + 1, misses: 0, completed: st.step + 1 >= data.rounds.length }
      : { ...next, misses: st.misses + 1 };
  } else {
    const s = data.settings;
    const hits = Number(answer.hits), seconds = Number(answer.seconds), gifts = Number(answer.gifts);
    // Même tolérance que le serveur : le chronomètre de la tablette s'arrête pendant les pauses.
    correct = answer.finished === true && hits < s.lives && seconds >= s.duration - 3 && gifts >= s.gifts_required;
    next = correct ? { ...next, completed: true } : { ...next, failures: st.failures + 1 };
  }
  const result: AttemptResult = {
    correct, completed: next.completed, step: next.step, hints: hints(data, next), reward: null,
    ...(data.id === "machine" ? { eliminated: next.eliminated } : {}),
  };
  return { state: next, result };
}
