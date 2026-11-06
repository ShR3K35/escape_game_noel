import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { loginAdmin, resetGame } from "./helpers";

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

/** Manche en cours de « La constellation » (tirée au hasard par le serveur). */
async function memoryContent(request: APIRequestContext) {
  const state = await (await request.get("/api/kids/state")).json();
  return state.games.find((g: { id: string }) => g.id === "constellation").content as {
    round: number;
    layout: { kind: "placement" | "paires"; cols: number; rows: number; cells: [number, number][]; cards: string[] };
  };
}

/** Joue les 3 manches : placement (avec un premier essai raté), paires, placement. */
async function playConstellation(page: Page, request: APIRequestContext) {
  for (let round = 0; round < 3; round++) {
    await expect(page.getByTestId("memory")).toHaveAttribute("data-round", String(round));
    const { layout } = await memoryContent(request);
    if (layout.kind === "placement") {
      const cells = layout.cells.map(([c, r]) => `${c},${r}`);
      await expect(page.locator("[data-cell]")).toHaveCount(layout.cols * layout.rows);
      await page.getByRole("button", { name: "Je suis prêt ! 👍" }).click();
      if (round === 0) {
        const empty = await page.locator("[data-cell]").evaluateAll((els, sol) =>
          els.map((e) => e.getAttribute("data-cell")!).filter((k) => !sol.includes(k)), cells);
        for (const cell of empty.slice(0, cells.length)) await page.locator(`[data-cell="${cell}"]`).click();
        await page.getByRole("button", { name: "✨ Valider" }).click();
        await expect(page.getByRole("alert")).toContainText("essayez encore");
        await page.getByRole("button", { name: "Effacer" }).click();
      }
      for (const cell of cells) await page.locator(`[data-cell="${cell}"]`).click();
      await page.getByRole("button", { name: "✨ Valider" }).click();
    } else {
      const bySymbol = new Map<string, number[]>();
      layout.cards.forEach((s, i) => s !== "etoile" && bySymbol.set(s, [...(bySymbol.get(s) ?? []), i]));
      let found = 0;
      for (const [a, b] of bySymbol.values()) {
        await page.locator(`[data-card="${a}"]`).click();
        await page.locator(`[data-card="${b}"]`).click();
        // la dernière paire envoie aussitôt la manche : l'écran « Manche réussie » remplace le compteur
        if (++found < bySymbol.size) await expect(page.getByTestId("pairs-count")).toContainText(`${found} / ${bySymbol.size}`);
      }
    }
    if (round < 2) {
      await expect(page.getByTestId("memory-between")).toContainText(`Manche ${round + 1} réussie`);
      await page.getByRole("button", { name: /C'est parti/ }).click();
    }
  }
}

async function closeCelebration(page: Page) {
  await expect(page.getByRole("heading", { name: "Bravo !" })).toBeVisible();
  await page.getByRole("button", { name: "Continuer ➜" }).click();
}

test("les lutins terminent les quatre mini-jeux", async ({ page, request }) => {
  await page.goto("/lutins");
  await expect(page.locator('[data-game="machine"]')).toBeDisabled();

  // 1. Constellation : 3 manches de memory (avec un premier essai raté)
  await openGame(page, "constellation");
  await playConstellation(page, request);
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

  // 3. Tournée du traîneau : le vol démarre (le jouer en entier prendrait 90 s), puis le MJ change le niveau
  //    et débloque l'étape à distance.
  await openGame(page, "tournee");
  await expect(page.getByTestId("tournee-lives")).toContainText("4 vies");
  await page.getByRole("button", { name: /C'est parti/ }).click();
  await expect(page.getByTestId("tournee")).toHaveAttribute("data-phase", "playing", { timeout: 5000 });
  await page.getByTestId("tournee-field").click({ position: { x: 300, y: 30 } }); // couloir du haut
  await page.getByLabel("Pause").click();
  await expect(page.getByRole("button", { name: /Reprendre/ })).toBeVisible();
  expect((await request.post("/api/admin/kids/tournee/difficulty", { data: { level: "facile" } })).ok()).toBeTruthy();
  await page.getByRole("button", { name: "← Carte" }).click();
  await openGame(page, "tournee");
  await expect(page.getByTestId("tournee-lives")).toContainText("5 vies"); // niveau facile appliqué
  expect((await request.post("/api/admin/kids/tournee/complete")).ok()).toBeTruthy();
  await expect(page.getByTestId("kids-map")).toBeVisible();

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
