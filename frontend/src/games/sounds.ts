/** Petits sons générés (Web Audio) : aucun fichier, aucune connexion externe. */

const KEY = "noel-lutins-sound";
let ctx: AudioContext | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* stockage indisponible */
  }
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = "sine", gain = 0.15) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function sweep(from: number, to: number, start: number, duration: number, gain = 0.12) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sawtooth";
  const t0 = ctx.currentTime + start;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function play(fn: () => void) {
  if (!soundEnabled()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    fn();
  } catch {
    /* audio indisponible */
  }
}

export const sfx = {
  tap: () => play(() => tone(880, 0, 0.08, "triangle", 0.08)),
  wrong: () => play(() => { tone(220, 0, 0.18, "square", 0.06); tone(180, 0.15, 0.25, "square", 0.06); }),
  success: () => play(() => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, "triangle"))),
  fanfare: () =>
    play(() => [523, 659, 784, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.14, 0.45, "triangle", 0.14))),
  /** Grelots : petites notes aiguës rapides. */
  jingle: () => play(() => [2093, 2637, 2349, 2794, 2093, 3136].forEach((f, i) => tone(f, i * 0.07, 0.25, "sine", 0.07))),
  /** Machine qui hoquette : son amusant pour une erreur. */
  boing: () => play(() => { sweep(420, 90, 0, 0.35); sweep(300, 70, 0.3, 0.3, 0.08); }),
  bell: () => play(() => { tone(1568, 0, 1.2, "sine", 0.1); tone(2093, 0.02, 1, "sine", 0.05); }),
};
