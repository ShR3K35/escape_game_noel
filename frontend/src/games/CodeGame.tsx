import { useState } from "react";

import type { CodeContent, Reward } from "../services/types";
import { BigButton, Feedback, Hints, type GameProps } from "./shared";
import { sfx } from "./sounds";
import { useAttempt } from "./useAttempt";

export function CodeGame({ game, submit, rewards }: GameProps<CodeContent> & { rewards: Reward[] }) {
  const c = game.content;
  const [digits, setDigits] = useState("");
  const { state, attempt } = useAttempt(submit);

  const press = (d: string) => {
    sfx.tap();
    setDigits((s) => (s.length < c.length ? s + d : s));
  };

  const check = async () => {
    const r = await attempt({ code: digits });
    if (r && !r.correct) setDigits("");
  };

  return (
    // Paysage peu haut (tablette) : indices et cases à gauche, clavier à droite — tout tient sans défiler.
    <div className="mx-auto w-full max-w-2xl short:grid short:max-w-4xl short:grid-cols-[1fr_auto] short:items-center short:gap-6">
      <div>
      <div className="flex justify-center gap-3">
        {rewards.map((r) => (
          <div key={r.label} className="flex flex-col items-center rounded-2xl bg-white/70 px-4 py-2 shadow short:py-1">
            <span className="text-4xl short:text-3xl">{r.symbol}</span>
            <span className="text-3xl font-black text-bordeaux-800">{r.digit}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-2xl bg-white/60 p-4 text-center text-2xl font-bold leading-snug text-encre short:mt-3 short:p-3 short:text-xl">{c.riddle}</p>
      <div className={`mt-5 flex justify-center gap-3 short:mt-3 ${state === "wrong" ? "animate-shake" : ""}`} data-testid="code-slots">
        {Array.from({ length: c.length }).map((_, i) => (
          <span key={i} className="flex h-24 w-20 items-center justify-center rounded-2xl border-4 border-or-600 bg-bois-900 text-5xl font-black text-or-300 shadow-inner short:h-20 short:w-16">
            {digits[i] ?? ""}
          </span>
        ))}
      </div>
      <div className="mt-3 short:mt-2">
        <Feedback state={state} />
      </div>
      </div>
      <div className="mx-auto mt-5 grid max-w-sm grid-cols-3 gap-3 short:mt-0 short:w-72 short:gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <BigButton key={d} tone="white" onClick={() => press(d)} className="text-3xl">
            {d}
          </BigButton>
        ))}
        <BigButton tone="red" onClick={() => setDigits((s) => s.slice(0, -1))} className="text-2xl" disabled={!digits}>
          ⌫
        </BigButton>
        <BigButton tone="white" onClick={() => press("0")} className="text-3xl">
          0
        </BigButton>
        <BigButton tone="green" onClick={check} disabled={digits.length !== c.length || state === "checking"} className="text-2xl">
          🛷
        </BigButton>
      </div>
      <div className="short:col-span-2">
        <Hints hints={game.hints} />
      </div>
    </div>
  );
}
