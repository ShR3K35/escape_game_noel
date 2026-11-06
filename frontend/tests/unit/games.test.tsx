import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CodeGame } from "../../src/games/CodeGame";
import { ConstellationGame } from "../../src/games/ConstellationGame";
import { MachineGame } from "../../src/games/MachineGame";
import { TourneeGame } from "../../src/games/TourneeGame";
import type { CodeContent, ConstellationContent, KidsGame, MachineContent, TourneeContent } from "../../src/services/types";

const ok = { correct: true, completed: true, step: 0, hints: [] };
const ko = { correct: false, completed: false, step: 0, hints: ["Comptez !"] };

function game<C>(id: KidsGame["id"], content: C, extra: Partial<KidsGame> = {}): KidsGame & { content: C } {
  return { id, title: "t", status: "available", step: 0, hints: [], reward: null, content, ...extra } as KidsGame & { content: C };
}

describe("Constellation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const content: ConstellationContent = {
    title: "c", instructions: "i", cols: 3, rows: 3, stars: [[0, 0], [2, 1]], memorize_seconds: 3,
  };

  it("montre puis cache les étoiles, et envoie les cases choisies", async () => {
    const submit = vi.fn().mockResolvedValue(ok);
    render(<ConstellationGame game={game("constellation", content)} submit={submit} />);
    expect(screen.getAllByLabelText(/étoile/)).toHaveLength(2);
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(1000)); // décompte seconde par seconde
    expect(screen.queryAllByLabelText(/étoile/)).toHaveLength(0);
    fireEvent.click(screen.getByLabelText("case 1-1"));
    fireEvent.click(screen.getByLabelText("case 3-2"));
    await act(async () => fireEvent.click(screen.getByText("✨ Vérifier")));
    expect(submit).toHaveBeenCalledWith({ cells: [[0, 0], [2, 1]] });
  });

  it("affiche les indices", () => {
    render(<ConstellationGame game={game("constellation", content, { hints: ["Il y a 2 étoiles"] })} submit={vi.fn()} />);
    expect(screen.getByText(/Il y a 2 étoiles/)).toBeInTheDocument();
  });
});

