import { test, expect } from "@playwright/test";

test.describe("E2E — Gestão de Múltiplas Contas por Motor e Limites de Execução", () => {
  const baseURL = "http://127.0.0.1:4100";

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("oc-token", "");
      window.localStorage.setItem("oc-ws", "test0");
    });
  });

  test("1. Deve gerenciar múltiplas contas para o mesmo motor (adicionar, alternar ativa, desconectar)", async ({ request }) => {
    // Limpa contas de teste anteriores do motor antigravity para idempotência
    const resPreLista = await request.get(`${baseURL}/api/motores/antigravity/contas`);
    if (resPreLista.ok()) {
      const preContas = (await resPreLista.json()).contas || [];
      for (const conta of preContas) {
        await request.delete(`${baseURL}/api/motores/antigravity/contas/${encodeURIComponent(conta.id)}`);
      }
    }

    // 1.1 Adiciona Conta 1 no Antigravity
    const resConta1 = await request.post(`${baseURL}/api/motores/antigravity/contas`, {
      data: {
        nome: "Antigravity Pessoal (Gemini AI Studio)",
        tokenOuChave: "gemini-test-pessoal-token-12345",
        authType: "token",
        limits: {
          daily_cost_usd: 15,
          rate_limit_rpm: 30,
        },
      },
    });
    expect(resConta1.status()).toBe(201);
    const body1 = await resConta1.json();
    expect(body1.conta).toBeDefined();
    expect(body1.conta.motorId).toBe("antigravity");
    expect(body1.conta.nome).toBe("Antigravity Pessoal (Gemini AI Studio)");
    expect(body1.conta.ativa).toBe(true); // primeira conta nasce ativa
    const contaId1 = body1.conta.id;

    // 1.2 Adiciona Conta 2 no mesmo motor Antigravity
    const resConta2 = await request.post(`${baseURL}/api/motores/antigravity/contas`, {
      data: {
        nome: "Antigravity Corporativo (Vertex AI)",
        tokenOuChave: "gemini-test-corp-token-67890",
        authType: "token",
        limits: {
          daily_cost_usd: 50,
          rate_limit_rpm: 60,
        },
      },
    });
    expect(resConta2.status()).toBe(201);
    const body2 = await resConta2.json();
    expect(body2.conta.ativa).toBe(false); // segunda conta nasce secundária
    const contaId2 = body2.conta.id;

    // 1.3 Lista contas do Antigravity
    const resLista = await request.get(`${baseURL}/api/motores/antigravity/contas`);
    expect(resLista.ok()).toBeTruthy();
    const listaAntigravity = await resLista.json();
    expect(listaAntigravity.contas.length).toBeGreaterThanOrEqual(2);

    // 1.4 Alterna conta ativa para a Conta 2
    const resAtivar = await request.post(`${baseURL}/api/motores/antigravity/contas/${encodeURIComponent(contaId2)}/ativar`);
    expect(resAtivar.ok()).toBeTruthy();

    const resListaPosAtivar = await request.get(`${baseURL}/api/motores/antigravity/contas`);
    const contasAtualizadas = (await resListaPosAtivar.json()).contas;
    const c1 = contasAtualizadas.find((c: any) => c.id === contaId1);
    const c2 = contasAtualizadas.find((c: any) => c.id === contaId2);
    expect(c1.ativa).toBe(false);
    expect(c2.ativa).toBe(true);

    // 1.5 Atualiza limites da Conta 2
    const resLimites = await request.put(`${baseURL}/api/motores/antigravity/contas/${encodeURIComponent(contaId2)}/limites`, {
      data: {
        daily_cost_usd: 80,
        rate_limit_rpm: 100,
        status_cota: "normal",
      },
    });
    expect(resLimites.ok()).toBeTruthy();
    const contaComLimites = await resLimites.json();
    expect(contaComLimites.conta.limits.daily_cost_usd).toBe(80);
    expect(contaComLimites.conta.limits.rate_limit_rpm).toBe(100);

    // 1.6 Desconecta a Conta 1
    const resDelete = await request.delete(`${baseURL}/api/motores/antigravity/contas/${encodeURIComponent(contaId1)}`);
    expect(resDelete.ok()).toBeTruthy();

    const resListaFinal = await request.get(`${baseURL}/api/motores/antigravity/contas`);
    const listaFinal = (await resListaFinal.json()).contas;
    expect(listaFinal.some((c: any) => c.id === contaId1)).toBe(false);
    expect(listaFinal.some((c: any) => c.id === contaId2)).toBe(true);
  });

  test("2. Deve salvar e obter limites consolidados de todos os motores", async ({ request }) => {
    const resLimites = await request.get(`${baseURL}/api/motores/limites`);
    expect(resLimites.ok()).toBeTruthy();
    const limitesIniciais = (await resLimites.json()).limites;
    expect(limitesIniciais.opencode).toBeDefined();
    expect(limitesIniciais.antigravity).toBeDefined();
    expect(limitesIniciais.copilot).toBeDefined();

    // Atualiza limites customizados para motores
    const resSalvar = await request.put(`${baseURL}/api/motores/limites`, {
      data: {
        antigravity: {
          timeout_min: 18,
          max_turns: 45,
          rate_limit_rpm: 50,
          daily_cost_usd: 25,
          status_cota: "normal",
        },
        copilot: {
          timeout_min: 22,
          max_turns: 35,
          rate_limit_rpm: 40,
          daily_cost_usd: 15,
          status_cota: "normal",
        },
      },
    });
    expect(resSalvar.ok()).toBeTruthy();
    const limitesSalvos = (await resSalvar.json()).limites;
    expect(limitesSalvos.antigravity.timeout_min).toBe(18);
    expect(limitesSalvos.antigravity.daily_cost_usd).toBe(25);
    expect(limitesSalvos.copilot.timeout_min).toBe(22);
  });

  test("3. Deve informar motores, contas e limites no endpoint /status do sistema", async ({ request }) => {
    const res = await request.get(`${baseURL}/status`);
    expect(res.ok()).toBeTruthy();
    const status = await res.json();

    expect(status.motores).toBeDefined();
    expect(status.motores.motor_ativo).toBeDefined();
    expect(Array.isArray(status.motores.harness_fallback)).toBeTruthy();
    expect(Array.isArray(status.motores.motores)).toBeTruthy();

    const agy = status.motores.motores.find((m: any) => m.id === "antigravity");
    expect(agy).toBeDefined();
    expect(agy.limits).toBeDefined();
    expect(agy.limits.timeout_min).toBeDefined();

    const cop = status.motores.motores.find((m: any) => m.id === "copilot");
    expect(cop).toBeDefined();
    expect(cop.limits).toBeDefined();
  });

  test("4. Deve navegar para a tab própria de limites no /config e renderizar limites de todos os motores", async ({ page }) => {
    await page.goto(`${baseURL}/config?tab=limites`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    // O container da tab de limites deve estar visível
    const tabLimites = page.locator("[data-testid='tab-limites-motores']");
    await expect(tabLimites).toBeVisible({ timeout: 15000 });

    // Título da aba e botões
    await expect(tabLimites.getByText("Limites de Operação, Taxas e Cotas por Motor")).toBeVisible();
    await expect(tabLimites.getByRole("button", { name: /Salvar Todos os Limites/i })).toBeVisible();

    // Deve listar os motores principais
    await expect(tabLimites.getByText("OpenCode Engine", { exact: true })).toBeVisible();
    await expect(tabLimites.getByText("Google Antigravity Engine (AGY)", { exact: true })).toBeVisible();
    await expect(tabLimites.getByText("GitHub Copilot CLI", { exact: true })).toBeVisible();
  });

  test("5. Deve consultar tokens e cotas reais via adaptadores dos motores sem cálculos cegos", async ({ request, page }) => {
    // 5.1 Validação do endpoint /api/motores/tokens
    const resTokens = await request.get(`${baseURL}/api/motores/tokens`);
    expect(resTokens.ok()).toBeTruthy();
    const dataTokens = await resTokens.json();
    expect(dataTokens.ok).toBe(true);
    expect(dataTokens.tokens).toBeDefined();

    // Copilot consulta real via GitHub API
    const copilotTokens = dataTokens.tokens.copilot;
    expect(copilotTokens).toBeDefined();
    expect(copilotTokens.source).toBe("api_live");
    expect(copilotTokens.provedor).toContain("GitHub");
    expect(copilotTokens.tokensDisponiveis).toBeGreaterThan(0);
    expect(copilotTokens.mensagem).toContain("requisições disponíveis");

    // OpenCode consulta real via OpenRouter / LLM
    const opencodeTokens = dataTokens.tokens.opencode;
    expect(opencodeTokens).toBeDefined();
    expect(opencodeTokens.source).toBe("api_live");
    expect(opencodeTokens.mensagem).toContain("OpenRouter");

    // 5.2 Validação na UI do frontend (/config?tab=limites)
    await page.goto(`${baseURL}/config?tab=limites`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    const tabLimites = page.locator("[data-testid='tab-limites-motores']");
    await expect(tabLimites).toBeVisible({ timeout: 15000 });

    // Botão de recarga ao vivo e badge de consulta real
    await expect(tabLimites.getByRole("button", { name: /Recarregar Quotas ao Vivo/i })).toBeVisible();
    await expect(tabLimites.getByText("CONSULTA REAL AO VIVO").first()).toBeVisible();

    // Clica em Recarregar Quotas ao Vivo e valida atualização
    await tabLimites.getByRole("button", { name: /Recarregar Quotas ao Vivo/i }).click();
    await page.waitForTimeout(1000);
    await expect(tabLimites.getByText("Quota Real & Tokens Disponíveis").first()).toBeVisible();
  });
});
