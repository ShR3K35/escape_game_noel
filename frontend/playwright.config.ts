import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout contre une application démarrée (docker compose up --build).
 *   E2E_BASE_URL       (défaut http://localhost:8080)
 *   E2E_ADMIN_PASSWORD (défaut « noel2026 », mot de passe de développement)
 * Les tests réinitialisent la partie : ne pas les lancer pendant la vraie soirée !
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
