import { test, expect } from "@playwright/test";

test.describe("E2E — Orquestração Multi-Motor: AGY, Copilot e OpenCode", () => {
  const baseURL = "http://127.0.0.1:4100";

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("oc-token", "");
      window.localStorage.setItem("oc-ws", "test0");
    });
  });

  test("1. Deve listar agentes especializados com motores padrão e rotação de modelos", async ({ request }) => {
    const res = await request.get(`${baseURL}/agents`);
    expect(res.ok()).toBeTruthy();
    const agentes = await res.json();

    const agAgy = agentes.find((a: any) => a.id === "agente-agy");
    expect(agAgy).toBeDefined();
    expect(agAgy.harness).toBe("antigravity");
    expect(Array.isArray(agAgy.rotation)).toBeTruthy();
    expect(agAgy.rotation.length).toBeGreaterThan(0);

    const agCopilot = agentes.find((a: any) => a.id === "agente-copilot");
    expect(agCopilot).toBeDefined();
    expect(agCopilot.harness).toBe("copilot");
    expect(Array.isArray(agCopilot.rotation)).toBeTruthy();

    const agOpencode = agentes.find((a: any) => a.id === "agente-opencode");
    expect(agOpencode).toBeDefined();
    expect(agOpencode.harness).toBe("opencode");
    expect(Array.isArray(agOpencode.rotation)).toBeTruthy();
  });

  test("2. Deve executar tarefas com motores diferentes no mesmo agente (override de engine)", async ({ request }) => {
    // Dispara tarefa no mesmo agente 'secretario-exec' com motor Antigravity
    const resAgy = await request.post(`${baseURL}/agents/secretario-exec/run`, {
      data: {
        ordem: "verificar status via agy",
        engine: "antigravity",
      },
    });
    expect(resAgy.status()).toBe(202);
    const bodyAgy = await resAgy.json();
    expect(bodyAgy.exec_id).toBeDefined();

    // Dispara tarefa no mesmo agente 'secretario-exec' com motor Copilot
    const resCopilot = await request.post(`${baseURL}/agents/secretario-exec/run`, {
      data: {
        ordem: "verificar status via copilot",
        engine: "copilot",
      },
    });
    expect(resCopilot.status()).toBe(202);
    const bodyCopilot = await resCopilot.json();
    expect(bodyCopilot.exec_id).toBeDefined();

    // Dispara tarefa no mesmo agente com motor OpenCode
    const resOpencode = await request.post(`${baseURL}/agents/secretario-exec/run`, {
      data: {
        ordem: "verificar status via opencode",
        engine: "opencode",
      },
    });
    expect(resOpencode.status()).toBe(202);
    const bodyOpencode = await resOpencode.json();
    expect(bodyOpencode.exec_id).toBeDefined();
  });

  test("3. Deve criar e executar reunião com agentes de motores diferentes conversando sequencialmente e paralelamente", async ({ request }) => {
    test.setTimeout(240_000);

    // Cria reunião com os 3 agentes de motores diferentes
    const resSala = await request.post(`${baseURL}/meetings/chat`, {
      data: {
        pauta: "Alinhamento Estratégico Multi-Motor",
        agentes: "agente-agy,agente-copilot,agente-opencode",
      },
    });
    expect(resSala.status()).toBe(201);
    const sala = await resSala.json();
    expect(sala.id).toBeDefined();
    expect(sala.participantes).toContain("agente-agy");
    expect(sala.participantes).toContain("agente-copilot");
    expect(sala.participantes).toContain("agente-opencode");

    // 3.1 Mensagem do usuário com respostas sequenciais
    const resMsgSeq = await request.post(`${baseURL}/meetings/${encodeURIComponent(sala.id)}/mensagem`, {
      data: {
        mensagem: "Olá time multi-motor! Como cada um pode contribuir?",
        modo: "sequencial",
      },
    });
    expect(resMsgSeq.ok()).toBeTruthy();
    const dadosSeq = await resMsgSeq.json();
    expect(dadosSeq.mensagemUsuario).toBeDefined();
    expect(Array.isArray(dadosSeq.respostas)).toBeTruthy();

    // 3.2 Mensagem do usuário com respostas em modo paralelo
    const resMsgParalelo = await request.post(`${baseURL}/meetings/${encodeURIComponent(sala.id)}/mensagem`, {
      data: {
        mensagem: "Confirmem prontidão simultaneamente para a próxima sprint.",
        modo: "paralelo",
      },
    });
    expect(resMsgParalelo.ok()).toBeTruthy();
    const dadosParalelo = await resMsgParalelo.json();
    expect(dadosParalelo.mensagemUsuario).toBeDefined();
    expect(Array.isArray(dadosParalelo.respostas)).toBeTruthy();

    // Verifica estado final da sala
    const resEstado = await request.get(`${baseURL}/meetings/${encodeURIComponent(sala.id)}`);
    expect(resEstado.ok()).toBeTruthy();
    const estado = await resEstado.json();
    expect(estado.mensagens.length).toBeGreaterThan(0);
  });

  test("4. Deve abrir o drawer lateral de configuração no Secretário e permitir alternar agente/motor/modelo", async ({ page }) => {
    await page.goto(`${baseURL}/secretario`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    // Botão de Motor & Modelo deve estar visível no subheader
    const btnMotorModelo = page.locator("[data-testid='btn-motor-modelo']");
    await expect(btnMotorModelo).toBeVisible({ timeout: 15000 });
    await btnMotorModelo.click();

    // Drawer lateral deve abrir com título
    const drawer = page.locator("[data-testid='drawer-lateral-config']");
    await expect(drawer).toBeVisible({ timeout: 10000 });
    await expect(drawer.getByText("Configurar Motor & Modelo")).toBeVisible();
    await expect(drawer.getByText("Agente do Workspace")).toBeVisible();
    await expect(drawer.getByText("Motor de Execução (Harness)")).toBeVisible();
    await expect(drawer.getByText("Google Antigravity (AGY)")).toBeVisible();
    await expect(drawer.getByText("GitHub Copilot CLI")).toBeVisible();
    await expect(drawer.getByText("OpenCode Engine")).toBeVisible();

    // Clica no card do Google Antigravity
    await drawer.getByText("Google Antigravity (AGY)").click();
    await page.waitForTimeout(300);

    // O campo de modelo deve ter sugestões rápidas
    await expect(drawer.getByText("gemini-3.8-flash-high")).toBeVisible();
    await drawer.getByText("gemini-3.8-flash-high").click();

    // Dispara teste de conexão
    const btnTestar = drawer.getByRole("button", { name: /Testar Conexão/i });
    await expect(btnTestar).toBeVisible();
    await btnTestar.click();

    // Aguarda o resultado do teste aparecer (badge com status)
    await expect(drawer.locator("div:has-text('ativo e respondendo'), div:has-text('conectado e operacional')").first()).toBeVisible({ timeout: 20000 });

    // Aplica no chat
    const btnAplicar = drawer.getByRole("button", { name: /Aplicar ao Chat/i });
    await expect(btnAplicar).toBeVisible();
    await btnAplicar.click();

    // O drawer deve fechar
    await expect(drawer).not.toBeVisible();
  });

  test("5. Deve executar fluxo paralelo (fanout) com agentes de diferentes motores trabalhando simultaneamente", async ({ request }) => {
    test.setTimeout(90_000);
    const flowId = `flow-multi-engine-${Date.now()}`;
    const resCriar = await request.post(`${baseURL}/flows`, {
      data: {
        id: flowId,
        nome: "Auditoria Paralela Multi-Motor",
        descricao: "Fluxo paralelo combinando Antigravity, Copilot e OpenCode",
        nos: [
          {
            id: "inicio",
            tipo: "manual",
          },
          {
            id: "n1",
            tipo: "fanout",
            config: {
              paralelos: [
                { agente: "agente-agy", ordem: "resuma diretrizes de arquitetura em 1 frase: {{entrada}}" },
                { agente: "agente-copilot", ordem: "resuma diretrizes de código em 1 frase: {{entrada}}" },
                { agente: "agente-opencode", ordem: "resuma diretrizes de scripts em 1 frase: {{entrada}}" },
              ],
              sintese: {
                agente: "agente-opencode",
                ordem: "consolide os pareceres acima em uma síntese: {{entrada}}",
              },
            },
          },
        ],
        arestas: [
          { de: "inicio", para: "n1" },
        ],
      },
    });
    expect(resCriar.status()).toBe(201);

    const resRun = await request.post(`${baseURL}/flows/${encodeURIComponent(flowId)}/run`, {
      data: { entrada: "Projeto OpenCorp Multi-Engine v0.7.0" },
    });
    expect(resRun.ok()).toBeTruthy();
    const resultado = await resRun.json();
    expect(resultado.status).toBe("iniciado");
    expect(resultado.flow).toBe(flowId);
  });

  test("6. Deve verificar rotabilidade de harness e modelos configurados por agente e padrão", async ({ request }) => {
    const res = await request.get(`${baseURL}/agents`);
    expect(res.ok()).toBeTruthy();
    const agentes = await res.json();

    const agAgy = agentes.find((a: any) => a.id === "agente-agy");
    expect(agAgy.harness).toBe("antigravity");
    expect(agAgy.harness_fallback).toEqual(["copilot", "opencode"]);
    expect(agAgy.rotation).toContain("google/gemini-3.7-flash-high");

    const agCopilot = agentes.find((a: any) => a.id === "agente-copilot");
    expect(agCopilot.harness).toBe("copilot");
    expect(agCopilot.harness_fallback).toEqual(["antigravity", "opencode"]);
    expect(agCopilot.rotation).toContain("github/claude-3.5-sonnet");

    const agOpencode = agentes.find((a: any) => a.id === "agente-opencode");
    expect(agOpencode.harness).toBe("opencode");
    expect(agOpencode.harness_fallback).toEqual(["antigravity", "copilot"]);
    expect(agOpencode.rotation).toContain("opencode/nemotron-3.5-lightning-free");
  });
});
