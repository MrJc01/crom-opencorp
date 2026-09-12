import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FlowStore } from "../src/core/flow-store.js";
import { SessionManager } from "../src/core/session-manager.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { RegistryStore } from "../src/core/registry-store.js";
import { argsComGatilhoCron } from "../src/core/scheduler.js";

const raizes: string[] = [];
afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

async function ambiente() {
  const home = await mkdtemp(join(tmpdir(), "opencorp-fluxo-hist-"));
  raizes.push(home);
  const ws = await new WorkspaceManager({ homeDir: home, cwd: home }).criar("corp-fluxo-hist");
  const flows = new FlowStore({ homeDir: home, cwd: ws.path });
  const registros = new RegistryStore();
  return { home, ws, flows, registros };
}

function specBasico() {
  return {
    id: "pipeline-hist",
    nome: "Pipeline Hist",
    nos: [
      { id: "inicio", tipo: "manual", config: {} },
      { id: "gravar", tipo: "registro", config: { categoria: "documentos" } },
    ],
    arestas: [{ de: "inicio", para: "gravar" }],
  } as const;
}

describe("fluxos no histórico (A: exec_id rastreável)", () => {
  it("executar com execId pré-gerado usa o mesmo id (contrato do POST /flows/:id/run)", async () => {
    const { ws, flows } = await ambiente();
    await flows.salvar(ws.path, { ...specBasico(), nos: [...specBasico().nos], arestas: [...specBasico().arestas] } as any);
    const r = await flows.executar(ws.path, "pipeline-hist", { entrada: "hello", execId: "exec-abc123" });
    expect(r.execId).toBe("exec-abc123");
    expect(r.status).toBe("concluido");
  });

  it("listarExecucoes e ultimaExecucao expõem nós + contexto final (fonte da timeline)", async () => {
    const { ws, flows } = await ambiente();
    await flows.salvar(ws.path, { ...specBasico(), nos: [...specBasico().nos], arestas: [...specBasico().arestas] } as any);
    const r = await flows.executar(ws.path, "pipeline-hist", { entrada: "tema-x" });
    const lista = await flows.listarExecucoes(ws.path, "pipeline-hist");
    expect(lista.length).toBeGreaterThanOrEqual(1);
    const atual = lista.find((e) => e.execId === r.execId)!;
    expect(atual.status).toBe("concluido");
    expect(atual.nos.map((n) => n.status)).toEqual(["ok", "ok"]);
    expect(atual.entrada).toBe("tema-x");
    const ultima = await flows.ultimaExecucao(ws.path, "pipeline-hist");
    expect(ultima?.execId).toBe(r.execId);
    expect(ultima?.contextoFinal.length).toBeGreaterThan(0);
  });
});

describe("elo agenda↔fluxo (D: gatilho cron)", () => {
  it("argsComGatilhoCron cobre flow run além de agent run", () => {
    expect(argsComGatilhoCron({ id: "sch-a", args: ["agent", "run", "x"] })).toBe("cron:sch-a");
    expect(argsComGatilhoCron({ id: "sch-f", args: ["flow", "run", "meu-flow"] })).toBe("cron:sch-f");
    expect(argsComGatilhoCron({ id: "sch-t", args: ["task", "list"] })).toBe("");
  });

  it("gatilho cron é persistido nos extras do registro de execução", async () => {
    const { ws, flows, registros } = await ambiente();
    await flows.salvar(ws.path, { ...specBasico(), nos: [...specBasico().nos], arestas: [...specBasico().arestas] } as any);
    const r = await flows.executar(ws.path, "pipeline-hist", {
      entrada: "via-cron",
      execId: "exec-cron-1",
      gatilho: { tipo: "cron", origem: "sch-fluxo-teste" },
    });
    expect(r.status).toBe("concluido");
    const meta = await registros.lerMeta(ws.path, "execucoes", "exec-cron-1");
    expect((meta.extras as any)?.gatilho).toEqual({ tipo: "cron", origem: "sch-fluxo-teste" });
  });

  it("execução sem gatilho continua válida (manual via Studio)", async () => {
    const { ws, flows, registros } = await ambiente();
    await flows.salvar(ws.path, { ...specBasico(), nos: [...specBasico().nos], arestas: [...specBasico().arestas] } as any);
    await flows.executar(ws.path, "pipeline-hist", { entrada: "manual", execId: "exec-man-1" });
    const meta = await registros.lerMeta(ws.path, "execucoes", "exec-man-1");
    expect((meta.extras as any)?.gatilho).toBeUndefined();
    expect((meta.extras as any)?.tipo).toBe("flow");
  });
});

