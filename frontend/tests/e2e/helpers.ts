import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "noel2026";

export async function resetGame(request: APIRequestContext) {
  const login = await request.post("/api/auth/login", { data: { password: PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const reset = await request.post("/api/admin/game/reset", { data: { confirm: true } });
  expect(reset.ok()).toBeTruthy();
  // Réglage d'affichage conservé par la réinitialisation : on le remet à sa valeur par défaut.
  expect((await request.post("/api/admin/tv/progress", { data: { visible: true } })).ok()).toBeTruthy();
}

export async function loginAdmin(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrer dans le bureau" }).click();
  await expect(page.getByText("● en direct")).toBeVisible();
}

/** Clique un bouton puis valide la boîte de confirmation. */
export async function clickAndConfirm(page: Page, name: string | RegExp, confirmLabel: string | RegExp) {
  await page.getByRole("button", { name }).click();
  await page.getByRole("dialog").getByRole("button", { name: confirmLabel }).click();
}
