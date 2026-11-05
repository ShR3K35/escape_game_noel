import { useCallback, useEffect, useRef, useState } from "react";

import { AmbientLayer } from "../components/Ambient";
import { FADE_MS, decide, messageVisible, screenFor, type Screen } from "../components/tv/playback";
import { CELEBRATION_MS, detectSuccesses, type Success } from "../components/tv/progress";
import { ProgressOverlay, SuccessCelebration } from "../components/tv/ProgressOverlay";
import { sfx } from "../games/sounds";
import { FallbackScreen, LoopLayer, MainVideo, MessageOverlay } from "../components/tv/TvScenes";
import { WaitingScreen } from "../components/tv/WaitingScreen";
import { useLiveChannel } from "../hooks/useLiveChannel";
import { api } from "../services/api";
import type { PublicState } from "../services/types";

/** Préchargement séquentiel des vidéos dans le cache du navigateur (désactivable par ?preload=0). */
function usePreload(urls: string[] | undefined) {
  const done = useRef(false);
  useEffect(() => {
    if (!urls || done.current || new URLSearchParams(location.search).get("preload") === "0") return;
    done.current = true;
    (async () => {
      for (const url of urls) {
        try {
          const res = await fetch(url);
          const reader = res.body?.getReader();
          while (reader && !(await reader.read()).done) {
            /* lecture complète = mise en cache */
          }
        } catch {
          /* fichier indisponible : tant pis */
        }
      }
    })();
  }, [urls]);
}

/** Interface télévision : aucune commande, uniquement l'affichage piloté par le maître du jeu. */
export default function TvPage() {
  const { data, connected, clockOffset } = useLiveChannel<PublicState>("tv");
  const [screen, setScreen] = useState<Screen>({ kind: "loop" });
  const [fading, setFading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [needsSound, setNeedsSound] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const currentId = useRef<string | null>(null);
  const firstSnapshot = useRef(true);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dataRef = useRef(data);
  dataRef.current = data;

  usePreload(data?.tv.preload);

  // Succès (équipe validée, mini-jeu réussi) détectés en comparant les états successifs.
  const [successes, setSuccesses] = useState<Success[]>([]);
  const prevState = useRef<PublicState | null>(null);
  useEffect(() => {
    if (!data) return;
    const found = detectSuccesses(prevState.current, data);
    prevState.current = data;
    if (found.length) setSuccesses((q) => [...q, ...found].slice(-8));
  }, [data]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const transition = useCallback((next: Screen) => {
    clearTimeout(fadeTimer.current);
    setFading(true);
    fadeTimer.current = setTimeout(() => {
      setScreen(next);
      setFading(false);
    }, FADE_MS);
  }, []);

  const finish = useCallback(
    (playId: string) => {
      if (currentId.current !== playId) return;
      currentId.current = null;
      api.tvEnded(playId).catch(() => undefined);
      transition({ kind: "loop" });
    },
    [transition],
  );

  const playId = data?.tv.play?.play_id ?? null;
  const loaded = data !== null;
  useEffect(() => {
    const d = dataRef.current;
    if (!d) return;
    const play = d.tv.play;
    const decision = decide(play, currentId.current, Date.now() + clockOffset, firstSnapshot.current);
    firstSnapshot.current = false;
    if (decision === "start" && play) {
      currentId.current = play.play_id;
      transition(screenFor(play));
    } else if (decision === "stop") {
      currentId.current = null;
      transition({ kind: "loop" });
    } else if (decision === "discard" && play) {
      api.tvEnded(play.play_id).catch(() => undefined);
    }
  }, [playId, loaded, clockOffset, transition]);

  const onAutoplayBlocked = useCallback(() => {
    setMuted(true);
    setNeedsSound(true);
  }, []);

  const enableSound = () => {
    setMuted(false);
    setNeedsSound(false);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else document.documentElement.requestFullscreen().catch(() => undefined);
  };

  // Avant le démarrage : écran d'attente (et compte à rebours) à la place de la boucle du bureau.
  const waiting = screen.kind === "loop" && data?.phase === "PREPARATION";

  // Une animation à la fois, uniquement sur la boucle du bureau : en attente pendant une vidéo.
  const celebration = screen.kind === "loop" && !waiting && !fading ? successes[0] : undefined;
  useEffect(() => {
    if (!celebration) return;
    if (!muted) sfx.fanfare();
    const t = setTimeout(() => setSuccesses((q) => q.slice(1)), CELEBRATION_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebration?.key]);

  const message = data?.tv.message;
  const showMessage = message && messageVisible(message.until, now + clockOffset);

  return (
    <div
      className={`relative h-dvh w-screen select-none overflow-hidden bg-black ${needsSound ? "" : "cursor-none"}`}
      onDoubleClick={toggleFullscreen}
      data-testid="tv-root"
      data-screen={screen.kind}
      data-waiting={waiting ? "true" : undefined}
    >
      <div className="absolute left-1/2 top-1/2 aspect-video max-h-full w-full max-w-[177.78vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden">
        {data && <LoopLayer loop={data.tv.loop} active={screen.kind === "loop" && !waiting} muted={muted} onAutoplayBlocked={onAutoplayBlocked} />}

        {waiting && data && <WaitingScreen countdownUntil={data.tv.countdown?.until ?? null} clockOffset={clockOffset} />}
        {screen.kind === "loop" && !waiting && data && <AmbientLayer ambient={data.tv.ambient} />}
        {screen.kind === "loop" && !waiting && data?.tv.show_progress && <ProgressOverlay state={data} highlight={celebration} />}
        {celebration && <SuccessCelebration key={celebration.key} success={celebration} />}

        {screen.kind === "video" && (
          <MainVideo
            key={screen.play.play_id}
            play={screen.play}
            muted={muted}
            onAutoplayBlocked={onAutoplayBlocked}
            onEnded={() => finish(screen.play.play_id)}
            onError={() => setScreen({ kind: "fallback", play: screen.play })}
          />
        )}
        {screen.kind === "fallback" && (
          <FallbackScreen key={screen.play.play_id} play={screen.play} onDone={() => finish(screen.play.play_id)} />
        )}

        {showMessage && message && <MessageOverlay message={message} />}

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-30 bg-black transition-opacity ease-in-out"
          style={{ opacity: fading || !data ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
        />
      </div>

      {!data && (
        <p className="absolute inset-0 z-40 flex items-center justify-center font-display text-2xl text-or-400/70">
          Connexion au bureau du Père Noël…
        </p>
      )}
      {data && !connected && (
        <p className="absolute right-3 top-3 z-40 rounded bg-black/60 px-2 py-1 text-xs text-white/70">reconnexion…</p>
      )}
      {needsSound && (
        <button
          onClick={enableSound}
          className="absolute bottom-4 left-4 z-40 rounded-full bg-or-500 px-5 py-3 font-bold text-bois-950 shadow-xl"
        >
          🔊 Activer le son
        </button>
      )}
    </div>
  );
}
