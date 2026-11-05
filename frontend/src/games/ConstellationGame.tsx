import { useEffect, useState } from "react";

import type { ConstellationContent } from "../services/types";
import { BigButton, Feedback, Hints, type GameProps } from "./shared";
import { sfx } from "./sounds";
import { useAttempt } from "./useAttempt";

const key = (c: number, r: number) => `${c},${r}`;

/** Étoile dessinée (ne dépend pas des polices emoji de l'appareil). */
function Star() {
  return (
    <svg viewBox="0 0 24 24" className="h-[70%] w-[70%] drop-shadow-[0_0_14px_rgba(255,230,140,0.9)]" aria-hidden>
      <path d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.2L12 18l-6.4 3.5 1.4-7.2-5.3-5 7.2-.9z" fill="#ffd76a" stroke="#fff3c4" strokeWidth="0.8" />
    </svg>
  );
}

export function ConstellationGame({ game, submit }: GameProps<ConstellationContent>) {
  const c = game.content;
  const stars = new Set(c.stars.map(([x, y]) => key(x, y)));
  const [mode, setMode] = useState<"memorize" | "place">("memorize");
  const [left, setLeft] = useState(c.memorize_seconds);
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
    setLeft(c.memorize_seconds);
    setMode("memorize");
  };

  const toggle = (k: string) => {
    if (mode !== "place") return;
    sfx.tap();
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length < stars.size ? [...s, k] : s));
  };

  const check = () => attempt({ cells: selected.map((k) => k.split(",").map(Number)) });

  return (
    <div>
      <p className="text-center text-xl font-bold text-encre">
        {mode === "memorize" ? (
          <>
            Mémorisez les étoiles ! <span className="inline-block min-w-12 rounded-full bg-bordeaux-700 px-3 text-white">{left}</span>
          </>
        ) : (
          <>
            Touchez le ciel pour replacer les étoiles : <strong>{selected.length} / {stars.size}</strong>
          </>
        )}
      </p>
      <div
        className={`mx-auto mt-4 grid max-w-3xl gap-2 rounded-3xl bg-[radial-gradient(ellipse_at_top,#1d2b5c,#0b1430)] p-4 shadow-inner ${state === "wrong" ? "animate-shake" : ""}`}
        style={{ gridTemplateColumns: `repeat(${c.cols}, minmax(0, 1fr))` }}
        data-testid="sky"
      >
        {Array.from({ length: c.rows }).flatMap((_, r) =>
          Array.from({ length: c.cols }).map((__, col) => {
            const k = key(col, r);
            const lit = mode === "memorize" ? stars.has(k) : selected.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-label={`case ${col + 1}-${r + 1}${lit ? " étoile" : ""}`}
                data-cell={k}
                onClick={() => toggle(k)}
                className={`flex aspect-square items-center justify-center rounded-2xl text-4xl transition sm:text-5xl ${
                  lit ? "scale-105 bg-white/10" : "bg-white/[0.03] hover:bg-white/10"
                }`}
              >
                {lit ? <span className="animate-pop flex h-full w-full items-center justify-center"><Star /></span> : <span className="h-2 w-2 rounded-full bg-white/25" />}
              </button>
            );
          }),
        )}
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {mode === "memorize" ? (
          <BigButton onClick={() => setMode("place")}>Je suis prêt ! 👍</BigButton>
        ) : (
          <>
            <BigButton tone="white" onClick={review}>
              👀 Revoir le ciel
            </BigButton>
            <BigButton tone="white" onClick={() => setSelected([])} disabled={!selected.length}>
              Effacer
            </BigButton>
            <BigButton tone="green" onClick={check} disabled={selected.length !== stars.size || state === "checking"}>
              ✨ Vérifier
            </BigButton>
          </>
        )}
      </div>
      <div className="mt-3">
        <Feedback state={state} />
      </div>
      <Hints hints={game.hints} />
    </div>
  );
}
