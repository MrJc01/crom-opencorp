import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao, esperarElementoTexto } from "./helpers.js";

test.describe("Apps", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("app semeado aparece na lista", async ({ page }) => {
    await page.click('.nav-item[data-view="apps"]');
    await page.waitForURL("**/#/apps");
    await esperarElementoTexto(page, "Mini-apps");

    await esperarElementoTexto(page, "Painel de Tarefas");
    await expect(page.locator("text=painel-tarefas")).toBeVisible();
  });

  test("abrir app renderiza o widget metrica (número visível) e o título do widget", async ({ page }) => {
    await page.click('.nav-item[data-view="apps"]');
    await page.waitForURL("**/#/apps");
    await esperarElementoTexto(page, "Mini-apps");

    // Clica no app
    await page.click('.app-card:has-text("Painel de Tarefas")');
    await esperarElementoTexto(page, "Painel de Tarefas");

    // Verifica widget metrica
    await esperarElementoTexto(page, "Tasks");
    // O número deve aparecer na classe widget-metric
    const widget = page.locator(".widget-metric").first();
    await expect(widget).toBeVisible();
  });

  test("voltar funciona", async ({ page }) => {
    await page.click('.nav-item[data-view="apps"]');
    await page.waitForURL("**/#/apps");
    await esperarElementoTexto(page, "Mini-apps");

    await page.click('.app-card:has-text("Painel de Tarefas")');
    await esperarElementoTexto(page, "Painel de Tarefas");

    // Clica voltar
    await page.click('button:has-text("← Voltar")');
    await esperarElementoTexto(page, "Mini-apps");
  });
});