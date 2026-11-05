import { api } from "../../services/api";
import type { AdminState } from "../../services/types";
import { ActionButton } from "../ui/ActionButton";
import { Card, Pill } from "../ui/Card";

const STATUS = {
  locked: { label: "Verrouillé", tone: "neutral" },
  available: { label: "En cours", tone: "warn" },
  completed: { label: "Réussi", tone: "ok" },
} as const;

export function KidsPanel({ state }: { state: AdminState }) {
  const kids = state.kids;
  return (
    <>
      <Card title={`Mini-jeux des lutins · ${kids.completed_count} / ${kids.total}`}>
        <p className="mb-3 text-sm text-parchemin-200/75">
          {kids.all_completed ? "🎉 Les lutins ont terminé : l'écran « Mission accomplie » est affiché." : "Progression en direct de la tablette."}
          {" "}Tablette connectée : {state.connections.kids ? "oui" : "non"}.
        </p>
        <ul className="space-y-3">
          {kids.games.map((g, i) => (
            <li key={g.id} className="rounded-lg bg-black/25 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">
                  {i + 1}. {g.title}
                </p>
                <Pill tone={STATUS[g.status].tone}>{STATUS[g.status].label}</Pill>
              </div>
              <p className="mt-1 text-xs text-parchemin-200/70">
                {g.attempts ?? 0} essai(s) · {g.failures ?? 0} raté(s) · {g.hints.length} indice(s) affiché(s)
                {g.id === "cadeaux" && ` · manche ${Math.min(g.step + 1, 3)}/3`}
                {g.completed_by_admin && " · débloqué par le MJ"}
              </p>
              {g.current_order && g.status === "available" && (
                <p className="mt-1 rounded bg-black/30 p-2 text-xs text-parchemin-200/90" data-testid="admin-machine-order">
                  Commande {g.current_order.number}/{g.current_order.total} : « {g.current_order.text} »
                  <br />
                  <span className="font-bold text-or-300">
                    Réponse : {g.current_order.answer} ({g.current_order.calc})
                  </span>
                </p>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <ActionButton
                  variant="green"
                  disabled={g.status === "completed"}
                  onAction={() => api.kidsComplete(g.id)}
                  confirm={{ title: "Débloquer cette étape ?", message: `« ${g.title} » sera marqué comme réussi sur la tablette.` }}
                >
                  🔓 Débloquer
                </ActionButton>
                <ActionButton disabled={(g.attempts ?? 0) === 0 && g.status !== "completed"} onAction={() => api.kidsReset(g.id)}>
                  ↺ Recommencer
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
        <ActionButton
          variant="danger"
          className="mt-4 w-full"
          onAction={api.kidsResetAll}
          confirm={{ title: "Tout recommencer ?", message: "Les quatre mini-jeux des lutins seront remis à zéro." }}
        >
          Réinitialiser tous les mini-jeux
        </ActionButton>
      </Card>
    </>
  );
}
