import { useLiveChannel } from "../hooks/useLiveChannel";
import { PHASE_LABELS, TEAM_LABELS } from "../services/labels";
import type { PublicState } from "../services/types";

/** État simplifié, en lecture seule (aucune commande). */
export default function StatusPage() {
  const { data, connected } = useLiveChannel<PublicState>("status");

  return (
    <main className="wood min-h-dvh px-4 py-8">
      <div className="mx-auto max-w-xl">
        <h1 className="gold-text font-display text-3xl font-extrabold">État du jeu</h1>
        <p className="mt-1 text-sm text-parchemin-200/70">{connected ? "● En direct" : "○ Connexion…"}</p>
        {data && (
          <div className="parchment mt-6 space-y-4 rounded-xl p-5 shadow-xl">
            <p className="font-display text-xl text-bordeaux-800">
              Phase : <strong>{PHASE_LABELS[data.phase]}</strong>
            </p>
            <ul className="space-y-2">
              {data.teams.map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded-lg bg-white/50 px-3 py-2">
                  <span className="flex items-center gap-2 font-bold">
                    <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />
                    {t.name} <span className="font-normal text-encre/70">— {t.theme}</span>
                  </span>
                  <span>{TEAM_LABELS[t.status]}</span>
                </li>
              ))}
            </ul>
            <p>
              Lutins : <strong>{data.kids_summary.completed}</strong> / {data.kids_summary.total} mini-jeux réussis
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
