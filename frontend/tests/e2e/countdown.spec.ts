import { expect, test } from "@playwright/test";

import { loginAdmin, resetGame } from "./helpers";

test.beforeEach(async ({ request }) => resetGame(request));

test("compte à rebours avant l'intro puis lancement automatique", async ({ browser, request }) => {
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const adminCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tv = await tvCtx.newPage();
  const admin = await adminCtx.newPage();

  await tv.goto("/tv?preload=0");
  await expect(tv.getByTestId("tv-waiting")).toContainText("Allocution du Père Noël");
  await expect(tv.getByTestId("tv-countdown")).toHaveCount(0);

  // Le maître du jeu choisit une durée : le compte à rebours apparaît sur la TV.
  await loginAdmin(admin);
  await admin.getByTitle("Compte à rebours de 5 min").click();
  await expect(tv.getByTestId("tv-countdown")).toHaveText(/^0[45]:\d\d$/);
  await expect(admin.getByTestId("countdown-remaining")).toBeVisible();

  // Durée courte (API) : à zéro, la vidéo d'introduction se lance toute seule.
  expect((await request.post("/api/admin/game/countdown", { data: { seconds: 5 } })).ok()).toBeTruthy();
  await expect(tv.getByTestId("tv-countdown")).toHaveText(/^00:0[1-5]$/);
  await expect(tv.locator('[data-video-id="intro"]')).toBeVisible({ timeout: 15_000 });
  await expect(tv.getByTestId("tv-waiting")).toHaveCount(0);
  await expect(admin.getByTestId("admin-phase")).toHaveText("Introduction");

  await tvCtx.close();
  await adminCtx.close();
});
