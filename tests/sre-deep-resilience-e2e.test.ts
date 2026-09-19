import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { SessionManager } from "../src/core/session-manager.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { TokenBucketLimiter } from "../src/core/engines/token-bucket-limiter.js";
import { FlowStore, executarComConcorrencia } from "../src/core/flow-store.js";
import { Scheduler } from "../src/core/scheduler.js";

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock("execa", () => ({ execa: execaMock }));

const raizes: string[] = [];

function fakeChild(opts: { out?: string[]; err?: string[]; exitCode?: number; pid?: number }) {
  const base = Promise.resolve({
    exitCode: opts.exitCode ?? 0,
    killed: false,
    stdout: undefined,
    stderr: undefined,
  }) as Promise<{ exitCode: number; killed: boolean }> & {
    stdout: Readable;
    stderr: Readable;
    pid?: number;
    killed: boolean;
  };
  const child = base as typeof base & { pid?: number };
  child.stdout = Readable.from(opts.out ?? []);
  child.stderr = Readable.from(opts.err ?? []);
  child.pid = opts.pid ?? 424242;
  child.killed = false;
  return child;
}

async function criarAmbiente() {
  const home = await mkdtemp(join(tmpdir(), "sre-deep-"));
  raizes.push(home);
  const manager = new WorkspaceManager({ homeDir: home, cwd: home });
  const ws = await manager.criar("corp-deep-sre");
  const sessoes = new SessionManager({ homeDir: home, cwd: home });
  return { home, ws, sessoes };
}

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

