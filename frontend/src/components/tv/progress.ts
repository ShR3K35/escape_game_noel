import type { KidsGameId, PublicState } from "../../services/types";

/** Durée d'affichage d'une animation de succès sur la TV. */
export const CELEBRATION_MS = 6500;

export const KIDS_ICONS: Record<KidsGameId, string> = { constellation: "✨", machine: "⚙️", tournee: "🎅", code: "🛷" };

export type Success =
  | {
      key: string;
      kind: "team";
      id: string;
      name: string;
      theme: string;
      color: string;
      codeWord: string | null;
      points: number;
    }
  | { key: string; kind: "kids"; id: KidsGameId; title: string; all: boolean };

/**
 * Compare deux états successifs et renvoie les nouveaux succès :
 * une équipe qui passe à VALIDEE, un mini-jeu qui passe à « completed ».
 * Aucun succès au premier état reçu (chargement de la page) : on ne rejoue pas l'historique.
 */
export function detectSuccesses(prev: PublicState | null, next: PublicState): Success[] {
  if (!prev) return [];
  const found: Success[] = [];
  const stamp = next.server_time;

  for (const team of next.teams) {
    const before = prev.teams.find((t) => t.id === team.id);
    if (team.status === "VALIDEE" && before && before.status !== "VALIDEE") {
      found.push({
        key: `team-${team.id}-${stamp}`,
        kind: "team",
        id: team.id,
        name: team.name,
        theme: team.theme,
        color: team.color,
        codeWord: team.code_word,
        points: team.mission_points,
      });
    }
  }

  const kidsDone = next.kids_games.filter((g) => g.status === "completed").length;
  const newKids = next.kids_games.filter((g) => {
    const before = prev.kids_games.find((p) => p.id === g.id);
    return g.status === "completed" && before && before.status !== "completed";
  });
  newKids.forEach((g, i) => {
    const last = i === newKids.length - 1;
    found.push({
      key: `kids-${g.id}-${stamp}`,
      kind: "kids",
      id: g.id,
      title: g.title,
      all: last && kidsDone === next.kids_games.length,
    });
  });
  return found;
}
