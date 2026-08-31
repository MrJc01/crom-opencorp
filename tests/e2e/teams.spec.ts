import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao, esperarElementoTexto } from "./helpers.js";

// Fusão team×fluxo (PLANO-WEB-CRUD F): o item Teams saiu da sidebar; #/teams
// redireciona para Fluxos, onde times legados aparecem com botão Migrar.
test.describe("Teams → Fluxos (fusão)", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("#/teams redireciona para Fluxos e mostra times legados semeado", async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '/teams'; });
    await page.waitForURL("**/#/fluxos");
    await esperarElementoTexto(page, "Fluxos");

    // Time semeado aparece na seção de legados
    const legados = page.locator('#times-legados');
    await expect(legados).toBeVisible();
    await expect(legados.locator('text=e2e-pipe').first()).toBeVisible();
  });

  test("botão Migrar todos converte team legado em fluxo listado", async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '/teams'; });
    await page.waitForURL("**/#/fluxos");
    await esperarElementoTexto(page, "Times legados");

    await page.click('button:has-text("Migrar todos")');
    // o fluxo migrado entra na lista de fluxos
    await esperarElementoTexto(page, "e2e-pipe");
    // e a seção de legados esvazia (team arquivado como .json.migrado)
    await expect(page.locator('#times-legados')).not.toContainText('e2e-pipe');
  });

  test("templates de coordenação disponíveis no cabeçalho (Pipeline/Fanout/Review/Debate)", async ({ page }) => {
    await page.click('.nav-item[data-view="fluxos"]');
    await page.waitForURL("**/#/fluxos");
    for (const template of ["Pipeline", "Fanout", "Review", "Debate"]) {
      await expect(page.locator(`button:has-text("${template}")`).first()).toBeVisible();
    }
  });
});
