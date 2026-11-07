export type Phase = "PREPARATION" | "INTRO" | "ENQUETE" | "FINALE" | "VICTOIRE" | "SECOURS" | "FIN";
export type TeamStatus = "NON_COMMENCE" | "EN_COURS" | "VALIDEE";
export type KidsGameId = "constellation" | "machine" | "tournee" | "code";

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
  /** Compte à rebours avant l'intro (phase PREPARATION uniquement). */
  countdown: { until: string } | null;
}

export interface TeamSummary {
  id: string;
  name: string;
  theme: string;
  color: string;
  status: TeamStatus;
  /** Mot code de l'équipe, révélé une fois la mission validée (toujours présent côté admin). */
  code_word: string | null;
  /** Ordre de validation (1 = première équipe à terminer), null si la mission n'est pas validée. */
  rank: number | null;
  /** Points de mission : 5 pour la 1re équipe validée, 4, 3 puis 2. */
  mission_points: number;
  /** Points bonus : 1 par mission personnelle réussie par un joueur (ajoutés par l'admin). */
  bonus: number;
  /** Total : points de mission + bonus. */
  points: number;
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
  /** Protocole d'urgence autorisé : l'action 5 du boîtier Matter lance le secours des lutins. */
  emergency_authorized: boolean;
}

export interface Reward {
  symbol: string;
  label: string;
  digit: number;
}

export type MemoryKind = "placement" | "paires";

/** Manche « placement » : des symboles s'affichent puis disparaissent, on retrouve leurs cases. */
export interface PlacementLayout {
  kind: "placement";
  id: string;
  level: number;
  cols: number;
  rows: number;
  memorize_seconds: number;
  cells: [number, number][];
  symbols: string[];
}

/** Manche « paires » : memory classique (« etoile » : carte seule, face visible). */
export interface PairsLayout {
  kind: "paires";
  id: string;
  level: number;
  cols: number;
  rows: number;
  cards: string[];
}

export interface ConstellationContent {
  title: string;
  instructions: string;
  /** Manche en cours (à partir de 0). */
  round: number;
  total: number;
  rounds: MemoryKind[];
  layout: PlacementLayout | PairsLayout;
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

/** Réglages d'un niveau de « La tournée du traîneau » (voir config/game.yaml). */
export interface TourneeSettings {
  label: string;
  /** Durée du vol (s) : la même à tous les niveaux. */
  duration: number;
  /** Cadeaux à attraper pour réussir. */
  gifts_required: number;
  lives: number;
  speed_start: number;
  speed_end: number;
  gap_start: number;
  gap_end: number;
  double_chance: number;
  /** Cadeaux alignés entre deux obstacles. */
  gifts_per_gap: number;
}

export interface TourneeContent {
  title: string;
  instructions: string;
  level: string;
  settings: TourneeSettings;
}

export interface TourneeRun {
  level: string;
  finished: boolean;
  hits: number;
  progress: number;
  gifts: number;
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
  content: ConstellationContent | MachineContent | TourneeContent | CodeContent | null;
  attempts?: number;
  failures?: number;
  completed_by_admin?: boolean;
  completed_at?: string | null;
  /** Admin uniquement : commande en cours de la machine à cadeaux, avec sa réponse. */
  current_order?: { number: number; total: number; text: string; calc: string; answer: number };
  /** Admin uniquement : manche en cours et niveaux de « La constellation ». */
  memory?: {
    round: number;
    total: number;
    rounds: MemoryKind[];
    placement: { current: number; levels: number[] };
    paires: { current: number; levels: number[] };
  };
  /** Admin uniquement : niveau de la tournée du traîneau et dernier vol. */
  difficulty?: {
    current: string;
    last_run: TourneeRun | null;
    duration: number;
    levels: { id: string; label: string; lives: number; gifts_required: number }[];
  };
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
