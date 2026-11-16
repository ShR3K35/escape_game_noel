import { useRef, useState } from "react";

import type { AttemptResult, ConstellationContent, FreePlayData, KidsGame, MachineContent, TourneeContent } from "../services/types";
import { ConstellationGame } from "./ConstellationGame";
import { freeAttempt, freeGame, initialFreeState } from "./freePlay";
import { MachineGame } from "./MachineGame";
import { TourneeGame } from "./TourneeGame";

/** Un jeu des missions rejoué dans la salle de jeux : mêmes écrans, vérification sur la tablette. */
export function FreePlayGame({ data, onResult }: { data: FreePlayData; onResult: (r: AttemptResult) => void }) {
  const [state, setState] = useState(initialFreeState);
  const current = useRef(state);

  const submit = async (answer: unknown): Promise<AttemptResult> => {
    const { state: next, result } = freeAttempt(data, current.current, answer);
    current.current = next;
    setState(next);
    onResult(result);
    return result;
  };

  const game = freeGame(data, state);
  switch (data.id) {
    case "constellation":
      return <ConstellationGame game={game as KidsGame & { content: ConstellationContent }} submit={submit} />;
    case "machine":
      return <MachineGame game={game as KidsGame & { content: MachineContent }} submit={submit} />;
    case "tournee":
      return <TourneeGame game={game as KidsGame & { content: TourneeContent }} submit={submit} />;
  }
}
