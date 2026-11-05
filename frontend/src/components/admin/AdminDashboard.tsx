import { useEffect, useState } from "react";

import { useLiveChannel } from "../../hooks/useLiveChannel";
import { api } from "../../services/api";
import { PHASE_LABELS } from "../../services/labels";
import type { AdminState } from "../../services/types";
import { EventsPanel } from "./EventsPanel";
import { GamePanel } from "./GamePanel";
import { KidsPanel } from "./KidsPanel";
import { SchedulePanel } from "./SchedulePanel";
import { TeamsPanel } from "./TeamsPanel";
import { TvPanel } from "./TvPanel";

const TABS = [
  { id: "partie", label: "Partie", icon: "🎬" },
  { id: "tv", label: "TV", icon: "📺" },
  { id: "equipes", label: "Équipes", icon: "🕵️" },
  { id: "lutins", label: "Lutins", icon: "🧝" },
  { id: "planning", label: "Planning", icon: "⏰" },
  { id: "journal", label: "Journal", icon: "📜" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function savedTab(): TabId {
  try {
    const t = localStorage.getItem("noel-admin-tab");
    if (TABS.some((x) => x.id === t)) return t as TabId;
  } catch {
    /* stockage indisponible */
  }
  return "partie";
}

export function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const { data, connected, closedCode, clockOffset } = useLiveChannel<AdminState>("admin");
  const [tab, setTab] = useState<TabId>(savedTab);

  useEffect(() => {
    try {
      localStorage.setItem("noel-admin-tab", tab);
    } catch {
      /* ignoré */
    }
  }, [tab]);

  useEffect(() => {
    if (closedCode === 4401) onLogout();
  }, [closedCode, onLogout]);

  const logout = async () => {
    await api.logout().catch(() => undefined);
    onLogout();
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <header className="sticky top-0 z-30 border-b border-or-500/30 bg-bordeaux-950/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-lg font-bold text-or-400">Maître du jeu</h1>
            <p className="text-xs text-parchemin-200/80">
              <span className={connected ? "text-green-400" : "text-red-400"}>{connected ? "● en direct" : "○ reconnexion…"}</span>
              {data && (
                <>
                  {" · "}
                  <strong data-testid="admin-phase">{PHASE_LABELS[data.phase]}</strong>
                  {" · TV "}
                  {data.connections.tv ?? 0}
                  {" · tablette "}
                  {data.connections.kids ?? 0}
                  {data.demo_mode && <span className="ml-1 rounded bg-or-500 px-1 text-bois-950">DÉMO ×{data.time_scale}</span>}
                </>
              )}
            </p>
          </div>
          <button onClick={logout} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-parchemin-200">
            Déconnexion
          </button>
        </div>
        <nav className="mt-2 grid grid-cols-6 gap-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center rounded-lg py-1.5 text-[11px] font-bold transition ${
                tab === t.id ? "bg-or-500 text-bois-950" : "bg-white/5 text-parchemin-200"
              }`}
            >
              <span className="text-base leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 space-y-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {!data ? (
          <p className="text-center text-parchemin-200">Connexion au serveur…</p>
        ) : (
          <>
            {tab === "partie" && <GamePanel state={data} clockOffset={clockOffset} />}
            {tab === "tv" && <TvPanel state={data} />}
            {tab === "equipes" && <TeamsPanel state={data} />}
            {tab === "lutins" && <KidsPanel state={data} />}
            {tab === "planning" && <SchedulePanel state={data} />}
            {tab === "journal" && <EventsPanel state={data} />}
          </>
        )}
      </main>
    </div>
  );
}
