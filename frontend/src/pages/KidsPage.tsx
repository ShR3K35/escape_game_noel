import { useEffect, useRef, useState } from "react";

import { Confetti, Snowfall } from "../components/Ambient";
import { CodeGame } from "../games/CodeGame";
import { ConstellationGame } from "../games/ConstellationGame";
import { MachineGame } from "../games/MachineGame";
import { TourneeGame } from "../games/TourneeGame";
import { setSoundEnabled, sfx, soundEnabled } from "../games/sounds";
import { useLiveChannel } from "../hooks/useLiveChannel";
import { api } from "../services/api";
import type {
  CodeContent,
  ConstellationContent,
  KidsGame,
  KidsGameId,
  KidsState,
  MachineContent,
  Reward,
  TourneeContent,
} from "../services/types";

const ICONS: Record<KidsGameId, string> = { constellation: "✨", machine: "⚙️", tournee: "🎅", code: "🛷" };

function RewardBar({ games }: { games: KidsGame[] }) {
  return (
    <div className="flex gap-2" aria-label="récompenses">
      {games
        .filter((g) => g.id !== "code")
        .map((g) => (
          <span
            key={g.id}
            className={`flex h-14 min-w-14 items-center justify-center gap-1 rounded-2xl border-2 px-2 text-2xl font-black ${
              g.reward ? "animate-pop border-or-400 bg-or-300 text-bois-950" : "border-white/30 bg-white/10 text-white/40"
            }`}
          >
            {g.reward ? (
              <>
                {g.reward.symbol}
                <span>{g.reward.digit}</span>
              </>
            ) : (
              "?"
            )}
          </span>
        ))}
    </div>
  );
}

/** Coffre magique de la machine à cadeaux : le couvercle s'ouvre et révèle le chiffre doré. */
function Chest({ reward }: { reward: Reward }) {
  return (
    <div className="mt-4 flex flex-col items-center" data-testid="machine-chest">
      <div className="relative h-44 w-48">
        <span
          className="gold-text absolute inset-x-0 top-0 text-center font-display text-8xl font-black drop-shadow"
          style={{ animation: "rise 0.8s ease-out 0.7s both" }}
        >
          {reward.digit}
        </span>
        <svg viewBox="0 0 160 110" className="absolute inset-x-0 bottom-0" aria-hidden>
          <rect x="14" y="52" width="132" height="54" rx="8" fill="#7a1a2c" stroke="#3e0a17" strokeWidth="4" />
          <rect x="14" y="70" width="132" height="8" fill="#c9a24b" />
          <rect x="70" y="62" width="20" height="26" rx="4" fill="#ddbf72" stroke="#7f6128" strokeWidth="3" />
          <g style={{ transformBox: "fill-box", transformOrigin: "left bottom", animation: "lid-open 0.7s ease-in-out 0.2s both" }}>
            <path d="M14 54 q66 -50 132 0 z" fill="#9b2638" stroke="#3e0a17" strokeWidth="4" />
            <rect x="74" y="34" width="12" height="20" fill="#c9a24b" />
          </g>
        </svg>
      </div>
      <span className="text-lg font-bold text-bois-950">
        {reward.symbol} Vous gagnez {reward.label}&nbsp;!
      </span>
    </div>
  );
}

function Celebration({ title, reward, chest, onClose }: {
  title: string;
  reward: Reward | null;
  chest?: boolean;
  onClose: () => void;
}) {
  if (chest && reward)
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-sapin-950/80 p-6" onClick={onClose} role="dialog" aria-label="Bravo">
        <Confetti count={40} />
        <div className="parchment animate-pop w-full max-w-lg rounded-[2rem] p-6 text-center shadow-2xl">
          <h2 className="text-4xl font-black text-sapin-700">Bravo !</h2>
          <p className="mt-2 text-2xl font-bold text-encre">
            Bravo les lutins&nbsp;! Vous avez trouvé le premier chiffre du code secret du traîneau&nbsp;!
          </p>
          <Chest reward={reward} />
          <p className="text-sm font-bold text-bois-900">Retenez bien ce chiffre !</p>
          <button className="mt-4 block w-full rounded-2xl bg-sapin-600 py-4 text-2xl font-black text-white" onClick={onClose}>
            Continuer ➜
          </button>
        </div>
      </div>
    );
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-sapin-950/80 p-6" onClick={onClose} role="dialog" aria-label="Bravo">
      <Confetti />
      <div className="parchment animate-pop w-full max-w-lg rounded-[2rem] p-8 text-center shadow-2xl">
        <p className="text-7xl">🎉</p>
        <h2 className="mt-2 text-5xl font-black text-sapin-700">Bravo !</h2>
        <p className="mt-2 text-2xl font-bold text-encre">Vous avez réussi « {title} » !</p>
        {reward && (
          <div className="mt-5 inline-flex flex-col items-center rounded-3xl border-4 border-or-500 bg-or-300 px-8 py-4">
            <span className="text-6xl">{reward.symbol}</span>
            <span className="text-lg font-bold text-bois-950">Vous gagnez {reward.label}</span>
            <span className="text-6xl font-black text-bordeaux-800">{reward.digit}</span>
            <span className="text-sm font-bold text-bois-900">Retenez bien ce chiffre !</span>
          </div>
        )}
        <button className="mt-6 block w-full rounded-2xl bg-sapin-600 py-4 text-2xl font-black text-white" onClick={onClose}>
          Continuer ➜
        </button>
      </div>
    </div>
  );
}

