import { useEffect, useState } from "react";

import { api } from "../../services/api";
import { CRITICAL_PHASES, NEXT_PHASES, PHASE_LABELS, PHASES, TEAM_LABELS, formatDuration, formatTime } from "../../services/labels";
import type { AdminState, Phase } from "../../services/types";
import { ActionButton } from "../ui/ActionButton";
import { Card, Pill } from "../ui/Card";
import { NowPlaying } from "./TvPanel";

function useNow(offset: number, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), intervalMs);
    return () => clearInterval(t);
  }, [offset, intervalMs]);
  return now;
}

const PHASE_BUTTON_LABELS: Partial<Record<Phase, string>> = {
  ENQUETE: "Lancer l'enquête",
  FINALE: "Passer en finale",
  VICTOIRE: "🏆 Victoire !",
  SECOURS: "🧝 Secours des lutins",
  FIN: "Terminer la partie",
};

const COUNTDOWN_PRESETS = [1, 2, 3, 5, 10, 15];

/** Compte à rebours affiché sur la TV avant l'intro ; à zéro, la partie démarre toute seule. */
function IntroCountdown({ state, now }: { state: AdminState; now: number }) {
  const [minutes, setMinutes] = useState("20");
  const until = state.tv.countdown?.until;
  const custom = Math.round(Number(minutes.replace(",", ".")) * 60);
  const customValid = Number.isFinite(custom) && custom >= 5 && custom <= 4 * 3600;

  return (
    <div className="rounded-lg border border-or-500/40 bg-black/25 p-3" data-testid="intro-countdown">
      <p className="text-sm font-bold text-or-300">⏳ Compte à rebours avant l'intro</p>
      <p className="mb-2 text-xs text-parchemin-200/70">
        La TV affiche « Message rtk du pôle Nord en cours de téléchargement... ». À zéro, la vidéo d'introduction se lance automatiquement.
      </p>
      {until && (
        <div className="mb-2 flex items-center gap-3">
          <span className="font-mono text-3xl font-bold text-or-300" data-testid="countdown-remaining">
            {formatDuration(Math.max(0, Date.parse(until) - now) + 999)}
          </span>
          <ActionButton variant="danger" className="ml-auto" onAction={api.cancelCountdown} success="Compte à rebours annulé">
            ✕ Annuler
          </ActionButton>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {COUNTDOWN_PRESETS.map((m) => (
          <ActionButton key={m} variant="green" onAction={() => api.countdown(m * 60)} title={`Compte à rebours de ${m} min`}>
            {m} min
          </ActionButton>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <label className="flex flex-1 items-center gap-2 text-sm">
          <input
            type="number"
            inputMode="decimal"
            min={0.1}
            max={240}
            step="any"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            aria-label="Durée personnalisée en minutes"
            className="w-20 rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-center text-parchemin-100"
          />
          min
        </label>
        <ActionButton variant="gold" disabled={!customValid} onAction={() => api.countdown(custom)}>
          {until ? "↻ Relancer" : "▶ Lancer"}
        </ActionButton>
      </div>
    </div>
  );
}

/** Action 5 du boîtier Matter : verrouillée, elle affiche un message de patience ; autorisée, elle lance le secours. */
function EmergencyControl({ state }: { state: AdminState }) {
  const authorized = state.emergency_authorized;
  const possible = NEXT_PHASES[state.phase].includes("SECOURS");
  return (
    <div
      className={`rounded-lg border p-3 ${authorized ? "border-bordeaux-600 bg-bordeaux-900/40" : "border-white/15 bg-black/25"}`}
      data-testid="emergency-control"
      data-authorized={authorized}
    >
      <div className="mb-1 flex items-center gap-2">
        <p className="text-sm font-bold text-or-300">🚨 Protocole d'urgence des lutins</p>
        <span className="ml-auto">
          <Pill tone={authorized ? "bad" : "neutral"}>{authorized ? "autorisé" : "verrouillé"}</Pill>
        </span>
      </div>
      <p className="mb-2 text-xs text-parchemin-200/70">
        {authorized
          ? possible
            ? "L'action 5 du boîtier lance immédiatement la vidéo du secours des lutins."
            : "Autorisé, mais le secours ne peut être lancé qu'en enquête ou en finale."
          : "L'action 5 du boîtier affiche sur la TV : « Soyez patients mes lutins… »."}
      </p>
      {authorized ? (
        <ActionButton className="w-full" onAction={() => api.emergency(false)} success="Protocole d'urgence verrouillé">
          🔒 Verrouiller le protocole
        </ActionButton>
      ) : (
        <ActionButton
          variant="primary"
          className="w-full"
          onAction={() => api.emergency(true)}
          success="Protocole d'urgence autorisé"
          confirm={{
            title: "Autoriser le protocole d'urgence ?",
            message: "Dès que les lutins appuieront sur l'action 5, la vidéo du secours des lutins sera diffusée sur la TV.",
            confirmLabel: "Autoriser",
          }}
        >
          🚨 Autoriser le protocole d'urgence
        </ActionButton>
      )}
    </div>
  );
}

export function GamePanel({ state, clockOffset }: { state: AdminState; clockOffset: number }) {
  const now = useNow(clockOffset);
  const elapsed = state.started_at ? now - Date.parse(state.started_at) : 0;
  const next = state.schedule
    .filter((i) => i.enabled && i.status === "pending" && i.due_at)
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))[0];
  const validated = state.teams.filter((t) => t.status === "VALIDEE").length;

  return (
    <>
      <Card title="Déroulé de la soirée">
        <ol className="mb-4 flex flex-wrap gap-1.5">
          {PHASES.map((p) => (
            <li key={p}>
              <Pill tone={p === state.phase ? "gold" : "neutral"}>{PHASE_LABELS[p]}</Pill>
            </li>
          ))}
        </ol>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-black/25 p-3">
            <dt className="text-parchemin-200/70">Temps écoulé</dt>
            <dd className="font-mono text-2xl font-bold text-or-300">{state.started_at ? formatDuration(elapsed) : "—"}</dd>
          </div>
          <div className="rounded-lg bg-black/25 p-3">
            <dt className="text-parchemin-200/70">Prochain événement</dt>
            <dd className="font-bold text-parchemin-100">
              {next ? (
                <>
                  {next.label}
                  <span className="block font-mono text-or-300">dans {formatDuration(Date.parse(next.due_at!) - now)}</span>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-4 grid gap-2">
          {state.phase === "PREPARATION" && <IntroCountdown state={state} now={now} />}
          {state.phase === "PREPARATION" && (
            <ActionButton
              variant="gold"
              className="py-4 text-lg"
              onAction={api.start}
              confirm={{ title: "Démarrer la partie ?", message: "La vidéo d'introduction du Père Noël sera lancée sur la TV.", confirmLabel: "Démarrer" }}
            >
              ▶ Démarrer la partie (vidéo d'intro)
            </ActionButton>
          )}
          <div className="grid grid-cols-2 gap-2">
            {NEXT_PHASES[state.phase]
              .filter((p) => p !== "INTRO")
              .map((p) => {
                const critical = CRITICAL_PHASES.includes(p);
                return (
                  <ActionButton
                    key={p}
                    variant={critical ? "primary" : "green"}
                    className="py-3"
                    onAction={() => api.setPhase(p, critical)}
                    confirm={
                      critical || p === "FIN"
                        ? {
                            title: `${PHASE_LABELS[p]} ?`,
                            message:
                              p === "FIN"
                                ? "La partie sera marquée comme terminée."
                                : `La vidéo « ${PHASE_LABELS[p]} » sera diffusée immédiatement sur la TV.`,
                            confirmLabel: "Oui, déclencher",
                          }
                        : undefined
                    }
                  >
                    {PHASE_BUTTON_LABELS[p] ?? PHASE_LABELS[p]}
                  </ActionButton>
                );
              })}
          </div>
          {state.phase !== "FIN" && <EmergencyControl state={state} />}
        </div>
      </Card>

      <Card title="Télévision">
        <NowPlaying state={state} />
      </Card>

      <Card title="Progression">
        <p className="text-sm text-parchemin-200">
          Équipes validées : <strong className="text-or-300">{validated} / {state.teams.length}</strong>
          {" · "}Lutins : <strong className="text-or-300">{state.kids.completed_count} / {state.kids.total}</strong>
        </p>
        <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">
          {state.teams.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-lg bg-black/25 px-2 py-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
              <span className="truncate">{t.theme}</span>
              <span className="ml-auto text-xs text-parchemin-200/70">{TEAM_LABELS[t.status]}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Sauvegarde et remise à zéro">
        <p className="mb-3 text-sm text-parchemin-200/80">
          L'état est enregistré en continu : après un redémarrage, la partie reprend où elle en était.
          Démarrée à {formatTime(state.started_at)}.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <ActionButton onAction={async () => api.backup()} success="Sauvegarde créée dans data/backups">
            💾 Sauvegarder
          </ActionButton>
          <ActionButton
            variant="danger"
            onAction={api.reset}
            confirm={{
              title: "Réinitialiser la partie ?",
              message: "Phase, équipes, mini-jeux et planning reviennent à zéro. Le journal est conservé.",
              confirmLabel: "Réinitialiser",
            }}
            success="Partie réinitialisée"
          >
            ↺ Réinitialiser
          </ActionButton>
        </div>
      </Card>
    </>
  );
}
