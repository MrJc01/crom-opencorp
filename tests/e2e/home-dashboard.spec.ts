import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao } from "./helpers.js";

/** Etapa 9 (P-17) — Home dashboard: KPIs de infos importantes + barra de comando
 *  → Secretário. Determinístico: 100% via API do painel (sem fake opencode). */

const HDR = { authorization: "Bearer test-e2e", "content-type": "application/json" };

/** Seed base + 1 task vencida (due = ontem) + 1 notificação não lida. */
async function seedDashboard(request: import("@playwright/test").APIRequestContext): Promise<void> {
  await seederEmpresaBasica(request, "test-e2e");
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await request.post("/tasks", { headers: HDR, data: { titulo: "Task vencida e2e", coluna: "backlog", prioridade: "alta", due: ontem } });
  await request.delete("/notifications?workspace=e2e-corp", { headers: HDR });
  await request.post("/notifications?workspace=e2e-corp", { headers: HDR, data: { titulo: "Resumo e2e", corpo: "corpo do resumo", tipo: "resumo", origem: "e2e" } });
}

test.describe("Home dashboard (PLANO-COMPLETO Etapa 9)", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seedDashboard(api(page));
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("(a) 5 KPIs com números (tasks vencidas, custos, saúde, fluxos, notificações)", async ({ page }) => {
    await expect(page.locator(".kpi-grid .kpi-card")).toHaveCount(5);
    // task vencida semeada (due = ontem) e 1 notificação não lida
    await expect(page.locator('[data-kpi="tasks-vencidas"] .kpi-value')).toHaveText("1");
    await expect(page.locator('[data-kpi="custos"] .kpi-value')).toHaveText(/^\$\d+\.\d{2}$/);
    await expect(page.locator('[data-kpi="fluxos"] .kpi-value')).toHaveText(/^\d+$/);
    await expect(page.locator('[data-kpi="notificacoes"] .kpi-value')).toHaveText("1");
  });

  test("(b) texto normal na barra de comando → #/secretario com rascunho preenchido", async ({ page }) => {
    await page.fill("#home-comando", "prepare o relatório de vendas da semana");
    await page.press("#home-comando", "Enter");
    await page.waitForURL("**/#/secretario");
    const rascunho = await page.evaluate(() => localStorage.getItem("oc-chat-rascunho"));
    expect(rascunho).toBe("prepare o relatório de vendas da semana");
  });

  test("(c) comando ! da whitelist mostra a saída inline na home", async ({ page }) => {
    await page.fill("#home-comando", "!task list");
    await page.press("#home-comando", "Enter");
    const saida = page.locator("#home-comando-resultado .terminal-saida");
    await expect(saida).toBeVisible({ timeout: 25000 });
    await expect(saida).toContainText("$ task list");
  });

  test("(d) card de saúde mostra dois dots (scheduler + secretário)", async ({ page }) => {
    await expect(page.locator("#kpi-saude")).toBeVisible();
    await expect(page.locator("#kpi-saude .hub-dot")).toHaveCount(2);
  });
});
