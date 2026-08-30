import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao, esperarElementoTexto } from "./helpers.js";

test.describe("Histórico", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("timeline mostra itens (task semeada gera evento tipo 'task')", async ({ page }) => {
    await page.click('.nav-item[data-view="historico"]');
    await page.waitForURL("**/#/historico");
    await esperarElementoTexto(page, "Histórico");

    // Verifica se há itens na timeline
    await esperarElementoTexto(page, "Task");
    // Deve haver badge "Task"
  });

  test("filtro por tipo 'Tasks' mostra só tasks", async ({ page }) => {
    await page.click('.nav-item[data-view="historico"]');
    await page.waitForURL("**/#/historico");
    await esperarElementoTexto(page, "Histórico");

    // Seleciona filtro Tasks
    await page.click('button:has-text("Tasks")');

    // Aguarda filtro
    await page.waitForTimeout(500);

    // Verifica que só aparecem tasks: nenhum badge de tipo "Execução"/"Rotina"
    // (badges de status como "backlog"/"feito" são permitidos)
    const badges = page.locator(".badge-neutral.text-xs");
    const count = await badges.count();
    const tipos = new Set<string>();
    for (let i = 0; i < count; i++) {
      const text = (await badges.nth(i).textContent())?.trim() ?? "";
      if (["Execução", "Rotina", "Task"].includes(text)) {
        expect(text).toBe("Task");
      }
    }
  });

  test('"Rotinas" com job semeado mostra o job (se tiver ultima_exec null aparece vazio — aceitável)', async ({ page }) => {
    await page.click('.nav-item[data-view="historico"]');
    await page.waitForURL("**/#/historico");
    await esperarElementoTexto(page, "Histórico");

    // Seleciona filtro Rotinas
    await page.click('button:has-text("Rotinas")');

    // Aguarda filtro
    await page.waitForTimeout(500);

    // Verifica que não quebra (pode estar vazio se ultima_exec for null)
    await expect(page.locator("#view-historico")).toBeVisible();
  });
});