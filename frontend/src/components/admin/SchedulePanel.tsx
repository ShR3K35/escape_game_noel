import { api } from "../../services/api";
import { formatTime } from "../../services/labels";
import type { AdminState, ScheduleItem } from "../../services/types";
import { ActionButton } from "../ui/ActionButton";
import { Card, Pill } from "../ui/Card";
import { useFeedback } from "../ui/Feedback";

const STATUS = {
  pending: { label: "Programmé", tone: "neutral" },
  done: { label: "Fait", tone: "ok" },
  skipped: { label: "Manqué", tone: "bad" },
} as const;

const ACTION = { video: "Vidéo", phase: "Phase", message: "Message" };

function Row({ item }: { item: ScheduleItem }) {
  const fb = useFeedback();
  const update = async (body: { at?: string; enabled?: boolean }) => {
    try {
      await api.scheduleUpdate(item.id, body);
    } catch (e) {
      fb.notify(e instanceof Error ? e.message : "Erreur", "error");
    }
  };
  return (
    <li className={`rounded-lg bg-black/25 p-3 ${item.enabled ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{item.label}</p>
          <p className="text-xs text-parchemin-200/70">
            {ACTION[item.action]} · {item.anchor === "clock" ? "heure fixe" : "relatif au démarrage"}
            {item.due_at && ` · prévu à ${formatTime(item.due_at)}`}
            {item.fired_at && ` · joué à ${formatTime(item.fired_at)}`}
          </p>
          {item.note && <p className="text-xs text-or-300">{item.note}</p>}
        </div>
        <Pill tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Pill>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="time"
          defaultValue={item.at}
          key={item.at}
          aria-label={`Horaire de ${item.label}`}
          onBlur={(e) => e.target.value && e.target.value !== item.at && update({ at: e.target.value })}
          className="rounded-md bg-white/90 px-2 py-1.5 font-mono text-encre"
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={item.enabled} onChange={(e) => update({ enabled: e.target.checked })} className="h-5 w-5 accent-or-500" />
          Automatique
        </label>
        <ActionButton
          variant="gold"
          className="ml-auto"
          onAction={() => api.scheduleFire(item.id)}
          confirm={item.action === "phase" ? { title: "Déclencher maintenant ?", message: `${item.label} : la phase de jeu va changer.` } : undefined}
        >
          ⚡ Maintenant
        </ActionButton>
      </div>
    </li>
  );
}

export function SchedulePanel({ state }: { state: AdminState }) {
  return (
    <Card title="Planning de la soirée">
      <p className="mb-3 text-sm text-parchemin-200/75">
        Horaires de référence : démarrage {state.game.start_time}, fin {state.game.end_time}. Les événements « relatifs » sont décalés si la
        partie démarre en retard. Un événement en retard de plus de 2 minutes (coupure) est marqué « manqué » : relancez-le à la main.
        {state.time_scale !== 1 && ` Mode démonstration : temps accéléré ×${state.time_scale}.`}
      </p>
      <ul className="space-y-2">
        {state.schedule.map((i) => (
          <Row key={i.id} item={i} />
        ))}
      </ul>
    </Card>
  );
}
