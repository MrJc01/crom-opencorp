import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao } from "./helpers.js";

/**
 * Etapa 1b (P-29) — Histórico do Secretário como popup.
 * Determinísticos e independentes do estado do Secretário (rodando ou standby):
 * o popup deve abrir, mostrar lista OU estado vazio/erro, e fechar sem órfãos.
 */
test.describe("Histórico do Secretário como popup (Etapa 1b)", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
  });

  test("(a) abre pelo page-header do Secretário, mostra conteúdo e fecha com Escape", async ({ page }) => {
    await page.goto("/#/secretario");
    await page.waitForURL("**/#/secretario");

    // botão de entrada existe em TODOS os headers da página (standby, erro ou chat)
    const btn = page.locator("#btn-hist-header");
    await expect(btn).toBeVisible({ timeout: 15000 });
    await btn.click();

    // overlay + box visíveis; conteúdo: lista de conversas OU estado vazio/erro
    await expect(page.locator(".hist-popup")).toBeVisible();
    await expect(page.locator(".hist-popup-box")).toBeVisible();
    await expect(
      page.locator(".hist-popup-box .sessao-item, .hist-popup-box .empty-state").first()
    ).toBeVisible({ timeout: 10000 });

    // Escape fecha e NÃO deixa overlay órfão no DOM
    await page.keyboard.press("Escape");
    await expect(page.locator(".hist-popup")).toHaveCount(0);
  });

  test("(b) abre pelo header do chat lateral e Escape fecha SÓ o popup", async ({ page }) => {
    await page.goto("/");
    await esperarNavegacao(page, "home");

    await page.click("#fab-chat");
    await expect(page.locator("#chat-drawer")).toHaveClass(/open/);
    await page.click("#btn-lat-historico");

    await expect(page.locator(".hist-popup")).toBeVisible();
    await expect(
      page.locator(".hist-popup-box .sessao-item, .hist-popup-box .empty-state").first()
    ).toBeVisible({ timeout: 10000 });

    await page.keyboard.press("Escape");
    await expect(page.locator(".hist-popup")).toHaveCount(0);
    // o popup é uma camada superior: o drawer de chat continua aberto atrás
    await expect(page.locator("#chat-drawer")).toHaveClass(/open/);
  });

  test("(c) fechar por × e por click no overlay não deixa overlay órfão", async ({ page }) => {
    await page.goto("/");
    await esperarNavegacao(page, "home");
    await page.click("#fab-chat");
    await page.click("#btn-lat-historico");
    await expect(page.locator(".hist-popup")).toBeVisible();

    // fecha pelo botão ×
    await page.click(".hist-popup-fechar");
    await expect(page.locator(".hist-popup")).toHaveCount(0);

    // reabre e fecha por click no overlay (fora do box) — sem acúmulo de overlays
    await page.click("#btn-lat-historico");
    await expect(page.locator(".hist-popup")).toBeVisible();
    await page.locator(".hist-popup").click({ position: { x: 8, y: 8 } });
    await expect(page.locator(".hist-popup")).toHaveCount(0);
    await expect(page.locator("#chat-drawer")).toHaveClass(/open/);
  });
});
