import { test, expect } from "@playwright/test";

test.describe("E2E Completo — Extração Real de Quotas e Tokens por Módulo Adaptador", () => {
  const baseURL = "http://127.0.0.1:4100";

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("oc-token", "");
      window.localStorage.setItem("oc-ws", "test0");
    });
  });

  test("1. Deve retornar quotas reais de todos os 8 motores via GET /api/motores/tokens", async ({ request }) => {
    const res = await request.get(`${baseURL}/api/motores/tokens`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.tokens).toBeDefined();

    const motoresEsperados = [
      "opencode",
      "crom-agente",
      "copilot",
      "antigravity",
      "claude-code",
      "cursor",
      "codex",
      "aider",
    ];

    for (const id of motoresEsperados) {
      const tok = body.tokens[id];
      expect(tok, `Motor ${id} deve estar presente na resposta`).toBeDefined();
      expect(tok.motorId).toBe(id);
      expect(typeof tok.mensagem).toBe("string");
      expect(tok.consultadoEm).toBeDefined();
      expect(["api_live", "cli_live", "oauth_session", "unconfigured", "error"]).toContain(tok.source);
    }
  });

  test("2. Deve consultar quotas ao vivo para motor individual (Copilot e OpenCode)", async ({ request }) => {
    // 2.1 Copilot CLI
    const resCop = await request.get(`${baseURL}/api/motores/copilot/tokens`);
    expect(resCop.ok()).toBeTruthy();
    const dataCop = await resCop.json();
    expect(dataCop.ok).toBe(true);
    expect(dataCop.tokens.motorId).toBe("copilot");
    expect(dataCop.tokens.source).toBe("api_live");
    expect(dataCop.tokens.provedor).toContain("GitHub");
    expect(dataCop.tokens.tokensDisponiveis).toBeGreaterThan(0);

    // 2.2 OpenCode
    const resOc = await request.get(`${baseURL}/api/motores/opencode/tokens`);
    expect(resOc.ok()).toBeTruthy();
    const dataOc = await resOc.json();
    expect(dataOc.ok).toBe(true);
    expect(dataOc.tokens.motorId).toBe("opencode");
    expect(dataOc.tokens.source).toBe("api_live");
  });

  test("3. Deve cadastrar conta e consultar tokens individuais da conta via adaptador", async ({ request }) => {
    // Cria conta temporária no motor antigravity
    const resAdd = await request.post(`${baseURL}/api/motores/antigravity/contas`, {
      data: {
        nome: "Conta Teste Live Quota",
        tokenOuChave: "dummy-key-for-test",
        authType: "token",
        limits: { daily_cost_usd: 20, rate_limit_rpm: 30 },
      },
    });
    expect(resAdd.status()).toBe(201);
    const conta = (await resAdd.json()).conta;

    // Consulta tokens específicos daquela conta
    const resTokConta = await request.get(`${baseURL}/api/motores/antigravity/contas/${encodeURIComponent(conta.id)}/tokens`);
    expect(resTokConta.ok()).toBeTruthy();
    const dataTokConta = await resTokConta.json();
    expect(dataTokConta.ok).toBe(true);
    expect(dataTokConta.motorId).toBe("antigravity");
    expect(dataTokConta.contaId).toBe(conta.id);
    expect(dataTokConta.tokens).toBeDefined();

    // Limpeza
    await request.delete(`${baseURL}/api/motores/antigravity/contas/${encodeURIComponent(conta.id)}`);
  });

  test("4. Deve validar layout e interação de tokens na aba /config?tab=limites", async ({ page }) => {
    await page.goto(`${baseURL}/config?tab=limites`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    const container = page.locator("[data-testid='tab-limites-motores']");
    await expect(container).toBeVisible({ timeout: 15000 });

    // Verifica badge 'CONSULTA REAL AO VIVO'
    const badges = container.getByText(/CONSULTA REAL AO VIVO/i);
    await expect(badges.first()).toBeVisible();

    // Botão de recarga de quotas
    const btnRecarregar = container.getByRole("button", { name: /Recarregar Quotas ao Vivo/i });
    await expect(btnRecarregar).toBeVisible();
    await btnRecarregar.click();
    await page.waitForTimeout(800);

    // Botão de salvar limites
    const btnSalvar = container.getByRole("button", { name: /Salvar Todos os Limites/i });
    await expect(btnSalvar).toBeVisible();
  });

  test("5. Deve validar layout na aba /config?tab=motores com detalhes do motor selecionado", async ({ page }) => {
    await page.goto(`${baseURL}/config?tab=motores`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    // Verifica seção de Quota Real & Tokens Disponíveis no detalhe do motor
    const secQuota = page.getByText("Quota Real & Tokens Disponíveis").first();
    await expect(secQuota).toBeVisible({ timeout: 15000 });

    // Verifica botão 'Consultar Adaptador'
    const btnConsultar = page.getByRole("button", { name: /Consultar Adaptador/i }).first();
    await expect(btnConsultar).toBeVisible();

    // Verifica seção de Contas Conectadas
    await expect(page.getByText(/Contas Conectadas/i).first()).toBeVisible();
  });
});
