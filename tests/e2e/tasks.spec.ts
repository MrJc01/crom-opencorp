import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao, esperarElementoTexto } from "./helpers.js";

test.describe("Tasks / Kanban", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("criar task pelo input → aparece no kanban na coluna backlog", async ({ page }) => {
    await page.click('.nav-item[data-view="tasks"]');
    await page.waitForURL("**/#/tasks");
    await esperarElementoTexto(page, "Tasks");

    // Preenche input de criar task
    const input = page.locator("#task-titulo");
    await input.fill("Nova task e2e via UI");
    await input.press("Enter");

    // Aguarda aparecer no kanban coluna backlog
    await esperarElementoTexto(page, "Nova task e2e via UI");
    const backlogCol = page.locator('#kanban-backlog');
    await expect(backlogCol.locator("text=Nova task e2e via UI")).toBeVisible();
  });

  test("clicar no card abre drawer com título e metadados", async ({ page }) => {
    await page.click('.nav-item[data-view="tasks"]');
    await page.waitForURL("**/#/tasks");
    await esperarElementoTexto(page, "Tasks");

    // Procura um card existente (task semeada)
    const card = page.locator(".task-card").first();
    await expect(card).toBeVisible();
    const taskTitle = await card.locator(".task-title").textContent();
    await card.click();

    // Aguarda drawer abrir
    await expect(page.locator("#drawer")).toHaveClass(/open/);
    await esperarElementoTexto(page, taskTitle ?? "Task");
  });

  test("enviar mensagem no chat do drawer → mensagem aparece", async ({ page }) => {
    await page.click('.nav-item[data-view="tasks"]');
    await page.waitForURL("**/#/tasks");
    await esperarElementoTexto(page, "Tasks");

    const card = page.locator(".task-card").first();
    await card.click();
    await expect(page.locator("#drawer")).toHaveClass(/open/);

    // Envia mensagem no chat do drawer
    const chatInput = page.locator("#drawer-chat-input");
    await chatInput.fill("Mensagem de teste e2e");
    await chatInput.press("Enter");

    // Aguarda mensagem aparecer
    await esperarElementoTexto(page, "Mensagem de teste e2e");
  });

  test("mover task pela coluna (select) → some de backlog e aparece em feito; badge de count muda", async ({ page }) => {
    await page.click('.nav-item[data-view="tasks"]');
    await page.waitForURL("**/#/tasks");
    await esperarElementoTexto(page, "Tasks");

    // Cria task exclusiva deste teste (o seeder roda a cada teste e acumula tasks)
    const tituloUnico = `Task mover e2e ${Date.now()}`;
    await api(page).post("/tasks", {
      headers: { authorization: `Bearer test-e2e`, "content-type": "application/json" },
      data: { titulo: `Task mover e2e`, descricao: "criada para o teste de mover", coluna: "backlog", prioridade: "media" },
    });
    await page.waitForTimeout(300);

    // Encontra essa task no backlog
    const backlogCol = page.locator('#kanban-backlog');
    const taskCard = backlogCol.locator(".task-card", { hasText: "Task mover e2e" }).first();
    await expect(taskCard).toBeVisible();
    const taskTitle = await taskCard.locator(".task-title").textContent();

    // Abre o drawer clicando no card
    await taskCard.click();
    await expect(page.locator("#drawer")).toHaveClass(/open/);

    // Seleciona coluna "feito" no dropdown
    const select = page.locator("#drawer-coluna");
    await select.selectOption("feito");

    // Aguarda mover (re-render)
    await page.waitForTimeout(500);

    // Verifica que não está mais no backlog
    await expect(page.locator(`#kanban-backlog .task-title`, { hasText: "Task mover e2e" })).toHaveCount(0);

    // Verifica que está em feito
    const feitoCol = page.locator('#kanban-feito');
    await expect(feitoCol.locator(`.task-title`, { hasText: "Task mover e2e" }).first()).toBeVisible();

    // Verifica badge de count (o header da coluna tem .kanban-count)
    await expect(page.locator('.kanban-col:has(#kanban-backlog) .kanban-count')).toBeVisible();
    await expect(page.locator('.kanban-col:has(#kanban-feito) .kanban-count')).toBeVisible();
  });
});