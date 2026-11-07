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
              {t.status === "VALIDEE" && t.code_word && (
                <span className="rounded bg-or-500 px-1.5 font-display text-sm font-extrabold tracking-wider text-bois-950">
                  {t.code_word}
                </span>
              )}
            </span>
          }
          actions={
            <span className="flex items-center gap-2">
              {t.points > 0 && (
                <span className="text-sm font-bold text-or-300" data-testid={`team-points-${t.id}`}>
                  {t.rank ? `${t.rank}ᵉ · ` : ""}
                  {t.points} pts
                </span>
              )}
              <Pill tone={TONE[t.status]}>{TEAM_LABELS[t.status]}</Pill>
            </span>
          }
        >
          <p className="text-sm font-bold">{t.enigma}</p>
          <p className="text-sm text-parchemin-200/75">{t.description}</p>
          {t.code_word && (
            <p className="mt-1 text-xs text-parchemin-200/60">
              Mot code : <strong className="tracking-wider">{t.code_word}</strong>
              {t.status !== "VALIDEE" && " (révélé à la validation)"}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-black/25 px-3 py-2" data-testid={`team-bonus-${t.id}`}>
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-bold">Bonus missions perso</span>
              <span className="block text-xs text-parchemin-200/60">
                Mission {t.mission_points} + bonus {t.bonus} = <strong className="text-or-300">{t.points} pts</strong>
              </span>
            </span>
            <ActionButton
              variant="ghost"
              disabled={t.bonus <= 0}
              onAction={() => api.teamBonus(t.id, -1)}
              title={`Retirer un point bonus à ${t.name}`}
            >
              −1
            </ActionButton>
            <span className="w-8 text-center font-display text-lg font-extrabold text-or-300" data-testid={`team-bonus-value-${t.id}`}>
              {t.bonus}
            </span>
            <ActionButton variant="green" onAction={() => api.teamBonus(t.id, 1)} title={`Ajouter un point bonus à ${t.name}`}>
              +1
            </ActionButton>
          </div>
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
