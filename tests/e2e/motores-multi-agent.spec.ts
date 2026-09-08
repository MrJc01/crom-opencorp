import { test, expect } from "@playwright/test";

test.describe("E2E — Abas de Agentes, Motor Padrão e Provedores Contextuais", () => {
  const baseURL = "http://127.0.0.1:4100";

  test.beforeEach(async ({ page }) => {
    // Configura localStorage para inicializar no OpenCorp
    await page.addInitScript(() => {
      window.localStorage.setItem("oc-token", "");
      window.localStorage.setItem("oc-ws", "");
    });
  });

  test("deve exibir as abas de todos os 8 motores de agentes autônomos", async ({ page }) => {
    await page.goto(`${baseURL}/config?tab=motores`);
    await page.waitForTimeout(1500);

    // Verifica presença das abas dos 8 motores
    await expect(page.locator("button[data-engine-id='opencode']")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("button[data-engine-id='crom-agente']")).toBeVisible();
    await expect(page.locator("button[data-engine-id='claude-code']")).toBeVisible();
    await expect(page.locator("button[data-engine-id='antigravity']")).toBeVisible();
    await expect(page.locator("button[data-engine-id='cursor']")).toBeVisible();
    await expect(page.locator("button[data-engine-id='copilot']")).toBeVisible();
    await expect(page.locator("button[data-engine-id='codex']")).toBeVisible();
    await expect(page.locator("button[data-engine-id='aider']")).toBeVisible();
  });

  test("deve abrir o modal de autenticação ao vivo a partir da aba do agente selecionado", async ({ page }) => {
    await page.goto(`${baseURL}/config?tab=motores`);
    await page.waitForTimeout(1000);

    // Seleciona a aba do Claude Code
    const tabClaude = page.locator("button[data-engine-id='claude-code']");
    await expect(tabClaude).toBeVisible({ timeout: 10000 });
    await tabClaude.click();
    await page.waitForTimeout(500);

    const btnAuthClaude = page.getByRole("button", { name: /Autenticar \/ Chave/i });
    await expect(btnAuthClaude).toBeVisible();
    await btnAuthClaude.click();

    // Modal deve abrir com título e comando claude login
    await expect(page.getByText("Autenticação do Claude Code (Anthropic)")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("$ claude login")).toBeVisible();
    await expect(page.getByText("ANTHROPIC_API_KEY", { exact: true })).toBeVisible();

    // Fecha o modal pelo botão Fechar
    await page.getByRole("button", { name: "Fechar" }).click();
    await page.waitForTimeout(500);

    // Seleciona a aba do Cursor Agent
    const tabCursor = page.locator("button[data-engine-id='cursor']");
    await tabCursor.click();
    await page.waitForTimeout(500);

    const btnAuthCursor = page.getByRole("button", { name: /Autenticar \/ Chave/i });
    await expect(btnAuthCursor).toBeVisible();
    await btnAuthCursor.click();

    // Modal deve abrir com título e comando agent login
    await expect(page.getByText("Autenticação do Cursor Agent CLI")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("$ agent login")).toBeVisible();
    await expect(page.getByText("CURSOR_API_KEY", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Fechar" }).click();
  });

  test("deve listar os provedores contextuais conforme o agente selecionado", async ({ page }) => {
    await page.goto(`${baseURL}/config?tab=motores`);
    await page.waitForTimeout(1000);

    // Na aba Claude Code: deve listar apenas provedores do Claude
    await page.locator("button[data-engine-id='claude-code']").click();
    await page.waitForTimeout(500);
    await expect(page.getByText("Conta Claude Pro / Team (OAuth CLI)")).toBeVisible();
    await expect(page.getByText("Anthropic API Key (Pay-as-you-go)")).toBeVisible();

    // Na aba GitHub Copilot: deve listar métodos do Copilot
    await page.locator("button[data-engine-id='copilot']").click();
    await page.waitForTimeout(500);
    await expect(page.getByText("GitHub Copilot Device Code (CLI Auth)")).toBeVisible();
    await expect(page.getByText("GitHub CLI Token (gh auth token)")).toBeVisible();

    // Na aba OpenCode: deve listar os provedores universais
    await page.locator("button[data-engine-id='opencode']").click();
    await page.waitForTimeout(500);
    await expect(page.getByText("OpenRouter (Universal & BYOK)")).toBeVisible();
    await expect(page.getByText("Google AI Studio Direto")).toBeVisible();
  });

  test("deve permitir definir o motor padrão com um clique e reverter com facilidade", async ({ page }) => {
    await page.goto(`${baseURL}/config?tab=motores`);
    await page.waitForTimeout(1000);

    // Seleciona a aba do Crom-Agente
    const tabCrom = page.locator("button[data-engine-id='crom-agente']");
    await expect(tabCrom).toBeVisible({ timeout: 10000 });
    await tabCrom.click();
    await page.waitForTimeout(500);

    // Se já estiver como padrão (de execuções anteriores), reverte primeiro para opencode
    const btnReverterInicial = page.getByRole("button", { name: /Reverter para OpenCode/i });
    if (await btnReverterInicial.isVisible()) {
      await btnReverterInicial.click();
      await expect(page.getByRole("button", { name: /Definir como Motor Padrão/i })).toBeVisible({ timeout: 8000 });
      await page.waitForTimeout(1000);
    }

    // Agora clica no botão proeminente "Definir como Motor Padrão"
    const btnDefinirPadrao = page.getByRole("button", { name: /Definir como Motor Padrão/i });
    await expect(btnDefinirPadrao).toBeVisible({ timeout: 10000 });
    await btnDefinirPadrao.click();

    // Após conectar, deve exibir badge Motor Padrão Ativo do Sistema e botão Reverter
    await expect(page.getByText("Motor Padrão Ativo do Sistema")).toBeVisible({ timeout: 15000 });
    const btnReverter = page.getByRole("button", { name: /Reverter para OpenCode/i });
    await expect(btnReverter).toBeVisible({ timeout: 10000 });

    // Clica em Reverter para restaurar o OpenCode como padrão
    await btnReverter.click();
    await expect(page.getByRole("button", { name: /Definir como Motor Padrão/i })).toBeVisible({ timeout: 15000 });
  });

  test("deve executar diagnóstico em tempo real ao clicar em Testar", async ({ page }) => {
    await page.goto(`${baseURL}/config?tab=motores`);
    await page.waitForTimeout(1000);

    // Seleciona a aba do OpenCode Engine
    await page.locator("button[data-engine-id='opencode']").click();
    await page.waitForTimeout(500);

    const btnTestar = page.getByRole("button", { name: "Testar" }).first();
    await expect(btnTestar).toBeVisible();
    await btnTestar.click();

    // Verifica que o status contém OK e versão
    await expect(page.getByText(/OK — Versão/i)).toBeVisible({ timeout: 8000 });
  });

  test("deve alternar entre abas de configuração sem erros", async ({ page }) => {
    await page.goto(`${baseURL}/config?tab=motores`);
    await page.waitForTimeout(1000);

    // Navega para Chaves de API
    await page.getByRole("button", { name: /Chaves de API/i }).click();
    await expect(page.getByText("Gerenciamento Seguro de Chaves de API")).toBeVisible({ timeout: 5000 });

    // Navega para Modelos
    await page.getByRole("button", { name: /Modelos/i }).click();
    await expect(page.getByText("Modelo Padrão e Rotação Automática")).toBeVisible({ timeout: 5000 });

    // Navega de volta para Motores
    await page.getByRole("button", { name: /Motores & Provedores/i }).click();
    await expect(page.getByText("Motores & Agentes Autônomos")).toBeVisible({ timeout: 5000 });
  });
});
