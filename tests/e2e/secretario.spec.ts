import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao, esperarElementoTexto } from "./helpers.js";

test.describe("Secretário", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("status inicial: card 'standby' com botão Iniciar", async ({ page }) => {
    await page.click('.nav-item[data-view="secretario"]');
    await page.waitForURL("**/#/secretario");
    await esperarElementoTexto(page, "Secretário");

    // Verifica card standby
    await esperarElementoTexto(page, "Secretário em standby");
    await esperarElementoTexto(page, "Iniciar secretário");
  });

  test("clicar Iniciar → fake opencode sobe; após iniciar: lista de conversas + input; enviar 'olá' → resposta do fake aparece; conversa aparece na lista com título", async ({ page }) => {
    await page.click('.nav-item[data-view="secretario"]');
    await page.waitForURL("**/#/secretario");
    await esperarElementoTexto(page, "Secretário");

    // Clica Iniciar
    const iniciarBtn = page.locator("#btn-iniciar-secretario");
    await iniciarBtn.click();

    // Aguarda o fake opencode subir e a view recarregar (timeout generoso 20s)
    await page.waitForTimeout(8000);

    // Verifica que agora tem lista de conversas + input
    await esperarElementoTexto(page, "Conversas");
    await esperarElementoTexto(page, "Nova conversa");

    // Clica em "Nova conversa" para criar uma
    await page.click('button:has-text("Nova conversa")');

    // Aguarda input aparecer
    const input = page.locator("#chat-input");
    await expect(input).toBeVisible();

    // Envia "olá"
    await input.fill("olá");
    await page.click("#btn-enviar");

    // Aguarda resposta do fake
    await page.waitForTimeout(3000);

    // Verifica que a resposta aparece
    await esperarElementoTexto(page, "Resposta do assistant para: olá");

    // Verifica que a conversa aparece na lista com título
    await esperarElementoTexto(page, "olá");
  });
});