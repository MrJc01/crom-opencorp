import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao } from "./helpers.js";

const NOME = "teste_x_e2e";
const VALOR = "segredo-" + Date.now();

test.describe("Config / Secrets", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
    await page.goto("/#/config");
    await esperarNavegacao(page, "config");
    await page.click('[data-aba="secrets"]');
    await expect(page.locator("#secret-nome")).toBeVisible();
  });

  test("adicionar segredo → nome listado, valor NUNCA aparece", async ({ page }) => {
    await page.fill("#secret-nome", NOME);
    await page.fill("#secret-valor", VALOR);
    await page.click('button:has-text("Adicionar")');

    // aparece na lista (só o nome)
    await expect(page.locator(".secret-row:has-text('" + NOME + "')")).toBeVisible({ timeout: 10000 });

    // API não vaza o valor
    const resp = await page.request.get("/secrets", { headers: { authorization: "Bearer test-e2e" } });
    const corpo = await resp.text();
    const nomes = JSON.parse(corpo);
    expect(nomes.some((s: { nome: string }) => s.nome === NOME)).toBeTruthy();
    expect(corpo).not.toContain(VALOR);

    // limpa
    await page.locator(`button[aria-label="Remover ${NOME}"]`).click();
    await page.locator(".modal-ok").click();
    await expect(page.locator(".secret-row:has-text('" + NOME + "')")).toBeHidden({ timeout: 10000 });
  });

  test("remover segredo existente pede confirmação (modal)", async ({ page }) => {
    await page.fill("#secret-nome", NOME);
    await page.fill("#secret-valor", VALOR);
    await page.click('button:has-text("Adicionar")');
    await expect(page.locator(".secret-row:has-text('" + NOME + "')")).toBeVisible({ timeout: 10000 });

    await page.locator(`button[aria-label="Remover ${NOME}"]`).click();
    // modal de confirmação aparece e o cancelar NÃO remove
    await page.locator(".modal-cancelar").click();
    await expect(page.locator(".secret-row:has-text('" + NOME + "')")).toBeVisible();

    // confirmar remove
    await page.locator(`button[aria-label="Remover ${NOME}"]`).click();
    await page.locator(".modal-ok").click();
    await expect(page.locator(".secret-row:has-text('" + NOME + "')")).toBeHidden({ timeout: 10000 });
  });
});
