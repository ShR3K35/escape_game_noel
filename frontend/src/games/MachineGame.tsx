import { useEffect, useRef, useState, type CSSProperties, type Ref } from "react";

import type { AttemptResult, MachineContent } from "../services/types";
import { BigButton, COLOR_HEX, type GameProps } from "./shared";
import { sfx } from "./sounds";

type Phase = "idle" | "flying" | "good" | "bad";

const GIFT_COLORS = ["rouge", "vert", "bleu", "or"] as const;
const FLY_MS = 550;
const GOOD_MS = 1500;
const BAD_MS = 1300;

/** Engrenage SVG : quelques dents, une seule rotation CSS (transform). */
function Gear({ cx, cy, r, color, speed, reverse = false, spinning }: {
  cx: number; cy: number; r: number; color: string; speed: number; reverse?: boolean; spinning: boolean;
}) {
  const style: CSSProperties = {
    transformBox: "fill-box",
    transformOrigin: "center",
    animation: spinning ? `spin-slow ${speed}s linear infinite${reverse ? " reverse" : ""}` : undefined,
  };
  return (
    <g style={style}>
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x={cx - r * 0.18} y={cy - r * 1.22} width={r * 0.36} height={r * 0.5} rx={2} fill={color} transform={`rotate(${i * 45} ${cx} ${cy})`} />
      ))}
      <circle cx={cx} cy={cy} r={r} fill={color} />
      <circle cx={cx} cy={cy} r={r * 0.38} fill="#3b2416" />
    </g>
  );
}

/** La grande machine à emballer : engrenages, voyant, cheminée, bouche d'entrée. */
export function Machine({ phase, broken = false, mouthRef }: {
  phase: Phase; broken?: boolean; mouthRef?: Ref<SVGRectElement>;
}) {
  const lamp = broken ? "#7a1a2c" : phase === "good" ? "#4ade80" : phase === "bad" ? "#ef4444" : "#ddbf72";
  const spinning = !broken;
  return (
    <div className={`relative ${phase === "bad" ? "animate-shake" : ""}`} data-testid="machine" data-phase={broken ? "broken" : phase}>
      <svg viewBox="0 0 220 190" className="h-full w-full" aria-hidden>
        {/* cheminée */}
        <rect x="160" y="8" width="26" height="40" rx="3" fill="#553521" />
        <rect x="155" y="4" width="36" height="10" rx="3" fill="#3b2416" />
        {/* corps */}
        <rect x="14" y="40" width="192" height="130" rx="22" fill="#9b2638" stroke="#5a0f1f" strokeWidth="5" />
        <rect x="14" y="40" width="192" height="130" rx="22" fill={phase === "good" ? "#ecd9a0" : "transparent"} opacity="0.35" />
        <rect x="26" y="52" width="168" height="10" rx="5" fill="#c9a24b" />
        {/* bouche d'entrée */}
        <rect ref={mouthRef} x="70" y="22" width="80" height="26" rx="6" fill="#24150c" stroke="#c9a24b" strokeWidth="4" />
        {/* engrenages */}
        <Gear cx={62} cy={108} r={24} color="#c9a24b" speed={6} spinning={spinning} />
        <Gear cx={104} cy={128} r={15} color="#ddbf72" speed={4} reverse spinning={spinning} />
        {/* hublot : le cadeau s'y emballe */}
        <circle cx="158" cy="110" r="30" fill="#fbf6ea" stroke="#c9a24b" strokeWidth="6" />
        {phase === "good" && (
          <g style={{ animation: "pop 0.45s cubic-bezier(0.2, 1.4, 0.4, 1) both", transformBox: "fill-box", transformOrigin: "center" }}>
            <rect x="140" y="94" width="36" height="32" rx="4" fill="#2f6f3c" />
            <rect x="155" y="94" width="6" height="32" fill="#ddbf72" />
            <rect x="140" y="107" width="36" height="6" fill="#ddbf72" />
            <path d="M158 94 q-12 -14 -14 -2 q8 4 14 2 q12 -14 14 -2 q-8 4 -14 2" fill="#c8102e" />
          </g>
        )}
        {broken && <text x="158" y="122" textAnchor="middle" fontSize="34">💤</text>}
        {/* voyant */}
        <circle cx="34" cy="150" r="9" fill={lamp} stroke="#24150c" strokeWidth="3" />
        {/* pieds */}
        <rect x="34" y="168" width="26" height="16" rx="4" fill="#3b2416" />
        <rect x="160" y="168" width="26" height="16" rx="4" fill="#3b2416" />
      </svg>
      {/* fumée amusante en cas d'erreur (3 bouffées) */}
      {phase === "bad" &&
        [0, 1, 2].map((i) => (
          <span
            key={i}
            className="absolute h-12 w-12 rounded-full bg-gray-200 shadow"
            style={{ left: "70%", top: "-6%", animation: `puff 1.1s ease-out ${i * 0.18}s both`, ["--dx" as string]: `${(i - 1) * 18}px` }}
          />
        ))}
      {/* étincelles magiques (5) */}
      {phase === "good" &&
        [0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="absolute h-4 w-4 rotate-45 rounded-sm bg-or-300 shadow-[0_0_8px_#ecd9a0]"
            style={{
              left: `${55 + i * 8}%`,
              top: "45%",
              animation: `sparkle 0.9s ease-out ${i * 0.08}s both`,
              ["--dx" as string]: `${(i - 2) * 22}px`,
              ["--dy" as string]: `${-40 - (i % 2) * 25}px`,
            }}
          />
        ))}
    </div>
  );
}

