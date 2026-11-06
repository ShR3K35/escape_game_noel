import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

import type { TourneeContent } from "../services/types";
import { BigButton, Hints, type GameProps } from "./shared";
import { sfx } from "./sounds";
import { createRenderer, type Renderer } from "./tournee/draw";
import {
  OUTRO_S, createWorld, laneFromY, livesLeft, moveLane, progress, setLane, step, type World, type WorldEvent,
} from "./tournee/engine";

type Phase = "intro" | "countdown" | "playing" | "paused" | "ending" | "lost" | "sending";

function sounds(events: WorldEvent[]) {
  for (const e of events) {
    if (e === "hit") sfx.crash();
    else if (e === "gift") sfx.gift();
    else if (e === "won") sfx.jingle();
  }
}

/** Hauteur du terrain : le plus grand possible sans dépasser l'écran (tablette en paysage). */
function fitHeight(el: HTMLElement): number {
  const top = el.getBoundingClientRect().top + window.scrollY;
  const free = window.innerHeight - top - 12;
  return Math.round(Math.max(240, Math.min(free, el.clientWidth * 0.62)));
}

export function TourneeGame({ game, submit }: GameProps<TourneeContent>) {
  const c = game.content;
  const [phase, setPhase] = useState<Phase>("intro");
  const [count, setCount] = useState(3);
  const [height, setHeight] = useState(360);
  const [result, setResult] = useState<{ progress: number; gifts: number; hits: number } | null>(null);
  const [error, setError] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const world = useRef<World | null>(null);
  const level = useRef(c.level);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  // --- dimensions
  useEffect(() => {
    const el = wrap.current;
    const canvas = cv.current;
    if (!el || !canvas) return;
    renderer.current = createRenderer(canvas);
    const apply = () => {
      const h = fitHeight(el);
      setHeight(h);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.current?.resize(el.clientWidth, h, dpr);
      if (world.current) world.current.aspect = el.clientWidth / h;
    };
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  const send = useCallback(
    async (w: World, finished: boolean) => {
      const run = { level: level.current, finished, hits: w.hits, seconds: Math.round(w.t * 10) / 10, progress: progress(w), gifts: w.gifts };
      setResult({ progress: run.progress, gifts: run.gifts, hits: run.hits });
      setPhase("sending");
      setError(false);
      try {
        const r = await submit(run);
        // Réussite : la page affiche « Bravo » et referme le jeu. Sinon on propose de recommencer.
        if (!r.correct) setPhase("lost");
      } catch {
        setError(true);
        setPhase("lost");
      }
    },
    [submit],
  );

  // --- boucle d'animation
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let ending = 0;
    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const w = world.current;
      const p = phaseRef.current;
      if (w && (p === "playing" || p === "ending")) {
        const events = step(w, dt);
        sounds(events);
        if (events.includes("won") || events.includes("lost")) {
          ending = now;
          setPhase("ending");
        }
        if (p === "ending" && now - ending > (w.status === "won" ? OUTRO_S : 1.1) * 1000 && ending) {
          ending = 0;
          void send(w, w.status === "won");
        }
      }
      renderer.current?.draw(w, now, !w || p === "intro");
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [send]);

  // --- départ : 3, 2, 1, partez !
  const start = () => {
    const el = wrap.current;
    level.current = c.level;
    world.current = createWorld(c.settings, el ? el.clientWidth / height : 2);
    setResult(null);
    setCount(3);
    setPhase("countdown");
    sfx.beep();
  };

  useEffect(() => {
    if (phase !== "countdown") return;
    const t = setTimeout(() => {
      if (count > 1) {
        setCount(count - 1);
        sfx.beep();
      } else {
        sfx.beep(true);
        setPhase("playing");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [phase, count]);

  // --- pause automatique si la tablette se met en veille ou change d'onglet
  useEffect(() => {
    const onHide = () => {
      if (document.hidden && phaseRef.current === "playing") setPhase("paused");
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // --- clavier (PC) : flèches, Z/W et S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const w = world.current;
      if (!w || phaseRef.current !== "playing") return;
      const up = ["ArrowUp", "KeyW", "KeyZ"].includes(e.code);
      const down = ["ArrowDown", "KeyS"].includes(e.code);
      if (!up && !down) return;
      e.preventDefault();
      if (moveLane(w, up ? -1 : 1).length) sfx.whoosh();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- tactile / souris : le traîneau va dans le couloir touché (et suit le doigt)
  const steer = (e: PointerEvent<HTMLDivElement>) => {
    const w = world.current;
    if (!w || phaseRef.current !== "playing" || !wrap.current) return;
    const rect = wrap.current.getBoundingClientRect();
    if (setLane(w, laneFromY((e.clientY - rect.top) / rect.height)).length) sfx.whoosh();
  };

  const w = world.current;
  const s = c.settings;

  return (
    <div data-testid="tournee" data-phase={phase}>
      <div
        ref={wrap}
        className="relative w-full touch-none overflow-hidden rounded-3xl border-4 border-bois-800 bg-[#0a1433] shadow-xl"
        style={{ height }}
        onPointerDown={(e) => {
          if (phaseRef.current === "playing") e.currentTarget.setPointerCapture?.(e.pointerId);
          steer(e);
        }}
        onPointerMove={(e) => e.buttons && steer(e)}
        data-testid="tournee-field"
      >
        <canvas ref={cv} className="absolute inset-0 h-full w-full" aria-label="Le traîneau du Père Noël survole le village" />

        {phase === "playing" && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setPhase("paused")}
            className="absolute right-2 top-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-black/40 text-lg font-black text-white"
            aria-label="Pause"
          >
            ❚❚
          </button>
        )}

        {phase === "intro" && (
          <Overlay>
            <p className="text-2xl font-black text-or-300 sm:text-3xl short:text-xl">🎅 Ho ho ho ! Le traîneau doit traverser le village !</p>
            <p className="mt-2 max-w-2xl text-lg font-bold text-white sm:text-xl short:mt-1 short:text-base">
              {c.instructions}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-base font-bold text-white short:mt-2">
              <span className="rounded-xl bg-white/15 px-3 py-1">👆 Touchez en haut, au milieu ou en bas</span>
              <span className="rounded-xl bg-white/15 px-3 py-1">⌨️ ou flèches ↑ ↓</span>
              <span className="rounded-xl bg-white/15 px-3 py-1" data-testid="tournee-lives">
                {"❤️".repeat(Math.min(s.lives, 9))} {s.lives} vies
              </span>
              <span className="rounded-xl bg-white/15 px-3 py-1">⏱ {s.duration} s · {s.label}</span>
            </div>
            <BigButton tone="gold" className="mt-4 text-2xl short:mt-2" onClick={start}>
              ▶ C'est parti !
            </BigButton>
          </Overlay>
        )}

        {phase === "countdown" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span key={count} className="animate-pop font-display text-9xl font-black text-or-300 drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)]">
              {count}
            </span>
          </div>
        )}

        {phase === "paused" && (
          <Overlay>
            <p className="text-4xl font-black text-or-300">Pause</p>
            <p className="mt-2 text-lg font-bold text-white">Le traîneau attend dans les nuages…</p>
            <BigButton tone="gold" className="mt-4 text-2xl" onClick={() => setPhase("playing")}>
              ▶ Reprendre
            </BigButton>
          </Overlay>
        )}

        {phase === "sending" && w?.status === "won" && (
          <Overlay>
            <p className="animate-pop text-4xl font-black text-or-300">Arrivés au village ! 🎉</p>
          </Overlay>
        )}

        {phase === "lost" && result && (
          <Overlay>
            <p className="text-3xl font-black text-or-300 short:text-2xl">
              {error ? "Oups ! Le Père Noël n'a pas reçu le message…" : "Oh non ! Le traîneau est tombé dans la neige !"}
            </p>
            <p className="mt-2 text-xl font-bold text-white" data-testid="tournee-result">
              Vous avez parcouru {Math.round(result.progress * 100)} % du chemin
              {result.gifts > 0 && ` et attrapé ${result.gifts} cadeau${result.gifts > 1 ? "x" : ""}`} !
            </p>
            <div className="mx-auto mt-2 h-4 w-72 overflow-hidden rounded-full bg-white/20">
              <div className="h-full bg-or-400" style={{ width: `${Math.round(result.progress * 100)}%` }} />
            </div>
            <BigButton tone="gold" className="mt-4 text-2xl short:mt-2" onClick={start}>
              ↻ Recommencer
            </BigButton>
          </Overlay>
        )}
      </div>
      {w && phase === "playing" && <p className="sr-only" aria-live="polite">{livesLeft(w)} vies</p>}
      {(phase === "intro" || phase === "lost") && <Hints hints={game.hints} />}
    </div>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a1433]/70 p-4 text-center"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
