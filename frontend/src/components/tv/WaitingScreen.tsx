import { useEffect, useMemo, useState, type CSSProperties } from "react";

import bandeauMasque from "../../assets/attente/bandeau-masque.webp";
import fond from "../../assets/attente/fond.webp";
import plaque from "../../assets/attente/plaque.webp";
import plaqueMasque from "../../assets/attente/plaque-masque.webp";
import { Snowfall } from "../Ambient";
import { formatCountdown, remainingSeconds } from "./playback";

/** Dernières secondes : les chiffres pulsent et la cloche sonne. */
const FINAL_SECONDS = 10;

/*
 * Le fond est la maquette « Allocution du Père Noël à venir » (1672×941) telle quelle : les effets sont posés
 * par-dessus, en % du cadre 16:9 de la TV, pour tomber au bon endroit quelle que soit la résolution.
 */
/** Emplacement du bandeau titre dessiné dans le fond (masque du reflet doré). */
const BANDEAU_BOX: CSSProperties = { left: "13.158%", top: "8.502%", width: "73.684%", height: "38.257%" };
/** Plaque du compte à rebours (image 1390×697) centrée sous le bandeau. */
const PLAQUE_BOX: CSSProperties = { left: "26.5%", top: "45.5%", width: "47%", height: "41.9%" };
/** Zone des chiffres à l'intérieur de la plaque verte (chiffres d'origine effacés de l'image). */
const DIGITS_BOX: CSSProperties = { left: "17.41%", top: "11.91%", width: "65.9%", height: "43.9%" };

/** Points scintillants, en % du bandeau : étoile du sommet et flocons de part et d'autre du titre. */
const SPARKLES = [
  { x: 49.9, y: 11.1, size: 7, delay: 2.4 },
  { x: 6.5, y: 74.4, size: 4.5, delay: 3.6 },
  { x: 93.3, y: 74.4, size: 4.5, delay: 4.4 },
  { x: 62, y: 22, size: 2.5, delay: 5.3 },
  { x: 40, y: 25, size: 2.5, delay: 6.1 },
];

/** Halos lumineux du décor (cheminée, lampe, bougie, sapin), en % du cadre. */
const LIGHTS = [
  { x: 98, y: 62, r: 20, color: "255 150 60", duration: 2.6 },
  { x: 9, y: 52, r: 12, color: "255 210 120", duration: 4.2 },
  { x: 50, y: 70, r: 9, color: "255 200 110", duration: 1.9 },
  { x: 61, y: 52, r: 11, color: "255 220 140", duration: 3.4 },
];

function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