describe("zombie-reaper não toca fluxos em andamento (B: sem falso falhou)", () => {
  it("flow executando há +60s mantém status (só sessão de agente vira falhou)", async () => {
    const { ws, registros } = await ambiente();
    const sessoes = new SessionManager();
    const velho = new Date(Date.now() - 2 * 3600_000).toISOString();

    await registros.criar(ws.path, {
      categoria: "execucoes",
      id: "exec-flow-longo",
      descricao: "Flow longo",
      criadoPor: "flow:pipeline-hist",
      extras: { status: "executando", tipo: "flow", flow: "pipeline-hist", nos: [] },
    });
    const metaFlow = await registros.lerMeta(ws.path, "execucoes", "exec-flow-longo");
    metaFlow.criado_em = velho;
    await registros.salvarMeta(ws.path, "execucoes", "exec-flow-longo", metaFlow);
    await (sessoes as any).reconciliarZombie(ws.path, metaFlow);
    const depois = await registros.lerMeta(ws.path, "execucoes", "exec-flow-longo");
    expect((depois.extras as any)?.status).toBe("executando");

    await registros.criar(ws.path, {
      categoria: "execucoes",
      id: "exec-sessao-zumbi",
      descricao: "Ordem: alive?",
      criadoPor: "executor-padrao",
      extras: { status: "executando", ordem: "alive?" },
    });
    const metaSessao = await registros.lerMeta(ws.path, "execucoes", "exec-sessao-zumbi");
    metaSessao.criado_em = velho;
    await registros.salvarMeta(ws.path, "execucoes", "exec-sessao-zumbi", metaSessao);
    await (sessoes as any).reconciliarZombie(ws.path, metaSessao);
    const depoisSessao = await registros.lerMeta(ws.path, "execucoes", "exec-sessao-zumbi");
    expect((depoisSessao.extras as any)?.status).toBe("falhou");
  });
});

describe("saída nunca polui o ledger (regressão execucoes/resultado)", () => {
  it("validarTexto rejeita saida na categoria execucoes", async () => {
    const { FlowStore } = await import("../src/core/flow-store.js");
    const store = new FlowStore();
    expect(() =>
      store.validarTexto(
        JSON.stringify({
          id: "ruim",
          nome: "Ruim",
          nos: [
            { id: "gatilho", tipo: "manual", config: {} },
            { id: "saida", tipo: "saida", config: { registro: "execucoes/resultado" } },
          ],
          arestas: [{ de: "gatilho", para: "saida" }],
        }),
        "ruim",
      ),
    ).toThrow(/ledger reservado/);
  });

  it("listarExecucoes ignora registros avulsos sem tag sessao", async () => {
    const { wsPath } = await (async () => {
      const { mkdtemp } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const { WorkspaceManager } = await import("../src/core/workspace-manager.js");
      const home = await mkdtemp(join(tmpdir(), "opencorp-noses-"));
      const ws = await new WorkspaceManager({ homeDir: home, cwd: home }).criar("corp-noses");
      return { wsPath: ws.path, home };
    })();
    const { RegistryStore } = await import("../src/core/registry-store.js");
    const { SessionManager } = await import("../src/core/session-manager.js");
    const registros = new RegistryStore();
    await registros.criar(wsPath, {
      categoria: "execucoes",
      id: "resultado",
      descricao: "saída de flow",
      criadoPor: "flow:x",
    });
    const sessoes = new SessionManager();
    expect(await sessoes.listarExecucoes(wsPath)).toEqual([]);
  });
});
