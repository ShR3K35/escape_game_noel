import type { TvPlay } from "../../services/types";

/** Une lecture plus ancienne que cela, découverte au (re)chargement de la TV, n'est pas rejouée. */
export const STALE_PLAY_MS = 10 * 60 * 1000;
export const FADE_MS = 600;

export type Screen =
  | { kind: "loop" }
  | { kind: "video"; play: TvPlay }
  | { kind: "fallback"; play: TvPlay };

export type PlayDecision = "keep" | "start" | "stop" | "discard";

/**
 * Que faire quand l'état serveur change ?
 * - keep    : rien à faire (même lecture, ou toujours la boucle)
 * - start   : nouvelle lecture à lancer (remplace la précédente : jamais deux lectures superposées)
 * - stop    : l'admin a arrêté la lecture -> retour au bureau
 * - discard : lecture trop ancienne trouvée au démarrage de la TV -> la clore sans la jouer
 */
export function decide(
  play: TvPlay | null,
  currentPlayId: string | null,
  serverNow: number,
  firstSnapshot: boolean,
): PlayDecision {
  if (!play) return currentPlayId ? "stop" : "keep";
  if (play.play_id === currentPlayId) return "keep";
  if (firstSnapshot && serverNow - Date.parse(play.started_at) > STALE_PLAY_MS) return "discard";
  return "start";
}

export function screenFor(play: TvPlay): Screen {
  return play.video.available ? { kind: "video", play } : { kind: "fallback", play };
}

export function messageVisible(until: string | undefined, serverNow: number): boolean {
  return !!until && Date.parse(until) > serverNow;
}
