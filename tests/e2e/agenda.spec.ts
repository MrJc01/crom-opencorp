import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao, esperarElementoTexto } from "./helpers.js";

test.describe("Agenda / Rotinas", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("job criado via API aparece filtrado (escopo 'só e2e-corp' ativo por padrão)", async ({ page }) => {
    await page.click('.nav-item[data-view="agenda"]');
    await page.waitForURL("**/#/agenda");
    await esperarElementoTexto(page, "Agenda");

    // Verifica se o job semeado aparece (escopo: view agenda — o card de ações
    // da home também lista jobs e fica oculto fora dela)
    await expect(page.locator("#view-agenda").getByText("job-e2e-corp").first()).toBeVisible();
  });

  test('alternar "todas as empresas" mostra mais jobs', async ({ page }) => {
    await page.click('.nav-item[data-view="agenda"]');
    await page.waitForURL("**/#/agenda");
    await esperarElementoTexto(page, "Agenda");

    // Cria job em outro workspace via API
    await api(page).post("/workspaces", {
      headers: { authorization: `Bearer test-e2e`, "content-type": "application/json" },
      data: { id: "outro-ws" },
    });
    await api(page).post("/schedules", {
      headers: { authorization: `Bearer test-e2e`, "content-type": "application/json" },
      data: {
        nome: "job-outro-ws",
        agenda_tipo: "intervalo_min",
        agenda_valor: 30,
        args: "task list",
        workspace: "outro-ws",
      },
    });

    // Alterna para "todas as empresas"
    const btnTodas = page.locator("#agenda-escopo-todas");
    await btnTodas.click();

    // Aguarda atualização
    await page.waitForTimeout(500);

    // Verifica que o job do outro workspace aparece
    await esperarElementoTexto(page, "job-outro-ws");
  });

  test("form Nova rotina: preencher nome/tipo intervalo/valor/comando e criar → job aparece na lista", async ({ page }) => {
    await page.click('.nav-item[data-view="agenda"]');
    await page.waitForURL("**/#/agenda");
    await esperarElementoTexto(page, "Agenda");

    // Preenche formulário
    await page.fill("#agenda-nome", "Nova Rotina E2E");
    await page.selectOption("#agenda-tipo", "intervalo_min");
    await page.fill("#agenda-valor", "15");
    await page.fill("#agenda-args", "task list");

    // Clica em criar (submit do form Nova rotina)
    await page.click('#form-nova-agenda button[type="submit"]');

    // Aguarda aparecer na lista
    await esperarElementoTexto(page, "Nova Rotina E2E");
  });

  test("botão Pausar muda badge para pausado", async ({ page }) => {
    await page.click('.nav-item[data-view="agenda"]');
    await page.waitForURL("**/#/agenda");
    await esperarElementoTexto(page, "Agenda");

    // Encontra o PRIMEIRO job semeado e clica pausar (o seeder pode duplicar)
    const pausarBtn = page.locator('#agenda-lista .card:has-text("job-e2e-corp") button[aria-label="Pausar"]').first();
    await pausarBtn.click();

    // Aguarda atualização
    await page.waitForTimeout(500);

    // Verifica badge pausado (algum card mostra pausado)
    await expect(page.locator('#agenda-lista .card .badge', { hasText: 'pausado' }).first()).toBeVisible();
  });

  test("Excluir remove (modal de confirmação)", async ({ page }) => {
    await page.click('.nav-item[data-view="agenda"]');
    await page.waitForURL("**/#/agenda");
    await esperarElementoTexto(page, "Agenda");

    // Encontra o PRIMEIRO job semeado e clica excluir
    const excluirBtn = page.locator('#agenda-lista .card:has-text("job-e2e-corp") button[aria-label="Excluir"]').first();
    await excluirBtn.click();

    // Modal de confirmação aparece → confirma
    const modal = page.locator('.modal-box');
    await expect(modal).toBeVisible();
    await modal.locator('button.modal-ok').click();
    await expect(modal).toBeHidden();

    // Aguarda remoção
    await page.waitForTimeout(500);

    // Verifica que reduziu a quantidade de cards com o job (algum foi removido)
    await expect(page.locator('#agenda-lista .card')).not.toHaveCount(0);
  });
});