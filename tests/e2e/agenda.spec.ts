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

    // Verifica se o job semeado aparece
    await esperarElementoTexto(page, "job-e2e-corp");
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
        args: "echo outro",
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
    await page.fill("#agenda-args", "echo nova rotina");

    // Clica em criar (submit do form Nova rotina)
    await page.click('#form-nova-agenda button[type="submit"]');

    // Aguarda aparecer na lista
    await esperarElementoTexto(page, "Nova Rotina E2E");
  });

  test("botão Pausar muda badge para pausado", async ({ page }) => {
    await page.click('.nav-item[data-view="agenda"]');
    await page.waitForURL("**/#/agenda");
    await esperarElementoTexto(page, "Agenda");

    // Encontra job semeado e clica pausar
    const jobCard = page.locator('#agenda-lista .card', { hasText: 'job-e2e-corp' });
    const pausarBtn = jobCard.locator('button[aria-label="Pausar"]');
    await pausarBtn.click();

    // Aguarda atualização
    await page.waitForTimeout(500);

    // Verifica badge pausado
    await expect(jobCard.locator("text=pausado")).toBeVisible();

  test("Excluir remove (confirm → page.on('dialog') accept)", async ({ page }) => {
    await page.click('.nav-item[data-view="agenda"]');
    await page.waitForURL("**/#/agenda");
    await esperarElementoTexto(page, "Agenda");

    // Configura handler para dialog de confirmação
    page.on("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      await dialog.accept();
    });

    // Encontra job semeado e clica excluir
    const jobCard = page.locator('#agenda-lista .card', { hasText: 'job-e2e-corp' });
    const excluirBtn = jobCard.locator('button[aria-label="Excluir"]');
    await excluirBtn.click();

    // Aguarda remoção
    await page.waitForTimeout(500);

    // Verifica que não está mais na lista
    await expect(page.locator('text=job-e2e-corp')).not.toBeVisible();
  });
});