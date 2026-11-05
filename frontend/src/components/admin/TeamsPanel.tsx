import { api } from "../../services/api";
import { TEAM_LABELS, formatTime } from "../../services/labels";
import type { AdminState, TeamStatus } from "../../services/types";
import { ActionButton } from "../ui/ActionButton";
import { Card, Pill } from "../ui/Card";

const TONE: Record<TeamStatus, "neutral" | "warn" | "ok"> = { NON_COMMENCE: "neutral", EN_COURS: "warn", VALIDEE: "ok" };

export function TeamsPanel({ state }: { state: AdminState }) {
  return (
    <>
      {state.teams.map((t) => (
        <Card
          key={t.id}
          title={
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full ring-2 ring-white/30" style={{ background: t.color }} />
              {t.name} — {t.theme}
            </span>
          }
          actions={<Pill tone={TONE[t.status]}>{TEAM_LABELS[t.status]}</Pill>}
        >
          <p className="text-sm font-bold">{t.enigma}</p>
          <p className="text-sm text-parchemin-200/75">{t.description}</p>
          <p className="mt-1 text-xs text-parchemin-200/50">Dernière mise à jour : {formatTime(t.updated_at)}</p>
          <div className="mt-3 grid grid-cols-3 gap-2" data-testid={`team-${t.id}`}>
            <ActionButton disabled={t.status === "EN_COURS"} variant="ghost" onAction={() => api.setTeam(t.id, "EN_COURS")}>
              {t.status === "VALIDEE" ? "Invalider" : "En cours"}
            </ActionButton>
            <ActionButton disabled={t.status === "VALIDEE"} variant="green" onAction={() => api.setTeam(t.id, "VALIDEE")}>
              ✓ Valider
            </ActionButton>
            <ActionButton
              disabled={t.status === "NON_COMMENCE"}
              variant="ghost"
              onAction={() => api.setTeam(t.id, "NON_COMMENCE")}
              confirm={{ title: "Remettre à zéro ?", message: `${t.name} repassera « non commencée ».` }}
            >
              ↺ Zéro
            </ActionButton>
          </div>
        </Card>
      ))}
    </>
  );
}
