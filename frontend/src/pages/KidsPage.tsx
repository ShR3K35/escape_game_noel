import { lazy, Suspense, useEffect, useRef, useState } from "react";

import type { ArcadeGameId, ArcadeLevel } from "../arcade/ArcadeHost";
import { Confetti, Snowfall } from "../components/Ambient";
import { CodeGame } from "../games/CodeGame";
import { ConstellationGame } from "../games/ConstellationGame";
import { FreePlayGame } from "../games/FreePlayGame";
import { MachineGame } from "../games/MachineGame";
import { TourneeGame } from "../games/TourneeGame";
import { setSoundEnabled, sfx, soundEnabled } from "../games/sounds";
import { useLiveChannel } from "../hooks/useLiveChannel";
import { api } from "../services/api";
import type {
  AttemptResult,
  CodeContent,
  ConstellationContent,
  FreeGameId,
  FreePlayData,
  KidsGame,
  KidsGameId,
  KidsState,
  MachineContent,
  Reward,
  TourneeContent,
} from "../services/types";

// Jeux bonus débloqués quand toutes les missions sont réussies : chargés seulement à l'ouverture (three.js est lourd).
const ArcadeHost = lazy(() => import("../arcade/ArcadeHost"));

const ARCADE_LEVELS: { id: ArcadeLevel; label: string }[] = [
  { id: "facile", label: "Facile" },
  { id: "normal", label: "Normal" },
  { id: "difficile", label: "Difficile" },
];
const ARCADE: { id: ArcadeGameId; icon: string; title: string; subtitle: string }[] = [
  { id: "plateformes", icon: "⛄", title: "La Grande Tournée", subtitle: "Saute et récolte les clochettes" },
  { id: "kart", icon: "🏎️", title: "Le Grand Prix", subtitle: "Course de karts enneigée" },
];
const FREE_SUBTITLES: Record<FreeGameId, string> = {
  constellation: "Mémoire des étoiles",
  machine: "Calculs de Noël",
  tournee: "Vol du traîneau",
};
/** Couleur des boutons de niveau, du plus facile au plus difficile. */
const LEVEL_TONES = [
  "border-sapin-800 bg-sapin-600 text-white",
  "border-or-600 bg-or-400 text-bois-950",
  "border-bordeaux-900 bg-bordeaux-600 text-white",
];

interface RoomGame {
  key: string;
  icon: string;
  title: string;
  subtitle: string;
  levels: { id: string; label: string }[];
  play: (level: string) => void;
}

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

