import { useEffect, useState, type FormEvent } from "react";

import { AdminDashboard } from "../components/admin/AdminDashboard";
import { FeedbackProvider } from "../components/ui/Feedback";
import { ApiError, api } from "../services/api";

export default function AdminPage() {
  const [auth, setAuth] = useState<boolean | null>(null);

  useEffect(() => {
    api.me().then((r) => setAuth(r.authenticated)).catch(() => setAuth(false));
  }, []);

  return (
    <FeedbackProvider>
      <div className="wood min-h-dvh">
        {auth === null && <p className="p-8 text-center text-parchemin-200">Chargement…</p>}
        {auth === false && <LoginForm onSuccess={() => setAuth(true)} />}
        {auth && <AdminDashboard onLogout={() => setAuth(false)} />}
      </div>
    </FeedbackProvider>
  );
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Serveur injoignable");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="parchment w-full max-w-sm rounded-2xl p-6 shadow-2xl">
        <p className="text-center text-4xl">🎩</p>
        <h1 className="mt-2 text-center font-display text-2xl font-bold text-bordeaux-800">Maître du jeu</h1>
        <label className="mt-6 block text-sm font-bold text-encre" htmlFor="password">
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-bois-700/40 bg-white/80 px-3 py-3 text-lg text-encre outline-none focus:ring-2 focus:ring-or-500"
        />
        {error && (
          <p role="alert" className="mt-3 text-sm font-bold text-bordeaux-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-5 w-full rounded-lg bg-bordeaux-700 py-3 font-bold text-white disabled:opacity-50"
        >
          {busy ? "Connexion…" : "Entrer dans le bureau"}
        </button>
      </form>
    </main>
  );
}
