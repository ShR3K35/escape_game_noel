import { useRef, useState } from "react";

import type { AttemptResult } from "../services/types";

/** Gère l'état d'un essai : vérification en cours, échec (secousse), réussite. */
export function useAttempt(submit: (answer: unknown) => Promise<AttemptResult>) {
  const [state, setState] = useState<"idle" | "checking" | "wrong">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const attempt = async (answer: unknown): Promise<AttemptResult | null> => {
    if (state === "checking") return null;
    clearTimeout(timer.current);
    setState("checking");
    try {
      const result = await submit(answer);
      if (result.correct) {
        setState("idle");
      } else {
        setState("wrong");
        timer.current = setTimeout(() => setState("idle"), 2500);
      }
      return result;
    } catch {
      setState("idle");
      return null;
    }
  };

  return { state, attempt };
}
