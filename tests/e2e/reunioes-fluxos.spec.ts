import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao, esperarElementoTexto } from "./helpers.js";

test.describe("Reuniões e Fluxos", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("Reuniões: renderiza com estado vazio que ensina + form de convocar reunião existe (textarea pauta)", async ({ page }) => {
    // Reuniões saiu do navbar (P-13) — navegação direta pela rota (aba do Secretário)
    await page.evaluate(() => { window.location.hash = "#/reunioes"; });
    await page.waitForURL("**/#/reunioes");
    await esperarElementoTexto(page, "Reuniões");

    // Verifica estado vazio
    await esperarElementoTexto(page, "Nenhuma reunião");

    // Verifica form de convocar reunião
    const pautaTextarea = page.locator("#reuniao-pauta");
    await expect(pautaTextarea).toBeVisible();

    const criarBtn = page.locator('button:has-text("Convocar")');
    await expect(criarBtn).toBeVisible();
  });

  test("Fluxos: renderiza com estado vazio que ensina", async ({ page }) => {
    await page.click('.nav-item[data-view="fluxos"]');
    await page.waitForURL("**/#/fluxos");
    await esperarElementoTexto(page, "Fluxos");

    // Estado vazio OU lista com fluxos (home.spec semeia um flow na mesma home e2e):
    // vazio mostra "Nenhum fluxo"; com fluxos, cada card tem botão Executar.
    await expect(page.locator("#view-fluxos")).toContainText(/Nenhum fluxo|Executar/);
  });
});