/** Cadeau-réponse : grosse zone tactile, nombre bien lisible. */
function AnswerGift({ value, color, state, flyStyle, onPick, innerRef }: {
  value: number;
  color: string;
  state: "ready" | "out" | "picked" | "waiting";
  flyStyle?: CSSProperties;
  onPick: () => void;
  innerRef: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={innerRef}
      type="button"
      data-choice={value}
      disabled={state !== "ready"}
      onClick={onPick}
      aria-label={state === "out" ? `${value} : pas celui-là` : `cadeau ${value}`}
      className={`relative flex h-24 w-full max-w-36 short:h-20 items-center justify-center justify-self-center rounded-2xl border-b-[6px] border-black/25 shadow-lg ${
        state === "out" ? "opacity-30 grayscale" : ""
      }`}
      style={{ background: COLOR_HEX[color], transition: `transform ${FLY_MS}ms ease-in, opacity 300ms`, ...flyStyle }}
    >
      <span className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 bg-or-300" />
      <span className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 bg-or-300" />
      <span className="relative rounded-xl border-2 border-or-500 bg-white px-3 py-1 text-4xl font-black text-encre shadow">{value}</span>
      {state === "out" && <span className="absolute -right-2 -top-3 text-3xl">❌</span>}
    </button>
  );
}

