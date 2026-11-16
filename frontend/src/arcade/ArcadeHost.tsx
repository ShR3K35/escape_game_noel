import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";

import { useEffect, useRef } from "react";

import { startKart } from "./kart/kart";
import { startGame } from "./plateformes/game";

export type ArcadeGameId = "plateformes" | "kart";

const START: Record<ArcadeGameId, (host: HTMLElement, opts: { onExit: () => void }) => { stop: () => void }> = {
  plateformes: startGame,
  kart: startKart,
};

const LABELS: Record<ArcadeGameId, string> = {
  plateformes: "La Grande Tournée du Père Noël",
  kart: "Le Grand Prix du Père Noël",
};

/** Jeu bonus en plein écran par-dessus la page des lutins ; la croix du jeu ramène à l'écran final. */
export default function ArcadeHost({ game, onExit }: { game: ArcadeGameId; onExit: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const exit = useRef(onExit);
  exit.current = onExit;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const handle = START[game](el, { onExit: () => exit.current() });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      handle.stop();
      document.body.style.overflow = prevOverflow;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [game]);

  return (
    <div
      ref={host}
      className="fixed inset-0 z-50 touch-none select-none overflow-hidden overscroll-none bg-[#0b0d2a]"
      style={{ WebkitTouchCallout: "none" }}
      role="application"
      aria-label={LABELS[game]}
      data-testid={`arcade-${game}`}
    />
  );
}
