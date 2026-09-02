import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao } from "./helpers.js";

/** Etapa 9 (P-17) — Home dashboard: KPIs de infos importantes + barra de comando
 *  → Secretário. Determinístico: 100% via API do painel (sem fake opencode). */

const HDR = { authorization: "Bearer test-e2e", "content-type": "application/json" };

/** Seed base + 1 task vencida (due = ontem) + 1 notificação não lida + 1 rotina
 *  para o feed de ações (P-30). Idempotente: remove rotina homônima antes. */
async function seedDashboard(request: import("@playwright/test").APIRequestContext): Promise<void> {
  await seederEmpresaBasica(request, "test-e2e");
  // "ontem" em data LOCAL (toISOString seria UTC e, após meia-noite UTC,
  // devolveria hoje → due < hoje falhava no KPI de vencidas)
  const dOntem = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const ontem = `${dOntem.getFullYear()}-${String(dOntem.getMonth() + 1).padStart(2, '0')}-${String(dOntem.getDate()).padStart(2, '0')}`;
  await request.post("/tasks", { headers: HDR, data: { titulo: "Task vencida e2e", coluna: "backlog", prioridade: "alta", due: ontem } });
  await request.delete("/notifications?workspace=e2e-corp", { headers: HDR });
  await request.post("/notifications?workspace=e2e-corp", { headers: HDR, data: { titulo: "Resumo e2e", corpo: "corpo do resumo", tipo: "resumo", origem: "e2e" } });
  // Rotina para o feed de ações (intervalo longo = não executa durante o teste).
  // Limpa TODOS os jobs do workspace antes: outros specs criam rotinas com
  // proxima_exec mais cedo, o que tiraria esta do top-6 do card.
  const jobsResp = await request.get("/schedules?workspace=e2e-corp", { headers: HDR });
  const jobs = (await jobsResp.json()) as Array<{ id: string; nome: string }>;
  for (const j of jobs) {
    await request.delete(`/schedules/${j.id}`, { headers: HDR });
  }
  await request.post("/schedules", {
    headers: HDR,
    data: { nome: "rotina-e2e-feed", agenda_tipo: "intervalo_min", agenda_valor: 1440, args: "task list", workspace: "e2e-corp" },
  });
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

  test("(e) P-30 feed de ações: rotina a seguir com contagem regressiva ao vivo", async ({ page }) => {
    const linha = page.locator("#card-acoes .acao-item", { hasText: "rotina-e2e-feed" });
    await expect(linha).toBeVisible();
    const contagem = linha.locator(".acao-contagem");
    await expect(contagem).toHaveText(/^em \d{2}:\d{2}:\d{2}$/);
    // Tique ao vivo: a contagem muda em até 3s (intervalo de 1s)
    const antes = await contagem.textContent();
    await expect(contagem).not.toHaveText(antes!, { timeout: 3000 });
  });

  test("(f) P-30 não vistas: notificação semeada aparece e 'marcar todas' limpa o card", async ({ page }) => {
    const card = page.locator("#card-nao-vistas");
    await expect(card).toContainText("Resumo e2e");
    await expect(card.locator(".notif-nao-vista")).toHaveCount(1);
    await card.getByRole("button", { name: /Marcar todas como lidas/ }).click();
    await expect(card).toContainText("Nenhuma não vista");
    await expect(card.locator("#nao-vistas-badge")).toHaveText("0");
  });
});
