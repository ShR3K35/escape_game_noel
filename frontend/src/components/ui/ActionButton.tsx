import { useState, type ReactNode } from "react";

import { useFeedback } from "./Feedback";

type Variant = "primary" | "gold" | "danger" | "ghost" | "green";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-bordeaux-700 hover:bg-bordeaux-600 text-white border-bordeaux-600",
  gold: "bg-or-500 hover:bg-or-400 text-bois-950 border-or-400",
  danger: "bg-bordeaux-900 hover:bg-bordeaux-800 text-or-300 border-bordeaux-600",
  green: "bg-sapin-700 hover:bg-sapin-600 text-white border-sapin-600",
  ghost: "bg-white/5 hover:bg-white/10 text-parchemin-100 border-white/15",
};

interface Props {
  onAction: () => Promise<unknown>;
  children: ReactNode;
  variant?: Variant;
  confirm?: { title: string; message: string; confirmLabel?: string };
  success?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
}

/** Bouton de commande : verrouillé pendant l'appel (pas de double déclenchement), confirmation optionnelle. */
export function ActionButton({ onAction, children, variant = "ghost", confirm, success, disabled, className = "", title }: Props) {
  const [busy, setBusy] = useState(false);
  const fb = useFeedback();

  const run = async () => {
    if (busy) return;
    if (confirm && !(await fb.confirm({ ...confirm, danger: variant === "danger" || variant === "primary" }))) return;
    setBusy(true);
    try {
      await onAction();
      if (success) fb.notify(success);
    } catch (e) {
      fb.notify(e instanceof Error ? e.message : "Erreur inattendue", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      title={title}
      onClick={run}
      disabled={disabled || busy}
      className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-bold transition active:scale-[0.97] disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    >
      {busy ? "…" : children}
    </button>
  );
}