/** Poussière d'or qui monte lentement devant le décor. */
function GoldDust({ count = 28 }: { count?: number }) {
  const motes = useMemo(() => {
    const rnd = seeded(2026);
    return Array.from({ length: count }, (_, i) => ({
      key: i,
      left: rnd() * 100,
      size: 0.25 + rnd() * 0.55,
      duration: 12 + rnd() * 14,
      delay: -rnd() * 26,
      drift: (rnd() - 0.5) * 8,
      opacity: 0.35 + rnd() * 0.5,
    }));
  }, [count]);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {motes.map((m) => (
        <span
          key={m.key}
          className="absolute bottom-0 rounded-full bg-or-300"
          style={{
            left: `${m.left}%`,
            width: `${m.size}cqh`,
            height: `${m.size}cqh`,
            boxShadow: `0 0 ${m.size * 2}cqh ${m.size * 0.6}cqh rgb(236 217 160 / 0.7)`,
            ["--o" as string]: m.opacity,
            ["--drift" as string]: `${m.drift}cqw`,
            animation: `mote-rise ${m.duration}s linear ${m.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/** Étoile à quatre branches qui scintille. */
function Sparkle({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  return (
    <span
      aria-hidden
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}%`, top: `${y}%`, width: `${size}cqh`, height: `${size}cqh` }}
    >
      <span
        className="block h-full w-full"
        style={{
          background:
            "radial-gradient(circle, #fff 0 8%, rgb(255 236 170 / 0.9) 14%, transparent 42%)," +
            "linear-gradient(90deg, transparent 46%, #fff8dc 50%, transparent 54%)," +
            "linear-gradient(0deg, transparent 46%, #fff8dc 50%, transparent 54%)",
          filter: "drop-shadow(0 0 0.6cqh rgb(255 220 140 / 0.9))",
          animation: `sparkle-twinkle 4.5s ease-in-out ${delay}s infinite both`,
        }}
      />
    </span>
  );
}

/** Reflet doré qui balaie un calque, limité à sa silhouette (masque alpha). */
function Shimmer({ mask, delay, period }: { mask: string; delay: number; period: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 mix-blend-screen"
      style={{
        WebkitMaskImage: `url(${mask})`,
        maskImage: `url(${mask})`,
        WebkitMaskSize: "100% 100%",
        maskSize: "100% 100%",
      }}
    >
      <div
        className="absolute inset-y-0 -left-1/3 w-1/3"
        style={{
          background: "linear-gradient(105deg, transparent 0%, rgb(255 236 170 / 0.0) 30%, rgb(255 240 190 / 0.55) 50%, rgb(255 236 170 / 0.0) 70%, transparent 100%)",
          animation: `shimmer-sweep ${period}s ease-in-out ${delay}s infinite`,
        }}
      />
    </div>
  );
}

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

/** Chiffres du compte à rebours : seul le caractère qui change est animé. */
function Digits({ text, final }: { text: string; final: boolean }) {
  return (
    <p
      data-testid="tv-countdown"
      className="flex h-full items-center justify-center font-bold leading-none"
      style={{
        fontFamily: '"Playfair Display", Georgia, serif',
        // Chiffres alignés (Playfair utilise par défaut des chiffres elzéviriens) et à chasse fixe.
        fontVariantNumeric: "lining-nums tabular-nums",
        fontSize: "19.5cqh",
        animation: final ? "count-pulse 1s ease-in-out infinite" : undefined,
        filter: "drop-shadow(0 0.04em 0 rgb(40 20 5 / 0.9)) drop-shadow(0 0 0.12em rgb(255 215 120 / 0.55))",
      }}
    >
      {text.split("").map((ch, i) => (
        <span key={`${i}-${ch}`} className="inline-block" style={{ animation: "digit-in 0.45s cubic-bezier(0.2,0.9,0.3,1.2) both" }}>
          <span className="gold-text-bright">{ch}</span>
        </span>
      ))}
    </p>
  );
}

/**
 * Écran d'attente avant la vidéo d'introduction (phase PREPARATION) : le bureau du Père Noël, le bandeau
 * « Allocution du Père Noël à venir » et, quand le maître du jeu l'a lancé, la plaque du compte à rebours.
 * À zéro, le serveur démarre la partie et la vidéo d'intro remplace cet écran.
 */
export function WaitingScreen({ countdownUntil, clockOffset }: { countdownUntil: string | null; clockOffset: number }) {
  const now = useServerNow(clockOffset, countdownUntil !== null);
  const remaining = countdownUntil ? remainingSeconds(countdownUntil, now) : null;
  const final = remaining !== null && remaining <= FINAL_SECONDS && remaining > 0;
  const over = remaining === 0;

  return (
    <div data-testid="tv-waiting" className="absolute inset-0 z-10 overflow-hidden bg-black [container-type:size]">
      {/* Décor */}
      <div aria-hidden className="absolute inset-0" style={{ animation: "scene-in 2.6s cubic-bezier(0.2,0.7,0.2,1) both" }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${fond})` }}
        />
        {LIGHTS.map((l, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen"
            style={{
              left: `${l.x}%`,
              top: `${l.y}%`,
              width: `${l.r * 2}cqh`,
              height: `${l.r * 2}cqh`,
              background: `radial-gradient(circle, rgb(${l.color} / 0.45), transparent 65%)`,
              animation: `flicker ${l.duration}s ease-in-out infinite`,
            }}
          />
        ))}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,transparent_45%,rgb(10_5_2/0.65)_100%)]" />
      </div>

      <GoldDust />

      {/* Effets sur le bandeau titre du fond : halo qui respire, reflet doré, étoiles */}
      <div aria-hidden className="absolute" style={{ ...BANDEAU_BOX, animation: "fade-in 1.2s ease-out 1.6s both" }}>
        <div
          className="absolute inset-0 mix-blend-screen"
          style={{
            WebkitMaskImage: `url(${bandeauMasque})`,
            maskImage: `url(${bandeauMasque})`,
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
            background: "radial-gradient(ellipse at 50% 70%, rgb(255 200 110 / 0.35), transparent 70%)",
            animation: "glow-breathe 4s ease-in-out infinite",
          }}
        />
        <Shimmer mask={bandeauMasque} delay={1.4} period={7} />
        {SPARKLES.map((s, i) => (
          <Sparkle key={i} {...s} />
        ))}
      </div>
      {/* Texte accessible / testable (le titre est dessiné dans le fond). */}
      <span className="sr-only">Allocution du Père Noël à venir</span>

      {/* Plaque du compte à rebours */}
      {remaining !== null && (
        <div key={countdownUntil} className="absolute" style={{ ...PLAQUE_BOX, animation: "plaque-drop 1.3s cubic-bezier(0.25,1.4,0.45,1) both" }}>
          <div
            className="relative h-full w-full origin-top"
            style={{ animation: final ? "plaque-ring 0.5s ease-in-out infinite" : "plaque-swing 6s ease-in-out 1.3s infinite" }}
          >
            <img
              src={plaque}
              alt=""
              className="absolute inset-0 h-full w-full"
              style={{
                filter: final
                  ? "drop-shadow(0 0 2.2cqh rgb(255 90 70 / 0.75))"
                  : "drop-shadow(0 1.2cqh 1.6cqh rgb(0 0 0 / 0.55))",
                transition: "filter 0.6s",
              }}
            />
            <Shimmer mask={plaqueMasque} delay={1.6} period={7} />
            <div className="absolute" style={DIGITS_BOX}>
              {over ? (
                <p
                  data-testid="tv-countdown"
                  className="flex h-full items-center justify-center font-noel font-bold"
                  style={{ fontSize: "11cqh", animation: "pop 0.6s cubic-bezier(0.2,1.4,0.4,1) both" }}
                >
                  <span className="gold-text-bright">C'est l'heure !</span>
                </p>
              ) : (
                <Digits text={formatCountdown(remaining)} final={final} />
              )}
            </div>
            {final && (
              <span
                aria-hidden
                key={remaining}
                className="absolute rounded-full border-[0.4cqh] border-or-300"
                style={{ left: "50%", top: "86%", width: "8cqh", height: "8cqh", animation: "bell-wave 1s ease-out both" }}
              />
            )}
          </div>
        </div>
      )}

      <Snowfall count={70} />
    </div>
  );
}
