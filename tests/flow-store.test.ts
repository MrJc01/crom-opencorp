import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FlowError, FlowStore } from "../src/core/flow-store.js";
import type { OpcoesRun, ResultadoRun } from "../src/core/session-manager.js";

const raizes: string[] = [];

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

async function wsNovo(): Promise<{ home: string; ws: string }> {
  const home = await mkdtemp(join(tmpdir(), "opencorp-flow-"));
  raizes.push(home);
  const { WorkspaceManager } = await import("../src/core/workspace-manager.js");
  const ws = await new WorkspaceManager({ homeDir: home, cwd: home }).criar("corp-flow");
  return { home, ws: ws.path };
}

function sessaoFalsa(resposta: (op: OpcoesRun) => ResultadoRun) {
  const chamadas: OpcoesRun[] = [];
  return {
    chamadas,
    store: new FlowStore({
      sessoes: {
        rodar: async (op: OpcoesRun) => {
          chamadas.push(op);
          return resposta(op);
        },
      },
    }),
  };
}

function ok(id: string, captura: string): ResultadoRun {
  return { id, status: "concluido", exit_code: 0, captura } as ResultadoRun;
}

const flowLinear = {
  id: "relatorio",
  nome: "Relatório diário",
  nos: [
    { id: "gatilho", tipo: "manual", config: {} },
    { id: "coletar", tipo: "agente", config: { agente: "executor-padrao", ordem: "escreva '{{entrada}}' no arquivo sandbox/saida.txt" } },
    { id: "salvar", tipo: "saida", config: { registro: "documentos/relatorios" } },
  ],
  arestas: [
    { de: "gatilho", para: "coletar" },
    { de: "coletar", para: "salvar" },
  ],
};

describe("FlowStore — validação", () => {
  it("cria flow com gatilho manual e estrutura vazia", async () => {
    const { home, ws } = await wsNovo();
    const store = new FlowStore({ homeDir: home });
    const flow = await store.criar(ws, "relatorio", "Relatório diário");
    expect(flow.id).toBe("relatorio");
    expect(flow.nos).toHaveLength(1);
    expect(flow.nos[0]!.tipo).toBe("manual");
  });

  it("rejeita ciclo com caminho completo no erro", async () => {
    const { home, ws } = await wsNovo();
    const store = new FlowStore({ homeDir: home });
    await store.criar(ws, "ciclico", "Ciclo");
    const caminho = store.caminho(ws, "ciclico");
    const json = JSON.parse(await readFile(caminho, "utf8"));
    json.nos.push(
      { id: "a", tipo: "agente", config: { agente: "executor-padrao", ordem: "x" } },
      { id: "b", tipo: "saida", config: { registro: "notas/x" } },
    );
    json.arestas.push(
      { de: "gatilho", para: "a" },
      { de: "a", para: "b" },
      { de: "b", para: "a" },
    );
    await writeFile(caminho, JSON.stringify(json));
    await expect(store.obter(ws, "ciclico")).rejects.toThrow(/ciclo detectado/);
  });

  it("salvar rejeita JSON fora do schema (nó sem tipo válido)", async () => {
    const { home, ws } = await wsNovo();
    const store = new FlowStore({ homeDir: home });
    await store.criar(ws, "quebrado", "Q");
    const flow = await store.obter(ws, "quebrado");
    const ruim = { ...flow, nos: [{ id: "x", tipo: "foguete", config: {} }] } as never;
    await expect(store.salvar(ws, ruim)).rejects.toThrow(FlowError);
  });
});

describe("FlowStore — execução", () => {
  it("encadeia nós: contexto flui manual→agente→saida", async () => {
    const { home, ws } = await wsNovo();
    const { store, chamadas } = sessaoFalsa((op) => ok("exec-1", `SAIDA:${op.ordem}`));
    await store.salvar(ws, flowLinear as never);
    const r = await store.executar(ws, "relatorio", { entrada: "fluxo-ok" });
    expect(r.status).toBe("concluido");
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.ordem).toContain("fluxo-ok");
    expect(chamadas[0]!.ordem).not.toContain("{{entrada}}");
    const nosPorId = Object.fromEntries(r.nos.map((n) => [n.id, n.status]));
    expect(nosPorId["gatilho"]).toBe("ok");
    expect(nosPorId["coletar"]).toBe("ok");
    expect(nosPorId["salvar"]).toBe("ok");
    expect(r.contextoFinal).toContain("SAIDA:");
    const conteudo = await readFile(
      join(ws, ".opencorp", "registries", "documentos", "relatorios", "conteudo.md"),
      "utf8",
    );
    expect(conteudo).toContain("SAIDA:");
  });

  it("falha de nó interrompe e nós seguintes ficam não-executados", async () => {
    const { home, ws } = await wsNovo();
    const { store } = sessaoFalsa(() => ({ id: "exec-2", status: "concluido", exit_code: 3, captura: "" } as ResultadoRun));
    await store.salvar(ws, flowLinear as never);
    await expect(store.executar(ws, "relatorio", { entrada: "x" })).rejects.toThrow(/interrompido no nó "coletar"/);
    const ultima = await store.ultimaExecucao(ws, "relatorio");
    expect(ultima?.status).toBe("falhou");
    const nosPorId = Object.fromEntries(ultima!.nos.map((n) => [n.id, n.status]));
    expect(nosPorId["coletar"]).toBe("falhou");
    expect(nosPorId["salvar"]).toBe("nao-executado");
  });

  it("condicao roteia por chave do contexto (então e senão)", async () => {
    const { home, ws } = await wsNovo();
    const flow = {
      id: "rota",
      nome: "Rota",
      nos: [
        { id: "gatilho", tipo: "manual", config: {} },
        { id: "decide", tipo: "condicao", config: { chave: "ALERTA", entao: "critico", senao: "normal" } },
        { id: "critico", tipo: "agente", config: { agente: "executor-padrao", ordem: "trate {{entrada}}" } },
        { id: "normal", tipo: "saida", config: { registro: "notas/normal" } },
      ],
      arestas: [{ de: "gatilho", para: "decide" }],
    };
    const { store, chamadas } = sessaoFalsa(() => ok("exec-3", "rotulado"));
    await store.salvar(ws, flow as never);

    const r1 = await store.executar(ws, "rota", { entrada: "tem ALERTA aqui" });
    expect(r1.nos.find((n) => n.id === "critico")!.status).toBe("ok");
    expect(r1.nos.find((n) => n.id === "normal")!.status).toBe("nao-executado");
    expect(chamadas.at(-1)!.ordem).toContain("tem ALERTA aqui");

    const r2 = await store.executar(ws, "rota", { entrada: "calmo" });
    expect(r2.nos.find((n) => n.id === "critico")!.status).toBe("nao-executado");
    expect(r2.nos.find((n) => n.id === "normal")!.status).toBe("ok");
  });

  it("registra execução do flow com referências ao nó-agente", async () => {
    const { home, ws } = await wsNovo();
    const { store } = sessaoFalsa(() => ok("exec-no", "c"));
    await store.salvar(ws, flowLinear as never);
    const r = await store.executar(ws, "relatorio", { entrada: "e" });
    const ultima = await store.ultimaExecucao(ws, "relatorio");
    expect(ultima?.execId).toBe(r.execId);
    expect(ultima?.nos.find((n) => n.id === "coletar")?.exec_id).toBe("exec-no");
  });
});
