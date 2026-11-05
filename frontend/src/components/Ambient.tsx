import { useMemo } from "react";

/** Pseudo-aléatoire déterministe : même rendu à chaque affichage. */
function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

export function Snowfall({ count = 60, className = "" }: { count?: number; className?: string }) {
  const flakes = useMemo(() => {
    const rnd = seeded(42);
    return Array.from({ length: count }, (_, i) => ({
      key: i,
      left: rnd() * 100,
      size: 2 + rnd() * 5,
      duration: 9 + rnd() * 14,
      delay: -rnd() * 20,
      drift: (rnd() - 0.5) * 120,
      opacity: 0.35 + rnd() * 0.55,
    }));
  }, [count]);
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {flakes.map((f) => (
        <span
          key={f.key}
          className="absolute top-0 rounded-full bg-white"
          style={{
            left: `${f.left}%`,
            width: f.size,
            height: f.size,
            opacity: f.opacity,
            filter: "blur(0.5px)",
            animation: `snowfall ${f.duration}s linear ${f.delay}s infinite`,
            ["--drift" as string]: `${f.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

export function Starfield({ count = 70, gold = false }: { count?: number; gold?: boolean }) {
  const stars = useMemo(() => {
    const rnd = seeded(7);
    return Array.from({ length: count }, (_, i) => ({
      key: i,
      left: rnd() * 100,
      top: rnd() * 100,
      size: 2 + rnd() * (gold ? 6 : 3),
      duration: 2 + rnd() * 4,
      delay: -rnd() * 6,
    }));
  }, [count, gold]);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((s) => (
        <span
          key={s.key}
          className={`absolute rounded-full ${gold ? "bg-or-300 shadow-[0_0_12px_4px_rgba(236,217,160,0.6)]" : "bg-white"}`}
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            animation: `twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export function AmbientLayer({ ambient }: { ambient: string }) {
  if (ambient === "neige") return <Snowfall count={90} />;
  if (ambient === "etoiles") return <Starfield count={90} />;
  if (ambient === "magie") return <Starfield count={50} gold />;
  return null;
}

export function Confetti({ count = 80 }: { count?: number }) {
  const pieces = useMemo(() => {
    const rnd = seeded(99);
    const colors = ["#c9a24b", "#ecd9a0", "#9b2638", "#2f6f3c", "#ffffff", "#3b82f6"];
    return Array.from({ length: count }, (_, i) => ({
      key: i,
      left: rnd() * 100,
      w: 6 + rnd() * 8,
      h: 10 + rnd() * 10,
      color: colors[i % colors.length],
      duration: 2.2 + rnd() * 2.5,
      delay: rnd() * 0.8,
      drift: (rnd() - 0.5) * 200,
    }));
  }, [count]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.key}
          className="absolute top-0 rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.w,
            height: p.h,
            background: p.color,
            animation: `confetti ${p.duration}s ease-in ${p.delay}s forwards`,
            ["--drift" as string]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
