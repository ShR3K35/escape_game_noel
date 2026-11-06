import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressOverlay, SuccessCelebration } from "../../src/components/tv/ProgressOverlay";
import { detectSuccesses } from "../../src/components/tv/progress";
import type { PublicState } from "../../src/services/types";

type KidsGames = PublicState["kids_games"];

function state(teams: Record<string, PublicState["teams"][number]["status"]>, kids: KidsGames[number]["status"][], t = "2026-12-24T19:30:00Z"): PublicState {
  const ids = ["constellation", "machine", "tournee", "code"] as const;
  return {
    server_time: t,
    title: "x",
    phase: "ENQUETE",
    phase_changed_at: null,
    started_at: null,
    tv: { play: null, message: null, ambient: "neige", loop: {} as never, preload: [], show_progress: true, countdown: null },
    teams: Object.entries(teams).map(([id, status]) => ({ id, name: `Équipe ${id}`, theme: `Thème ${id}`, color: "#900", status })),
    kids_summary: { completed: kids.filter((k) => k === "completed").length, total: 4 },
    kids_games: ids.map((id, i) => ({ id, title: `Jeu ${id}`, status: kids[i] })),
  };
}

const KIDS0: KidsGames[number]["status"][] = ["available", "locked", "locked", "locked"];

describe("détection des succès", () => {
  it("rien au premier état reçu (pas de rejeu au chargement)", () => {
    expect(detectSuccesses(null, state({ rouge: "VALIDEE" }, ["completed", "completed", "completed", "completed"]))).toEqual([]);
  });

  it("une équipe validée", () => {
    const found = detectSuccesses(state({ rouge: "EN_COURS", verte: "VALIDEE" }, KIDS0), state({ rouge: "VALIDEE", verte: "VALIDEE" }, KIDS0));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "team", id: "rouge", theme: "Thème rouge" });
  });

  it("pas d'animation pour une invalidation ou un passage en cours", () => {
    expect(detectSuccesses(state({ rouge: "VALIDEE" }, KIDS0), state({ rouge: "EN_COURS" }, KIDS0))).toEqual([]);
    expect(detectSuccesses(state({ rouge: "NON_COMMENCE" }, KIDS0), state({ rouge: "EN_COURS" }, KIDS0))).toEqual([]);
  });

  it("mini-jeux réussis, dernier = mission accomplie", () => {
    const before = state({}, ["completed", "completed", "available", "locked"]);
    const after = state({}, ["completed", "completed", "completed", "completed"]);
    const found = detectSuccesses(before, after);
    expect(found.map((s) => s.kind === "kids" && [s.id, s.all])).toEqual([["tournee", false], ["code", true]]);
  });

  it("clés uniques même si une équipe est revalidée plus tard", () => {
    const a = detectSuccesses(state({ rouge: "EN_COURS" }, KIDS0), state({ rouge: "VALIDEE" }, KIDS0, "2026-12-24T19:30:00Z"));
    const b = detectSuccesses(state({ rouge: "EN_COURS" }, KIDS0), state({ rouge: "VALIDEE" }, KIDS0, "2026-12-24T19:40:00Z"));
    expect(a[0].key).not.toBe(b[0].key);
  });
});

describe("affichage", () => {
  it("panneau d'avancement des équipes et des lutins", () => {
    render(<ProgressOverlay state={state({ rouge: "VALIDEE", verte: "EN_COURS", bleue: "NON_COMMENCE" }, ["completed", "available", "locked", "locked"])} />);
    const panel = screen.getByTestId("tv-progress");
    expect(panel).toHaveTextContent("1/3");
    expect(panel).toHaveTextContent("1/4");
    expect(panel.querySelector('[data-team="rouge"]')).toHaveAttribute("data-status", "VALIDEE");
    expect(panel.querySelector('[data-kids-game="machine"]')).toHaveAttribute("data-status", "available");
  });

  it("animation équipe et animation lutins", () => {
    const { rerender } = render(
      <SuccessCelebration success={{ key: "a", kind: "team", id: "rouge", name: "Équipe Rouge", theme: "Les Archives", color: "#900" }} />,
    );
    expect(screen.getByTestId("tv-success")).toHaveTextContent("Énigme résolue !");
    expect(screen.getByTestId("tv-success")).toHaveTextContent("Équipe Rouge — Les Archives");
    rerender(<SuccessCelebration success={{ key: "b", kind: "kids", id: "code", title: "Le code du traîneau", all: true }} />);
    expect(screen.getByTestId("tv-success")).toHaveTextContent("Mission des lutins accomplie !");
  });
});
