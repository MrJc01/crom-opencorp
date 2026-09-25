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

  test("gatilho / abre popover de autocomplete e tecla Esc fecha", async ({ page }) => {
    await page.locator("#chat-input").focus();
    await page.keyboard.type("/");
    await expect(page.locator("[data-autocomplete-popover]")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("/status").first()).toBeVisible();
    await expect(page.getByText("/doctor").first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("[data-autocomplete-popover]")).not.toBeVisible();
  });

  test("gatilho @ abre menções e cria pílula de destinatário", async ({ page }) => {
    await page.locator('button[title="Mencionar agente, arquivo ou task (@)"]').click();
    await expect(page.locator("[data-autocomplete-popover]")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("@agente:secretario-exec").first()).toBeVisible();

    await page.getByText("@agente:secretario-exec").first().click();
    await expect(page.getByText("para @secretario-exec")).toBeVisible();

    // Botão de remover destinatário limpa a pílula
    await page.locator('button[title="Remover destinatário (voltar ao Secretário padrão)"]').click();
    await expect(page.getByText("para @secretario-exec")).not.toBeVisible();
  });

  test("gatilho ! executa comando no terminal e formata em bloco monospace", async ({ page }) => {
    await page.locator("#chat-input").fill("!status");
    await page.click("#btn-enviar");

    await expect(page.locator(".oc-user").last()).toContainText("!status", { timeout: 10000 });
    await expect(page.locator(".oc-assistant").last()).toContainText("$ !status", { timeout: 15000 });
  });

  test("toolbar do composer exibe apenas atalhos limpos sem dropdown manual de modelo", async ({ page }) => {
    await expect(page.locator("[data-model-dropdown]")).not.toBeVisible();
    await expect(page.getByTitle("Comandos rápidos (/)")).toBeVisible();
    await expect(page.getByTitle("Mencionar agente, arquivo ou task (@)")).toBeVisible();
    await expect(page.getByTitle("Execução shell direta (!)")).toBeVisible();
  });

  test("resposta com opções numeradas renderiza botões HITL e clique despacha mensagem", async ({ page }) => {
    await page.route("**/secretario/conversa/stream*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: "event: delta\ndata: {\"delta\":\"Análise finalizada.\\n1. Executar testes de integração\\n2. Fazer commit das alterações\"}\n\nevent: fim\ndata: {}\n\n",
      });
    });

    await page.locator("#chat-input").fill("como proceder?");
    await page.click("#btn-enviar");

    await expect(page.locator(".chat-opcao-btn").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".chat-opcao-btn")).toHaveCount(2);

    // Clicar na opção 1 despacha automaticamente como turno do usuário
    await page.locator(".chat-opcao-btn").first().click();
    await expect(page.locator(".oc-user").last()).toContainText("Executar testes de integração", { timeout: 10000 });
  });

  test("resposta com git status renderiza card interativo de arquivos", async ({ page }) => {
    await page.route("**/secretario/conversa/stream*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: "event: delta\ndata: {\"delta\":\"Status atual do repositório:\\nM src/index.ts\\n?? docs/teste.md\"}\n\nevent: fim\ndata: {}\n\n",
      });
    });

    await page.locator("#chat-input").fill("/git status");
    await page.click("#btn-enviar");

    await expect(page.getByText("Git Status").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("src/index.ts").first()).toBeVisible();
    await expect(page.getByText("docs/teste.md").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Descartar" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Abrir" }).first()).toBeVisible();
  });

  test("bloco de raciocínio CoT expande e recolhe suavemente", async ({ page }) => {
    await page.route("**/secretario/conversa/stream*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: "event: delta\ndata: {\"delta\":\"<think>Analisando arquitetura e dependências...</think>Aqui está a resposta.\"}\n\nevent: fim\ndata: {}\n\n",
      });
    });

    await page.locator("#chat-input").fill("analise o projeto");
    await page.click("#btn-enviar");

    await expect(page.getByText("Processo de Raciocínio").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Inspecionar").first()).toBeVisible();

    // Clica para expandir
    await page.getByText("Processo de Raciocínio").first().click();
    await expect(page.getByText("Ocultar").first()).toBeVisible();
    await expect(page.getByText("Analisando arquitetura e dependências...").first()).toBeVisible();

    // Clica para recolher
    await page.getByText("Processo de Raciocínio").first().click();
    await expect(page.getByText("Inspecionar").first()).toBeVisible();
  });
});
