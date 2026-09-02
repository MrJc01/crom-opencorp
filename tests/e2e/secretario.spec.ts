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

    // Verifica que o chat ficou pronto (coluna de conversas vira popup P-29)
    await esperarElementoTexto(page, "Nova conversa");

    // Clica em "Nova conversa" (botão de ícone no header do chat)
    await page.click('#secretario-chat button[title="Nova conversa"]');

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

    // Verifica que a conversa aparece no histórico (popup P-29) com título
    await page.click('#btn-hist-header');
    await expect(page.locator('.hist-popup .sessao-item').first()).toContainText('olá');
  });
});