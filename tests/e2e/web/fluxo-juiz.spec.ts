import { test, expect } from "@playwright/test";
import { logado, api } from "../helpers.js";

// F2-T01 — Juiz do loop (sem-melhora/condicao regex) + fim do "skip silencioso".
// Roda contra o servidor de teste do playwright (:4399), nunca produção :4100.
// Os flows usam apenas nós "manual"/"script"/"loop" (sem agente/LLM), então a
// execução é determinística e não depende de driver instalado.

const TOKEN = "test-e2e";
const WS = "e2e-flux-juiz";
const HDR = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

function noManual(id: string) {
  return { id, tipo: "manual", config: {} };
}

function noScript(id: string, comando: string, extra: Record<string, unknown> = {}) {
  return { id, tipo: "script", config: { comando, ...extra } };
}

function noLoop(id: string, config: Record<string, unknown>) {
  return { id, tipo: "loop", config };
}

async function garantirWorkspace(client: ReturnType<typeof api>): Promise<void> {
  await client
    .post("/workspaces", { headers: HDR, data: { id: WS } })
    .catch(() => undefined);
}

async function esperarFlowConcluir(
  page: import("@playwright/test").Page,
  flowId: string,
  timeoutMs = 30_000,
): Promise<{ execId: string; status: string; nos: Array<{ id: string; status: string }> }> {
  const ini = Date.now();
  for (;;) {
    const r = await api(page).get(`/flows/${encodeURIComponent(flowId)}/status?workspace=${WS}`, {
      headers: HDR,
    });
    expect(r.status()).toBe(200);
    const j = await r.json();
    if (j && j.execId && j.status && j.status !== "executando") {
      return { execId: j.execId, status: j.status, nos: j.nos ?? [] };
    }
    if (Date.now() - ini > timeoutMs) throw new Error(`timeout aguardando fluxo ${flowId} concluir`);
    await new Promise((r2) => setTimeout(r2, 500));
  }
}

async function lerJournal(page: import("@playwright/test").Page, execId: string): Promise<any[]> {
  const r = await api(page).get(`/registries/execucoes/${encodeURIComponent(execId)}?workspace=${WS}`, {
    headers: HDR,
  });
  expect(r.status()).toBe(200);
  const j = await r.json();
  return Array.isArray(j?.journal) ? j.journal : [];
}

test.describe("Fluxo — Juiz do loop (F2-T01)", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, TOKEN, WS);
    await garantirWorkspace(api(page));
  });

  test("(a) loop com sem-melhora para na volta esperada e grava motivo no journal", async ({ page }) => {
    const flowId = `juiz-sem-melhora-${Date.now().toString(36)}`;
    const resCriar = await api(page).post(`/flows?workspace=${WS}`, {
      headers: HDR,
      data: {
        id: flowId,
        nome: "Juiz sem-melhora",
        nos: [
          noManual("inicio"),
          noScript("corpo", "echo fixo"),
          noLoop("loop", {
            max_iteracoes: 10,
            retornar_para: "corpo",
            saida_final: "fim",
            juiz: { regras: [{ tipo: "sem-melhora", limiar: 2 }] },
          }),
          noScript("fim", "echo fim"),
        ],
        arestas: [
          { de: "inicio", para: "loop" },
          { de: "corpo", para: "loop" },
        ],
      },
    });
    expect(resCriar.status()).toBe(201);

    const resRun = await api(page).post(`/flows/${encodeURIComponent(flowId)}/run?workspace=${WS}`, {
      headers: HDR,
      data: { entrada: "entrada-e2e" },
    });
    expect(resRun.status()).toBe(202);

    const fim = await esperarFlowConcluir(page, flowId);
    expect(fim.status).toBe("concluido");

    const journal = await lerJournal(page, fim.execId);
    const iteracoes = journal.filter((e) => e.evento === "loop-iteracao");
    // corpo roda "fixo" → voltas 2 e 3 têm saída idêntica → para na volta 3.
    expect(iteracoes.length).toBe(3);
    expect(iteracoes[2].volta).toBe(3);
    expect(iteracoes[2].encerrado).toBe(true);
    expect(iteracoes[2].motivo_encerramento).toBe("sem_melhora");
  });

  test("(b) loop com condicao (regex) para no contexto", async ({ page }) => {
    const flowId = `juiz-condicao-${Date.now().toString(36)}`;
    const resCriar = await api(page).post(`/flows?workspace=${WS}`, {
      headers: HDR,
      data: {
        id: flowId,
        nome: "Juiz condicao regex",
        nos: [
          noManual("inicio"),
          noScript("corpo", "echo RESULTADO PRONTO"),
          noLoop("loop", {
            max_iteracoes: 10,
            retornar_para: "corpo",
            saida_final: "fim",
            juiz: { regras: [{ tipo: "condicao", padrao: "PRONTO$" }] },
          }),
          noScript("fim", "echo fim"),
        ],
        arestas: [
          { de: "inicio", para: "loop" },
          { de: "corpo", para: "loop" },
        ],
      },
    });
    expect(resCriar.status()).toBe(201);

    const resRun = await api(page).post(`/flows/${encodeURIComponent(flowId)}/run?workspace=${WS}`, {
      headers: HDR,
      data: { entrada: "entrada-e2e" },
    });
    expect(resRun.status()).toBe(202);

    const fim = await esperarFlowConcluir(page, flowId);
    expect(fim.status).toBe("concluido");

    const journal = await lerJournal(page, fim.execId);
    const iteracoes = journal.filter((e) => e.evento === "loop-iteracao");
    const encerrada = iteracoes.find((e) => e.encerrado);
    expect(encerrada).toBeDefined();
    expect(encerrada.motivo_encerramento).toBe("condicao");
    expect(encerrada.volta).toBe(2);
  });

  test("(c) nó comum acima do teto aparece com status skip (não fica executando)", async ({ page }) => {
    const flowId = `juiz-skip-${Date.now().toString(36)}`;
    const resCriar = await api(page).post(`/flows?workspace=${WS}`, {
      headers: HDR,
      data: {
        id: flowId,
        nome: "Skip de nó comum",
        nos: [
          noManual("inicio"),
          noScript("trabalhador", "echo trabalho", { max_iteracoes: 2 }),
          noLoop("loop", {
            max_iteracoes: 10,
            retornar_para: "trabalhador",
            saida_final: "fim",
          }),
          noScript("fim", "echo fim"),
        ],
        arestas: [
          { de: "inicio", para: "loop" },
          { de: "trabalhador", para: "loop" },
        ],
      },
    });
    expect(resCriar.status()).toBe(201);

    const resRun = await api(page).post(`/flows/${encodeURIComponent(flowId)}/run?workspace=${WS}`, {
      headers: HDR,
      data: { entrada: "entrada-e2e" },
    });
    expect(resRun.status()).toBe(202);

    const fim = await esperarFlowConcluir(page, flowId);
    expect(fim.status).toBe("concluido");

    const trabalhador = fim.nos.find((n) => n.id === "trabalhador");
    expect(trabalhador).toBeDefined();
    expect(trabalhador!.status).toBe("skip");
    expect(trabalhador!.status).not.toBe("executando");

    const journal = await lerJournal(page, fim.execId);
    const skips = journal.filter((e) => e.evento === "no-skip");
    expect(skips.length).toBeGreaterThanOrEqual(1);
    expect(skips[0].motivo).toBe("teto_no_atingido");
  });
});
