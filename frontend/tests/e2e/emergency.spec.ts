import { expect, test } from "@playwright/test";

import { clickAndConfirm, loginAdmin, resetGame } from "./helpers";

test.beforeEach(async ({ request }) => resetGame(request));

test("protocole d'urgence : message de patience puis secours des lutins une fois autorisé", async ({ browser, request }) => {
  const adminCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const admin = await adminCtx.newPage();
  const tv = await tvCtx.newPage();
  await tv.goto("/tv?preload=0");
  await loginAdmin(admin);

  await clickAndConfirm(admin, /Démarrer la partie/, "Démarrer");
  await admin.getByRole("button", { name: "Lancer l'enquête" }).click();
  await expect(admin.getByTestId("admin-phase")).toHaveText("Enquête");

  // Verrouillé : l'action 5 du boîtier affiche le message de patience sur la TV.
  const control = admin.getByTestId("emergency-control");
  await expect(control).toHaveAttribute("data-authorized", "false");
  expect((await request.post("/api/devices/actions/5", { data: { source: "test" } })).ok()).toBeTruthy();
  await expect(tv.getByTestId("tv-message")).toContainText("Soyez patients mes lutins");
  await expect(admin.getByTestId("admin-phase")).toHaveText("Enquête");

  // Autorisé par le MJ : l'action 5 lance la vidéo du secours des lutins.
  await clickAndConfirm(admin, /Autoriser le protocole d'urgence/, "Autoriser");
  await expect(control).toHaveAttribute("data-authorized", "true");
  await admin.screenshot({ path: "test-results/emergency-admin.png", fullPage: true });
  expect((await request.post("/api/devices/actions/5", { data: { source: "test" } })).ok()).toBeTruthy();
  await expect(admin.getByTestId("admin-phase")).toHaveText("Secours des lutins");
  await expect(tv.locator('[data-video-id="secours"]')).toBeVisible();
});
