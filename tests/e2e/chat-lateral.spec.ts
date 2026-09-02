import { test, expect, type Page } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao } from "./helpers.js";

/** Inicia o fake opencode com retry (mesma corrida rara do chat.spec).
 *  Espera resolver o estado da view (standby OU chat pronto) antes de agir:
 *  isVisible() imediato perde a corrida do render async ("Carregando status…")
 *  e queimava 20s de waitForSelector até estourar o timeout do teste. */
async function iniciarSecretario(page: Page): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const estado = await page
      .waitForSelector("#btn-iniciar-secretario, #chat-input", { timeout: 25000 })
      .catch(() => null);
    if (estado && (await estado.evaluate((el) => el.id)) === "btn-iniciar-secretario") {
      await estado.click();
      await page.waitForSelector("#chat-input", { timeout: 20000 });
    }
    if (await page.locator("#chat-input").isVisible().catch(() => false)) return;
  }
  throw new Error("secretário não ficou pronto após 2 tentativas");
}

test.describe("Chat lateral do Secretário (PLANO-PAINEL-V2 Etapa 1)", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
  });

  // O fake opencode persiste entre specs — paramos ao sair (secretário.spec
  // espera standby e roda depois deste arquivo).
  test.afterAll(async ({ request }) => {
    await request.post("/secretario/stop", { headers: { authorization: "Bearer test-e2e" } }).catch(() => {});
  });

  test("FAB abre o drawer; rascunho sobrevive à navegação e sincroniza com a página; persiste no reload", async ({ page }) => {
    await page.goto("/");
    await esperarNavegacao(page, "home");
    await expect(page.locator("#fab-chat")).toBeVisible();

    await page.click("#fab-chat");
    await expect(page.locator("#chat-drawer")).toHaveClass(/open/);

    // o drawer renderiza via import() dinâmico — espera os handlers globais do
    // composer existirem antes de digitar (automação é mais rápida que humanos;
    // sem isso o oninput do fill dispara antes de __composerInput e o rascunho
    // não é salvo — fonte única fica vazia e a sincronização falha mais adiante)
    await page.waitForFunction(() => typeof (window as unknown as Record<string, unknown>).__composerInput === "function");

    // digita no lateral → rascunho salvo (fonte única)
    await page.fill("#lat-input", "ideia para depois");

    // navega para outra view SEM fechar o drawer: sobrevive + texto preservado
    await page.evaluate(() => { window.location.hash = "#/tasks"; });
    await expect(page.locator("#chat-drawer")).toHaveClass(/open/);
    await expect(page.locator("#lat-input")).toHaveValue("ideia para depois");

    // fecha (overlay bloqueia a página atrás — padrão drawer) e inicia o Secretário
    await page.keyboard.press("Escape");
    await expect(page.locator("#chat-drawer")).not.toHaveClass(/open/);

    await page.evaluate(() => { window.location.hash = "#/secretario"; });
    await iniciarSecretario(page);

    // a página mostra o MESMO rascunho digitado no lateral (sincronização)
    await expect(page.locator("#chat-input")).toHaveValue("ideia para depois", { timeout: 10000 });

    // reload → rascunho persiste (localStorage)
    await page.reload();
    await page.waitForSelector("#chat-input", { timeout: 25000 });
    await expect(page.locator("#chat-input")).toHaveValue("ideia para depois", { timeout: 10000 });

    // reabrindo o lateral, as duas superfícies estão em sincronia
    await page.evaluate(() => { window.location.hash = "#/tasks"; });
    await page.click("#fab-chat");
    await expect(page.locator("#lat-input")).toHaveValue("ideia para depois", { timeout: 10000 });
  });

  test("enviar pelo lateral responde no feed lateral e alimenta a mesma conversa da página", async ({ page }) => {
    await page.goto("/#/secretario");
    await page.waitForURL("**/#/secretario");
    await iniciarSecretario(page);
    await page.click('#secretario-chat button[title="Nova conversa"]');

    // botão no Secretário (1.3) abre o drawer
    await page.click("#btn-chat-lateral");
    await expect(page.locator("#chat-drawer")).toHaveClass(/open/);

    await page.fill("#lat-input", "olá do lateral");
    await page.press("#lat-input", "Enter");

    // resposta do fake aparece no feed LATERAL
    await expect(page.locator("#lat-feed .oc-user")).toContainText("olá do lateral", { timeout: 15000 });
    await expect(page.locator("#lat-feed .oc-assistant").first()).toContainText("Resposta do assistant", { timeout: 15000 });

    // input limpo (rascunho zerado ao enviar)
    await expect(page.locator("#lat-input")).toHaveValue("");

    // MESMA conversa visível na página (estado compartilhado)
    await expect(page.locator("#oc-feed .oc-user")).toContainText("olá do lateral");
    await expect(page.locator("#oc-feed .oc-assistant").first()).toContainText("Resposta do assistant", { timeout: 15000 });
  });

  test("mobile: FAB abre o chat em tela cheia e Escape fecha", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await esperarNavegacao(page, "home");
    await page.click("#fab-chat");
    await expect(page.locator("#chat-drawer")).toHaveClass(/open/);
    const box = await page.locator("#chat-drawer").boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(390);
    await page.keyboard.press("Escape");
    await expect(page.locator("#chat-drawer")).not.toHaveClass(/open/);
  });

  test("FAB fica escondido na própria página do Secretário (redundante lá)", async ({ page }) => {
    await page.goto("/");
    await esperarNavegacao(page, "home");
    await expect(page.locator("#fab-chat")).toBeVisible();
    await page.evaluate(() => { window.location.hash = "#/secretario"; });
    await page.waitForURL("**/#/secretario");
    await page.waitForTimeout(400);
    await expect(page.locator("#fab-chat")).toBeHidden();
  });
});
