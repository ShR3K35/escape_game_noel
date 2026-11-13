import type { AttemptResult, GameEvent, KidsGameId, Phase, TeamStatus } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Identifiant aléatoire utilisable hors contexte sécurisé (http://noel2026.local n'est pas HTTPS). */
export function uid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function request<T>(method: string, path: string, body?: unknown, idempotent = false): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotent) headers["Idempotency-Key"] = uid();
  const res = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : `Erreur ${res.status}`;
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

const post = <T = { changed?: boolean }>(path: string, body: unknown = {}) => request<T>("POST", path, body, true);

export const api = {
  // Authentification
  me: () => request<{ authenticated: boolean }>("GET", "/api/auth/me"),
  login: (password: string) => request<{ authenticated: boolean }>("POST", "/api/auth/login", { password }),
  logout: () => request("POST", "/api/auth/logout", {}),

  // Partie
  start: () => post("/api/admin/game/start"),
  countdown: (seconds: number) => post("/api/admin/game/countdown", { seconds }),
  cancelCountdown: () => post("/api/admin/game/countdown/cancel"),
  setPhase: (phase: Phase, confirm = false) => post("/api/admin/game/phase", { phase, confirm }),
  emergency: (authorized: boolean) => post("/api/admin/game/emergency", { authorized }),
  relayPulse: () => post<{ changed: boolean; pulse_ms?: number | null }>("/api/admin/relay/pulse"),
  reset: () => post("/api/admin/game/reset", { confirm: true }),
  backup: () => post<{ file: string }>("/api/admin/backup"),
  events: (limit = 200) => request<GameEvent[]>("GET", `/api/admin/events?limit=${limit}`),

  // Équipes
  setTeam: (teamId: string, status: TeamStatus) => post(`/api/admin/teams/${teamId}`, { status }),
  teamBonus: (teamId: string, delta: 1 | -1) => post(`/api/admin/teams/${teamId}/bonus`, { delta }),

  // Télévision
  play: (videoId: string) => post("/api/admin/tv/play", { video_id: videoId }),
  stop: () => post("/api/admin/tv/stop"),
  message: (body: { message_id?: string; title?: string; text?: string; duration?: number }) =>
    post("/api/admin/tv/message", body),
  clearMessage: () => post("/api/admin/tv/message/clear"),
  ambient: (ambient: string) => post("/api/admin/tv/ambient", { ambient }),
  tvProgress: (visible: boolean) => post("/api/admin/tv/progress", { visible }),
  tvEnded: (playId: string) => request("POST", "/api/tv/ended", { play_id: playId }),

  // Lutins
  kidsComplete: (gameId: KidsGameId) => post(`/api/admin/kids/${gameId}/complete`),
  kidsReset: (gameId: KidsGameId) => post(`/api/admin/kids/${gameId}/reset`),
  kidsDifficulty: (level: string) => post("/api/admin/kids/tournee/difficulty", { level }),
  kidsMemoryDifficulty: (kind: "placement" | "paires", level: number) =>
    post("/api/admin/kids/constellation/difficulty", { kind, level }),
  kidsResetAll: () => post("/api/admin/kids/reset", { confirm: true }),
  attempt: (gameId: KidsGameId, answer: unknown) =>
    request<AttemptResult>("POST", `/api/kids/games/${gameId}/attempt`, { answer }),

  // Planning
  scheduleUpdate: (itemId: string, body: { at?: string; enabled?: boolean }) =>
    post(`/api/admin/schedule/${itemId}`, body),
  scheduleFire: (itemId: string) => post(`/api/admin/schedule/${itemId}/fire`),
};
