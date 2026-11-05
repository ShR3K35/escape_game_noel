import { describe, expect, it } from "vitest";

import { STALE_PLAY_MS, decide, messageVisible, screenFor } from "../../src/components/tv/playback";
import type { TvPlay } from "../../src/services/types";

const NOW = Date.parse("2026-12-24T19:30:00Z");

function play(id: string, ageMs = 0, available = true): TvPlay {
  return {
    play_id: id,
    started_at: new Date(NOW - ageMs).toISOString(),
    video: { id: "intro", title: "Intro", url: "/media/videos/01.mp4", file: "01.mp4", available, fallback_text: "Ho", fallback_seconds: 5 },
  };
}

describe("décision de lecture TV", () => {
  it("lance une nouvelle lecture", () => {
    expect(decide(play("a"), null, NOW, false)).toBe("start");
  });

  it("remplace la lecture en cours au lieu de superposer", () => {
    expect(decide(play("b"), "a", NOW, false)).toBe("start");
  });

  it("ne relance pas la même lecture", () => {
    expect(decide(play("a"), "a", NOW, false)).toBe("keep");
  });

  it("revient au bureau quand l'admin arrête", () => {
    expect(decide(null, "a", NOW, false)).toBe("stop");
    expect(decide(null, null, NOW, false)).toBe("keep");
  });

  it("ignore une lecture périmée découverte au chargement de la TV", () => {
    expect(decide(play("a", STALE_PLAY_MS + 1000), null, NOW, true)).toBe("discard");
    expect(decide(play("a", 30_000), null, NOW, true)).toBe("start");
    expect(decide(play("a", STALE_PLAY_MS + 1000), null, NOW, false)).toBe("start");
  });

  it("choisit l'écran de substitution si la vidéo manque", () => {
    expect(screenFor(play("a")).kind).toBe("video");
    expect(screenFor(play("a", 0, false)).kind).toBe("fallback");
  });

  it("masque les messages expirés", () => {
    expect(messageVisible(new Date(NOW + 5000).toISOString(), NOW)).toBe(true);
    expect(messageVisible(new Date(NOW - 1).toISOString(), NOW)).toBe(false);
    expect(messageVisible(undefined, NOW)).toBe(false);
  });
});
