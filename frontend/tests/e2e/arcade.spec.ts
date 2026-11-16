import { expect, test } from "@playwright/test";

import { resetGame } from "./helpers";

test.use({ viewport: { width: 960, height: 600 }, hasTouch: true });

const ALL = ["constellation", "machine", "tournee", "code"];

test("salle de jeux : tous les jeux, niveau choisi par les lutins", async ({ page, request }) => {
  await resetGame(request);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/lutins");
  await expect(page.getByTestId("kids-map")).toBeVisible();
  await expect(page.getByTestId("arcade-menu")).toHaveCount(0); // pas avant la fin des missions
  expect((await request.get("/api/kids/free/machine?level=facile")).status()).toBe(409);

  for (const g of ALL) expect((await request.post(`/api/admin/kids/${g}/complete`)).ok()).toBeTruthy();
  await expect(page.getByTestId("arcade-menu")).toBeVisible();
  await expect(page.getByTestId("final-message")).toContainText("près d'un objet qui permet de se réchauffer");
  await expect(page.getByTestId("emergency-status")).toContainText("Protocole d'urgence non autorisé");
  for (const g of ["constellation", "machine", "tournee", "plateformes", "kart"])
    await expect(page.locator(`[data-room="${g}"] [data-level]`)).toHaveCount(3);

  // Un jeu des missions, rejoué en niveau facile : la machine à cadeaux (vérifiée sur la tablette)
  await page.locator('[data-room="machine"] [data-level="facile"]').click();
  await expect(page.getByTestId("free-level")).toHaveText("Facile");
  await page.getByRole("button", { name: /C'est parti/ }).click();
  await expect(page.getByTestId("machine-order")).toBeVisible();
  await page.getByRole("button", { name: "← Salle de jeux" }).click();

  // La constellation en difficile : 10 symboles à mémoriser
  await page.locator('[data-room="constellation"] [data-level="difficile"]').click();
  await expect(page.getByTestId("memory")).toHaveAttribute("data-kind", "placement");
  await expect(page.locator('[data-testid="sky"] [aria-label$="symbole"]')).toHaveCount(10);
  await page.getByRole("button", { name: "← Salle de jeux" }).click();

  // Jeux bonus, avec leur niveau
  await page.locator('[data-room="plateformes"] [data-level="facile"]').click();
  await expect(page.getByTestId("arcade-plateformes")).toHaveAttribute("data-level", "facile");
  await page.getByTestId("arcade-plateformes").click({ position: { x: 922, y: 34 } }); // croix du jeu
  await expect(page.getByTestId("arcade-menu")).toBeVisible();
  await page.locator('[data-room="kart"] [data-level="difficile"]').click();
  await expect(page.getByTestId("arcade-kart").locator("canvas").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("arcade-menu")).toBeVisible();

  // Bouton d'urgence pressé trop tôt : message de patience ; puis autorisé par le maître du jeu
  expect((await request.post("/api/devices/actions/5")).ok()).toBeTruthy();
  await expect(page.getByTestId("final-message")).toContainText("Patience mes petits lutins");
  expect((await request.post("/api/admin/game/emergency", { data: { authorized: true } })).ok()).toBeTruthy();
  await expect(page.getByTestId("emergency-status")).toHaveText(/Protocole d'urgence autorisé/);
  await expect(page.getByTestId("emergency-status")).toHaveAttribute("data-authorized", "true");
  await expect(page.getByTestId("final-message")).toContainText("se réchauffer");

  expect(errors).toEqual([]);
});
