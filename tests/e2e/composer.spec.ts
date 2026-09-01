import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao } from "./helpers.js";

test.describe("Composer inteligente — / comandos, @ contexto, ! terminal (PLANO-PAINEL-V2 Etapa 2)", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
    await page.click('.nav-item[data-view="secretario"]');
    await page.waitForURL("**/#/secretario");
    await page.waitForTimeout(600);

    // inicia o fake opencode (com retry: corrida rara do start volta pro standby)
    for (let i = 0; i < 2; i++) {
      const standby = page.locator("#btn-iniciar-secretario");
      if (await standby.isVisible().catch(() => false)) {
        await standby.click();
      }
      try {
        await page.waitForSelector("#chat-input", { timeout: 20000 });
        return;
      } catch {
        if (i === 1) throw new Error("secretário não ficou pronto após 2 tentativas");
      }
    }
  });

  test.afterAll(async ({ request }) => {
    await request.post("/secretario/stop", { headers: { authorization: "Bearer test-e2e" } }).catch(() => {});
  });

  test("(a) / abre palette de comandos; Enter preenche e roda /status localmente", async ({ page }) => {
    await page.click('button[title="Nova conversa"]');
    await page.fill("#chat-input", "/");
    await expect(page.locator(".palette-menu")).toBeVisible();
    await expect(page.locator(".palette-menu .palette-item")).toHaveCount(7);

    // filtra por "/st" → só /status
    await page.fill("#chat-input", "/st");
    await expect(page.locator(".palette-menu .palette-item")).toHaveCount(1);
    await expect(page.locator(".palette-menu .palette-item").first()).toContainText("/status");

    // Enter seleciona → insere "/status " e fecha a palette
    await page.keyboard.press("Enter");
    await expect(page.locator("#chat-input")).toHaveValue("/status ");
    await expect(page.locator(".palette-menu")).toHaveCount(0);

    // Enter de novo envia → resposta LOCAL no feed (sem chamar o LLM)
    await page.keyboard.press("Enter");
    await expect(page.locator(".oc-user").last()).toContainText("/status");
    await expect(page.locator(".oc-assistant").last()).toContainText("Tasks", { timeout: 15000 });
  });

  test("(b) @ abre menu de contexto; clicar num agente insere @id no input", async ({ page }) => {
    await api(page).post("/agents", {
      headers: { authorization: "Bearer test-e2e", "content-type": "application/json" },
      data: { id: "e2e-atendente" },
    });
    await page.click('button[title="Nova conversa"]');
    await page.fill("#chat-input", "@");
    await expect(page.locator(".palette-menu")).toBeVisible();
    const agente = page.locator('.palette-item[data-tipo="agente"]').first();
    await expect(agente).toBeVisible();
    await agente.click();
    await expect(page.locator("#chat-input")).toHaveValue(/@e2e-atendente /);
    await expect(page.locator(".palette-menu")).toHaveCount(0);
  });

  test("(c) right-click em task-card abre menu com Ver detalhes; clicar abre o drawer", async ({ page }) => {
    await page.click('.nav-item[data-view="tasks"]');
    await page.waitForURL("**/#/tasks");
    await page.waitForSelector(".task-card", { timeout: 15000 });

    const card = page.locator(".task-card").first();
    await card.click({ button: "right" });
    const menu = page.locator(".ctx-menu");
    await expect(menu).toBeVisible();
    await expect(menu.locator(".palette-item", { hasText: "Ver detalhes" })).toBeVisible();
    await expect(menu.locator(".palette-item", { hasText: "Copiar título" })).toBeVisible();

    await menu.locator(".palette-item", { hasText: "Ver detalhes" }).click();
    await expect(menu).toHaveCount(0);
    await expect(page.locator("#drawer")).toHaveClass(/open/);
    await expect(page.locator("#drawer-title")).toContainText("Task backlog e2e");
  });

  test("(d) !task list executa comando whitelistado e mostra saída .terminal-saida", async ({ page }) => {
    await page.click('button[title="Nova conversa"]');
    await page.fill("#chat-input", "!task list");
    await page.keyboard.press("Enter");

    await expect(page.locator(".oc-user").last()).toContainText("!task list");
    const saida = page.locator(".terminal-saida").last();
    await expect(saida).toBeVisible({ timeout: 20000 });
    await expect(saida).toContainText("Task backlog e2e");
  });
});
