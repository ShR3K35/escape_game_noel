import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import dosCarte from "../assets/constellation/dos.webp";
import type { AttemptResult, ConstellationContent, MemoryKind, PairsLayout, PlacementLayout } from "../services/types";
import { BigButton, Feedback, Hints, type GameProps } from "./shared";
import { sfx } from "./sounds";
import { useAttempt } from "./useAttempt";

const files = import.meta.glob<string>("../assets/constellation/*.webp", { eager: true, import: "default" });
/** Illustration de chaque symbole, par identifiant (nom du fichier). */
export const SYMBOL_URL: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.split("/").pop()!.replace(".webp", ""), url]),
);

const LONE = "etoile";
const key = (c: number, r: number) => `${c},${r}`;
type Submit = (answer: unknown) => Promise<AttemptResult>;

const ROUND_LABEL: Record<MemoryKind, string> = { placement: "Symboles cachés", paires: "Les paires" };
const ROUND_INTRO: Record<MemoryKind, string> = {
  placement: "Regardez bien où sont les symboles… ils vont disparaître ! Touchez ensuite les cases où ils se cachaient.",
  paires: "Retournez les cartes deux par deux et retrouvez toutes les paires !",
};

/**
 * La grille remplit la zone de jeu sans la dépasser, en hauteur comme en largeur.
 * Unités cq* : dimensions du corps du jeu (conteneur de taille, voir KidsPage).
 * --reserve : hauteur prise par le reste (manches, consigne, boutons) ; --maxw : largeur disponible.
 */
function fit(cols: number, rows: number): CSSProperties {
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    width: `min(var(--maxw, 100%), calc((100cqh - var(--reserve, 200px)) / ${rows} * ${cols}))`,
  };
}

function SymbolImg({ id }: { id: string }) {
  return <img src={SYMBOL_URL[id]} alt="" draggable={false} className="pointer-events-none h-[82%] w-[82%] object-contain" />;
}

/** Repère doré posé par les enfants (dessiné : ne dépend pas des polices emoji de l'appareil). */
function Star() {
  return (
    <svg viewBox="0 0 24 24" className="h-[62%] w-[62%] drop-shadow-[0_0_14px_rgba(255,230,140,0.9)]" aria-hidden>
      <path d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.2L12 18l-6.4 3.5 1.4-7.2-5.3-5 7.2-.9z" fill="#ffd76a" stroke="#fff3c4" strokeWidth="0.8" />
    </svg>
  );
}