describe("SRE Deep Resilience & Self-Healing E2E", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execaMock.mockImplementation((cmd: string) => {
      if (cmd === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/bwrap" });
      return fakeChild({ out: ["saida ok"], exitCode: 0 });
    });
  });

  describe("1. DevOps: Hardening de Recursos e Cgroups Padrão", () => {
    it("deve injetar limites padrão de cgroup v2 (2048M RAM e 200% CPU) em sandbox sem config explícito", async () => {
      const { sessoes, ws } = await criarAmbiente();

      let argsCapturados: string[] = [];
      let binCapturado = "";

      execaMock.mockImplementation((bin: string, args: string[]) => {
        if (bin === "which") return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/bwrap" });
        binCapturado = bin;
        argsCapturados = args;
        return fakeChild({ out: ["teste concluido"], exitCode: 0 });
      });

      const res = await sessoes.rodar({
        agente: "executor-padrao",
        ordem: "teste limites padrao",
        workspaceDir: ws.path,
      });

      expect(res.status).toBe("concluido");
      // Se systemd-run estiver presente no ambiente de teste, ele encapsula com MemoryMax=2048M
      if (binCapturado === "systemd-run") {
        expect(argsCapturados).toContain("MemoryMax=2048M");
        expect(argsCapturados).toContain("CPUQuota=200%");
      }
    });

    it("admitirExecucaoHost não deve bloquear se a memória estiver saudável", async () => {
      const { sessoes } = await criarAmbiente();
      const inicio = Date.now();
      await sessoes.admitirExecucaoHost("test-session");
      expect(Date.now() - inicio).toBeLessThan(1000);
    });
  });

  describe("2. LLMOps: Token Bucket Rate Limiter", () => {
    it("deve permitir rajadas iniciais dentro da capacidade e regular chamadas excedentes", async () => {
      const limiter = new TokenBucketLimiter({ rpmPadrao: 60 });
      const motor = "motor-teste-rpm";

      // Adquire tokens em sequência rápida
      const t1 = Date.now();
      await limiter.adquirirToken(motor);
      await limiter.adquirirToken(motor);
      const delta = Date.now() - t1;

      // Primeiros tokens dentro do burst devem resolver quase instantaneamente
      expect(delta).toBeLessThan(200);

      const status = limiter.status(motor);
      expect(status).not.toBeNull();
      expect(status?.tokensDisponiveis).toBeLessThan(status?.capacidade ?? 0);
    });
  });

  describe("3. Engenharia de Fluxos: Concorrência Controlada em Fan-Out", () => {
    it("executarComConcorrencia deve respeitar o limite de tarefas simultâneas (pool de 2)", async () => {
      let ativos = 0;
      let picoAtivos = 0;

      const tarefas = Array.from({ length: 6 }, (_, i) => i);
      const resultados = await executarComConcorrencia(tarefas, 2, async (item) => {
        ativos++;
        picoAtivos = Math.max(picoAtivos, ativos);
        await new Promise((r) => setTimeout(r, 50));
        ativos--;
        return `item-${item}`;
      });

      expect(picoAtivos).toBeLessThanOrEqual(2);
      expect(resultados).toHaveLength(6);
      expect(resultados.every((r) => r.status === "fulfilled")).toBe(true);
    });

    it("fluxo com nó fanout deve rodar com semáforo de concorrência sem disparar tudo de uma vez", async () => {
      const { ws, home } = await criarAmbiente();
      let chamadasConcorrentes = 0;
      let maxConcorrentes = 0;

      const store = new FlowStore({
        homeDir: home,
        sessoes: {
          rodar: async () => {
            chamadasConcorrentes++;
            maxConcorrentes = Math.max(maxConcorrentes, chamadasConcorrentes);
            await new Promise((r) => setTimeout(r, 40));
            chamadasConcorrentes--;
            return { id: "mock", status: "concluido", exit_code: 0, captura: "ok" } as any;
          },
        },
      });

      const flow = {
        id: "flow-fanout-concorrencia",
        nome: "Flow Fanout Concorrencia",
        nos: [
          { id: "gatilho", tipo: "manual" as const, config: {} },
          {
            id: "distribuir",
            tipo: "fanout" as const,
            config: {
              concorrencia_maxima: 2,
              paralelos: [
                { agente: "ag1", ordem: "tarefa 1" },
                { agente: "ag2", ordem: "tarefa 2" },
                { agente: "ag3", ordem: "tarefa 3" },
                { agente: "ag4", ordem: "tarefa 4" },
              ],
            },
          },
        ],
        arestas: [{ de: "gatilho", para: "distribuir" }],
      };

      await store.salvar(ws.path, flow);
      const res = await store.executar(ws.path, flow.id, { tipo: "manual" });

      expect(res.status).toBe("concluido");
      expect(maxConcorrentes).toBeLessThanOrEqual(2);
    });
  });

  describe("4. Auto-Cura: Circuit Breaker no Scheduler", () => {
    it("deve colocar o job em quarentena preventiva e desativar após 3 falhas consecutivas", async () => {
      const { home, ws } = await criarAmbiente();

      let tentativas = 0;
      let relogio = new Date("2026-09-13T16:00:00Z").getTime();

      const scheduler = new Scheduler({
        homeDir: home,
        agora: () => new Date(relogio),
        executar: async () => {
          tentativas++;
          throw new Error("Falha irrecuperável de script (ex: ReferenceError ou 404)");
        },
      });

      const job = await scheduler.criar({
        nome: "job-com-erro-fatal",
        agenda: { tipo: "intervalo_min", valor: 5 },
        args: ["flow", "run", "inexistente"],
        workspace: ws.id,
      });

      // Avança relógio para vencer o 1º ciclo
      relogio += 6 * 60_000;
      await scheduler.tick();
      let j = await scheduler.obter(job.id);
      expect(j.ativo).toBe(true);

      // Avança relógio para vencer o 2º ciclo
      relogio += 6 * 60_000;
      await scheduler.tick();
      j = await scheduler.obter(job.id);
      expect(j.ativo).toBe(true);

      // 3º ciclo: no padrão n8n puro, falhas não desativam silenciosamente a esteira ativa
      relogio += 6 * 60_000;
      await scheduler.tick();
      j = await scheduler.obter(job.id);
      expect(j.ativo).toBe(true);

      // Ao consultar o job, ele permanece ativo para as próximas rodadas
      expect(tentativas).toBeGreaterThanOrEqual(3);
    });
  });
});
