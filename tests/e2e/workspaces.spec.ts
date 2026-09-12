import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao, esperarElementoTexto } from "./helpers.js";

test.describe("Workspaces / Empresas", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("seletor lista as empresas", async ({ page }) => {
    const selector = page.locator("#select-workspace-topbar");
    await expect(selector).toBeVisible();
    // Verifica se há opções (Início + empresas)
    const options = selector.locator("option");
    expect(await options.count()).toBeGreaterThan(1);
    await expect(selector.locator('option[value="e2e-corp"]')).toHaveCount(1);
  });

  test("sem localStorage oc-ws: UI auto-seleciona a primeira empresa", async ({ page }) => {
    // Garante que não há oc-ws
    await page.evaluate(() => localStorage.removeItem("oc-ws"));
    await page.reload();
    await esperarNavegacao(page, "home");
    // Verifica via evaluate se oc-ws foi definido
    const ws = await page.evaluate(() => localStorage.getItem("oc-ws"));
    expect(ws).toBeTruthy();
    // Deve ser o primeiro workspace (e2e-corp)
    expect(ws).toBe("e2e-corp");
  });
});