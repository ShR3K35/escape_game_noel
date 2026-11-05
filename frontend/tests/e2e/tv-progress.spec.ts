import { expect, test } from "@playwright/test";

import { loginAdmin, resetGame } from "./helpers";

test.beforeEach(async ({ request }) => resetGame(request));

test("avancement sur la TV et animation à chaque succès", async ({ browser }) => {
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const adminCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tv = await tvCtx.newPage();
  const admin = await adminCtx.newPage();

  await tv.goto("/tv?preload=0");
  const panel = tv.getByTestId("tv-progress");
  await expect(panel).toBeVisible();
  await expect(tv.getByTestId("tv-success")).toHaveCount(0); // pas de rejeu au chargement

  await loginAdmin(admin);

  // Équipe validée -> animation + panneau à jour
  await admin.getByRole("tab", { name: /Équipes/ }).click();
  await admin.getByTestId("team-verte").getByRole("button", { name: "✓ Valider" }).click();
  await expect(tv.getByTestId("tv-success")).toContainText("Énigme résolue !");
  await expect(tv.getByTestId("tv-success")).toContainText("Équipe Verte — Les Lumières");
  await expect(panel.locator('[data-team="verte"]')).toHaveAttribute("data-status", "VALIDEE");
  await expect(tv.getByTestId("tv-success")).toHaveCount(0, { timeout: 10_000 });

  // Succès pendant une vidéo : mis en attente, joué au retour sur le bureau
  await admin.getByRole("tab", { name: /TV/ }).click();
  await admin.getByTitle("Lancer Relance de 20h30").click();
  await expect(tv.locator('[data-video-id="relance"]')).toBeVisible();
  await admin.getByRole("tab", { name: /Lutins/ }).click();
  await admin.getByRole("button", { name: "🔓 Débloquer" }).first().click();
  await admin.getByRole("dialog").getByRole("button", { name: "Confirmer" }).click();
  await expect(tv.getByTestId("tv-progress")).toHaveCount(0); // pas d'overlay sur une vidéo
  await expect(tv.getByTestId("tv-success")).toHaveCount(0);
  await admin.getByRole("tab", { name: /TV/ }).click();
  await admin.getByRole("button", { name: "■ Stop" }).first().click();
  await expect(tv.getByTestId("tv-success")).toContainText("Bravo les lutins !");
  await expect(tv.getByTestId("tv-success")).toContainText("La constellation");
  await expect(tv.getByTestId("tv-progress").locator('[data-kids-game="constellation"]')).toHaveAttribute("data-status", "completed");

  // Masquer le panneau depuis l'admin
  await admin.getByRole("button", { name: /Avancement équipes \+ lutins affiché/ }).click();
  await expect(tv.getByTestId("tv-progress")).toHaveCount(0);

  await tvCtx.close();
  await adminCtx.close();
});
