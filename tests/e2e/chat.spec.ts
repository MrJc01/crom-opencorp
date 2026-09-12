import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarElementoTexto } from "./helpers.js";

test.describe("Chat do Secretário", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/secretario");
    await page.waitForSelector("#chat-input", { timeout: 20000 });
  });

  test.afterAll(async ({ request }) => {
    await request.post("/secretario/stop", { headers: { authorization: "Bearer test-e2e" } }).catch(() => undefined);
  });

  test("estado vazio mostra sugestões clicáveis", async ({ page }) => {
    await expect(page.getByText("O que aconteceu hoje?").first()).toBeVisible({ timeout: 15000 });
  });

  test("clicar sugestão envia → mensagens renderizam + botão copiar", async ({ page }) => {
    await page.getByText("Como está o board de tasks?").first().click();

    await expect(page.locator(".oc-user").last()).toContainText("Como está o board de tasks?", { timeout: 15000 });
    await expect(page.locator(".oc-assistant").last()).toContainText("Resposta do assistant", { timeout: 20000 });
    await expect(page.locator('button[title="Copiar prompt"]').first()).toBeVisible({ timeout: 10000 });
  });

  test("histórico lista a conversa e a busca filtra", async ({ page }) => {
    const texto = `historico chat e2e ${Date.now()}`;
    await page.locator("#chat-input").fill(texto);
    await page.click("#btn-enviar");
    await expect(page.locator(".oc-user").last()).toContainText(texto, { timeout: 15000 });

    await page.locator('button[title="Histórico de Sessões"]').click();
    await esperarElementoTexto(page, "Histórico de Conversas");
    await page.locator('input[placeholder="Buscar conversas..."]').fill("zzz-inexistente-999");
    await esperarElementoTexto(page, "Nenhuma conversa encontrada.");
    await page.locator('input[placeholder="Buscar conversas..."]').fill("");
    await page.keyboard.press("Escape");
  });

  test("URL ganha ?sessao= e F5 restaura a conversa", async ({ page }) => {
    const texto = `teste-url e2e ${Date.now()}`;
    await page.locator("#chat-input").fill(texto);
    await page.click("#btn-enviar");
    await expect(page.locator(".oc-assistant").last()).toContainText("Resposta do assistant", { timeout: 20000 });

    await page.waitForURL(/\/secretario\?sessao=.+/, { timeout: 15000 });
    await page.reload();
    await page.waitForSelector("#chat-input", { timeout: 20000 });
    await expect(page.getByText(texto).first()).toBeVisible({ timeout: 15000 });
  });
});
