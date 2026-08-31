import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { CorpDb } from "../src/core/corp-db.js";
import { FlowStore } from "../src/core/flow-store.js";
import { MeetingManager, type SessaoLike } from "../src/core/meeting-manager.js";
import { OrquestradorDeTeams } from "../src/core/team-orchestrator.js";
import { TeamStore } from "../src/core/team-store.js";
import { TaskStore } from "../src/core/task-store.js";
import { instalarMencoes, pendentesMencoes } from "../src/core/mention-runner.js";
import { argsComGatilhoCron } from "../src/core/scheduler.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import type { Gatilho } from "../src/schemas/gatilho.js";
import type { OpcoesRun } from "../src/core/session-manager.js";

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock("execa", () => ({ execa: execaMock }));

const raizes: string[] = [];
afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

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

async function ambiente(id: string) {
  const home = await mkdtemp(join(tmpdir(), `opencorp-gatilho-${id}-`));
  raizes.push(home);
  const manager = new WorkspaceManager({ homeDir: home, cwd: home });
  const ws = await manager.criar(`corp-gat-${id}`);
  return { home, wsPath: ws.path };
}

function dbDe(wsPath: string): CorpDb {
  const db = new CorpDb(join(wsPath, ".opencorp", "corp.db"));
  return db;
}

