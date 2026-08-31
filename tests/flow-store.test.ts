import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FlowStore } from "../src/core/flow-store.js";
import { FlowError } from "../src/core/errors.js";
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

describe("FlowStore — nodes de gestão (task_create, registro, decisao)", () => {
  it("task_create cria task real no board com contexto interpolado", async () => {
    const { ws } = await wsNovo();
    const flow = {
      id: "fila",
      nome: "Fila",
      nos: [
        { id: "gatilho", tipo: "manual", config: {} },
        { id: "abrir", tipo: "task_create", config: { titulo: "Tratar: {{entrada}}", prioridade: "alta", responsavel: "agente:executor-padrao" } },
      ],
      arestas: [{ de: "gatilho", para: "abrir" }],
    };
    const { store } = sessaoFalsa(() => ok("exec-1", "x"));
    await store.salvar(ws, flow as never);
    const r = await store.executar(ws, "fila", { entrada: "revisão de custos" });
    expect(r.contextoFinal).toContain("tsk-");
    expect(r.contextoFinal).toContain("Tratar: revisão de custos");
    const { TaskStore } = await import("../src/core/task-store.js");
    const tasks = await new TaskStore().listar(ws);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.titulo).toBe("Tratar: revisão de custos");
    expect(tasks[0]!.prioridade).toBe("alta");
    expect(tasks[0]!.responsavel).toBe("agente:executor-padrao");
    expect(tasks[0]!.criado_por).toBe("flow:fila");
  });

  it("registro grava contexto como registro novo em categoria", async () => {
    const { ws } = await wsNovo();
    const flow = {
      id: "memoria",
      nome: "Memória",
      nos: [
        { id: "gatilho", tipo: "manual", config: {} },
        { id: "anotar", tipo: "registro", config: { categoria: "documentos", id: "aprendizado", titulo: "Aprendizado do dia" } },
      ],
      arestas: [{ de: "gatilho", para: "anotar" }],
    };
    const { store } = sessaoFalsa(() => ok("exec-1", "insight importantíssimo"));
    await store.salvar(ws, flow as never);
    const r = await store.executar(ws, "memoria", { entrada: "insight importantíssimo" });
    expect(r.contextoFinal).toContain("documentos/aprendizado-");
    const conteudo = await readFile(join(ws, ".opencorp", "registries", "documentos", r.contextoFinal.split("/")[1]!, "conteudo.md"), "utf8");
    expect(conteudo).toContain("insight importantíssimo");
  });

  it("decisao roteia pelo rótulo escolhido pelo agente (e rejeita resposta inválida)", async () => {
    const { ws } = await wsNovo();
    const flow = {
      id: "triagem",
      nome: "Triagem",
      nos: [
        { id: "gatilho", tipo: "manual", config: {} },
        {
          id: "julgar",
          tipo: "decisao",
          config: {
            agente: "executor-padrao",
            pergunta: "qual caminho?",
            opcoes: [
              { rotulo: "URGENTE", proximo: "agora" },
              { rotulo: "FILA", proximo: "depois" },
            ],
          },
        },
        { id: "agora", tipo: "saida", config: { registro: "documentos/urgentes" } },
        { id: "depois", tipo: "saida", config: { registro: "documentos/na-fila" } },
      ],
      arestas: [{ de: "gatilho", para: "julgar" }],
    };
    const { store, chamadas } = sessaoFalsa(() => ok("exec-d", "Resposta: URGENTE"));
    await store.salvar(ws, flow as never);
    const r = await store.executar(ws, "triagem", { entrada: "petição chega hoje" });
    expect(r.nos.find((n) => n.id === "agora")!.status).toBe("ok");
    expect(r.nos.find((n) => n.id === "depois")!.status).toBe("nao-executado");
    // ordem da decisão contém os rótulos e o contexto
    const ordemDecisao = chamadas.find((c) => c.ordem?.includes("RÍGIDO"))!.ordem!;
    expect(ordemDecisao).toContain("- URGENTE");
    expect(ordemDecisao).toContain("- FILA");

    // resposta inválida → falha rígida
    const { store: store2 } = sessaoFalsa(() => ok("exec-d2", "acho que talvez"));
    const err = await store2.executar(ws, "triagem", { entrada: "ambíguo" }).catch((e) => e);
    expect(err).toBeInstanceOf(FlowError);
    expect(err.message).toContain("não correspondeu");
  });

  it("validação rejeita decisao sem opcoes válidas", async () => {
    const { ws } = await wsNovo();
    const flow = {
      id: "quebrado",
      nome: "Q",
      nos: [
        { id: "gatilho", tipo: "manual", config: {} },
        { id: "j", tipo: "decisao", config: { agente: "x", pergunta: "y" } },
      ],
      arestas: [{ de: "gatilho", para: "j" }],
    };
    const store = new FlowStore({ homeDir: (await wsNovo()).home });
    const err = await store.salvar(ws, flow as never).catch((e) => e);
    expect(err).toBeInstanceOf(FlowError);
    expect(err.message).toContain("opcoes");
  });
});

describe("FlowStore — decisão anexa ao contexto (não sobrescreve)", () => {
  it("nós após decisão recebem contexto original + rótulo da decisão", async () => {
    const { ws } = await wsNovo();
    const flow = {
      id: "anexo",
      nome: "Anexo",
      nos: [
        { id: "gatilho", tipo: "manual", config: {} },
        {
          id: "julgar",
          tipo: "decisao",
          config: {
            agente: "executor-padrao",
            pergunta: "q",
            opcoes: [
              { rotulo: "A", proximo: "memorizar" },
              { rotulo: "B", proximo: "memorizar" },
            ],
          },
        },
        { id: "memorizar", tipo: "registro", config: { categoria: "documentos", id: "com-decisao", titulo: "Com decisão" } },
      ],
      arestas: [{ de: "gatilho", para: "julgar" }],
    };
    const { store } = sessaoFalsa(() => ok("exec-a", "SUBSTÂNCIA REAL"));
    await store.salvar(ws, flow as never);
    const r = await store.executar(ws, "anexo", { entrada: "SUBSTÂNCIA REAL" });
    expect(r.contextoFinal).toContain("SUBSTÂNCIA REAL");
    expect(r.contextoFinal).toContain("[decisão (julgar)]: A");
  });
});
