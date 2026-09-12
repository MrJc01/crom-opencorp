import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarElementoTexto } from "./helpers.js";

/** Ajuda contextual atual: central de Docs + descrições de catálogo + tooltips. */
test.describe("Ajuda contextual e Docs", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
  });

  test("central de Docs lista guias e abre o conteúdo", async ({ page }) => {
    await page.goto("/docs");
    await esperarElementoTexto(page, "01. Visão Geral da Plataforma");
    await page.getByText("01. Visão Geral da Plataforma").first().click();
    await page.waitForURL("**/docs?doc=*", { timeout: 10000 });
  });

  test("catálogo de nós do Studio descreve cada tipo (ajuda inline)", async ({ page }) => {
    await page.goto("/fluxos");
    await esperarElementoTexto(page, "Fluxos");
    await page.getByRole("button", { name: "Adicionar Fluxo" }).click();
    await esperarElementoTexto(page, "Criar Novo Fluxo");
    await esperarElementoTexto(page, "Template Inicial");
    const opt = page.locator('option[value="pipeline"]');
    await expect(opt).toHaveText(/Pipeline Sequencial/);
  });

  test("botões de ícone têm tooltip de ajuda (title)", async ({ page }) => {
    await page.goto("/secretario");
    await expect(page.locator('button[title="Histórico de Sessões"]')).toBeVisible({ timeout: 15000 });
    await page.goto("/tasks");
    await esperarElementoTexto(page, "Quadro Kanban");
  });
});
