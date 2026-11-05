import { describe, expect, it } from "vitest";

import { backoffDelay, wsUrl } from "../../src/hooks/useLiveChannel";
import { uid } from "../../src/services/api";
import { NEXT_PHASES, formatDuration } from "../../src/services/labels";

describe("WebSocket", () => {
  it("construit l'URL sur le même hôte", () => {
    expect(wsUrl("tv", { protocol: "http:", host: "noel2026.local" } as Location)).toBe("ws://noel2026.local/ws?channel=tv");
    expect(wsUrl("admin", { protocol: "https:", host: "x:8443" } as Location)).toBe("wss://x:8443/ws?channel=admin");
  });

  it("reconnexion avec backoff plafonné", () => {
    expect(backoffDelay(0)).toBe(1000);
    expect(backoffDelay(2)).toBe(4000);
    expect(backoffDelay(50)).toBe(10_000);
  });
});

describe("utilitaires", () => {
  it("génère des identifiants d'idempotence uniques hors contexte sécurisé", () => {
    const a = uid();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(uid()).not.toBe(a);
  });

  it("formate les durées", () => {
    expect(formatDuration(65_000)).toBe("01:05");
    expect(formatDuration(3_725_000)).toBe("1h02:05");
    expect(formatDuration(-5)).toBe("00:00");
  });

  it("aucune phase après FIN, victoire et secours depuis l'enquête", () => {
    expect(NEXT_PHASES.FIN).toEqual([]);
    expect(NEXT_PHASES.ENQUETE).toContain("SECOURS");
  });
});