export function MachineGame({ game, submit }: GameProps<MachineContent>) {
  const c = game.content;
  const [started, setStarted] = useState(game.step > 0 || c.eliminated.length > 0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [picked, setPicked] = useState<number | null>(null);
  const [fly, setFly] = useState<{ x: number; y: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [localOut, setLocalOut] = useState<number[]>([]);
  // Commande affichée : figée pendant une animation pour ne pas changer de question en plein emballage.
  const [shown, setShown] = useState({ step: game.step, order: c.order });
  const [done, setDone] = useState(game.step);
  const mouth = useRef<SVGRectElement>(null);
  const gifts = useRef<Record<number, HTMLButtonElement | null>>({});
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (phase !== "idle") return;
    if (game.step !== shown.step || c.order.text !== shown.order.text) {
      setShown({ step: game.step, order: c.order });
      setLocalOut([]);
    }
    setDone(game.step);
  }, [phase, game.step, c.order, shown]);

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  const eliminated = shown.step === game.step ? [...new Set([...c.eliminated, ...localOut])] : localOut;

  const pick = async (value: number) => {
    if (phase !== "idle") return;
    sfx.tap();
    setHelpOpen(false);
    setPicked(value);
    setPhase("flying");
    // Le cadeau glisse jusqu'à la bouche de la machine.
    const from = gifts.current[value]?.getBoundingClientRect();
    const to = mouth.current?.getBoundingClientRect();
    if (from && to) setFly({ x: to.left + to.width / 2 - (from.left + from.width / 2), y: to.top + to.height / 2 - (from.top + from.height / 2) });
    const wait = new Promise((resolve) => setTimeout(resolve, FLY_MS));
    let result: AttemptResult | null = null;
    try {
      [result] = await Promise.all([submit({ order: shown.step, answer: value }), wait]);
    } catch {
      result = null;
    }
    setFly(null);
    if (!result) {
      setPhase("idle");
      setPicked(null);
      return;
    }
    if (result.correct) {
      sfx.jingle();
      setPhase("good");
      setDone(result.step);
      later(() => {
        setPhase("idle");
        setPicked(null);
      }, GOOD_MS);
    } else {
      sfx.boing();
      setLocalOut((o) => [...o, value]);
      setPhase("bad");
      later(() => {
        setPhase("idle");
        setPicked(null);
      }, BAD_MS);
    }
  };

  if (!started) {
    return (
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left" data-testid="machine-intro">
        <div className="h-44 w-52 shrink-0">
          <Machine phase="idle" broken />
        </div>
        <div className="flex-1">
          <p className="text-2xl font-black leading-snug text-bordeaux-800">{c.intro}</p>
          <BigButton
            className="mt-4"
            onClick={() => {
              sfx.bell();
              setStarted(true);
            }}
          >
            C'est parti ! 🎁
          </BigButton>
        </div>
      </div>
    );
  }

  const reader = (shown.step % 3) + 1;
  return (
    <div data-testid="machine-game" data-order={shown.step}>
      {/* compteur de progression, message de la machine, aide */}
      <div className="relative flex min-h-12 items-center justify-between gap-3">
        <div className="flex items-center gap-1" aria-label={`${done} cadeaux emballés sur ${c.total}`} data-testid="machine-counter">
          {Array.from({ length: c.total }).map((_, i) => (
            <span
              key={i}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border-2 text-lg ${
                i < done ? "animate-pop border-sapin-700 bg-sapin-600" : "border-encre/20 bg-white/60"
              }`}
            >
              {i < done ? "🎁" : ""}
            </span>
          ))}
          <span className="ml-2 text-xl font-black text-sapin-800">
            {done} / {c.total}
          </span>
        </div>
        <div className="flex-1 text-center" aria-live="polite">
          {phase === "good" && <p className="animate-pop text-2xl font-black text-sapin-700">Cadeau emballé ! 🔔</p>}
          {phase === "bad" && (
            <p role="alert" className="animate-pop text-xl font-black leading-tight text-bordeaux-700">
              Pouet ! Pas ce cadeau… essayez un autre !
            </p>
          )}
          {phase === "flying" && <p className="text-xl font-bold text-sapin-800">La machine réfléchit… ⚙️</p>}
        </div>
        <button
          type="button"
          onClick={() => {
            sfx.tap();
            setHelpOpen(!helpOpen);
          }}
          aria-expanded={helpOpen}
          className="min-h-12 shrink-0 rounded-2xl border-b-4 border-or-700 bg-or-400 px-4 text-lg font-black text-bois-950"
        >
          {helpOpen ? "✖ Fermer" : "❓ Aide"}
        </button>
        {helpOpen && (
          <div
            className="animate-pop absolute right-0 top-full z-30 mt-2 w-full max-w-xl space-y-1 rounded-2xl border-4 border-or-500 bg-parchemin-50 p-4 text-lg font-bold text-encre shadow-2xl"
            role="note"
            onClick={() => setHelpOpen(false)}
          >
            <p>🎯 {c.instructions}</p>
            <p>🧝 Un lutin lit la commande à voix haute, les autres écoutent bien.</p>
            <p>🔎 « chacun », « de … », « par » : on multiplie. « en tout », « encore » : on ajoute. « il reste » : on enlève.</p>
            <p>✏️ Calculez ensemble, sur vos doigts ou sur une feuille, puis touchez le cadeau !</p>
            {game.hints.length === 0 && <p className="text-encre/60">Après deux erreurs, la machine vous donne un indice.</p>}
          </div>
        )}
      </div>

      {/* panneau de commande (+ indice) et machine */}
      <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="rounded-2xl border-4 border-bois-700 bg-bois-800 p-3 text-white shadow-inner short:py-2" data-testid="machine-order">
          <p className="text-sm font-black uppercase tracking-wider text-or-300">
            Commande {Math.min(shown.step + 1, c.total)} sur {c.total} · 🧝 Lutin n°{reader}, à toi de lire !
          </p>
          <p key={shown.order.text} className="animate-fade-in mt-1 text-2xl font-black leading-snug short:text-xl">
            {shown.order.text}
          </p>
          {game.hints.map((h) => (
            <p key={h} className="animate-pop mt-2 rounded-xl bg-or-300 px-3 py-1 text-lg font-bold leading-snug text-bois-950" data-testid="machine-hint">
              💡 Indice : {h}
            </p>
          ))}
        </div>
        <div className="h-36 w-40 sm:h-40 sm:w-48 short:h-32 short:w-36">
          <Machine phase={phase} mouthRef={mouth} />
        </div>
      </div>

      {/* tapis roulant + cadeaux-réponses (pas de overflow-hidden : le cadeau doit pouvoir voler jusqu'à la machine) */}
      <div className="relative mt-2 rounded-2xl bg-bois-900 px-3 pb-5 pt-2">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-4 overflow-hidden rounded-b-2xl">
          <div
            className="h-full w-[calc(100%+40px)]"
            style={{
              background: "repeating-linear-gradient(90deg, #24150c 0 20px, #553521 20px 40px)",
              animation: "belt 1.2s linear infinite",
            }}
          />
        </div>
        <div className="relative grid grid-cols-4 gap-3">
          {shown.order.choices.map((v, i) => {
            const isPicked = picked === v;
            const out = eliminated.includes(v) && !(isPicked && phase !== "idle");
            const state = out ? "out" : phase !== "idle" ? (isPicked ? "picked" : "waiting") : "ready";
            const flyStyle: CSSProperties | undefined =
              isPicked && fly ? { transform: `translate(${fly.x}px, ${fly.y}px) scale(0.35)`, zIndex: 20 }
                : isPicked && phase === "good" ? { opacity: 0, transform: "scale(0.3)", transition: "none" }
                  : undefined;
            return (
              <AnswerGift
                key={`${shown.step}-${v}`}
                value={v}
                color={GIFT_COLORS[i % GIFT_COLORS.length]}
                state={state}
                flyStyle={flyStyle}
                onPick={() => void pick(v)}
                innerRef={(el) => {
                  gifts.current[v] = el;
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
