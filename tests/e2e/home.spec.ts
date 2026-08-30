import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao, esperarElementoTexto } from "./helpers.js";

test.describe("Home / Início", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("KPIs aparecem (Tasks abertas, Execuções, Aprovações, Custo)", async ({ page }) => {
    await esperarElementoTexto(page, "Tasks abertas");
    await esperarElementoTexto(page, "Execuções totais");
    await esperarElementoTexto(page, "Approvals pendentes");
    await esperarElementoTexto(page, "Custo hoje");
  });

  test('painel "Atividade ao vivo" presente com selo "todas as empresas"', async ({ page }) => {
    await esperarElementoTexto(page, "Atividade ao vivo");
    await esperarElementoTexto(page, "todas as empresas");
  });

  test('"Execuções recentes" com selo', async ({ page }) => {
    await esperarElementoTexto(page, "Execuções recentes");
    await esperarElementoTexto(page, "todas as empresas");
  });
});