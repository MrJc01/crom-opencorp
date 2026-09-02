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

  test("empty state mostra 4 sugestões clicáveis (welcome estilo ChatGPT)", async ({ page }) => {
    await page.click('#secretario-chat button[title="Nova conversa"]');
    const cards = page.locator(".secgpt-welcome button.secgpt-card");
    await expect(cards).toHaveCount(4);
    await expect(cards.first()).toContainText("O que aconteceu hoje?");
  });

  test("clicar sugestão envia → mensagens renderizam + follow-ups + copy", async ({ page }) => {
    await page.click('#secretario-chat button[title="Nova conversa"]');
    await page.locator(".secgpt-welcome button.secgpt-card:has-text('Como está o board?')").click();

    // mensagem do usuário aparece como card
    await expect(page.locator(".oc-user")).toContainText("Como está o board?", { timeout: 15000 });
    // resposta do fake aparece no feed
    await expect(page.locator(".oc-assistant").first()).toContainText("Resposta do assistant", { timeout: 15000 });
    // follow-ups depois da resposta
    await expect(page.locator(".oc-followups .chip").first()).toBeVisible();
    // botão copy por mensagem
    await expect(page.locator(".oc-msg .oc-copy").first()).toBeAttached();
  });

  test("histórico de sessões agrupa por Hoje e tem busca (popup P-29)", async ({ page }) => {
    // cria uma conversa
    await page.fill("#chat-input", "histórico teste");
    await page.press("#chat-input", "Enter");
    await page.waitForTimeout(2000);

    // coluna lateral virou popup P-29
    await page.click("#btn-hist-header");
    const popup = page.locator(".hist-popup");
    await expect(popup.locator(".sessao-grupo:has-text('Hoje')")).toBeVisible();
    await expect(popup.locator(".sessao-item").first()).toContainText("histórico teste");

    // busca filtra
    await page.fill("#hist-busca", "inexistente-xyz");
    await expect(popup.locator(".sessao-item")).toHaveCount(0);
    await page.fill("#hist-busca", "");
    await expect(popup.locator(".sessao-item").first()).toBeVisible();
    await page.keyboard.press("Escape");
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
    await page.click('#secretario-chat button[title="Nova conversa"]');
    await page.fill("#chat-input", "mostra markdown");
    await page.press("#chat-input", "Enter");

    await expect(page.locator(".md-h1")).toContainText("Título", { timeout: 15000 });
    await expect(page.locator(".oc-assistant strong")).toContainText("negrito");
    await expect(page.locator(".md-code .md-copy")).toBeVisible();
  });

  test("(g) ações das tools aparecem ao vivo no feed (⚙ tool + resumo)", async ({ page }) => {
    await page.click('#secretario-chat button[title="Nova conversa"]');
    await page.fill("#chat-input", "crie uma task de teste");
    await page.press("#chat-input", "Enter");

    // bloco de ações renderizado com a tool e o resumo do input
    const acao = page.locator(".oc-acoes .oc-acao", { hasText: "opencorp_task_create" });
    await expect(acao).toBeVisible({ timeout: 15000 });
    await expect(acao).toHaveClass(/ok/); // status completed → ✓
    await expect(acao.locator(".oc-acao-resumo")).toContainText("Task criada pelo e2e");
    // texto da resposta após as ações
    await expect(page.locator(".oc-assistant").last()).toContainText("Task criada com ID", { timeout: 15000 });
  });

  test("(h) URL amigável: hash ganha ?sessao= e F5 restaura a conversa", async ({ page }) => {
    await page.click('#secretario-chat button[title="Nova conversa"]');
    await page.fill("#chat-input", "teste-url");
    await page.press("#chat-input", "Enter");
    await expect(page.locator(".oc-assistant").last()).toContainText("Resposta do assistant para: teste-url", { timeout: 15000 });

    // hash carrega a sessão (replaceState, sem re-render)
    await expect(page).toHaveURL(/#\/secretario\?sessao=ses_/);

    // F5 → mesma conversa restaurada (título no header + mensagens no feed)
    await page.reload();
    await page.waitForSelector("#chat-input", { timeout: 20000 });
    await expect(page).toHaveURL(/#\/secretario\?sessao=ses_/);
    await expect(page.locator(".oc-assistant").last()).toContainText("Resposta do assistant para: teste-url", { timeout: 15000 });
  });

  test("(i) F5 no meio da resposta: polling completa a resposta sem refresh manual", async ({ page }) => {
    const SESSAO = "ses_poll_e2e";
    let chamadasMensagens = 0;
    let liberarFim = false; // só vira true DEPOIS de termos visto o parcial — remove a corrida do assert

    // Lista de sessões interceptada: o restore pós-F5 só roda se o id da URL
    // existir em sessoesCache — garantimos a sessão "em andamento" na lista.
    await page.route((url) => url.pathname.endsWith("/secretario/sessoes"), (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: SESSAO, title: "Conversa polling e2e", updated: Date.now() }]),
      }));

    // Mensagens: restore e polls recebem assistant PARCIAL { concluida: false }
    // até liberarFim; a partir daí, texto completo { concluida: true }.
    await page.route((url) => url.pathname.endsWith(`/secretario/sessoes/${SESSAO}/mensagens`), async (route) => {
      chamadasMensagens++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { role: "user", content: "escreva um poema", concluida: true },
          {
            role: "assistant",
            content: liberarFim ? "Resposta completa: verso um.\nverso dois." : "Resposta parcial: verso um.",
            concluida: liberarFim,
          },
        ]),
      });
    });

    // F5 no meio da resposta: recarrega a página com a sessão na URL
    await page.goto(`/#/secretario?sessao=${SESSAO}`);
    await page.reload();
    await page.waitForSelector("#chat-input", { timeout: 20000 });

    // bolha restaurada com o texto parcial do snapshot…
    await expect(page.locator(".oc-assistant").last()).toContainText("Resposta parcial", { timeout: 15000 });
    // …agora o server "termina de gerar": o polling (2s) completa a bolha sozinho
    liberarFim = true;
    await expect(page.locator(".oc-assistant").last()).toContainText("Resposta completa", { timeout: 15000 });
    // completou via fetch das mensagens (restore + pelo menos 1 poll), sem refresh manual
    expect(chamadasMensagens).toBeGreaterThanOrEqual(2);
  });
});
