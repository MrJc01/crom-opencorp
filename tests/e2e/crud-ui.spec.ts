import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao, esperarElementoTexto } from "./helpers.js";

/** Título/id único por run — o seeder roda em todo beforeEach e não limpa estado */
const sufixo = Date.now().toString(36);

test.describe("CRUD via UI (F2)", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("Excluir task: drawer → Excluir → modal → task some do kanban", async ({ page }) => {
    const titulo = `Task excluir e2e-${sufixo}`;
    const resp = await api(page).post("/tasks", {
      headers: { authorization: "Bearer test-e2e", "content-type": "application/json" },
      data: { titulo, descricao: "criada para exclusão", coluna: "backlog", prioridade: "media" },
    });
    if (resp.status() >= 400) throw new Error(`seed task falhou: ${resp.status()}`);

    await page.click('.nav-item[data-view="tasks"]');
    await page.waitForURL("**/#/tasks");

    const card = page.locator(".task-card", { hasText: titulo }).first();
    await expect(card).toBeVisible();
    await card.click();

    const drawer = page.locator("#drawer");
    await expect(drawer).toHaveClass(/open/);
    await expect(drawer).toContainText(titulo);

    await drawer.locator('button:has-text("Excluir task")').click();

    const modalOk = page.locator(".modal-ok");
    await expect(modalOk).toBeVisible();
    await modalOk.click();

    await expect(drawer).not.toHaveClass(/open/);
    await expect(page.locator(".task-card", { hasText: titulo })).toHaveCount(0);
  });

  test("Editar fluxo: cria pela UI com 2 passos → Editar → renomeia → Salvar → card atualizado", async ({ page }) => {
    const nomeOriginal = `Fluxo e2e-${sufixo}`;
    const nomeNovo = `Fluxo renomeado e2e-${sufixo}`;

    await page.click('.nav-item[data-view="fluxos"]');
    await page.waitForURL("**/#/fluxos");

    // Criação via UI (template pipeline: 2 passos task_create)
    await page.locator('button:has-text("Pipeline")').first().click();
    const form = page.locator("#form-novo-flow");
    await expect(form).toBeVisible();
    await page.fill("#flow-id", `e2e-flow-${sufixo}`);
    await page.fill("#flow-nome", nomeOriginal);
    const addPasso = page.locator('button:has-text("passo")').first();
    const passos = page.locator("#flow-passos .flow-passo");
    // Pipeline já vem com 1 linha inicial — só adiciona a segunda
    await passos.first().locator("select").first().selectOption("task_create");
    await passos.first().locator(".flow-titulo").fill("Passo um");
    await addPasso.click();
    await passos.nth(1).locator("select").first().selectOption("task_create");
    await passos.nth(1).locator(".flow-titulo").fill("Passo dois");
    await form.locator('button[type="submit"]').click();

    const cardFluxo = page.locator("#view-fluxos .card", { hasText: nomeOriginal }).first();
    await expect(cardFluxo).toBeVisible();

    // Edição: renomeia e salva
    await cardFluxo.locator('button:has-text("Editar")').click();
    const formEdicao = page.locator("#form-novo-flow");
    await expect(formEdicao).toBeVisible();
    await page.fill("#flow-nome", nomeNovo);
    await formEdicao.locator('button[type="submit"]').click();

    await expect(page.locator("#view-fluxos")).toContainText(nomeNovo);
  });

  test("Reunião no Secretário: pauta + check-list de agentes → Convocar limpa o form", async ({ page }) => {
    // Semeia agentes para o check-list (seeder não cria agentes)
    const respA = await api(page).post("/agents", {
      headers: { authorization: "Bearer test-e2e", "content-type": "application/json" },
      data: { id: "ag-convite-a" },
    });
    if (respA.status() >= 400 && respA.status() !== 409) throw new Error(`seed agente falhou: ${respA.status()}`);

    // Reuniões saiu do navbar (P-13) — navegação direta pela rota (aba do Secretário)
    await page.evaluate(() => { window.location.hash = "#/reunioes"; });
    await page.waitForURL("**/#/reunioes");
    await esperarElementoTexto(page, "Reuniões");

    // Check-list de agentes presente (Etapa E)
    const seletor = page.locator("#reuniao-seletor-agentes");
    await expect(seletor).toBeVisible();
    const checkboxes = seletor.locator('input[type="checkbox"]');
    await expect(checkboxes.first()).toBeAttached();

    await page.fill("#reuniao-pauta", `Pauta de lançamento e2e-${sufixo}`);
    await checkboxes.first().check();
    await page.locator('button:has-text("Convocar")').click();

    // POST /meetings responde 202 (iniciado em background) → form é limpo
    await expect(page.locator("#reuniao-pauta")).toHaveValue("");
  });
});
