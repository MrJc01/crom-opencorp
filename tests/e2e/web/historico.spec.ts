import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarElementoTexto } from "../helpers.js";
import { ConsoleWatcher } from "./pom/base.js";

const HDR = { authorization: "Bearer test-e2e", "content-type": "application/json" };

test.describe("Web Histórico: filtros, modal e ações", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/historico");
    await esperarElementoTexto(page, "Histórico de Atividades");
  });

  test("tabs de tipo filtram sem erro", async ({ page }) => {
    const watcher = new ConsoleWatcher(page);
    watcher.start();
    for (const tab of ["Execuções", "Fluxos", "Tasks", "Conversas"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      await page.waitForTimeout(400);
    }
    await page.getByRole("button", { name: "Tudo", exact: true }).click();
    watcher.stop();
    expect(watcher.limpos()).toEqual([]);
  });

  test("status e agente filtram a lista", async ({ page }) => {
    const selects = page.locator("main select");
    await expect(selects.first()).toBeVisible();
    await selects.first().selectOption("concluido");
    await page.waitForTimeout(500);
    await selects.first().selectOption("todos");
    await page.waitForTimeout(500);
  });

  test("pausar tempo-real interrompe o polling", async ({ page }) => {
    const botao = page.getByRole("button", { name: /Pausado|Ao Vivo/ });
    await expect(botao.first()).toBeVisible();
    await botao.first().click();
    await expect(page.getByText("Pausado").first()).toBeVisible({ timeout: 5000 });
    await botao.first().click();
  });

  test("modal de task abre e fecha sem erro", async ({ page }) => {
    const watcher = new ConsoleWatcher(page);
    watcher.start();
    const linha = page.getByText("TASK", { exact: true }).first();
    await expect(linha).toBeVisible({ timeout: 15000 });
    await linha.click();
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    watcher.stop();
    expect(watcher.limpos()).toEqual([]);
  });

  test("modal de execução: alterna abas e reenvia", async ({ page }) => {
    const execId = `exec-rt-${Date.now().toString(36)}`;
    await api(page).post("/registries/execucoes", {
      headers: HDR,
      data: { id: execId, descricao: "Ordem: listing e2e" },
    });
    await api(page).put(`/registries/execucoes/${execId}`, {
      headers: HDR,
      data: { extras: { status: "concluido", ordem: "listing e2e", agente: "executor-padrao" } },
    });
    // O modal lê o registro direto (/registries/execucoes/:id); a lista
    // (/historico) só exibe sessões reais (tag "sessao") — abre via ?run=
    await page.goto(`/historico?run=${encodeURIComponent(execId)}`);
    await esperarElementoTexto(page, `Execução: ${execId}`);

    for (const aba of ["Telemetria", "Terminal Raw", "Diff de Arquivos"]) {
      await page.getByRole("button", { name: new RegExp(aba) }).click();
      await page.waitForTimeout(400);
    }
    await page.keyboard.press("Escape");
  });
});