/** Une carte de la salle de jeux : on touche directement le niveau pour lancer la partie. */
function RoomCard({ game }: { game: RoomGame }) {
  return (
    <div className="flex flex-col rounded-[1.5rem] border-4 border-or-400 bg-bordeaux-700 p-3 text-white shadow-xl" data-room={game.key}>
      <div className="flex items-center gap-3 text-left">
        <span className="text-4xl" style={{ animation: "float 3s ease-in-out infinite" }}>
          {game.icon}
        </span>
        <span>
          <span className="block text-xl font-black leading-tight">{game.title}</span>
          <span className="block text-sm font-bold text-white/80">{game.subtitle}</span>
        </span>
      </div>
      <div className="mt-auto grid gap-2 pt-2" style={{ gridTemplateColumns: `repeat(${game.levels.length}, minmax(0, 1fr))` }}>
        {game.levels.map((l, i) => (
          <button
            key={l.id}
            type="button"
            data-level={l.id}
            aria-label={`${game.title} : niveau ${l.label}`}
            onClick={() => {
              sfx.bell();
              game.play(l.id);
            }}
            className={`min-h-12 rounded-xl border-b-4 px-1 text-base font-black shadow active:translate-y-0.5 active:border-b-2 ${
              LEVEL_TONES[Math.round((i * (LEVEL_TONES.length - 1)) / Math.max(1, game.levels.length - 1))]
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Mission accomplie : le message final, puis la salle de jeux (tous les jeux, niveau au choix des lutins). */
function FinalScreen({ title, message, emergency, room }: {
  title: string;
  message: string;
  emergency: boolean;
  room: RoomGame[];
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto overflow-x-hidden text-center" data-testid="kids-final">
      <Confetti count={40} />
      <div className="pointer-events-none absolute left-0 top-2 text-6xl" style={{ animation: "sleigh 7s linear infinite" }}>
        🛷🦌🦌
      </div>
      <h2 className="relative mt-2 text-4xl font-black text-or-300 drop-shadow short:mt-0 short:text-3xl">🏆 {title}</h2>
      <p className="parchment relative mt-2 max-w-3xl rounded-2xl px-5 py-2 text-lg font-bold leading-snug shadow-xl short:text-base" data-testid="final-message">
        {message}
      </p>
      <p
        className={`relative mt-2 rounded-full border-2 px-4 py-1 text-lg font-black shadow ${
          emergency ? "border-sapin-300 bg-sapin-600 text-white" : "border-bordeaux-300 bg-bordeaux-800 text-white"
        }`}
        data-testid="emergency-status"
        data-authorized={emergency}
      >
        🚨 {emergency ? "✅ Protocole d'urgence autorisé" : "⛔ Protocole d'urgence non autorisé"}
      </p>
      <div className="relative z-10 mt-3 w-full max-w-5xl pb-2" data-testid="arcade-menu">
        <h3 className="text-2xl font-black text-or-300 drop-shadow">🎮 Salle de jeux des lutins : choisissez un jeu et un niveau !</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {room.map((g) => (
            <RoomCard key={g.key} game={g} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function KidsPage() {
  const { data, connected } = useLiveChannel<KidsState>("kids");
  const [openId, setOpenId] = useState<KidsGameId | null>(null);
  const [celebrate, setCelebrate] = useState<{ id: KidsGameId; title: string; reward: Reward | null; at: number; free?: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(soundEnabled);
  const [error, setError] = useState<string | null>(null);
  const [arcade, setArcade] = useState<{ id: ArcadeGameId; level: ArcadeLevel } | null>(null);
  // Salle de jeux : un jeu des missions rejoué au niveau choisi par les lutins (vérifié sur la tablette).
  const [free, setFree] = useState<{ id: FreeGameId; level: string; label: string } | null>(null);
  const [freeData, setFreeData] = useState<FreePlayData | null>(null);

  useEffect(() => {
    if (!free) {
      setFreeData(null);
      return;
    }
    let alive = true;
    setError(null);
    api.freePlay(free.id, free.level).then(
      (d) => alive && setFreeData(d),
      () => {
        if (!alive) return;
        setError("Oups ! La tablette n'arrive pas à joindre le Père Noël. Réessayez dans un instant.");
        setFree(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [free]);

  // La salle de jeux se referme si le maître du jeu relance la mission.
  const roomOpen = !!data?.all_completed;
  useEffect(() => {
    if (!roomOpen) {
      setFree(null);
      setArcade(null);
    }
  }, [roomOpen]);

  const onFreeResult = (r: AttemptResult) => {
    if (!free) return;
    if (r.correct && r.completed) {
      const delay = free.id === "machine" ? 1600 : 0;
      if (delay) setTimeout(() => sfx.fanfare(), delay);
      else sfx.fanfare();
      setCelebrate({ id: free.id, title: `${freeData?.title ?? ""} · niveau ${free.label}`, reward: null, at: Date.now() + delay, free: true });
    } else if (free.id === "constellation") (r.correct ? sfx.success : sfx.wrong)();
  };

  const room: RoomGame[] = [
    ...(data?.free_play ?? []).map((g) => ({
      key: g.id,
      icon: ICONS[g.id],
      title: g.title,
      subtitle: FREE_SUBTITLES[g.id],
      levels: g.levels,
      play: (level: string) => setFree({ id: g.id, level, label: g.levels.find((l) => l.id === level)?.label ?? level }),
    })),
    ...ARCADE.map((a) => ({
      key: a.id,
      icon: a.icon,
      title: a.title,
      subtitle: a.subtitle,
      levels: ARCADE_LEVELS,
      play: (level: string) => setArcade({ id: a.id, level: level as ArcadeLevel }),
    })),
  ];

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
      {!open && !free && !arcade && <Snowfall count={35} />}
      <header className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3 short:py-1">
        <button
          onClick={() => {
            setOpenId(null);
            setFree(null);
          }}
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

        {data && !open && free && (
          <div className="parchment mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col rounded-[2rem] p-4 shadow-2xl sm:p-6 short:p-3" data-testid={`free-${free.id}`}>
            <div className="mb-3 flex shrink-0 items-center gap-3 short:mb-1">
              <button onClick={() => setFree(null)} className="rounded-2xl bg-bois-700 px-4 py-3 text-lg font-black text-white short:py-2">
                ← Salle de jeux
              </button>
              <h1 className="flex-1 text-3xl font-black text-bordeaux-800 short:text-2xl">
                {ICONS[free.id]} {freeData?.title ?? "…"}{" "}
                <span className="whitespace-nowrap rounded-full bg-or-300 px-3 py-0.5 align-middle text-lg text-bois-950" data-testid="free-level">
                  {free.label}
                </span>
              </h1>
              <div id="game-toolbar" className="flex items-center gap-2" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto [container-type:size]" data-testid="game-body">
              {freeData ? (
                <FreePlayGame key={`${free.id}-${free.level}`} data={freeData} onResult={onFreeResult} />
              ) : (
                <p className="text-center text-2xl font-bold text-encre/70">Le Père Noël prépare la partie…</p>
              )}
            </div>
          </div>
        )}

        {data && !open && !free && data.all_completed && data.final && (
          <FinalScreen title={data.final.title} message={data.final.message} emergency={!!data.final.emergency_authorized} room={room} />
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

      {arcade && data?.all_completed && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-[#0b0d2a]" />}>
          <ArcadeHost game={arcade.id} level={arcade.level} onExit={() => setArcade(null)} />
        </Suspense>
      )}

      {celebrate && celebrate.at <= now && (
        <Celebration
          title={celebrate.title}
          reward={celebrate.reward}
          chest={celebrate.id === "machine"}
          onClose={() => {
            if (celebrate.free) setFree(null); // retour à la salle de jeux
            setCelebrate(null);
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}
