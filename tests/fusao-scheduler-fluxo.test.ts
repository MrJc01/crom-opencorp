import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { Scheduler, extrairFlowRunDeArgs } from "../src/core/scheduler.js";
import { flowSchema, type Flow } from "../src/core/flow-store.js";
import {
  sincronizarFluxoParaScheduler,
  converterJobParaFlow,
} from "../src/core/scheduler-flow-bridge.js";

const raizes: string[] = [];
afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

let home = "";
let wsPath = "";

function flowCron(auto: boolean): Flow {
  return {
    id: "pulso",
    nome: "Pulso",
    auto_agendar: auto,
    nos: [
      { id: "gatilho", tipo: "cron", config: { expressao_cron: "*/15 * * * *" } },
      { id: "passo", tipo: "agente", config: { agente: "editor", ordem: "resumir" } },
    ],
    arestas: [{ de: "gatilho", para: "passo" }],
  };
}

function jobsFlow(id: string): { linhas: { nome: string; args: string; agenda_valor: string }[] } {
  const db = new Database(join(home, ".opencorp", "scheduler.db"));
  try {
    const linhas = db.prepare("SELECT nome, args, agenda_valor FROM jobs WHERE nome = ?").all(`flow:${id}`) as {
      nome: string; args: string; agenda_valor: string;
    }[];
    return { linhas };
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "opencorp-fusao-"));
  raizes.push(home);
  wsPath = join(home, "ws1");
  await mkdir(wsPath, { recursive: true });
});

describe("12.4 — schema Flow.auto_agendar", () => {
  it("default é false e true explícito é preservado", () => {
    const base = { id: "f1", nome: "F1", nos: [{ id: "gatilho", tipo: "manual", config: {} }], arestas: [] };
    expect(flowSchema.parse(base).auto_agendar).toBe(false);
    expect(flowSchema.parse({ ...base, auto_agendar: true }).auto_agendar).toBe(true);
  });
});

describe("12.2 — sincronizarFluxoParaScheduler (fonte única)", () => {
  it("cria exatamente 1 job flow:<id> e segunda chamada não duplica", async () => {
    await sincronizarFluxoParaScheduler(wsPath, flowCron(true), home);
    let { linhas } = jobsFlow("pulso");
    expect(linhas).toHaveLength(1);
    expect(JSON.parse(linhas[0]!.args)).toEqual(["flow", "run", "pulso"]);
    expect(linhas[0]!.agenda_valor).toBe("*/15 * * * *");
    await sincronizarFluxoParaScheduler(wsPath, flowCron(true), home);
    ({ linhas } = jobsFlow("pulso"));
    expect(linhas).toHaveLength(1);
  });

  it("desligar a flag remove o job", async () => {
    await sincronizarFluxoParaScheduler(wsPath, flowCron(true), home);
    expect(jobsFlow("pulso").linhas).toHaveLength(1);
    await sincronizarFluxoParaScheduler(wsPath, flowCron(false), home);
    expect(jobsFlow("pulso").linhas).toHaveLength(0);
  });

  it("flow sem nó cron não cria job mesmo com flag ligada", async () => {
    const semCron: Flow = { ...flowCron(true), nos: [{ id: "gatilho", tipo: "manual", config: {} }], arestas: [] };
    await sincronizarFluxoParaScheduler(wsPath, semCron, home);
    expect(jobsFlow("pulso").linhas).toHaveLength(0);
  });
});

describe("12.3 — converterJobParaFlow", () => {
  it("gera flow de 1 nó manual com auto_agendar false (agent run e node script)", () => {
    const f1 = converterJobParaFlow({ id: "sch-abc", nome: "rotina", args: ["agent", "run", "editor", "resumir"] });
    expect(f1.nos).toHaveLength(1);
    expect(f1.nos[0]!.tipo).toBe("manual");
    expect(f1.auto_agendar).toBe(false);
    expect(f1.nome).toBe("convertido-sch-abc");
    const f2 = converterJobParaFlow({ id: "sch-xyz", nome: "script", args: ["node", "scripts/x.mjs", "--ok"] });
    expect(f2.nos).toHaveLength(1);
    expect(f2.auto_agendar).toBe(false);
    expect(String((f2.nos[0]!.config as { comando: string }).comando)).toContain("scripts/x.mjs");
  });
});

describe("12.1 — delegação in-process", () => {
  it("extrairFlowRunDeArgs só casa ['flow','run',<id>]", () => {
    expect(extrairFlowRunDeArgs(["flow", "run", "pulso"])).toBe("pulso");
    expect(extrairFlowRunDeArgs(["flow", "run", "pulso", "--entrada", "oi"])).toBe("pulso");
    expect(extrairFlowRunDeArgs(["flow", "run"])).toBeNull();
    expect(extrairFlowRunDeArgs(["agent", "run", "editor", "ordem"])).toBeNull();
    expect(extrairFlowRunDeArgs(["doctor"])).toBeNull();
  });

  it("job flow run chama o executor in-process com o id certo e registra job_runs", async () => {
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