describe("Machine à cadeaux", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const content: MachineContent = {
    title: "m", instructions: "i", intro: "Catastrophe !", total: 8, eliminated: [],
    order: { text: "Chaque renne reçoit 7 carottes. Il y a 6 rennes.", choices: [36, 42, 48, 56], level: 2 },
  };
  const choice = (c: HTMLElement, v: number) => c.querySelector<HTMLButtonElement>(`[data-choice="${v}"]`)!;

  it("écran d'accueil puis commande avec 4 cadeaux-réponses", () => {
    const { container } = render(<MachineGame game={game("machine", content)} submit={vi.fn()} />);
    expect(screen.getByTestId("machine-intro")).toHaveTextContent("Catastrophe !");
    fireEvent.click(screen.getByText(/C'est parti/));
    expect(screen.getByTestId("machine-order")).toHaveTextContent("Commande 1 sur 8");
    expect(container.querySelectorAll("[data-choice]")).toHaveLength(4);
    expect(screen.getByTestId("machine-counter")).toHaveTextContent("0 / 8");
  });

  it("reprend directement le jeu après la première commande (rechargement)", () => {
    render(<MachineGame game={game("machine", content, { step: 3 })} submit={vi.fn()} />);
    expect(screen.queryByTestId("machine-intro")).toBeNull();
    expect(screen.getByTestId("machine-counter")).toHaveTextContent("3 / 8");
  });

  it("bonne réponse : envoie la commande et la valeur, la machine emballe", async () => {
    const submit = vi.fn().mockResolvedValue({ correct: true, completed: false, step: 1, hints: [], eliminated: [] });
    const { container } = render(<MachineGame game={game("machine", content)} submit={submit} />);
    fireEvent.click(screen.getByText(/C'est parti/));
    fireEvent.click(choice(container, 42));
    expect(choice(container, 36)).toBeDisabled(); // un seul cadeau à la fois
    await act(async () => vi.advanceTimersByTime(600));
    expect(submit).toHaveBeenCalledWith({ order: 0, answer: 42 });
    expect(screen.getByTestId("machine")).toHaveAttribute("data-phase", "good");
    expect(screen.getByText(/Cadeau emballé/)).toBeInTheDocument();
    expect(screen.getByTestId("machine-counter")).toHaveTextContent("1 / 8");
  });

  it("mauvaise réponse : fumée, puis le cadeau est écarté et on peut réessayer", async () => {
    const submit = vi.fn().mockResolvedValue({ correct: false, completed: false, step: 0, hints: [], eliminated: [36] });
    const { container } = render(<MachineGame game={game("machine", content)} submit={submit} />);
    fireEvent.click(screen.getByText(/C'est parti/));
    fireEvent.click(choice(container, 36));
    await act(async () => vi.advanceTimersByTime(600));
    expect(screen.getByTestId("machine")).toHaveAttribute("data-phase", "bad");
    expect(screen.getByRole("alert")).toHaveTextContent(/essayez un autre/);
    await act(async () => vi.advanceTimersByTime(1400));
    expect(choice(container, 36)).toBeDisabled();
    expect(choice(container, 42)).toBeEnabled();
  });

  it("affiche l'indice et l'aide", () => {
    render(<MachineGame game={game("machine", { ...content, eliminated: [36, 48] }, { hints: ["Pensez à la table de 6 !"] })} submit={vi.fn()} />);
    expect(screen.getByTestId("machine-hint")).toHaveTextContent(/Pensez à la table de 6/);
    fireEvent.click(screen.getByText("❓ Aide"));
    expect(screen.getByRole("note")).toHaveTextContent(/on multiplie/);
  });
});

describe("Tournée du traîneau", () => {
  const content: TourneeContent = {
    title: "t", instructions: "Évitez les cheminées !", level: "facile",
    settings: { label: "Facile", duration: 60, lives: 5, speed_start: 0.22, speed_end: 0.3, gap_start: 2.6, gap_end: 1.9, double_chance: 0, gifts: true },
  };

  it("écran d'accueil avec le niveau, puis décompte au départ", () => {
    vi.useFakeTimers();
    render(<TourneeGame game={game("tournee", content)} submit={vi.fn()} />);
    expect(screen.getByText("Évitez les cheminées !")).toBeInTheDocument();
    expect(screen.getByTestId("tournee-lives")).toHaveTextContent("5 vies");
    expect(screen.getByText(/60 s · Facile/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/C'est parti/));
    expect(screen.getByTestId("tournee")).toHaveAttribute("data-phase", "countdown");
    for (let i = 0; i < 3; i++) act(() => vi.advanceTimersByTime(800));
    expect(screen.getByTestId("tournee")).toHaveAttribute("data-phase", "playing");
    expect(screen.getByLabelText("Pause")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("affiche les indices sur l'écran d'accueil", () => {
    render(<TourneeGame game={game("tournee", content, { hints: ["Touchez le ciel"] })} submit={vi.fn()} />);
    expect(screen.getByText(/Touchez le ciel/)).toBeInTheDocument();
  });
});

describe("Code du traîneau", () => {
  const content: CodeContent = { title: "c", instructions: "i", riddle: "renne, étoile, cadeau", length: 3 };

  it("saisit le code et le vide après une erreur", async () => {
    const submit = vi.fn().mockResolvedValue(ko);
    render(<CodeGame game={game("code", content)} submit={submit} rewards={[{ symbol: "⭐", label: "étoile", digit: 4 }]} />);
    for (const d of ["7", "4", "2"]) fireEvent.click(screen.getByRole("button", { name: d }));
    expect(screen.getByTestId("code-slots")).toHaveTextContent("742");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "🛷" })));
    expect(submit).toHaveBeenCalledWith({ code: "742" });
    expect(screen.getByTestId("code-slots")).toHaveTextContent("");
    expect(screen.getByRole("alert")).toHaveTextContent(/essayez encore/);
  });
});
