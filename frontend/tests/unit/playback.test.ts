import { describe, expect, it } from "vitest";

import { STALE_PLAY_MS, decide, formatCountdown, messageVisible, remainingSeconds, screenFor } from "../../src/components/tv/playback";
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

describe("compte à rebours avant l'intro", () => {
  const until = new Date(NOW + 90_000).toISOString();

  it("arrondit à la seconde supérieure et ne descend pas sous zéro", () => {
    expect(remainingSeconds(until, NOW)).toBe(90);
    expect(remainingSeconds(until, NOW + 89_500)).toBe(1);
    expect(remainingSeconds(until, NOW + 90_000)).toBe(0);
    expect(remainingSeconds(until, NOW + 120_000)).toBe(0);
  });

  it("formate en minutes:secondes, avec les heures si besoin", () => {
    expect(formatCountdown(90)).toBe("01:30");
    expect(formatCountdown(5)).toBe("00:05");
    expect(formatCountdown(3725)).toBe("1:02:05");
  });
});
