import type { ReactNode } from "react";

import type { AttemptResult, KidsGame } from "../services/types";

export interface GameProps<C> {
  game: KidsGame & { content: C };
  submit: (answer: unknown) => Promise<AttemptResult>;
}

export function BigButton({ children, onClick, disabled, tone = "gold", className = "" }: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "gold" | "green" | "red" | "white";
  className?: string;
}) {
  const tones = {
    gold: "bg-or-400 text-bois-950 border-or-600",
    green: "bg-sapin-600 text-white border-sapin-800",
    red: "bg-bordeaux-600 text-white border-bordeaux-800",
    white: "bg-white text-encre border-parchemin-300",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-16 rounded-2xl border-b-[6px] px-6 py-3 text-xl font-black shadow-lg transition active:translate-y-1 active:border-b-2 disabled:opacity-40 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Hints({ hints }: { hints: string[] }) {
  if (!hints.length) return null;
  return (
    <div className="mt-4 space-y-2" aria-live="polite">
      {hints.map((h, i) => (
        <p key={i} className="animate-pop rounded-2xl border-2 border-or-400 bg-or-300/90 px-4 py-2 text-lg font-bold text-bois-950">
          💡 Indice {i + 1} : {h}
        </p>
      ))}
    </div>
  );
}

export function Feedback({ state }: { state: "idle" | "wrong" | "checking" }) {
  if (state === "wrong")
    return (
      <p role="alert" className="animate-shake text-center text-2xl font-black text-bordeaux-700">
        Pas tout à fait… essayez encore ! ❄️
      </p>
    );
  if (state === "checking") return <p className="text-center text-xl font-bold text-sapin-800">Le Père Noël vérifie… 🎅</p>;
  return null;
}

export const COLOR_HEX: Record<string, string> = {
  rouge: "#c8102e",
  vert: "#1f8a3c",
  bleu: "#1e5bd8",
  or: "#d4a017",
};
