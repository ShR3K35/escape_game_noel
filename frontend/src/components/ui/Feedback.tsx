import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ toasts */
interface Toast {
  id: number;
  text: string;
  kind: "ok" | "error";
}

interface FeedbackApi {
  notify: (text: string, kind?: Toast["kind"]) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("FeedbackProvider manquant");
  return ctx;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const next = useRef(1);

  const notify = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 2500);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...opts, resolve })),
    [],
  );

  const close = (value: boolean) => {
    dialog?.resolve(value);
    setDialog(null);
  };

  return (
    <FeedbackContext.Provider value={{ notify, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`animate-fade-in pointer-events-auto max-w-md rounded-lg px-4 py-2 text-sm font-bold shadow-xl ${
              t.kind === "error" ? "bg-bordeaux-700 text-white" : "bg-sapin-700 text-white"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="parchment animate-pop w-full max-w-sm rounded-xl p-5 shadow-2xl">
            <h2 id="confirm-title" className="font-display text-xl font-bold text-bordeaux-800">
              {dialog.title}
            </h2>
            <p className="mt-2 text-encre/90">{dialog.message}</p>
            <div className="mt-5 flex gap-3">
              <button
                className="flex-1 rounded-lg border border-bois-700/40 px-4 py-3 font-bold text-encre"
                onClick={() => close(false)}
              >
                Annuler
              </button>
              <button
                autoFocus
                className={`flex-1 rounded-lg px-4 py-3 font-bold text-white ${
                  dialog.danger ? "bg-bordeaux-700" : "bg-sapin-700"
                }`}
                onClick={() => close(true)}
              >
                {dialog.confirmLabel ?? "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
