import { expect, test } from "@playwright/test";

import { resetGame } from "./helpers";

test.use({ viewport: { width: 960, height: 600 }, hasTouch: true });

test("toutes les missions réussies : la salle de jeux lance les deux jeux bonus", async ({ page, request }) => {
  await resetGame(request);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/lutins");
  await expect(page.getByTestId("kids-map")).toBeVisible();
  await expect(page.getByTestId("arcade-menu")).toHaveCount(0); // pas avant la fin des missions

  for (const g of ["constellation", "machine", "tournee", "code"])
    expect((await request.post(`/api/admin/kids/${g}/complete`)).ok()).toBeTruthy();
  await expect(page.getByTestId("arcade-menu")).toBeVisible();

  await page.locator('[data-arcade="plateformes"]').click();
  await expect(page.getByTestId("arcade-plateformes").locator("canvas").first()).toBeVisible();
  await page.getByTestId("arcade-plateformes").click({ position: { x: 922, y: 34 } }); // croix du jeu
  await expect(page.getByTestId("arcade-menu")).toBeVisible();

  await page.locator('[data-arcade="kart"]').click();
  await expect(page.getByTestId("arcade-kart").locator("canvas").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("arcade-menu")).toBeVisible();

  expect(errors).toEqual([]);
});
