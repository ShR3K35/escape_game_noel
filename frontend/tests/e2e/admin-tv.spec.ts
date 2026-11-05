import { expect, test } from "@playwright/test";

import { clickAndConfirm, loginAdmin, resetGame } from "./helpers";

test.beforeEach(async ({ request }) => resetGame(request));

test("connexion admin refusée avec un mauvais mot de passe", async ({ page }) => {
  await page.goto("/admin");
  await page.getByLabel("Mot de passe").fill("mauvais");
  await page.getByRole("button", { name: "Entrer dans le bureau" }).click();
  await expect(page.getByRole("alert")).toHaveText(/incorrect/);
});

test("l'admin pilote la TV en temps réel", async ({ browser }) => {
  const adminCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const admin = await adminCtx.newPage();
  const tv = await tvCtx.newPage();

  await tv.goto("/tv?preload=0");
  await expect(tv.getByTestId("tv-root")).toHaveAttribute("data-screen", "loop");
  await loginAdmin(admin);
  await expect(admin.getByText(/TV [1-9]/)).toBeVisible(); // d'autres écrans peuvent être ouverts sur le poste

  // Démarrage : vidéo d'introduction sur la TV
  await clickAndConfirm(admin, /Démarrer la partie/, "Démarrer");
  await expect(admin.getByTestId("admin-phase")).toHaveText("Introduction");
  await expect(tv.locator('[data-video-id="intro"]')).toBeVisible();

  // Vidéo de relance depuis l'onglet TV : remplace l'intro (aucune superposition)
  await admin.getByRole("tab", { name: /TV/ }).click();
  await admin.getByTitle("Lancer Relance de 20h30").click();
  await expect(tv.locator('[data-video-id="relance"]')).toBeVisible();
  await expect(tv.locator("[data-video-id]")).toHaveCount(1);
  await expect(admin.getByTestId("now-playing").first()).toContainText("Relance de 20h30");

  // Stop -> retour au bureau
  await admin.getByRole("button", { name: "■ Stop" }).first().click();
  await expect(tv.getByTestId("tv-root")).toHaveAttribute("data-screen", "loop");

  // Message du Père Noël
  await admin.getByRole("button", { name: /Courage, mes enquêteurs/ }).click();
  await expect(tv.getByTestId("tv-message")).toContainText("Courage");

  // La TV n'expose aucune commande
  await expect(tv.getByRole("button", { name: /Démarrer|Stop|Valider/ })).toHaveCount(0);
  await adminCtx.close();
  await tvCtx.close();
});

test("équipes, victoire confirmée et journal", async ({ page }) => {
  await loginAdmin(page);
  await clickAndConfirm(page, /Démarrer la partie/, "Démarrer");
  await page.getByRole("button", { name: "Lancer l'enquête" }).click();
  await expect(page.getByTestId("admin-phase")).toHaveText("Enquête");

  await page.getByRole("tab", { name: /Équipes/ }).click();
  await page.getByTestId("team-rouge").getByRole("button", { name: "✓ Valider" }).click();
  await expect(page.getByTestId("team-rouge").getByRole("button", { name: "Invalider" })).toBeVisible();

  await page.getByRole("tab", { name: /Partie/ }).click();
  await page.getByRole("button", { name: "🏆 Victoire !" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByTestId("admin-phase")).toHaveText("Enquête");
  await clickAndConfirm(page, "🏆 Victoire !", "Oui, déclencher");
  await expect(page.getByTestId("admin-phase")).toHaveText("Victoire");

  await page.getByRole("tab", { name: /Journal/ }).click();
  await expect(page.getByTestId("events")).toContainText("Équipe Rouge : en cours → validée");
  await expect(page.getByTestId("events")).toContainText("Phase ENQUETE → VICTOIRE");
});

test("réinitialisation depuis l'admin", async ({ page }) => {
  await loginAdmin(page);
  await clickAndConfirm(page, /Démarrer la partie/, "Démarrer");
  await expect(page.getByTestId("admin-phase")).toHaveText("Introduction");
  await clickAndConfirm(page, "↺ Réinitialiser", "Réinitialiser");
  await expect(page.getByTestId("admin-phase")).toHaveText("Préparation");
});
