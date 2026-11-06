import { api } from "../../services/api";
import type { AdminState, KidsGame } from "../../services/types";
import { ActionButton } from "../ui/ActionButton";
import { Card, Pill } from "../ui/Card";

const STATUS = {
  locked: { label: "Verrouillé", tone: "neutral" },
  available: { label: "En cours", tone: "warn" },
  completed: { label: "Réussi", tone: "ok" },
} as const;

type Difficulty = NonNullable<KidsGame["difficulty"]>;

/** Niveau de « La tournée du traîneau » : appliqué au prochain vol sur la tablette. */
function DifficultyPicker({ difficulty }: { difficulty: Difficulty }) {
  const last = difficulty.last_run;
  const label = (id: string) => difficulty.levels.find((l) => l.id === id)?.label ?? id;
  return (
    <div className="mt-2 rounded bg-black/30 p-2" data-testid="admin-tournee-difficulty">
      <p className="text-xs font-bold text-parchemin-200/90">
        Difficulté (appliquée au prochain vol) · vol de {difficulty.duration} s :
      </p>
      <div className="mt-1 grid gap-2" style={{ gridTemplateColumns: `repeat(${difficulty.levels.length}, minmax(0, 1fr))` }}>
        {difficulty.levels.map((l) => (
          <ActionButton
            key={l.id}
            variant={l.id === difficulty.current ? "green" : undefined}
            disabled={l.id === difficulty.current}
            onAction={() => api.kidsDifficulty(l.id)}
            success={`Tournée du traîneau : niveau ${l.label}`}
            className={l.id === difficulty.current ? "ring-2 ring-or-400 disabled:opacity-100" : ""}
          >
            {l.id === difficulty.current ? "✓ " : ""}
            {l.label}
            <span className="block text-[11px] font-normal opacity-80">
              {l.gifts_required} cadeaux · {l.lives} vies
            </span>
          </ActionButton>
        ))}
      </div>
      {last && (
        <p className="mt-1 text-xs text-parchemin-200/80" data-testid="admin-tournee-last">
          Dernier vol ({label(last.level)}) : {last.finished ? "arrivé" : `${Math.round(last.progress * 100)} % du parcours`} ·{" "}
          {last.hits} choc(s) · {last.gifts}/{difficulty.levels.find((l) => l.id === last.level)?.gifts_required ?? "?"} cadeaux
        </p>
      )}
    </div>
  );
}

type Memory = NonNullable<KidsGame["memory"]>;

/** Niveaux de « La constellation » : appliqués tout de suite aux manches pas encore réussies. */
function MemoryPicker({ memory, done }: { memory: Memory; done: boolean }) {
  const rows = [
    { kind: "placement" as const, title: "Symboles à replacer", unit: "symboles", ...memory.placement },
    { kind: "paires" as const, title: "Memory (paires)", unit: "cartes", ...memory.paires },
  ];
  return (
    <div className="mt-2 rounded bg-black/30 p-2" data-testid="admin-memory-difficulty">
      <p className="text-xs font-bold text-parchemin-200/90">
        {done ? `${memory.total} manches réussies` : `Manche ${memory.round} / ${memory.total}`} ·{" "}
        {memory.rounds.join(" → ")}
      </p>
      {rows.map((row) => (
        <div key={row.kind} className="mt-2">
          <p className="text-xs text-parchemin-200/80">{row.title} (appliqué aussitôt aux manches non terminées) :</p>
          <div className="mt-1 grid gap-2" style={{ gridTemplateColumns: `repeat(${row.levels.length}, minmax(0, 1fr))` }}>
            {row.levels.map((level) => (
              <ActionButton
                key={level}
                variant={level === row.current ? "green" : undefined}
                disabled={level === row.current}
                onAction={() => api.kidsMemoryDifficulty(row.kind, level)}
                success={`Constellation : ${level} ${row.unit}`}
                className={level === row.current ? "ring-2 ring-or-400 disabled:opacity-100" : ""}
              >
                {level === row.current ? "✓ " : ""}
                {level} {row.unit}
              </ActionButton>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

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
              {g.memory && <MemoryPicker memory={g.memory} done={g.status === "completed"} />}
              {g.difficulty && <DifficultyPicker difficulty={g.difficulty} />}
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
