import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarElementoTexto } from "./helpers.js";

/** Painel de Operações: KPIs, comando rápido, terminal inline, saúde, A Seguir e tasks. */

test.describe("Home dashboard / Painel de Operações", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarElementoTexto(page, "Painel de Operações");
  });

  test("(a) 5 KPIs com rótulos (custo, tasks, agentes, fluxos, saúde)", async ({ page }) => {
    await esperarElementoTexto(page, "Custo do Dia");
    await esperarElementoTexto(page, "Tasks em Aberto");
    await esperarElementoTexto(page, "Agentes Prontos");
    await esperarElementoTexto(page, "Fluxos Ativos");
    await esperarElementoTexto(page, "Saúde do Sistema");
  });

  test("(b) texto normal na barra de comando → /secretario com a ordem", async ({ page }) => {
    const input = page.locator('input[placeholder="Digite uma instrução para o Secretário ou ! comando no terminal..."]');
    await input.fill("prepare o relatório de vendas da semana");
    await input.press("Enter");
    await page.waitForURL("**/secretario?ordem=*", { timeout: 10000 });
  });

  test("(c) comando ! whitelist mostra a saída inline na home", async ({ page }) => {
    const input = page.locator('input[placeholder="Digite uma instrução para o Secretário ou ! comando no terminal..."]');
    await input.fill("!task list");
    await input.press("Enter");
    await expect(page.getByText("Task backlog e2e").first()).toBeVisible({ timeout: 25000 });
  });

  test("(d) saúde mostra Scheduler OK", async ({ page }) => {
    await esperarElementoTexto(page, "Saúde do Sistema");
    await esperarElementoTexto(page, "Scheduler OK");
  });

  test("(e) A Seguir lista a rotina semeada com contagem ao vivo", async ({ page }) => {
    await esperarElementoTexto(page, "Rondas 24h Agendadas");
    await expect(page.getByText("job-e2e-corp").first()).toBeVisible({ timeout: 10000 });
    // Contagem regressiva no formato "em HH:MM:SS" e tique ao vivo em até 3s
    const contagem = page.getByText(/^em \d{2}:\d{2}:\d{2}$/).first();
    await expect(contagem).toBeVisible({ timeout: 10000 });
    const antes = await contagem.textContent();
    await expect(contagem).not.toHaveText(antes!, { timeout: 4000 });
  });

  test("(f) tasks prioritárias mostram a task semeada", async ({ page }) => {
    await esperarElementoTexto(page, "Tarefas Prioritárias em Aberto");
    await expect(page.getByText("Task backlog e2e").first()).toBeVisible({ timeout: 10000 });
  });
});
