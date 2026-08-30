import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao, esperarElementoTexto } from "./helpers.js";

test.describe("Login", () => {
  test("sem token: aparece a tela de login", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#login-screen")).toBeVisible();
    await expect(page.locator("#login-token")).toBeVisible();
    await expect(page.locator("#login-btn")).toBeVisible();
  });

  test("token errado: mensagem de erro visível", async ({ page }) => {
    await page.goto("/");
    await page.fill("#login-token", "token-invalido");
    await page.click("#login-btn");
    await esperarElementoTexto(page, "Token inválido");
    await expect(page.locator("#login-error")).toBeVisible();
    await expect(page.locator("#login-screen")).toBeVisible();
  });

  test("token correto: entra e sidebar visível", async ({ page }) => {
    logado(page, "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
    // Verifica se o app está visível (login escondido)
    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator("#login-screen")).toBeHidden();
    // Verifica se o token está no localStorage
    const token = await page.evaluate(() => localStorage.getItem("oc-token"));
    expect(token).toBe("test-e2e");
  });
});