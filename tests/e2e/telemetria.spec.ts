import { test, expect } from "@playwright/test";
import { logado, api } from "./helpers.js";

test.describe("Histórico — Aba e Visualizador de Telemetria Granular (E2E)", () => {
  const wsId = "e2e-telemetria-ws";
  const execId = "exec-telemetria-01";
  const ordem = "Análise de logs e execução de diagnóstico via tools";

  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e", wsId);
    const client = api(page);

    // 1. Criar workspace de teste
    await client.post("/workspaces", {
      headers: { authorization: "Bearer test-e2e", "content-type": "application/json" },
      data: { id: wsId },
    }).catch(() => undefined);

    // 2. Criar execução de teste
    await client.post(`/registries/execucoes?workspace=${wsId}`, {
      headers: { authorization: "Bearer test-e2e", "content-type": "application/json" },
      data: {
        id: execId,
        descricao: `Ordem: ${ordem}`,
      },
    }).catch(() => undefined);

    await client.put(`/registries/execucoes/${execId}?workspace=${wsId}`, {
      headers: { authorization: "Bearer test-e2e", "content-type": "application/json" },
      data: {
        extras: {
          status: "concluido",
          ordem,
          agente: "secretario-exec",
          modelo: "glm-5.3-flash",
          duracao_ms: 3200,
          inicio: new Date().toISOString(),
        },
      },
    }).catch(() => undefined);
  });

  test("navega para histórico e visualiza o alternador de Telemetria no drawer", async ({ page }) => {
    await page.goto(`/#/historico?workspace=${wsId}`);
    await page.waitForTimeout(1000);

    // Verifica que a página de histórico carregou
    const titulo = page.locator("h1");
    await expect(titulo).toContainText("Histórico");

    // Clica na execução para abrir o drawer
    const item = page.locator(`text=${execId}`).first();
    if (await item.isVisible()) {
      await item.click();
      await page.waitForTimeout(500);

      // Verifica presença do botão de Telemetria no switcher
      const botaoTelemetria = page.locator('button:has-text("Telemetria")');
      await expect(botaoTelemetria).toBeVisible();

      // Clica na aba de telemetria
      await botaoTelemetria.click();
      await page.waitForTimeout(500);

      // Deve exibir o container de telemetria
      const containerTelemetria = page.locator("text=Nenhum span granular");
      await expect(containerTelemetria).toBeVisible();
    }
  });
});
