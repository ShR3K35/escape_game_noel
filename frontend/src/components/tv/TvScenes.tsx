import { useEffect, useRef, useState } from "react";

import type { TvMessage, TvPlay, VideoInfo } from "../../services/types";
import { Snowfall, Starfield } from "../Ambient";

/** Décor animé affiché tant que la vidéo du bureau n'est pas disponible. */
export function OfficeDecor() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_50%_110%,#6b2a12_0%,var(--color-bois-900)_45%,var(--color-bois-950)_100%)]">
      <div className="absolute left-1/2 top-[8%] h-[52%] w-[34%] -translate-x-1/2 overflow-hidden rounded-t-[50%] border-[10px] border-bois-700 bg-[linear-gradient(180deg,#0b1430,#1d2b5c)] shadow-[inset_0_0_60px_rgba(0,0,0,0.6)]">
        <Starfield count={40} />
        <Snowfall count={40} />
        <div className="absolute inset-x-0 bottom-0 h-1/4 bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.85))]" />
        <div className="absolute inset-y-0 left-1/2 w-[10px] -translate-x-1/2 bg-bois-700" />
        <div className="absolute inset-x-0 top-1/2 h-[10px] -translate-y-1/2 bg-bois-700" />
      </div>
      <div
        className="absolute bottom-0 left-1/2 h-[30%] w-[60%] -translate-x-1/2 rounded-t-full bg-[radial-gradient(ellipse_at_50%_100%,rgba(255,170,60,0.55),transparent_70%)]"
        style={{ animation: "flicker 3s ease-in-out infinite" }}
      />
      <div className="absolute inset-x-0 bottom-[10%] text-center">
        <p className="gold-text font-display text-[4.5vw] font-extrabold drop-shadow-xl">Le bureau du Père Noël</p>
        <p className="mt-2 font-display text-[1.6vw] text-or-300/80">Ho ho ho… le Père Noël est à son bureau.</p>
      </div>
    </div>
  );
}

/** Boucle du bureau : jouée en continu, mise en pause pendant les autres vidéos. */
export function LoopLayer({ loop, active, muted, onAutoplayBlocked }: {
  loop: VideoInfo;
  active: boolean;
  muted: boolean;
  onAutoplayBlocked: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = muted || !active;
    if (active) {
      v.play().catch((err: DOMException) => {
        if (err.name === "NotAllowedError") {
          v.muted = true;
          onAutoplayBlocked();
          v.play().catch(() => undefined);
        }
      });
    } else {
      v.pause();
    }
  }, [active, muted, onAutoplayBlocked, failed]);

  if (!loop.available || failed) return <OfficeDecor />;
  return (
    <video
      ref={ref}
      data-testid="tv-loop"
      src={loop.url}
      loop
      playsInline
      preload="auto"
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full bg-black object-cover"
    />
  );
}

/** Vidéo de message (intro, relance…). Une nouvelle lecture = un nouvel élément (clé play_id). */
export function MainVideo({ play, muted, onEnded, onError, onAutoplayBlocked }: {
  play: TvPlay;
  muted: boolean;
  onEnded: () => void;
  onError: () => void;
  onAutoplayBlocked: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = muted;
    v.play().catch((err: DOMException) => {
      if (err.name === "NotAllowedError") {
        v.muted = true;
        onAutoplayBlocked();
        v.play().catch(onError);
      }
    });
    // play_id identifie la lecture ; les autres dépendances ne doivent pas relancer la vidéo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play.play_id]);
  useEffect(() => {
    if (ref.current && !muted) ref.current.muted = false;
  }, [muted]);
  return (
    <video
      ref={ref}
      data-testid="tv-video"
      data-video-id={play.video.id}
      src={play.video.url}
      playsInline
      preload="auto"
      onEnded={onEnded}
      onError={onError}
      className="absolute inset-0 h-full w-full bg-black object-contain"
    />
  );
}

/** Écran de substitution : vidéo manquante ou illisible. */
export function FallbackScreen({ play, onDone }: { play: TvPlay; onDone: () => void }) {
  const seconds = play.video.fallback_seconds;
  useEffect(() => {
    const t = setTimeout(onDone, seconds * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play.play_id]);
  return (
    <div
      data-testid="tv-fallback"
      data-video-id={play.video.id}
      className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,var(--color-bordeaux-800),var(--color-bordeaux-950)_75%)]"
    >
      <Snowfall count={70} />
      <div className="parchment animate-unroll relative mx-[8vw] max-w-[70vw] rounded-[2vw] px-[5vw] py-[4vw] text-center shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <p className="text-[4vw]">🎅</p>
        <h1 className="font-display text-[3vw] font-extrabold text-bordeaux-800">{play.video.title}</h1>
        <p className="mt-[1.5vw] font-sans text-[2.4vw] font-bold leading-snug text-encre">{play.video.fallback_text || "Ho ho ho !"}</p>
        <div className="mx-auto mt-[2.5vw] h-[0.5vw] w-1/2 overflow-hidden rounded-full bg-bordeaux-900/20">
          <div className="h-full bg-or-500" style={{ animation: `progress ${seconds}s linear forwards` }} />
        </div>
      </div>
      <style>{"@keyframes progress { from { width: 0 } to { width: 100% } }"}</style>
    </div>
  );
}

export function MessageOverlay({ message }: { message: TvMessage }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[7vh] z-20 flex justify-center px-[6vw]" data-testid="tv-message">
      <div key={message.id} className="parchment animate-unroll max-w-[75vw] rounded-[1.5vw] border-[0.3vw] border-or-600 px-[4vw] py-[2.5vw] text-center shadow-[0_25px_70px_rgba(0,0,0,0.7)]">
        <p className="font-display text-[2.2vw] font-extrabold text-bordeaux-800">✦ {message.title} ✦</p>
        <p className="mt-[1vw] font-sans text-[2.6vw] font-bold leading-snug text-encre">{message.text}</p>
      </div>
    </div>
  );
}
