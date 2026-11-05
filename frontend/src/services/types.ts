export type Phase = "PREPARATION" | "INTRO" | "ENQUETE" | "FINALE" | "VICTOIRE" | "SECOURS" | "FIN";
export type TeamStatus = "NON_COMMENCE" | "EN_COURS" | "VALIDEE";
export type KidsGameId = "constellation" | "machine" | "cadeaux" | "code";

export interface VideoInfo {
  id: string;
  title: string;
  url: string;
  file: string;
  available: boolean;
  fallback_text: string;
  fallback_seconds: number;
  kind?: "loop" | "message";
}

export interface TvPlay {
  play_id: string;
  started_at: string;
  video: VideoInfo;
}

export interface TvMessage {
  id: string;
  title: string;
  text: string;
  until: string;
}

export interface TvState {
  play: TvPlay | null;
  message: TvMessage | null;
  ambient: string;
  loop: VideoInfo;
  preload: string[];
  show_progress: boolean;
}

export interface TeamSummary {
  id: string;
  name: string;
  theme: string;
  color: string;
  status: TeamStatus;
}

export interface Team extends TeamSummary {
  enigma: string;
  description: string;
  updated_at: string | null;
}

export interface PublicState {
  server_time: string;
  title: string;
  phase: Phase;
  phase_changed_at: string | null;
  started_at: string | null;
  tv: TvState;
  teams: TeamSummary[];
  kids_summary: { completed: number; total: number };
  kids_games: { id: KidsGameId; title: string; status: "locked" | "available" | "completed" }[];
}

export interface Reward {
  symbol: string;
  label: string;
  digit: number;
}

export interface ConstellationContent {
  title: string;
  instructions: string;
  cols: number;
  rows: number;
  stars: [number, number][];
  memorize_seconds: number;
}

export interface MachineContent {
  title: string;
  instructions: string;
  intro: string;
  total: number;
  /** Réponses déjà essayées (fausses) pour la commande en cours. */
  eliminated: number[];
  order: { text: string; choices: number[]; level: number };
}

export type GiftColor = "rouge" | "vert" | "bleu";
export interface Gift {
  id: string;
  color: GiftColor;
  size: "petit" | "grand";
  symbol: "etoile" | "sapin" | "cloche";
}

export interface CadeauxContent {
  title: string;
  instructions: string;
  gifts: Gift[];
  rounds: { rule: "color" | "size" | "symbol"; instructions: string; bins: { value: string; label: string }[] }[];
}

export interface CodeContent {
  title: string;
  instructions: string;
  riddle: string;
  length: number;
}

export interface KidsGame {
  id: KidsGameId;
  title: string;
  status: "locked" | "available" | "completed";
  step: number;
  hints: string[];
  reward: Reward | null;
  content: ConstellationContent | MachineContent | CadeauxContent | CodeContent | null;
  attempts?: number;
  failures?: number;
  completed_by_admin?: boolean;
  completed_at?: string | null;
  /** Admin uniquement : commande en cours de la machine à cadeaux, avec sa réponse. */
  current_order?: { number: number; total: number; text: string; calc: string; answer: number };
}

export interface KidsView {
  games: KidsGame[];
  completed_count: number;
  total: number;
  all_completed: boolean;
  final: { title: string; message: string } | null;
}

export interface KidsState extends KidsView {
  server_time: string;
  phase: Phase;
}

export interface AttemptResult {
  correct: boolean;
  completed: boolean;
  step: number;
  hints: string[];
  reward?: Reward | null;
  eliminated?: number[];
  already_completed?: boolean;
}

export interface ScheduleItem {
  id: string;
  label: string;
  at: string;
  default_at: string;
  anchor: "start" | "clock";
  action: "video" | "phase" | "message";
  target: string;
  enabled: boolean;
  status: "pending" | "done" | "skipped";
  fired_at: string | null;
  due_at: string | null;
  note: string | null;
}

export interface GameEvent {
  id: number;
  ts: string;
  type: string;
  source: string;
  message: string;
  data: Record<string, unknown> | null;
}

export interface MessagePreset {
  id: string;
  title: string;
  text: string;
  duration: number;
}

export interface AdminState extends Omit<PublicState, "teams"> {
  teams: Team[];
  kids: KidsView;
  schedule: ScheduleItem[];
  videos: VideoInfo[];
  messages: MessagePreset[];
  ambients: string[];
  events: GameEvent[];
  time_scale: number;
  demo_mode: boolean;
  game: { title: string; start_time: string; end_time: string; timezone: string };
  connections: Record<string, number>;
}
