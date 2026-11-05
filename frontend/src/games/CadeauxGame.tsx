import { useEffect, useState, type MouseEvent } from "react";

import type { CadeauxContent, Gift } from "../services/types";
import { BigButton, COLOR_HEX, Feedback, Hints, SYMBOLS, type GameProps } from "./shared";
import { sfx } from "./sounds";
import { useAttempt } from "./useAttempt";

export function GiftBox({ gift, selected, onClick }: {
  gift: Gift;
  selected?: boolean;
  onClick?: (e: MouseEvent) => void;
}) {
  const size = gift.size === "grand" ? 92 : 58;
  return (
    <button
      type="button"
      data-gift={gift.id}
      onClick={onClick}
      aria-label={`cadeau ${gift.color} ${gift.size} ${gift.symbol}`}
      className={`relative flex shrink-0 items-center justify-center rounded-xl shadow-lg transition ${selected ? "-translate-y-2 scale-110 ring-4 ring-or-400" : ""}`}
      style={{ width: size, height: size, background: COLOR_HEX[gift.color] }}
    >
      <span className="absolute inset-y-0 left-1/2 w-[16%] -translate-x-1/2 bg-or-400" />
      <span className="absolute inset-x-0 top-1/2 h-[16%] -translate-y-1/2 bg-or-400" />
      <span className="relative rounded-full bg-white/90 p-1" style={{ fontSize: size * 0.32 }}>
        {SYMBOLS[gift.symbol]}
      </span>
    </button>
  );
}

export function CadeauxGame({ game, submit }: GameProps<CadeauxContent>) {
  const c = game.content;
  const [step, setStep] = useState(game.step);
  const [placement, setPlacement] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [roundWon, setRoundWon] = useState(false);
  const { state, attempt } = useAttempt(submit);

  useEffect(() => {
    if (game.step > step) setStep(game.step);
  }, [game.step, step]);
  useEffect(() => {
    setPlacement({});
    setSelected(null);
  }, [step]);

  const round = c.rounds[Math.min(step, c.rounds.length - 1)];
  const pool = c.gifts.filter((g) => !placement[g.id]);

  const put = (bin: string) => {
    if (!selected) return;
    sfx.tap();
    setPlacement((p) => ({ ...p, [selected]: bin }));
    setSelected(null);
  };

  const check = async () => {
    const r = await attempt({ round: step, placement });
    if (r?.correct && !r.completed) {
      setRoundWon(true);
      setTimeout(() => {
        setRoundWon(false);
        setStep(r.step);
      }, 1400);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-center gap-2">
        {c.rounds.map((_, i) => (
          <span key={i} className={`h-4 w-10 rounded-full ${i < step ? "bg-sapin-600" : i === step ? "bg-or-500" : "bg-encre/15"}`} />
        ))}
      </div>
      <p className="mt-2 text-center text-2xl font-black text-bordeaux-800">{round.instructions}</p>
      {roundWon ? (
        <p className="animate-pop mt-8 text-center text-4xl font-black text-sapin-700">Bravo, manche réussie ! 🎉</p>
      ) : (
        <>
          <div className="mt-4 flex min-h-32 flex-wrap items-end justify-center gap-4 rounded-3xl bg-white/50 p-4">
            {pool.length ? (
              pool.map((g) => (
                <GiftBox
                  key={g.id}
                  gift={g}
                  selected={selected === g.id}
                  onClick={() => {
                    sfx.tap();
                    setSelected(selected === g.id ? null : g.id);
                  }}
                />
              ))
            ) : (
              <p className="self-center text-xl font-bold text-encre/60">Tous les cadeaux sont rangés !</p>
            )}
          </div>
          <div className={`mt-4 grid gap-3 ${round.bins.length === 2 ? "grid-cols-2" : "grid-cols-3"} ${state === "wrong" ? "animate-shake" : ""}`}>
            {round.bins.map((b) => (
              <div
                key={b.value}
                role="button"
                tabIndex={0}
                data-bin={b.value}
                onClick={() => put(b.value)}
                onKeyDown={(e) => e.key === "Enter" && put(b.value)}
                className={`flex min-h-48 flex-col items-center rounded-[2rem] border-4 bg-bois-700 p-3 text-white shadow-inner transition ${
                  selected ? "animate-glow border-or-400" : "border-bois-800"
                }`}
              >
                <span className="text-xl font-black">{b.label}</span>
                <span className="text-3xl">{round.rule === "symbol" ? SYMBOLS[b.value] : round.rule === "color" ? "🎒" : b.value === "grand" ? "📦" : "🎀"}</span>
                <div className="mt-2 flex flex-wrap items-end justify-center gap-2">
                  {c.gifts
                    .filter((g) => placement[g.id] === b.value)
                    .map((g) => (
                      <GiftBox
                        key={g.id}
                        gift={g}
                        onClick={(e) => {
                          // Un cadeau est sélectionné : le toucher range ce cadeau dans le sac (clic propagé au sac).
                          if (selected) return;
                          e.stopPropagation();
                          sfx.tap();
                          setPlacement(({ [g.id]: _removed, ...rest }) => rest);
                        }}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-center gap-3">
            <BigButton tone="white" onClick={() => setPlacement({})} disabled={!Object.keys(placement).length}>
              Tout ressortir
            </BigButton>
            <BigButton tone="green" onClick={check} disabled={pool.length > 0 || state === "checking"}>
              ✨ Vérifier
            </BigButton>
          </div>
        </>
      )}
      <div className="mt-3">
        <Feedback state={state} />
      </div>
      <Hints hints={game.hints} />
    </div>
  );
}
