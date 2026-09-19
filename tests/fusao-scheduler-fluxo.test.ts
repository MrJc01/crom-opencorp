import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Scheduler, extrairFlowRunDeArgs } from "../src/core/scheduler.js";
import { FlowStore, flowSchema, type Flow } from "../src/core/flow-store.js";

const raizes: string[] = [];
afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

let home = "";
let wsPath = "";

function flowCron(ativo = true): Flow {
  return {
    id: "pulso",
    nome: "Pulso",
    ativo,
    nos: [
      { id: "gatilho", tipo: "cron", config: { expressao_cron: "*/15 * * * *" } },
      { id: "passo", tipo: "agente", config: { agente: "editor", ordem: "resumir" } },
    ],
    arestas: [{ de: "gatilho", para: "passo" }],
  };
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "opencorp-fusao-"));
  raizes.push(home);
  wsPath = join(home, "workspaces", "ws1");
  await mkdir(wsPath, { recursive: true });
});

describe("12.4 — schema Flow.auto_agendar", () => {
  it("default é false e true explícito é preservado para retrocompatibilidade", () => {
    const base = { id: "f1", nome: "F1", nos: [{ id: "gatilho", tipo: "manual", config: {} }], arestas: [] };
    expect(flowSchema.parse(base).auto_agendar).toBe(false);
    expect(flowSchema.parse({ ...base, auto_agendar: true }).auto_agendar).toBe(true);
  });
});

describe("12.2 — Agendamento Direto via Fluxo (Padrão n8n, Zero Banco Legado)", () => {
  it("descobre fluxo com nó cron diretamente do workspace", async () => {
    const store = new FlowStore({ homeDir: home });
    await store.salvar(wsPath, flowCron(true));

    const sched = new Scheduler({ homeDir: home });
    const agendamentos = await sched.listarAgendamentos();
    expect(agendamentos).toHaveLength(1);
    expect(agendamentos[0]!.id).toBe("pulso");
    expect(agendamentos[0]!.expressao_cron).toBe("*/15 * * * *");
    expect(agendamentos[0]!.workspace).toBe("ws1");
  });

  it("fluxo inativo (ativo: false) não aparece em listarAgendamentos", async () => {
    const store = new FlowStore({ homeDir: home });
    await store.salvar(wsPath, flowCron(false));

    const sched = new Scheduler({ homeDir: home });
    const agendamentos = await sched.listarAgendamentos();
    expect(agendamentos).toHaveLength(0);
  });

  it("fluxo sem nó cron não gera agendamento", async () => {
    const semCron: Flow = {
      id: "manual",
      nome: "Manual",
      ativo: true,
      nos: [{ id: "gatilho", tipo: "manual", config: {} }],
      arestas: [],
    };
    const store = new FlowStore({ homeDir: home });
    await store.salvar(wsPath, semCron);

    const sched = new Scheduler({ homeDir: home });
    const agendamentos = await sched.listarAgendamentos();
    expect(agendamentos).toHaveLength(0);
  });
});

describe("12.1 — delegação in-process e execução de rotinas", () => {
  it("extrairFlowRunDeArgs só casa ['flow','run',<id>]", () => {
    expect(extrairFlowRunDeArgs(["flow", "run", "pulso"])).toBe("pulso");
    expect(extrairFlowRunDeArgs(["flow", "run", "pulso", "--entrada", "oi"])).toBe("pulso");
    expect(extrairFlowRunDeArgs(["flow", "run"])).toBeNull();
    expect(extrairFlowRunDeArgs(["agent", "run", "editor", "ordem"])).toBeNull();
    expect(extrairFlowRunDeArgs(["doctor"])).toBeNull();
  });

  it("job flow run chama o executor in-process com o id certo e registra runs", async () => {
    const spy = vi.fn(async () => ({ execId: "exec-1", status: "concluido", contextoFinal: "ok" }));
    const sched = new Scheduler({ homeDir: home, flowExecutar: spy });
    const job = await sched.criar({
      nome: "flow:pulso",
      agenda: { tipo: "intervalo_min", valor: 30 },
      args: ["flow", "run", "pulso", "--entrada", "oi"],
      workspace: "ws1",
    });
    const { resultado } = await sched.runNow(job.id);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![1]).toBe("pulso");
    expect(spy.mock.calls[0]![2]).toMatchObject({ gatilho: { tipo: "cron", origem: job.id } });
    expect(resultado).toContain("flow pulso exec exec-1");
    const runs = await sched.listarRuns(job.id);
    expect(runs.length).toBeGreaterThan(0);
  });
});
