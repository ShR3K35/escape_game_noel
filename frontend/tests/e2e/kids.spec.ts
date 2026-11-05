import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { loginAdmin, resetGame } from "./helpers";

// Solutions de config/game.yaml
const STARS = ["0,2", "1,0", "2,3", "3,1", "4,3", "5,0"];
const GIFTS = [
  { g1: "rouge", g2: "vert", g3: "bleu", g4: "rouge", g5: "vert", g6: "bleu" },
  { g1: "grand", g2: "petit", g3: "grand", g4: "petit", g5: "grand", g6: "petit" },
  { g1: "etoile", g2: "sapin", g3: "cloche", g4: "sapin", g5: "cloche", g6: "etoile" },
];

test.beforeEach(async ({ request }) => resetGame(request));
test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });

async function openGame(page: Page, id: string) {
  await page.locator(`[data-game="${id}"]`).click();
  await expect(page.getByTestId(`game-${id}`)).toBeVisible();
}

/** Réponse de la commande en cours, lue dans l'état admin (le contexte `request` est connecté). */
async function currentOrder(request: APIRequestContext) {
  const state = await (await request.get("/api/admin/state")).json();
  return state.kids.games.find((g: { id: string }) => g.id === "machine").current_order as { number: number; answer: number };
}

async function closeCelebration(page: Page) {
  await expect(page.getByRole("heading", { name: "Bravo !" })).toBeVisible();
  await page.getByRole("button", { name: "Continuer ➜" }).click();
}

test("les lutins terminent les quatre mini-jeux", async ({ page, request }) => {
  await page.goto("/lutins");
  await expect(page.locator('[data-game="machine"]')).toBeDisabled();

  // 1. Constellation (avec un premier essai raté)
  await openGame(page, "constellation");
  await page.getByRole("button", { name: "Je suis prêt ! 👍" }).click();
  for (const cell of ["0,0", "1,1", "2,2", "3,3", "4,0", "5,1"]) await page.locator(`[data-cell="${cell}"]`).click();
  await page.getByRole("button", { name: "✨ Vérifier" }).click();
  await expect(page.getByRole("alert")).toContainText("essayez encore");
  await page.getByRole("button", { name: "Effacer" }).click();
  for (const cell of STARS) await page.locator(`[data-cell="${cell}"]`).click();
  await page.getByRole("button", { name: "✨ Vérifier" }).click();
  await closeCelebration(page);

  // 2. Machine à cadeaux : 8 commandes (une erreur sur la première)
  await openGame(page, "machine");
  await expect(page.getByTestId("machine-intro")).toContainText("Catastrophe !");
  await page.getByRole("button", { name: /C'est parti/ }).click();
  for (let i = 0; i < 8; i++) {
    await expect(page.getByTestId("machine-game")).toHaveAttribute("data-order", String(i));
    const order = await currentOrder(request);
    expect(order.number).toBe(i + 1);
    if (i === 0) {
      const wrong = page.locator(`[data-choice]:not([data-choice="${order.answer}"])`).first();
      await wrong.click();
      await expect(page.getByRole("alert")).toContainText("essayez un autre");
      await expect(wrong).toBeDisabled(); // cadeau écarté
    }
    await page.locator(`[data-choice="${order.answer}"]`).click();
    await expect(page.getByTestId("machine-counter")).toContainText(`${i + 1} / 8`);
  }
  await expect(page.getByTestId("machine-chest")).toContainText("7");
  await closeCelebration(page);

  // 3. Cadeaux : trois manches
  await openGame(page, "cadeaux");
  for (const [i, round] of GIFTS.entries()) {
    for (const [gift, bin] of Object.entries(round)) {
      await page.locator(`[data-gift="${gift}"]`).first().click();
      await page.locator(`[data-bin="${bin}"]`).click();
    }
    await page.getByRole("button", { name: "✨ Vérifier" }).click();
    if (i < GIFTS.length - 1) await expect(page.getByText("Bravo, manche réussie !")).toBeVisible();
  }
  await closeCelebration(page);

  // 4. Code du traîneau
  await openGame(page, "code");
  for (const d of "742") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "🛷" }).click();
  await closeCelebration(page);

  await expect(page.getByTestId("kids-final")).toContainText("Mission accomplie !");

  // Persistance : la progression survit au rechargement de la tablette
  await page.reload();
  await expect(page.getByTestId("kids-final")).toBeVisible();
});

test("le maître du jeu débloque une étape à distance", async ({ browser }) => {
  const kids = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  await kids.goto("/lutins");
  await openGame(kids, "constellation");

  await loginAdmin(admin);
  await admin.getByRole("tab", { name: /Lutins/ }).click();
  await admin.getByRole("button", { name: "🔓 Débloquer" }).first().click();
  await admin.getByRole("dialog").getByRole("button", { name: "Confirmer" }).click();

  // La tablette revient à la carte, le jeu 2 est disponible
  await expect(kids.getByTestId("kids-map")).toBeVisible();
  await expect(kids.locator('[data-game="machine"]')).toBeEnabled();
  await expect(kids.getByLabel("récompenses")).toContainText("4");
});
