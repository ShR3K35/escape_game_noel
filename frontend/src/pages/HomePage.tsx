import { Link } from "react-router-dom";

import { Snowfall } from "../components/Ambient";

const LINKS = [
  { to: "/tv", icon: "📺", title: "Télévision", text: "Bureau du Père Noël, en plein écran" },
  { to: "/lutins", icon: "🧝", title: "Lutins", text: "Les mini-jeux de la tablette des enfants" },
  { to: "/admin", icon: "🎩", title: "Maître du jeu", text: "Pilotage de la soirée (mot de passe)" },
  { to: "/status", icon: "📜", title: "État du jeu", text: "Résumé de la partie en cours" },
];

export default function HomePage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[radial-gradient(ellipse_at_top,var(--color-bordeaux-800),var(--color-bordeaux-950)_70%)] px-4 py-10">
      <Snowfall count={50} />
      <div className="relative mx-auto max-w-3xl text-center">
        <p className="text-5xl">⭐</p>
        <h1 className="gold-text mt-3 font-display text-4xl font-extrabold sm:text-5xl">La Clé des Étoiles</h1>
        <p className="mt-2 font-display text-or-300/80">Cluedo Escape de Noël 2026</p>
        <nav className="mt-10 grid gap-4 sm:grid-cols-2">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="parchment group rounded-xl p-5 text-left shadow-xl transition hover:-translate-y-1"
            >
              <span className="text-3xl">{l.icon}</span>
              <h2 className="mt-2 font-display text-xl font-bold text-bordeaux-800">{l.title}</h2>
              <p className="text-sm text-encre/80">{l.text}</p>
              <p className="mt-2 font-mono text-xs text-bordeaux-700/80">{l.to}</p>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
