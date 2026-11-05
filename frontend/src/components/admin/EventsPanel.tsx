import { useState } from "react";

import { api } from "../../services/api";
import { formatTime } from "../../services/labels";
import type { AdminState, GameEvent } from "../../services/types";
import { ActionButton } from "../ui/ActionButton";
import { Card } from "../ui/Card";

const SOURCE_ICON: Record<string, string> = { admin: "🎩", kids: "🧝", tv: "📺", scheduler: "⏰", system: "⚙️", demo: "🧪" };

export function EventsPanel({ state }: { state: AdminState }) {
  const [full, setFull] = useState<GameEvent[] | null>(null);
  const events = full ?? state.events;
  return (
    <Card
      title="Journal des événements"
      actions={
        full ? (
          <button className="text-xs text-or-300 underline" onClick={() => setFull(null)}>
            Direct
          </button>
        ) : (
          <ActionButton onAction={async () => setFull(await api.events(300))}>Historique complet</ActionButton>
        )
      }
    >
      <ol className="space-y-1.5 text-sm" data-testid="events">
        {events.map((e) => (
          <li key={e.id} className="flex gap-2 rounded bg-black/20 px-2 py-1.5">
            <span className="shrink-0 font-mono text-xs text-parchemin-200/60">{formatTime(e.ts)}</span>
            <span aria-hidden>{SOURCE_ICON[e.source] ?? "•"}</span>
            <span>{e.message}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
