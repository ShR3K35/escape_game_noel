import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bordeaux-950 p-6 text-center">
      <p className="text-5xl">🦌</p>
      <h1 className="font-display text-2xl text-or-400">Cette page s'est perdue dans la neige…</h1>
      <Link to="/" className="rounded-lg bg-or-500 px-4 py-2 font-bold text-bois-950">
        Retour à l'accueil
      </Link>
    </main>
  );
}
