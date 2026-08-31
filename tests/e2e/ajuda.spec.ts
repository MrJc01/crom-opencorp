import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao } from "./helpers.js";

test.describe("Sistema de ajuda (?)", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("'?' em KPI da home abre popup 'Como funciona' e ESC fecha", async ({ page }) => {
    await page.locator('#view-home .help-btn[aria-label="Ajuda: tasks"]').first().click();
    await expect(page.locator(".help-pop")).toBeVisible();
    await expect(page.locator(".help-pop")).toContainText("Como funciona");
    await expect(page.locator(".help-pop")).toContainText("quadro kanban");
    await page.keyboard.press("Escape");
    await expect(page.locator(".help-pop")).toBeHidden();
  });

  test("'?' na sidebar do workspace explica conceito", async ({ page }) => {
    await page.locator('button[aria-label="Ajuda: workspace"]').click();
    await expect(page.locator(".help-pop")).toContainText("empresa autônoma");
    await page.locator(".help-pop .btn").click();
    await expect(page.locator(".help-pop")).toBeHidden();
  });

  test("config: cada aba tem '?' de seção abrindo explicação", async ({ page }) => {
    await page.goto("/#/config");
    await esperarNavegacao(page, "config");
    // seção Modelos
    await page.locator('#view-config .help-btn[aria-label="Ajuda: modelos"]').first().click();
    await expect(page.locator(".help-pop")).toContainText("plano Go");
    await page.keyboard.press("Escape");

    // aba Secrets → seção Segredos
    await page.click('[data-aba="secrets"]');
    await page.locator('#view-config .help-btn[aria-label="Ajuda: secrets"]').first().click();
    await expect(page.locator(".help-pop")).toContainText("Nunca");
    await page.keyboard.press("Escape");
  });

  test("'?' presente em pelo menos 8 lugares na home", async ({ page }) => {
    const total = await page.locator("#view-home .help-btn").count();
    expect(total).toBeGreaterThanOrEqual(8);
  });
});
