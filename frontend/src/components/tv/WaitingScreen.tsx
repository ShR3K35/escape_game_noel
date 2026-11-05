import { useEffect, useState } from "react";

import bureau from "../../assets/bureau-pere-noel.jpg";
import { Snowfall } from "../Ambient";
import { formatCountdown, remainingSeconds } from "./playback";

const TITLE_WORDS = ["Allocution", "du", "Père", "Noël"];
/** Dernières secondes : le compteur pulse. */
const FINAL_SECONDS = 10;

/** Horloge locale plus fine que la seconde : le compteur change pile à chaque seconde. */
function useServerNow(clockOffset: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now() + clockOffset);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now() + clockOffset), 200);
    return () => clearInterval(t);
  }, [clockOffset, active]);
  return now;
}

/**
 * Écran d'attente avant la vidéo d'introduction (phase PREPARATION) : bureau du Père Noël flouté,
 * titre animé et, quand le maître du jeu l'a lancé, compte à rebours. À zéro, le serveur démarre la
 * partie et la vidéo d'intro remplace cet écran.
 */
export function WaitingScreen({ countdownUntil, clockOffset }: { countdownUntil: string | null; clockOffset: number }) {
  const now = useServerNow(clockOffset, countdownUntil !== null);
  const remaining = countdownUntil ? remainingSeconds(countdownUntil, now) : null;
  const final = remaining !== null && remaining <= FINAL_SECONDS && remaining > 0;

  return (
    <div data-testid="tv-waiting" className="absolute inset-0 z-10 overflow-hidden bg-bois-950">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${bureau})`,
          filter: "blur(1.6vw) brightness(0.6) saturate(1.25)",
          animation: "ken-burns 45s ease-in-out infinite alternate",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgb(20_11_6/0.8)_100%)]"
      />
      <Snowfall count={110} />

      <div className="relative flex h-full flex-col items-center justify-center px-[5vw] text-center">
        <p
          className="font-display text-[2vw] tracking-[0.6em] text-or-300 opacity-0 [text-shadow:0_0_0.6em_rgb(236_217_160/0.7)]"
          style={{ animation: "fade-in 2s ease 0.2s forwards" }}
        >
          ❄ ✦ ❄
        </p>

        <h1
          className="mt-[1.5vw] font-noel text-[8.5vw] font-bold leading-[1.02]"
          style={{ animation: "noel-glow 3.5s ease-in-out infinite" }}
        >
          {/* Dégradé doré sur chaque mot : avec background-clip:text sur le parent, Chromium superpose
              les mots animés. */}
          {TITLE_WORDS.map((w, i) => (
            <span key={w}>
              <span className="inline-block opacity-0" style={{ animation: `word-in 1.1s cubic-bezier(0.2,0.8,0.2,1) ${0.5 + i * 0.3}s forwards` }}>
                <span className="gold-text">{w}</span>
              </span>{" "}
            </span>
          ))}
          <span className="block text-[0.75em]">
            <span className="inline-block opacity-0" style={{ animation: "word-in 1.1s cubic-bezier(0.2,0.8,0.2,1) 1.9s forwards" }}>
              <span className="gold-text">à venir</span>
            </span>
          </span>
        </h1>

        {remaining !== null && (
          <div key={countdownUntil} className="animate-pop mt-[2vw]">
            <p
              data-testid="tv-countdown"
              className={`font-display text-[9vw] font-extrabold leading-none tabular-nums ${final ? "text-or-300" : "text-parchemin-50"} [text-shadow:0_0_0.15em_rgb(255_255_255/0.5),0_0_0.45em_rgb(155_38_56/0.95),0_0.05em_0_rgb(62_10_23)]`}
              style={final ? { animation: "count-pulse 1s ease-in-out infinite" } : undefined}
            >
              {remaining > 0 ? formatCountdown(remaining) : "C'est l'heure !"}
            </p>
            <p className="mt-[1vw] font-display text-[1.7vw] uppercase tracking-[0.25em] text-or-300/90">
              {remaining > 0 ? "Préparez-vous, le Père Noël arrive…" : "Ho ho ho !"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
