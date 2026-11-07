import type { PublicState, TeamStatus } from "../../services/types";
import { Confetti } from "../Ambient";
import { CELEBRATION_MS, KIDS_ICONS, type Success } from "./progress";

function TeamStatusBadge({ status }: { status: TeamStatus }) {
  if (status === "VALIDEE")
    return (
      <span className="flex h-[2.4vw] w-[2.4vw] items-center justify-center rounded-full bg-or-500 shadow-[0_0_1vw_rgba(221,191,114,0.8)]">
        <svg viewBox="0 0 24 24" className="h-[1.5vw] w-[1.5vw]" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#24150c" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  if (status === "EN_COURS")
    return (
      <span className="flex items-center gap-[0.3vw]" aria-label="en cours">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-[0.55vw] w-[0.55vw] rounded-full bg-or-300"
            style={{ animation: `twinkle 1.4s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </span>
    );
  return <span className="h-[0.6vw] w-[1.6vw] rounded-full bg-white/15" aria-label="non commencée" />;
}

/** Protocole d'urgence des lutins : verrouillé (cadenas) ou autorisé (cadenas ouvert, pulsation). */
function EmergencyIndicator({ authorized }: { authorized: boolean }) {
  return (
    <div
      data-testid="tv-emergency"
      data-authorized={authorized}
      className={`mt-[1vw] flex items-center gap-[0.8vw] rounded-[0.7vw] border py-[0.5vw] pl-[0.6vw] pr-[0.8vw] transition ${
        authorized
          ? "animate-glow border-red-400/80 bg-red-600/30 shadow-[0_0_1.2vw_rgba(248,113,113,0.55)]"
          : "border-white/10 bg-black/30"
      }`}
    >
      <svg viewBox="0 0 24 24" className={`h-[2vw] w-[2vw] shrink-0 ${authorized ? "text-red-300" : "text-parchemin-200/50"}`} aria-hidden>
        <rect x="4.5" y="10.5" width="15" height="10.5" rx="2" fill="currentColor" />
        <path
          d={authorized ? "M8 10.5V7a4 4 0 0 1 7.6-1.7" : "M8 10.5V7a4 4 0 0 1 8 0v3.5"}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1.05vw] font-bold leading-tight">Protocole d'urgence</span>
        <span className={`block truncate text-[0.85vw] ${authorized ? "font-bold text-red-200" : "text-parchemin-200/60"}`}>
          {authorized ? "Autorisé" : "Verrouillé"}
        </span>
      </span>
    </div>
  );
}

/** Panneau d'avancement affiché par-dessus la boucle du bureau (lecture seule). */
export function ProgressOverlay({ state, highlight }: { state: PublicState; highlight?: Success }) {
  const validated = state.teams.filter((t) => t.status === "VALIDEE").length;
  const kidsDone = state.kids_games.filter((g) => g.status === "completed").length;
  return (
    <aside
      data-testid="tv-progress"
      className="animate-fade-in absolute right-[2vw] top-[3vh] z-10 w-[24vw] rounded-[1.2vw] border border-or-500/60 bg-bois-950/75 p-[1.2vw] text-parchemin-100 shadow-[0_2vw_4vw_rgba(0,0,0,0.55)] backdrop-blur-sm"
    >
      <h2 className="flex items-baseline justify-between font-display text-[1.35vw] font-extrabold text-or-400">
        L'enquête avance
        <span className="font-sans text-[1.1vw] text-or-300/80">
          {validated}/{state.teams.length}
        </span>
      </h2>
      <ul className="mt-[0.8vw] space-y-[0.55vw]">
        {state.teams.map((t) => {
          const lit = highlight?.kind === "team" && highlight.id === t.id;
          return (
            <li
              key={t.id}
              data-team={t.id}
              data-status={t.status}
              className={`flex items-center gap-[0.8vw] rounded-[0.7vw] bg-white/5 py-[0.45vw] pl-[0.5vw] pr-[0.8vw] transition ${
                lit ? "animate-glow bg-or-500/25" : ""
              } ${t.status === "VALIDEE" ? "bg-or-500/10" : ""}`}
            >
              <span className="h-[2.4vw] w-[0.45vw] shrink-0 rounded-full" style={{ background: t.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[1.2vw] font-bold leading-tight">{t.theme}</span>
                <span className="block truncate text-[0.85vw] text-parchemin-200/60">{t.name}</span>
              </span>
              <TeamStatusBadge status={t.status} />
            </li>
          );
        })}
      </ul>
      <div className="mt-[1vw] border-t border-or-500/30 pt-[0.8vw]">
        <h3 className="flex items-baseline justify-between font-display text-[1.15vw] font-bold text-or-400">
          Les lutins
          <span className="font-sans text-[1.05vw] text-or-300/80">
            {kidsDone}/{state.kids_games.length}
          </span>
        </h3>
        <ol className="mt-[0.6vw] flex justify-between">
          {state.kids_games.map((g) => {
            const lit = highlight?.kind === "kids" && highlight.id === g.id;
            return (
              <li
                key={g.id}
                data-kids-game={g.id}
                data-status={g.status}
                title={g.title}
                className={`flex h-[3.6vw] w-[3.6vw] items-center justify-center rounded-full border-[0.18vw] text-[1.8vw] transition ${
                  g.status === "completed"
                    ? "border-or-400 bg-or-500/90 shadow-[0_0_1.2vw_rgba(221,191,114,0.7)]"
                    : g.status === "available"
                      ? "border-or-300/70 bg-white/10"
                      : "border-white/15 bg-black/30 opacity-40 grayscale"
                } ${lit ? "animate-glow scale-110" : ""}`}
                style={g.status === "available" ? { animation: "float 3s ease-in-out infinite" } : undefined}
              >
                {KIDS_ICONS[g.id]}
              </li>
            );
          })}
        </ol>
      </div>
      <EmergencyIndicator authorized={state.emergency_authorized} />
    </aside>
  );
}

function BigStar() {
  return (
    <div className="relative h-[16vw] w-[16vw]">
      <div
        className="absolute inset-[-40%] rounded-full bg-[repeating-conic-gradient(rgba(236,217,160,0.35)_0deg_8deg,transparent_8deg_22deg)] [mask-image:radial-gradient(circle,black_25%,transparent_68%)]"
        style={{ animation: "spin-slow 14s linear infinite" }}
      />
      <svg viewBox="0 0 24 24" className="animate-pop relative h-full w-full drop-shadow-[0_0_3vw_rgba(255,215,106,0.95)]" aria-hidden>
        <path d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.2L12 18l-6.4 3.5 1.4-7.2-5.3-5 7.2-.9z" fill="#ffd76a" stroke="#fff3c4" strokeWidth="0.5" />
      </svg>
    </div>
  );
}

/** Animation plein écran à chaque succès (équipe validée, mini-jeu réussi). */
export function SuccessCelebration({ success }: { success: Success }) {
  const isTeam = success.kind === "team";
  const title = isTeam ? "Énigme résolue !" : success.all ? "Mission des lutins accomplie !" : "Bravo les lutins !";
  return (
    <div
      key={success.key}
      data-testid="tv-success"
      data-kind={success.kind}
      className="absolute inset-0 z-[25] flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(42,6,16,0.55),rgba(10,4,2,0.92)_75%)]"
      style={{ animation: `fade-in 0.6s ease-out both, fade-out 0.8s ease-in ${(CELEBRATION_MS - 800) / 1000}s forwards` }}
    >
      <Confetti count={110} />
      <BigStar />
      <h1 className="gold-text animate-pop mt-[1vw] text-center font-display text-[5vw] font-extrabold leading-none drop-shadow-xl">
        {title}
      </h1>
      {isTeam ? (
        <p
          className="animate-unroll mt-[2vw] rounded-full px-[3vw] py-[1vw] text-center font-display text-[2.6vw] font-bold text-white shadow-2xl ring-[0.25vw] ring-or-400"
          style={{ background: success.color, animationDelay: "0.3s" }}
        >
          {success.name} — {success.theme}
        </p>
      ) : (
        <p
          className="animate-unroll mt-[2vw] flex items-center gap-[1.2vw] rounded-full bg-sapin-700 px-[3vw] py-[1vw] font-display text-[2.6vw] font-bold text-white shadow-2xl ring-[0.25vw] ring-or-400"
          style={{ animationDelay: "0.3s" }}
        >
          <span>{KIDS_ICONS[success.id]}</span>« {success.title} » réussi !
        </p>
      )}
    </div>
  );
}
