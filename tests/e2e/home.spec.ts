import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao, esperarElementoTexto } from "./helpers.js";

test.describe("Home / Início (hub)", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("KPIs de operação aparecem (Tasks abertas, Feitas 7d, Taxa ok 24h, Custo hoje)", async ({ page }) => {
    await esperarElementoTexto(page, "Tasks abertas");
    await esperarElementoTexto(page, "Feitas em 7 dias");
    await esperarElementoTexto(page, "Taxa ok 24h");
    await esperarElementoTexto(page, "Custo hoje");
  });

  test('painel "Feed ao vivo" presente com selo "todas as empresas"', async ({ page }) => {
    await esperarElementoTexto(page, "Feed ao vivo");
    await esperarElementoTexto(page, "todas as empresas");
  });

  test('zona "Linhas de pensamento" com botão Rodar agora e link ver todas', async ({ page }) => {
    // semeia um flow no workspace (a zona mostra vazio orientando criar, se não houver)
    await api(page).post("/flows", {
      headers: { authorization: `Bearer test-e2e`, "content-type": "application/json" },
      data: { id: "ceo-analise-board", nome: "Análise do board pelo CEO" },
    });
    await page.reload();
    await esperarNavegacao(page, "home");
    await esperarElementoTexto(page, "Linhas de pensamento");
    await esperarElementoTexto(page, "Rodar agora");
    await esperarElementoTexto(page, "ver todas");
  });

  test('zona "Sistema" com atalhos Config, Secrets, Ferramentas, Doutor', async ({ page }) => {
    await esperarElementoTexto(page, "Secrets");
    await esperarElementoTexto(page, "Ferramentas");
    await esperarElementoTexto(page, "Doutor");
  });

  test("chip de workspace no header abre a sidebar", async ({ page }) => {
    const chip = page.locator(".hub-ws");
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(page.locator("#sidebar")).toHaveClass(/open/);
  });

  test("botão Criar empresa abre o wizard (passo 1 Identidade)", async ({ page }) => {
    await page.click('button:has-text("Criar empresa")');
    await esperarElementoTexto(page, "Nova empresa");
    await esperarElementoTexto(page, "Nome da empresa");
    await page.click('button[aria-label="Fechar wizard"]');
  });
});