function FinalScreen({ title, message, games }: { title: string; message: string; games: KidsGame[] }) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden text-center" data-testid="kids-final">
      <Confetti count={60} />
      <div className="pointer-events-none absolute left-0 top-10 text-7xl" style={{ animation: "sleigh 7s linear infinite" }}>
        🛷🦌🦌
      </div>
      <p className="text-8xl">🏆</p>
      <h2 className="mt-4 text-5xl font-black text-or-300 drop-shadow">{title}</h2>
      <p className="parchment mt-6 max-w-2xl rounded-3xl p-6 text-2xl font-bold leading-snug shadow-xl">{message}</p>
      <div className="mt-6">
        <RewardBar games={games} />
      </div>
    </div>
  );
}

export default function KidsPage() {
  const { data, connected } = useLiveChannel<KidsState>("kids");
  const [openId, setOpenId] = useState<KidsGameId | null>(null);
  const [celebrate, setCelebrate] = useState<{ id: KidsGameId; title: string; reward: Reward | null; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(soundEnabled);
  const [error, setError] = useState<string | null>(null);

  const open = data?.games.find((g) => g.id === openId) ?? null;

  // Débloqué ou réinitialisé par le maître du jeu pendant que le jeu est ouvert. Pas pendant un essai :
  // l'état poussé « réussi » peut arriver avant la réponse de l'essai, qui déclenche la célébration.
  const inFlight = useRef(false);
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    if (open && open.status !== "available" && !celebrate && !inFlight.current) setOpenId(null);
  }, [open, celebrate, settled]);

  // La machine à cadeaux s'illumine avant l'ouverture du coffre : la fenêtre « Bravo » attend un peu.
  useEffect(() => {
    if (!celebrate || celebrate.at <= now) return;
    const t = setTimeout(() => setNow(Date.now()), celebrate.at - Date.now());
    return () => clearTimeout(t);
  }, [celebrate, now]);

  const submit = async (answer: unknown) => {
    if (!open) throw new Error("aucun jeu");
    setError(null);
    // La machine et le traîneau jouent leurs propres sons (grelots, « pouet », chocs) pendant leurs animations.
    const ownSounds = open.id === "machine" || open.id === "tournee";
    inFlight.current = true;
    try {
      const r = await api.attempt(open.id, answer);
      if (r.correct && r.completed) {
        const delay = open.id === "machine" ? 1600 : 0;
        if (delay) setTimeout(() => sfx.fanfare(), delay);
        else sfx.fanfare();
        setCelebrate({ id: open.id, title: open.title, reward: r.reward ?? null, at: Date.now() + delay });
      } else if (ownSounds) {
        /* rien */
      } else if (r.correct) sfx.success();
      else sfx.wrong();
      return r;
    } catch (e) {
      setError("Oups ! La tablette n'arrive pas à joindre le Père Noël. Réessayez dans un instant.");
      throw e;
    } finally {
      inFlight.current = false;
      setSettled((n) => n + 1);
    }
  };

  const toggleSound = () => {
    setSoundEnabled(!sound);
    setSound(!sound);
  };

  const rewards = (data?.games ?? []).filter((g) => g.reward).map((g) => g.reward!) as Reward[];

  const renderGame = (g: KidsGame) => {
    const props = { submit };
    switch (g.id) {
      case "constellation":
        return <ConstellationGame {...props} game={g as KidsGame & { content: ConstellationContent }} />;
      case "machine":
        return <MachineGame {...props} game={g as KidsGame & { content: MachineContent }} />;
      case "tournee":
        return <TourneeGame {...props} game={g as KidsGame & { content: TourneeContent }} />;
      case "code":
        return <CodeGame {...props} game={g as KidsGame & { content: CodeContent }} rewards={rewards} />;
    }
  };

  return (
    // Tout tient dans l'écran (tablette en paysage) : en-tête fixe, puis une zone qui prend le reste de la hauteur
    // et centre son contenu. Seul le corps d'un jeu défile, en dernier recours.
    <div className="relative flex h-dvh select-none flex-col overflow-hidden bg-[linear-gradient(180deg,var(--color-sapin-800),var(--color-sapin-950))] font-sans">
      {/* Les flocons de la page ne tombent que sur la carte : en jeu, ils coûteraient des images au jeu lui-même. */}
      {!open && <Snowfall count={35} />}
      <header className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3 short:py-1">
        <button
          onClick={() => setOpenId(null)}
          className="flex items-center gap-2 text-left"
          aria-label="Retour à la carte des missions"
        >
          <span className="text-4xl">🧝</span>
          <span>
            <span className="block text-2xl font-black text-or-300">Mission des Lutins</span>
            <span className="block text-sm text-white/70">{connected ? "Le Père Noël vous regarde ✨" : "Connexion…"}</span>
          </span>
        </button>
        <div className="flex items-center gap-3">
          {data && <RewardBar games={data.games} />}
          <button
            onClick={toggleSound}
            className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-3xl"
            aria-label={sound ? "Couper le son" : "Activer le son"}
            aria-pressed={sound}
          >
            {sound ? "🔊" : "🔇"}
          </button>
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-4 short:pb-2">
        {error && <p className="mx-auto mb-3 max-w-2xl shrink-0 rounded-2xl bg-bordeaux-700 p-3 text-center text-lg font-bold text-white">{error}</p>}
        {!data && <p className="m-auto text-center text-2xl text-white/80">Le traîneau arrive…</p>}

        {data && open && (
          <div
            className="parchment mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col rounded-[2rem] p-4 shadow-2xl sm:p-6 short:p-3"
            data-testid={`game-${open.id}`}
          >
            <div className="mb-3 flex shrink-0 items-center gap-3 short:mb-1">
              <button onClick={() => setOpenId(null)} className="rounded-2xl bg-bois-700 px-4 py-3 text-lg font-black text-white short:py-2">
                ← Carte
              </button>
              <h1 className="flex-1 text-3xl font-black text-bordeaux-800 short:text-2xl">
                {ICONS[open.id]} {open.title}
              </h1>
              {/* Emplacement où un jeu peut placer ses repères (ex. manches de la constellation) : place gagnée en hauteur. */}
              <div id="game-toolbar" className="flex items-center gap-2" />
            </div>
            {open.content && "instructions" in open.content && open.id !== "machine" && open.id !== "tournee" && open.id !== "constellation" && (
              <p className="mb-3 shrink-0 text-center text-xl text-encre/80 short:mb-1 short:text-lg">{open.content.instructions}</p>
            )}
            {/* Corps du jeu : centré verticalement dans la place restante. */}
            <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto [container-type:size]" data-testid="game-body">
              {renderGame(open)}
            </div>
          </div>
        )}

        {data && !open && data.all_completed && data.final && (
          <FinalScreen title={data.final.title} message={data.final.message} games={data.games} />
        )}

        {data && !open && !data.all_completed && (
          <div className="mx-auto grid w-full max-w-5xl flex-1 gap-4 sm:grid-cols-2 sm:grid-rows-2 short:gap-3" data-testid="kids-map">
            {data.games.map((g, i) => (
              <button
                key={g.id}
                type="button"
                data-game={g.id}
                disabled={g.status !== "available"}
                onClick={() => {
                  sfx.bell();
                  setOpenId(g.id);
                }}
                className={`relative flex min-h-36 flex-col items-center justify-center rounded-[2rem] border-4 p-5 text-center shadow-xl transition short:p-3 ${
                  g.status === "available"
                    ? "glow-pulse border-or-400 bg-bordeaux-700 text-white"
                    : g.status === "completed"
                      ? "border-sapin-500 bg-sapin-700 text-white"
                      : "border-white/20 bg-black/25 text-white/50"
                }`}
              >
                <span className="text-6xl" style={g.status === "available" ? { animation: "float 3s ease-in-out infinite" } : undefined}>
                  {g.status === "locked" ? "🔒" : ICONS[g.id]}
                </span>
                <span className="mt-2 text-2xl font-black">
                  {i + 1}. {g.title}
                </span>
                <span className="text-lg font-bold">
                  {g.status === "completed" ? "✅ Réussi !" : g.status === "available" ? "▶ Touchez pour jouer" : "Bientôt…"}
                </span>
              </button>
            ))}
          </div>
        )}
      </main>

      {celebrate && celebrate.at <= now && (
        <Celebration
          title={celebrate.title}
          reward={celebrate.reward}
          chest={celebrate.id === "machine"}
          onClose={() => {
            setCelebrate(null);
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}
