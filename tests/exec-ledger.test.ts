import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { CorpDb } from "../src/core/corp-db.js";
import { SessionManager } from "../src/core/session-manager.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { parseGatilho } from "../src/schemas/gatilho.js";

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock("execa", () => ({ execa: execaMock }));

const raizes: string[] = [];

function fakeChild(out: string[]) {
  const child = Promise.resolve({ exitCode: 0, killed: false }) as unknown as {
    stdout: Readable;
    stderr: Readable;
    pid?: number;
    killed: boolean;
  } & Promise<{ exitCode: number; killed: boolean }>;
  child.stdout = Readable.from(out);
  child.stderr = Readable.from([]);
  child.pid = 424242;
  child.killed = false;
  return child;
}

async function ambiente() {
  const home = await mkdtemp(join(tmpdir(), "opencorp-ledger-"));
  raizes.push(home);
  const manager = new WorkspaceManager({ homeDir: home, cwd: home });
  const ws = await manager.criar("corp-ledger");
  const sessoes = new SessionManager({ homeDir: home, cwd: home });
  return { home, ws, sessoes };
}

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

describe("parseGatilho (contrato <tipo>:<origem>)", () => {
  it("parseia tipos válidos com origem", () => {
    expect(parseGatilho("cron:sch-x1")).toEqual({ tipo: "cron", origem: "sch-x1" });
    expect(parseGatilho("mencao:tsk_a1b2")).toEqual({ tipo: "mencao", origem: "tsk_a1b2" });
    expect(parseGatilho("dependencia:flow-editoria/no-agente")).toEqual({
      tipo: "dependencia",
      origem: "flow-editoria/no-agente",
    });
    expect(parseGatilho("turno:reuniao-20260831-1a2b")).toEqual({
      tipo: "turno",
      origem: "reuniao-20260831-1a2b",
    });
  });

  it("rejeita tipo desconhecido, origem vazia e formato sem :", () => {
    expect(() => parseGatilho("cronsch-x")).toThrow(/gatilho/);
    expect(() => parseGatilho("supercao:x")).toThrow(/inválido/);
    expect(() => parseGatilho("cron:")).toThrow(/inválido/);
  });
});

describe("corp.db ledger unificado (execucoes)", () => {
  it("upsert cria, atualiza status/custo e listarExecucoes filtra por gatilho/agente/status", () => {
    const home = raizes[raizes.push(mkdtempSync(join(tmpdir(), "opencorp-ledger-db-"))) - 1]!;
    const db = new CorpDb(join(home, "corp.db"));
    db.upsertExecucao({
      id: "exec-1",
      agente: "auditor",
      modelo: "m1",
      gatilho_tipo: "cron",
      gatilho_origem: "sch-ciclo",
      status: "executando",
      inicio: "2026-08-31T09:00:00Z",
      fim: null,
      duracao_ms: null,
      custo_usd: null,
      exit_code: null,
    });
    expect(db.listarExecucoes()).toHaveLength(1);
    expect(db.listarExecucoes({ status: "executando" })[0]!.id).toBe("exec-1");

    db.upsertExecucao({
      id: "exec-1",
      agente: "auditor",
      modelo: "m1",
      gatilho_tipo: "cron",
      gatilho_origem: "sch-ciclo",
      status: "concluido",
      inicio: "2026-08-31T09:00:00Z",
      fim: "2026-08-31T09:01:00Z",
      duracao_ms: 60000,
      custo_usd: 0.01,
      exit_code: 0,
    });
    db.upsertExecucao({
      id: "exec-2",
      agente: "revisor",
      modelo: "m2",
      gatilho_tipo: "mencao",
      gatilho_origem: "tsk_a1",
      status: "falhou",
      inicio: "2026-08-31T09:02:00Z",
      fim: "2026-08-31T09:02:30Z",
      duracao_ms: 30000,
      custo_usd: 0,
      exit_code: 1,
      erro: "Rate limit exceeded: free-models-per-day-high-balance",
    });

    const todas = db.listarExecucoes();
    expect(todas).toHaveLength(2);
    expect(todas[0]!.id).toBe("exec-2"); // mais recente primeiro
    expect(todas[0]!.erro).toBe("Rate limit exceeded: free-models-per-day-high-balance");
    expect(todas[1]!.status).toBe("concluido"); // upsert atualizou, não duplicou
    expect(todas[1]!.erro).toBeNull();

    expect(db.listarExecucoes({ gatilho_tipo: "cron" }).map((e) => e.id)).toEqual(["exec-1"]);
    expect(db.listarExecucoes({ gatilho_origem: "tsk_a1" }).map((e) => e.id)).toEqual(["exec-2"]);
    expect(db.listarExecucoes({ agente: "auditor" }).map((e) => e.id)).toEqual(["exec-1"]);
    expect(db.listarExecucoes({ status: "falhou" }).map((e) => e.id)).toEqual(["exec-2"]);
    expect(db.listarExecucoes({ limite: 1 })).toHaveLength(1);

    db.limpar();
    expect(db.listarExecucoes()).toHaveLength(0);
    db.fechar();
  });
});

describe("SessionManager grava no ledger (execa mockado)", () => {
  it("execução com --gatilho cron aparece no ledger com gatilho e status final", async () => {
    const { ws, sessoes } = await ambiente();
    execaMock.mockImplementation(() => fakeChild(["ok\n"]));
    const r = await sessoes.rodar({
      agente: "executor-padrao",
      ordem: "tarefa agendada",
      gatilho: { tipo: "cron", origem: "sch-ciclo-aud01" },
    });
    expect(r.status).toBe("concluido");

    const db = new CorpDb(join(ws.path, ".opencorp", "corp.db"));
    const [linha] = db.listarExecucoes({ gatilho_tipo: "cron" });
    expect(linha).toMatchObject({
      id: r.id,
      agente: "executor-padrao",
      gatilho_origem: "sch-ciclo-aud01",
      status: "concluido",
      exit_code: 0,
    });
    expect(linha!.duracao_ms).toBeGreaterThanOrEqual(0);
    db.fechar();

    // gatilho também persiste nos extras do registro documental
    const metaPath = join(ws.path, ".opencorp", "registries", "execucoes", r.id, "meta.json");
    const meta = JSON.parse(await import("node:fs/promises").then((m) => m.readFile(metaPath, "utf8")));
    expect(meta.extras.gatilho).toEqual({ tipo: "cron", origem: "sch-ciclo-aud01" });
  });

  it("sem gatilho declarado, ledger classifica como manual", async () => {
    const { ws, sessoes } = await ambiente();
    execaMock.mockImplementation(() => fakeChild(["ok\n"]));
    const r = await sessoes.rodar({ agente: "executor-padrao", ordem: "direto do humano" });
    const db = new CorpDb(join(ws.path, ".opencorp", "corp.db"));
    const [linha] = db.listarExecucoes({ agente: "executor-padrao" });
    expect(linha!.id).toBe(r.id);
    expect(linha!.gatilho_tipo).toBe("manual");
    expect(linha!.gatilho_origem).toBe("");
    db.fechar();
  });
});
