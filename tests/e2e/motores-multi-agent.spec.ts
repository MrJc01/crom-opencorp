import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarElementoTexto } from "./helpers.js";

test.describe("Config — Motores, autenticação e provedores", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
  });

  test("exibe os 8 motores de agentes autônomos", async ({ page }) => {
    await page.goto("/config?tab=motores");
    for (const id of ["opencode", "crom-agente", "claude-code", "antigravity", "cursor", "copilot", "codex", "aider"]) {
      await expect(page.locator(`button[data-engine-id='${id}']`).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test("abre o modal de autenticação a partir do motor selecionado", async ({ page }) => {
    await page.goto("/config?tab=motores");
    await page.locator("button[data-engine-id='claude-code']").click();

    await page.getByRole("button", { name: /Autenticar \/ Chave/i }).click();
    await esperarElementoTexto(page, "Acesse o console da Anthropic");

    await page.getByRole("button", { name: "Terminal CLI" }).click();
    await esperarElementoTexto(page, "Autenticação Necessária");
    await expect(page.getByText("$ claude login").first()).toBeVisible();

    await page.getByRole("button", { name: "Token / Chave Manual" }).click();
    await expect(page.getByText("Token, Chave de API ou Credencial (ANTHROPIC_API_KEY)").first()).toBeVisible();

    await page.getByRole("button", { name: "Fechar" }).click();
    await expect(page.getByText("Acesse o console da Anthropic")).toHaveCount(0);
  });

  test("provedores contextuais do motor selecionado (OpenCode universais)", async ({ page }) => {
    await page.goto("/config?tab=motores");
    await page.locator("button[data-engine-id='opencode']").click();
    await esperarElementoTexto(page, "OpenRouter (Universal & BYOK)");
    await esperarElementoTexto(page, "Google AI Studio Direto");
  });

  test("alterna para Chaves de API e Modelos sem erros", async ({ page }) => {
    await page.goto("/config?tab=motores");
    await page.getByRole("button", { name: /Chaves de API/i }).click();
    await esperarElementoTexto(page, "Gerenciamento Seguro de Chaves de API");

    await page.getByRole("button", { name: /^Modelos$/i }).click();
    await esperarElementoTexto(page, "Modelo Padrão");
  });
});
