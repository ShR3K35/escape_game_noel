import type { Phase, TeamStatus } from "./types";

export const PHASES: Phase[] = ["PREPARATION", "INTRO", "ENQUETE", "FINALE", "VICTOIRE", "SECOURS", "FIN"];

export const PHASE_LABELS: Record<Phase, string> = {
  PREPARATION: "Préparation",
  INTRO: "Introduction",
  ENQUETE: "Enquête",
  FINALE: "Finale",
  VICTOIRE: "Victoire",
  SECOURS: "Secours des lutins",
  FIN: "Fin de partie",
};

/** Doit rester aligné avec PHASE_TRANSITIONS côté backend (app/services/game.py). */
export const NEXT_PHASES: Record<Phase, Phase[]> = {
  PREPARATION: ["INTRO"],
  INTRO: ["ENQUETE"],
  ENQUETE: ["FINALE", "VICTOIRE", "SECOURS"],
  FINALE: ["VICTOIRE", "SECOURS"],
  VICTOIRE: ["FIN"],
  SECOURS: ["VICTOIRE", "FIN"],
  FIN: [],
};

export const CRITICAL_PHASES: Phase[] = ["VICTOIRE", "SECOURS"];

export const TEAM_LABELS: Record<TeamStatus, string> = {
  NON_COMMENCE: "Non commencée",
  EN_COURS: "En cours",
  VALIDEE: "Validée",
};

export const AMBIENT_LABELS: Record<string, string> = {
  aucun: "Aucune",
  neige: "Neige",
  etoiles: "Étoiles",
  magie: "Poussière magique",
};

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}h${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
