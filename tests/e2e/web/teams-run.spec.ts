import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarElementoTexto } from "../helpers.js";

test.describe("Teams / Grupos de Agentes - Run E2E", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
  });

  test("POST /teams/:id/run - pipeline com sessões isoladas por integrante", async ({ page }) => {
    const HDR = { authorization: "Bearer test-e2e", "content-type": "application/json" };

    // Cria team pipeline com 2 agentes usando agentes existentes
    const teamSpec = {
      id: "e2e-pipe-run",
      titulo: "Pipe Run E2E",
      padrao: "pipeline",
      passos: [
        { agente: "executor-padrao", ordem: "OK" },
        { agente: "analista-qualidade", ordem: "OK" },
      ],
      criado_em: new Date().toISOString(),
    };
    await api(page).post("/teams", {
      headers: HDR,
      data: teamSpec,
    });

    // Executa team com sessao_por_integrante=true (default)
    const resp = await api(page).post("/teams/e2e-pipe-run/run", {
      headers: HDR,
      data: { entrada: "OK" },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.resumos).toBeDefined();
    expect(body.total).toBe(2);
    expect(body.resumos.length).toBe(2);
    // Cada integrante deve ter sessao isolada
    const idsSessoes = body.resumos.map((r: any) => r.sessao);
    const unicos = new Set(idsSessoes);
    expect(unicos.size).toBe(2);
    // Cada um deve ter agente e resumo
    for (const r of body.resumos) {
      expect(r.agente).toBeDefined();
      expect(r.resumo).toBeDefined();
      expect(r.ok).toBe(true);
    }
  });

  test("POST /teams/:id/run - fanout com sessões isoladas por integrante", async ({ page }) => {
    const HDR = { authorization: "Bearer test-e2e", "content-type": "application/json" };

    // Cria team fanout com 3 paralelos usando agentes existentes
    const teamSpec = {
      id: "e2e-fanout-run",
      titulo: "Fanout Run E2E",
      padrao: "fanout",
      paralelos: [
        { agente: "executor-padrao", ordem: "2+2" },
        { agente: "analista-qualidade", ordem: "3+3" },
        { agente: "pautador-youtube", ordem: "4+4" },
      ],
      criado_em: new Date().toISOString(),
    };
    await api(page).post("/teams", {
      headers: HDR,
      data: teamSpec,
    });

    // Executa team
    const resp = await api(page).post("/teams/e2e-fanout-run/run", {
      headers: HDR,
      data: { entrada: "calc" },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.total).toBe(3);
    expect(body.resumos.length).toBe(3);
    // Cada integrante tem sessao isolada
    const idsSessoes = body.resumos.map((r: any) => r.sessao);
    const unicos = new Set(idsSessoes);
    expect(unicos.size).toBe(3);
  });

  test("POST /teams/:id/run - review com sessões isoladas", async ({ page }) => {
    const HDR = { authorization: "Bearer test-e2e", "content-type": "application/json" };

    // Cria team review usando agentes existentes
    const teamSpec = {
      id: "e2e-review-run",
      titulo: "Review Run E2E",
      padrao: "review",
      executor: { agente: "executor-padrao", ordem: "Execute" },
      revisor: { agente: "analista-qualidade", ordem: "APROVADO" },
      turnos: 1,
      criado_em: new Date().toISOString(),
    };
    await api(page).post("/teams", {
      headers: HDR,
      data: teamSpec,
    });

    // Executa team
    const resp = await api(page).post("/teams/e2e-review-run/run", {
      headers: HDR,
      data: { entrada: "teste" },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.total).toBe(2); // executor + revisor
    expect(body.resumos.length).toBe(2);
    // Cada integrante tem sessao isolada
    const idsSessoes = body.resumos.map((r: any) => r.sessao);
    const unicos = new Set(idsSessoes);
    expect(unicos.size).toBe(2);
  });

  test("POST /teams/:id/run - debate com sessões isoladas", async ({ page }) => {
    const HDR = { authorization: "Bearer test-e2e", "content-type": "application/json" };

    // Cria team debate usando agentes existentes
    const teamSpec = {
      id: "e2e-debate-run",
      titulo: "Debate Run E2E",
      padrao: "debate",
      proponentes: [
        { agente: "executor-padrao", ordem: "A" },
        { agente: "analista-qualidade", ordem: "B" },
      ],
      moderador: { agente: "pautador-youtube", ordem: "Escolha" },
      criado_em: new Date().toISOString(),
    };
    await api(page).post("/teams", {
      headers: HDR,
      data: teamSpec,
    });

    // Executa team
    const resp = await api(page).post("/teams/e2e-debate-run/run", {
      headers: HDR,
      data: { entrada: "escolha" },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.total).toBe(3); // 2 proponentes + 1 moderador
    expect(body.resumos.length).toBe(3);
    // Cada integrante tem sessao isolada
    const idsSessoes = body.resumos.map((r: any) => r.sessao);
    const unicos = new Set(idsSessoes);
    expect(unicos.size).toBe(3);
  });

  test("POST /teams/:id/run - sessao_por_integrante=false usa orchestrador legacy", async ({ page }) => {
    const HDR = { authorization: "Bearer test-e2e", "content-type": "application/json" };

    // Cria team pipeline
    const teamSpec = {
      id: "e2e-legacy-run",
      titulo: "Legacy Run E2E",
      padrao: "pipeline",
      passos: [
        { agente: "executor-padrao", ordem: "ok" },
      ],
      criado_em: new Date().toISOString(),
    };
    await api(page).post("/teams", {
      headers: HDR,
      data: teamSpec,
    });

    // Executa team com sessao_por_integrante=false
    const resp = await api(page).post("/teams/e2e-legacy-run/run", {
      headers: HDR,
      data: { entrada: "ok", sessao_por_integrante: false },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    // Deve retornar resultado do orchestrador legacy (task_id, passos, status_final)
    expect(body.task_id).toBeDefined();
    expect(body.padrao).toBe("pipeline");
    expect(body.status_final).toBeDefined();
  });
});