import type { ReactNode } from "react";

export function Card({ title, children, actions, className = "" }: {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`gold-border rounded-xl bg-bois-900/80 p-4 shadow-lg backdrop-blur ${className}`}>
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-display text-base font-semibold tracking-wide text-or-400">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "bad" | "gold" }) {
  const tones = {
    neutral: "bg-white/10 text-parchemin-100",
    ok: "bg-sapin-700 text-white",
    warn: "bg-or-600 text-bois-950",
    bad: "bg-bordeaux-700 text-white",
    gold: "bg-or-500 text-bois-950",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}
