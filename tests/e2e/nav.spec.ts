import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao, esperarElementoTexto } from "./helpers.js";

const views = [
  { hash: "home", titulo: "Operação hoje" },
  { hash: "tasks", titulo: "Tasks" },
  { hash: "agenda", titulo: "Agenda" },
  { hash: "reunioes", titulo: "Reuniões" },
  { hash: "fluxos", titulo: "Fluxos" },
  { hash: "historico", titulo: "Histórico" },
  { hash: "secretario", titulo: "Secretário" },
  { hash: "apps", titulo: "Apps" },
];

test.describe("Navegação Sidebar", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
  });

  for (const view of views) {
    test(`clicar em ${view.titulo} muda hash para #/${view.hash} e renderiza título`, async ({ page }) => {
      await page.goto("/");
      await esperarNavegacao(page, "home");
      // Clica no item da sidebar
      const navItem = page.locator(`.nav-item[data-view="${view.hash}"]`);
      await navItem.click();
      // Aguarda navegação
      await page.waitForURL(`**/#/${view.hash}`);
      // Verifica se o título da view aparece
      await esperarElementoTexto(page, view.titulo);
      // Verifica se a view está ativa
      // Reuniões agora é uma ABA dentro da página do Secretário (PLANO-WEB-CRUD D):
      // o hash #/reunioes ativa #view-secretario e mostra o painel de reuniões.
      const sectionHash = view.hash === 'reunioes' ? 'secretario' : view.hash;
      const viewEl = page.locator(`#view-${sectionHash}`);
      await expect(viewEl).toHaveClass(/active/);
    });
  }
});