describe("Etapa 2 — motores declaram o gatilho da Execução", () => {
  it("scheduler: job agent run se auto-declara cron:<jobId>", () => {
    expect(argsComGatilhoCron({ id: "sch-abc", args: ["agent", "run", "auditor", "faça o ciclo"] })).toBe("cron:sch-abc");
    expect(argsComGatilhoCron({ id: "sch-abc", args: ["flow", "run", "editoria"] })).toBe("");
  });

  it("flow: nó agente grava no ledger com gatilho dependencia flow:<id>/<no>", async () => {
    const { home, wsPath } = await ambiente("flow");
    execaMock.mockImplementation(() => fakeChild(["resultado do nó\n"]));
    const flows = new FlowStore({ homeDir: home, cwd: wsPath });
    await flows.salvar(wsPath, {
      id: "editoria-teste",
      nome: "Editoria teste",
      nos: [
        { id: "gatilho", tipo: "manual", config: {} },
        { id: "passo", tipo: "agente", config: { agente: "executor-padrao", ordem: "faça {{entrada}}" } },
      ],
      arestas: [{ de: "gatilho", para: "passo" }],
    });
    const r = await flows.executar(wsPath, "editoria-teste", { entrada: "tema x" });
    expect(r.status).toBe("concluido");

    const db = dbDe(wsPath);
    const [linha] = db.listarExecucoes({ gatilho_tipo: "dependencia" });
    expect(linha).toMatchObject({
      agente: "executor-padrao",
      gatilho_origem: "flow:editoria-teste/passo",
      status: "concluido",
    });
    db.fechar();
  });

  it("team: passos do orquestrador recebem gatilho padrao team:<id>/<passo>", async () => {
    const { wsPath } = await ambiente("team");
    const recebidos: Gatilho[] = [];
    const orch = new OrquestradorDeTeams({
      executores: {
        rodar: async (agente: string, _ordem: string, _ws: string, gatilho?: Gatilho) => {
          recebidos.push(gatilho ?? { tipo: "manual", origem: "" });
          return { id: "sessao-fake", captura: "trabalho ok" };
        },
      },
    });
    const teams = new TeamStore();
    await teams.criar(wsPath, {
      id: "editoria",
      titulo: "Pipeline editorial",
      padrao: "pipeline",
      passos: [
        { agente: "executor-padrao", ordem: "escreva {{entrada}}" },
        { agente: "revisor", ordem: "revise {{anterior}}" },
      ],
    });
    const r = await orch.executar(wsPath, "editoria", "tema do dia");
    expect(r.status_final).toBe("feito");
    expect(recebidos).toHaveLength(2);
    expect(recebidos[0]).toEqual({ tipo: "padrao", origem: "team:editoria/1/2:executor-padrao" });
    expect(recebidos[1]).toEqual({ tipo: "padrao", origem: "team:editoria/2/2:revisor" });
  });

  it("meeting: turno de reunião declara gatilho turno:<reuniaoId>", async () => {
    const { home, wsPath } = await ambiente("meeting");
    const gatilhos: (Gatilho | undefined)[] = [];
    const sessao: SessaoLike = {
      rodar: vi.fn(async (opcoes: OpcoesRun) => {
        gatilhos.push(opcoes.gatilho);
        return {
          id: "sess-fake",
          agente: opcoes.agente,
          modelo: "m",
          ordem: "x",
          inicio: new Date().toISOString(),
          fim: new Date().toISOString(),
          status: "concluido",
          exit_code: 0,
          duracao_ms: 10,
          pid: 1,
          log: "",
          captura: "concordo com a pauta",
          custo_usd: 0,
        };
      }) as unknown as SessaoLike["rodar"],
    };
    const mm = new MeetingManager({ homeDir: home, cwd: home, sessoes: sessao });
    const sala = await mm.iniciar({
      pauta: "aprovar pauta de teste",
      agentes: "secretario,executor-padrao",
      workspaceDir: wsPath,
    });
    expect(gatilhos.length).toBeGreaterThan(0);
    for (const g of gatilhos) {
      expect(g!.tipo).toBe("turno");
      expect(g!.origem.startsWith(sala.id)).toBe(true);
    }
  });

  it("mention: menção no chat da task declara gatilho mencao:<task>/<alvo>", async () => {
    const { wsPath } = await ambiente("mencao");
    const recebidos: Gatilho[] = [];
    let liberar: (() => void) | null = null;
    const promessa = new Promise<void>((res) => (liberar = res));
    instalarMencoes({
      executores: {
        rodar: async (_agente: string, _ordem: string, _ws: string, gatilho?: Gatilho) => {
          recebidos.push(gatilho ?? { tipo: "manual", origem: "" });
          liberar?.();
          return { id: "sess-fake", captura: "ok" };
        },
      },
      agora: () => new Date(),
    });
    const tasks = new TaskStore({ agora: () => new Date() });
    const t = await tasks.criar(wsPath, { titulo: "task com menção" });
    await tasks.mensagem(wsPath, t.id, {
      autor: "humano",
      corpo: "por favor @executor-padrao assuma isto",
    });
    await promessa;
    await Promise.allSettled(pendentesMencoes());
    expect(recebidos).toEqual([{ tipo: "mencao", origem: `${t.id}/executor-padrao` }]);
  });

  it("ledger: múltiplos motores no mesmo workspace distinguem origem pelo gatilho", async () => {
    const home = raizes[raizes.push(mkdtempSync(join(tmpdir(), "opencorp-gatilho-db-"))) - 1]!;
    const db = new CorpDb(join(home, "corp.db"));
    const base = {
      modelo: "m",
      status: "concluido",
      fim: "2026-08-31T10:00:00Z",
      duracao_ms: 100,
      custo_usd: 0.01,
      exit_code: 0,
    };
    const gatilhosDe = [
      { id: "exec-cron", agente: "auditor", gatilho_tipo: "cron", gatilho_origem: "sch-1" },
      { id: "exec-mencao", agente: "revisor", gatilho_tipo: "mencao", gatilho_origem: "tsk_9/auditor" },
      { id: "exec-flow", agente: "redator", gatilho_tipo: "dependencia", gatilho_origem: "flow:ed/passo" },
      { id: "exec-team", agente: "sintetizador", gatilho_tipo: "padrao", gatilho_origem: "team:ed/síntese" },
      { id: "exec-turno", agente: "secretario", gatilho_tipo: "turno", gatilho_origem: "reuniao-1" },
      { id: "exec-manual", agente: "executor-padrao", gatilho_tipo: "manual", gatilho_origem: "" },
    ];
    gatilhosDe.forEach((g, i) => {
      db.upsertExecucao({
        ...base,
        ...g,
        inicio: `2026-08-31T09:5${i}:00Z`,
      });
    });
    expect(db.listarExecucoes({ limite: 50 }).map((e) => e.gatilho_tipo)).toEqual([
      "manual", "turno", "padrao", "dependencia", "mencao", "cron",
    ]);
    db.fechar();
  });
});