// ------------------------------------------------------------------ placement
function PlacementRound({ layout, round, submit, onCleared }: { layout: PlacementLayout; round: number; submit: Submit; onCleared: (r: AttemptResult) => void }) {
  const symbolAt = new Map(layout.cells.map(([c, r], i) => [key(c, r), layout.symbols[i]]));
  const count = layout.cells.length;
  const [mode, setMode] = useState<"memorize" | "place">("memorize");
  const [left, setLeft] = useState(layout.memorize_seconds);
  const [selected, setSelected] = useState<string[]>([]);
  const { state, attempt } = useAttempt(submit);

  useEffect(() => {
    if (mode !== "memorize") return;
    if (left <= 0) {
      setMode("place");
      return;
    }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [mode, left]);

  const review = () => {
    setLeft(layout.memorize_seconds);
    setMode("memorize");
  };

  const toggle = (k: string) => {
    if (mode !== "place") return;
    sfx.tap();
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length < count ? [...s, k] : s));
  };

  const check = async () => {
    const r = await attempt({ round, cells: selected.map((k) => k.split(",").map(Number)) });
    if (r?.correct) onCleared(r);
  };

  return (
    <div>
      <p className="text-center text-xl font-bold text-encre">
        {mode === "memorize" ? (
          <>
            Mémorisez les {count} symboles ! <span className="inline-block min-w-12 rounded-full bg-bordeaux-700 px-3 text-white">{left}</span>
          </>
        ) : (
          <>
            Touchez les cases où se cachaient les symboles : <strong data-testid="placement-count">{selected.length} / {count}</strong>
          </>
        )}
      </p>
      {/* En paysage peu haut : boutons à droite de la grille, pour lui laisser toute la hauteur. */}
      <div className="mt-3 flex flex-col items-center gap-4 [--reserve:190px] short:mt-2 short:flex-row short:justify-center short:[--maxw:calc(100cqw-13rem)] short:[--reserve:64px]">
      <div
        className={`grid shrink-0 gap-1.5 rounded-3xl bg-[radial-gradient(ellipse_at_top,#1d2b5c,#0b1430)] p-3 shadow-inner sm:gap-2 short:p-2 ${state === "wrong" ? "animate-shake" : ""}`}
        style={fit(layout.cols, layout.rows)}
        data-testid="sky"
      >
        {Array.from({ length: layout.rows }).flatMap((_, r) =>
          Array.from({ length: layout.cols }).map((__, col) => {
            const k = key(col, r);
            const symbol = mode === "memorize" ? symbolAt.get(k) : undefined;
            const picked = mode === "place" && selected.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-label={`case ${col + 1}-${r + 1}${symbol ? " symbole" : ""}${picked ? " choisie" : ""}`}
                data-cell={k}
                onClick={() => toggle(k)}
                className={`flex aspect-square items-center justify-center rounded-2xl transition ${
                  symbol ? "bg-parchemin-50 shadow-[0_0_18px_rgba(255,230,140,0.55)]" : picked ? "scale-105 bg-white/15" : "bg-white/[0.04] hover:bg-white/10"
                }`}
              >
                {symbol ? (
                  <span className="animate-pop flex h-full w-full items-center justify-center"><SymbolImg id={symbol} /></span>
                ) : picked ? (
                  <span className="animate-pop flex h-full w-full items-center justify-center"><Star /></span>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-white/25" />
                )}
              </button>
            );
          }),
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-3 short:w-48 short:flex-col short:items-stretch">
        {mode === "memorize" ? (
          <BigButton onClick={() => setMode("place")}>Je suis prêt ! 👍</BigButton>
        ) : (
          <>
            <BigButton tone="white" onClick={review}>
              👀 Revoir
            </BigButton>
            <BigButton tone="white" onClick={() => setSelected([])} disabled={!selected.length}>
              Effacer
            </BigButton>
            <BigButton tone="green" onClick={check} disabled={selected.length !== count || state === "checking"}>
              ✨ Valider
            </BigButton>
          </>
        )}
      </div>
      </div>
      <div className="mt-3 short:mt-1">
        <Feedback state={state} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- paires
function Card({ symbol, faceUp, found, onClick, index }: { symbol: string; faceUp: boolean; found: boolean; onClick: () => void; index: number }) {
  const lone = symbol === LONE;
  return (
    <button
      type="button"
      data-card={index}
      data-symbol={faceUp ? symbol : undefined}
      aria-label={faceUp ? `carte ${index + 1} : ${symbol}` : `carte ${index + 1}`}
      disabled={lone || found}
      onClick={onClick}
      className="memory-card aspect-square disabled:cursor-default"
    >
      <span className={`memory-card-inner ${faceUp ? "is-up" : ""}`}>
        <span className="memory-card-face memory-card-back">
          <img src={dosCarte} alt="" draggable={false} className="h-full w-full rounded-[inherit] object-cover" />
        </span>
        <span
          className={`memory-card-face memory-card-front ${found ? "is-found" : ""} ${
            lone ? "bg-[radial-gradient(circle,#2a3f86,#0b1430)]" : "bg-parchemin-50"
          }`}
        >
          <SymbolImg id={symbol} />
        </span>
      </span>
    </button>
  );
}

function PairsRound({ layout, round, submit, onCleared }: { layout: PairsLayout; round: number; submit: Submit; onCleared: (r: AttemptResult) => void }) {
  const cards = layout.cards;
  const total = cards.filter((s) => s !== LONE).length / 2;
  const [flipped, setFlipped] = useState<number[]>([]);
  const [pairs, setPairs] = useState<[number, number][]>([]);
  const [tries, setTries] = useState(0);
  const [sent, setSent] = useState(false);
  const { state, attempt } = useAttempt(submit);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const found = new Set(pairs.flat());
  const done = pairs.length === total;

  const send = async (all: [number, number][]) => {
    const r = await attempt({ round, pairs: all });
    if (r?.correct) {
      setSent(true);
      onCleared(r);
    }
  };

  const flip = (i: number) => {
    if (flipped.length === 2 || flipped.includes(i) || found.has(i) || cards[i] === LONE) return;
    sfx.tap();
    if (flipped.length === 0) {
      setFlipped([i]);
      return;
    }
    const a = flipped[0];
    setFlipped([a, i]);
    setTries((t) => t + 1);
    if (cards[a] === cards[i]) {
      timer.current = setTimeout(() => {
        sfx.gift();
        const next: [number, number][] = [...pairs, [a, i]];
        setPairs(next);
        setFlipped([]);
        if (next.length === total) void send(next);
      }, 450);
    } else {
      timer.current = setTimeout(() => setFlipped([]), 1100);
    }
  };

  return (
    <div>
      <p className="text-center text-xl font-bold text-encre">
        Paires trouvées : <strong data-testid="pairs-count">{pairs.length} / {total}</strong>
        <span className="ml-3 text-base font-semibold text-encre/60">({tries} essai{tries > 1 ? "s" : ""})</span>
      </p>
      <div
        className="mx-auto mt-3 grid gap-1.5 rounded-3xl bg-[radial-gradient(ellipse_at_top,#1d2b5c,#0b1430)] p-2 shadow-inner [--reserve:120px] sm:gap-2 sm:p-3 short:mt-2 short:p-2 short:[--reserve:64px]"
        style={fit(layout.cols, layout.rows)}
        data-testid="memory-board"
      >
        {cards.map((symbol, i) => (
          <Card key={i} index={i} symbol={symbol} faceUp={symbol === LONE || found.has(i) || flipped.includes(i)} found={found.has(i)} onClick={() => flip(i)} />
        ))}
      </div>
      {done && !sent && state !== "checking" && (
        <div className="mt-4 flex justify-center">
          <BigButton tone="green" onClick={() => void send(pairs)}>
            ✨ Valider
          </BigButton>
        </div>
      )}
      <div className="mt-3">
        <Feedback state={state} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------- jeu
/** Les manches s'affichent dans la barre de titre du jeu (une ligne de gagnée pour le plateau), sinon au-dessus. */
function RoundTracker({ rounds, current }: { rounds: MemoryKind[]; current: number }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById("game-toolbar")), []);
  const list = <RoundList rounds={rounds} current={current} inline={!slot} />;
  return slot ? createPortal(list, slot) : list;
}

function RoundList({ rounds, current, inline }: { rounds: MemoryKind[]; current: number; inline: boolean }) {
  return (
    <ol className={`flex flex-wrap justify-center gap-2 ${inline ? "mb-3 short:mb-1" : ""}`} aria-label="manches" data-testid="memory-rounds">
      {rounds.map((kind, i) => (
        <li
          key={i}
          data-status={i < current ? "done" : i === current ? "current" : "todo"}
          className={`rounded-full border-2 px-3 py-1 text-sm font-black ${
            i < current ? "border-sapin-700 bg-sapin-600 text-white" : i === current ? "border-or-600 bg-or-300 text-bois-950" : "border-encre/20 bg-white/50 text-encre/60"
          }`}
        >
          {i < current ? "✓" : `${i + 1}.`} {ROUND_LABEL[kind]}
        </li>
      ))}
    </ol>
  );
}

export function ConstellationGame({ game, submit }: GameProps<ConstellationContent>) {
  const c = game.content;
  const layout = c.layout;
  // Entre deux manches : un écran « Bravo » attend les enfants avant la manche suivante (tirée par le serveur).
  const [between, setBetween] = useState<number | null>(null);
  const ready = between !== null && c.round >= between;

  const cleared = (r: AttemptResult) => {
    if (!r.completed) setBetween(r.step);
  };

  if (between !== null) {
    const next = c.rounds[Math.min(between, c.rounds.length - 1)];
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center" data-testid="memory-between">
        <RoundTracker rounds={c.rounds} current={between} />
        <p className="animate-pop text-4xl font-black text-sapin-800">🌟 Manche {between} réussie !</p>
        <p className="text-2xl font-bold text-encre">
          Épreuve suivante : <span className="text-bordeaux-700">{ROUND_LABEL[next]}</span>
        </p>
        <p className="max-w-xl text-lg text-encre/80">{ROUND_INTRO[next]}</p>
        <BigButton tone="green" onClick={() => setBetween(null)} disabled={!ready}>
          C'est parti ! ➜
        </BigButton>
      </div>
    );
  }

  const props = { round: c.round, submit, onCleared: cleared };
  return (
    <div data-testid="memory" data-round={c.round} data-kind={layout.kind}>
      <RoundTracker rounds={c.rounds} current={c.round} />
      {layout.kind === "placement" ? <PlacementRound key={layout.id} layout={layout} {...props} /> : <PairsRound key={layout.id} layout={layout} {...props} />}
      <Hints hints={game.hints} />
    </div>
  );
}
