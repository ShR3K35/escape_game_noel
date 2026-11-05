import { useState, type FormEvent } from "react";

import { api } from "../../services/api";
import { AMBIENT_LABELS } from "../../services/labels";
import type { AdminState } from "../../services/types";
import { ActionButton } from "../ui/ActionButton";
import { Card, Pill } from "../ui/Card";
import { useFeedback } from "../ui/Feedback";

export function NowPlaying({ state }: { state: AdminState }) {
  const play = state.tv.play;
  const msg = state.tv.message;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2 rounded-lg bg-black/25 p-3">
        <div data-testid="now-playing">
          <p className="text-parchemin-200/70">À l'écran</p>
          <p className="font-bold">{play ? `▶ ${play.video.title}` : "Bureau du Père Noël (boucle)"}</p>
          {play && !play.video.available && <Pill tone="warn">fichier absent : écran de substitution</Pill>}
        </div>
        {play && (
          <ActionButton variant="ghost" onAction={api.stop}>
            ■ Stop
          </ActionButton>
        )}
      </div>
      {msg && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-black/25 p-3">
          <p>
            <span className="text-parchemin-200/70">Message : </span>
            <strong>{msg.title}</strong>
          </p>
          <ActionButton onAction={api.clearMessage}>Retirer</ActionButton>
        </div>
      )}
      {(state.connections.tv ?? 0) === 0 && (
        <p className="rounded-lg bg-bordeaux-800/60 p-2 text-xs">⚠ Aucun écran TV connecté (ouvrir /tv sur la télévision).</p>
      )}
    </div>
  );
}

export function TvPanel({ state }: { state: AdminState }) {
  const fb = useFeedback();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("Message du Père Noël");
  const [duration, setDuration] = useState(20);

  const sendCustom = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.message({ text, title, duration });
      setText("");
      fb.notify("Message affiché sur la TV");
    } catch (err) {
      fb.notify(err instanceof Error ? err.message : "Erreur", "error");
    }
  };

  return (
    <>
      <Card title="En cours">
        <NowPlaying state={state} />
      </Card>

      <Card title="Vidéos">
        <ul className="space-y-2">
          {state.videos
            .filter((v) => v.kind !== "loop")
            .map((v) => (
              <li key={v.id} className="flex items-center gap-2 rounded-lg bg-black/25 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{v.title}</p>
                  <p className="truncate font-mono text-[11px] text-parchemin-200/60">
                    {v.file} {v.available ? "" : "· absent (substitution)"}
                  </p>
                </div>
                <ActionButton
                  variant={state.tv.play?.video.id === v.id ? "gold" : "green"}
                  onAction={() => api.play(v.id)}
                  title={`Lancer ${v.title}`}
                >
                  ▶ Lancer
                </ActionButton>
              </li>
            ))}
        </ul>
        <p className="mt-2 text-xs text-parchemin-200/60">
          Lancer une vidéo ici ne change pas la phase de jeu : idéal pour tester. Boucle du bureau :{" "}
          {state.tv.loop.available ? "présente" : "absente (décor animé de substitution)"}.
        </p>
      </Card>

      <Card title="Messages du Père Noël">
        <div className="grid gap-2">
          {state.messages.map((m) => (
            <ActionButton key={m.id} onAction={() => api.message({ message_id: m.id })} success="Message affiché" className="text-left">
              <span className="block">{m.title}</span>
              <span className="block text-xs font-normal text-parchemin-200/70">{m.text}</span>
            </ActionButton>
          ))}
        </div>
        <form onSubmit={sendCustom} className="mt-4 space-y-2 rounded-lg bg-black/25 p-3">
          <p className="text-sm font-bold text-or-400">Message libre</p>
          <input
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md bg-white/90 px-3 py-2 text-encre"
            aria-label="Titre du message"
          />
          <textarea
            value={text}
            maxLength={600}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ho ho ho…"
            className="w-full rounded-md bg-white/90 px-3 py-2 text-encre"
            aria-label="Texte du message"
          />
          <div className="flex items-center gap-2">
            <label className="text-sm">
              Durée{" "}
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="rounded bg-white/90 px-2 py-1 text-encre">
                {[10, 20, 30, 60, 120].map((d) => (
                  <option key={d} value={d}>
                    {d} s
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={!text.trim()} className="ml-auto rounded-lg bg-or-500 px-4 py-2 font-bold text-bois-950 disabled:opacity-40">
              Afficher
            </button>
          </div>
        </form>
      </Card>

      <Card title="Affichage sur la TV">
        <ActionButton
          variant={state.tv.show_progress ? "gold" : "ghost"}
          className="mb-3 w-full"
          onAction={() => api.tvProgress(!state.tv.show_progress)}
        >
          {state.tv.show_progress ? "✓ Avancement équipes + lutins affiché" : "Avancement équipes + lutins masqué"}
        </ActionButton>
        <p className="mb-3 text-xs text-parchemin-200/60">
          Panneau visible sur la boucle du bureau. Chaque énigme validée et chaque mini-jeu réussi déclenche une animation
          sur la TV (mise en attente pendant une vidéo).
        </p>
        <p className="mb-2 text-sm font-bold text-or-400">Ambiance</p>
        <div className="grid grid-cols-2 gap-2">
          {state.ambients.map((a) => (
            <ActionButton key={a} variant={state.tv.ambient === a ? "gold" : "ghost"} onAction={() => api.ambient(a)}>
              {AMBIENT_LABELS[a] ?? a}
            </ActionButton>
          ))}
        </div>
      </Card>
    </>
  );
}
