import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao } from "./helpers.js";

test.describe("Chat do Secretário (estilo opencode)", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
    await page.click('.nav-item[data-view="secretario"]');
    await page.waitForURL("**/#/secretario");
    await page.waitForTimeout(600);

    // inicia o fake opencode (com retry: corrida rara do start volta pro standby)
    for (let i = 0; i < 2; i++) {
      const standby = page.locator("#btn-iniciar-secretario");
      if (await standby.isVisible().catch(() => false)) {
        await standby.click();
      }
      try {
        await page.waitForSelector("#chat-input", { timeout: 20000 });
        return;
      } catch {
        if (i === 1) throw new Error("secretário não ficou pronto após 2 tentativas");
      }
    }
  });

  // O fake opencode persiste entre specs (mesmo processo). secretary.spec roda
  // depois e espera o card de STANDBY — paramos o secretário ao sair.
  test.afterAll(async ({ request }) => {
    await request.post("/secretario/stop", { headers: { authorization: "Bearer test-e2e" } }).catch(() => {});
  });

  test("empty state mostra 4 sugestões-chip clicáveis", async ({ page }) => {
    await page.click('button[title="Nova conversa"]');
    const chips = page.locator(".oc-vazio .chip");
    await expect(chips).toHaveCount(4);
    await expect(chips.first()).toContainText("O que aconteceu hoje?");
  });

  test("clicar sugestão envia → mensagens renderizam + follow-ups + copy", async ({ page }) => {
    await page.click('button[title="Nova conversa"]');
    await page.locator(".oc-vazio .chip:has-text('Como está o board?')").click();

    // mensagem do usuário aparece como card
    await expect(page.locator(".oc-user")).toContainText("Como está o board?", { timeout: 15000 });
    // resposta do fake aparece no feed
    await expect(page.locator(".oc-assistant").first()).toContainText("Resposta do assistant", { timeout: 15000 });
    // follow-ups depois da resposta
    await expect(page.locator(".oc-followups .chip").first()).toBeVisible();
    // botão copy por mensagem
    await expect(page.locator(".oc-msg .oc-copy").first()).toBeAttached();
  });

  test("histórico de sessões agrupa por Hoje e tem busca", async ({ page }) => {
    // cria uma conversa
    await page.fill("#chat-input", "histórico teste");
    await page.press("#chat-input", "Enter");
    await page.waitForTimeout(2000);

    await expect(page.locator(".sessao-grupo:has-text('Hoje')")).toBeVisible();
    await expect(page.locator(".sessao-item").first()).toContainText("histórico teste");

    // busca filtra
    await page.fill("#sessao-busca", "inexistente-xyz");
    await expect(page.locator(".sessao-item")).toHaveCount(0);
    await page.fill("#sessao-busca", "");
    await expect(page.locator(".sessao-item").first()).toBeVisible();
  });

  test("markdown rico: code fence tem botão copy", async ({ page }) => {
    // intercepta a resposta com markdown (exercita md.ts sem custo de LLM)
    // `**` no fim: o endpoint é /secretario/conversa/stream (Etapa 2) e um único
    // `*` não casa com `/` — o intercept nunca pegava a rota do stream.
    await page.route("**/secretario/conversa**", async (route) => {
      const req = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          resposta: "# Título\n\n- **negrito** e *itálico*\n\n```bash\necho oi\n```",
          sessao_id: req?.sessao_id ?? "ses_md",
        }),
      });
    });
    await page.click('button[title="Nova conversa"]');
    await page.fill("#chat-input", "mostra markdown");
    await page.press("#chat-input", "Enter");

    await expect(page.locator(".md-h1")).toContainText("Título", { timeout: 15000 });
    await expect(page.locator(".oc-assistant strong")).toContainText("negrito");
    await expect(page.locator(".md-code .md-copy")).toBeVisible();
  });
});
