import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { RegistryStore } from "../src/core/registry-store.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { SettingsStore } from "../src/core/settings-store.js";
import {
  Supervisor,
  estaRodando,
  gravarPidfile,
  lerPidfile,
  removerPidfile,
  type PidInfo,
} from "../src/core/supervisor.js";
import type { OpcoesRun, ResultadoRun } from "../src/core/session-manager.js";

const raizes: string[] = [];

async function tmpDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  raizes.push(dir);
  return dir;
}

async function ambiente() {
  const home = await tmpDir("opencorp-sup-");
  const manager = new WorkspaceManager({ homeDir: home, cwd: home });
  const ws = await manager.criar("corp-sup");
  return { home, wsPath: ws.path, store: new SettingsStore({ homeDir: home, cwd: home }) };
}

async function criarExecucaoFalha(wsPath: string, id: string, criadoEm?: string): Promise<void> {
  const { mkdirSync } = await import("node:fs");
  const dir = join(wsPath, ".opencorp", "registries", "execucoes", id);
  mkdirSync(dir, { recursive: true });
  const { writeFileAtomic } = await import("../src/utils/fs-safe.js");
  await writeFileAtomic(
    join(dir, "meta.json"),
    JSON.stringify({
      id,
      categoria: "execucoes",
      descricao: `Ordem: teste de falha ${id}`,
      criado_por: "executor-padrao",
      criado_em: criadoEm ?? new Date().toISOString(),
      atualizado_em: criadoEm ?? new Date().toISOString(),
      permissoes: { leitura: ["*"], escrita: ["executor-padrao"], modificacao_meta: [] },
      tags: [],
      referencias: [],
      extras: { status: "falhou", modelo: "opencode/hy3-free", ordem: "x", exit_code: 1 },
    }, null, 2) + "\n",
  );
}

function resultadoFake(opcoes: OpcoesRun): ResultadoRun {
  return {
    id: `exec-${Math.random().toString(36).slice(2, 8)}`,
    agente: opcoes.agente,
    modelo: opcoes.model ?? "opencode/hy3-free",
    ordem: opcoes.ordem ?? "",
    inicio: new Date().toISOString(),
    fim: new Date().toISOString(),
    status: "concluido",
    exit_code: 0,
    duracao_ms: 10,
    pid: 1,
    log: "logs/x.log",
    captura: "ok",
    custo_usd: 0.0005,
  };
}

function sessaoFalsa(capturas?: string[]) {
  const rodar = vi.fn(async (opcoes: OpcoesRun) => {
    capturas?.push(opcoes.ordem ?? "");
    return resultadoFake(opcoes);
  });
  return rodar;
}

const raizesLimpar = raizes;

afterAll(async () => {
  await Promise.all(raizesLimpar.map((r) => rm(r, { recursive: true, force: true })));
});

async function lerJournalSupervisor(wsPath: string): Promise<{ evento: string; resumo: string; checks?: Record<string, number>; ordens?: unknown[]; recusas?: unknown[] }[]> {
  const bruto = readFileSync(
    join(wsPath, ".opencorp", "registries", "logs", "supervisor-log", "journal.jsonl"),
    "utf8",
  );
  return bruto
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l))
    .filter((e) => e.evento === "tick");
}

describe("Supervisor — tick (a) falhas → ordem cega", () => {
  it("emite ordem ao executor-padrao, registra no supervisor-log e marca a chave", async () => {
    const { home, wsPath } = await ambiente();
    await criarExecucaoFalha(wsPath, "exec-f1");
    const rodar = sessaoFalsa();
    const sup = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    const t1 = await sup.tick(wsPath);
    expect(rodar).toHaveBeenCalledTimes(1);
    const chamada = (rodar as ReturnType<typeof vi.fn>).mock.calls[0]![0] as OpcoesRun;
    expect(chamada.agente).toBe("executor-padrao");
    expect(chamada.ordem).toContain("exec-f1");
    expect(chamada.model).toBe("opencode/hy3-free");
    expect(t1.ordens).toHaveLength(1);
    expect(t1.checks.execucoes_falhas).toBe(1);

    const eventos = await lerJournalSupervisor(wsPath);
    expect(eventos[0].evento).toBe("tick");
    expect((eventos[0].ordens as unknown[]) ?? []).toHaveLength(1);
    const estado = await sup.lerEstado(wsPath);
    expect(estado.chaves_tratadas).toContain("execucao_falha:exec-f1:healing:1");
    expect(estado.ultimo_tick).toBeTruthy();
  });

  it("dedup: retries esgotados → escala-humano uma única vez (memória entre instâncias)", async () => {
    const { home, wsPath, store } = await ambiente();
    await criarExecucaoFalha(wsPath, "exec-f2");
    await store.set("healing.max_retries", "1", { scope: "workspace", workspaceDir: wsPath });
    const rodar = sessaoFalsa();
    const supA = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    await supA.tick(wsPath); // corrige (healing:1)
    expect(rodar).toHaveBeenCalledTimes(1);
    // nova instância = "restart": estado persistido evita reemissão
    const supB = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    const t2 = await supB.tick(wsPath); // tentativas 1 >= max 1 → escala
    expect(rodar).toHaveBeenCalledTimes(1);
    expect(t2.ordens).toHaveLength(0);
    expect(t2.escalacoes).toHaveLength(1);
    const t3 = await supB.tick(wsPath); // já escalada → nada
    expect(rodar).toHaveBeenCalledTimes(1);
    expect(t3.escalacoes).toHaveLength(0);
    expect(t3.ignorados).toHaveLength(0);
  });



  it("corte max_orders_per_tick: distribui entre ticks", async () => {
    const { home, wsPath, store } = await ambiente();
    for (let i = 1; i <= 5; i++) {
      await criarExecucaoFalha(wsPath, `exec-corte-${i}`);
    }
    await store.set("supervisor.max_orders_per_tick", "2", { scope: "workspace", workspaceDir: wsPath });
    const rodar = sessaoFalsa();
    const sup = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    const t1 = await sup.tick(wsPath);
    expect(t1.ordens).toHaveLength(2);
    const t2 = await sup.tick(wsPath);
    expect(t2.ordens).toHaveLength(2);
    const t3 = await sup.tick(wsPath);
    expect(t3.ordens).toHaveLength(2);
    expect(t3.escalacoes).toHaveLength(2);
    expect(rodar).toHaveBeenCalledTimes(6);
  });

  it("orçamento insuficiente (rodar exit 4) → recusa registrada, sem emitir e sem marcar (retenta depois)", async () => {
    const { home, wsPath } = await ambiente();
    await criarExecucaoFalha(wsPath, "exec-bud");
    let chamadas = 0;
    const rodar = vi.fn(async (opcoes: OpcoesRun) => {
      chamadas += 1;
      if (chamadas === 1) {
        const e = new Error("recusada pelo BudgetManager: orçamento diário esgotado");
        (e as { exitCode?: number }).exitCode = 4;
        throw e;
      }
      return resultadoFake(opcoes);
    });
    const sup = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    const t1 = await sup.tick(wsPath);
    expect(t1.ordens).toHaveLength(0);
    expect(t1.recusas).toHaveLength(1);
    expect(t1.recusas[0]!.motivo).toContain("BudgetManager");
    const estado = await sup.lerEstado(wsPath);
    expect(estado.chaves_tratadas).not.toContain("execucao_falha:exec-bud");
    const t2 = await sup.tick(wsPath);
    expect(t2.ordens).toHaveLength(1);
    expect(chamadas).toBe(2);
  });

  it("falha do spawn da ordem cega é capturada e não derruba o tick", async () => {
    const { home, wsPath } = await ambiente();
    await criarExecucaoFalha(wsPath, "exec-crash");
    const rodar = vi.fn(async () => {
      throw new Error("spawn ENOENT simulado");
    });
    const sup = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    const t1 = await sup.tick(wsPath);
    expect(t1.recusas).toHaveLength(1);
    expect(t1.ordens).toHaveLength(0);
    expect(rodar).toHaveBeenCalledTimes(1);
    const eventos = await lerJournalSupervisor(wsPath);
    expect(eventos).toHaveLength(1);
  });

  it("(b) approval jovem é contada mas não gera ordem; antiga gera", async () => {
    const { home, wsPath } = await ambiente();
    const approvals = new (await import("../src/core/approvals-store.js")).ApprovalsStore();
    await approvals.criar(wsPath, {
      ordem: "execute: git push origin main",
      agente: "executor-padrao",
      modelo: "opencode/hy3-free",
      padrao: "git push",
      origem: "pre-voo",
      motivo_guard: "teste",
      workspace_id: "corp-sup",
      workspace_path: wsPath,
      exec_id: "exec-hitl",
    });
    const rodar = sessaoFalsa();
    const sup = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    const t1 = await sup.tick(wsPath);
    expect(t1.checks.approvals_pendentes).toBe(1);
    expect(t1.checks.approvals_antigas).toBe(0);
    expect(rodar).not.toHaveBeenCalled();

    const antiga = JSON.parse(readFileSync(join(wsPath, ".opencorp", "approvals", `${(await approvals.listar(wsPath))[0]!.id}.json`), "utf8"));
    antiga.criado_em = new Date(Date.now() - 2 * 3600_000).toISOString();
    const { writeFileAtomic } = await import("../src/utils/fs-safe.js");
    await writeFileAtomic(join(wsPath, ".opencorp", "approvals", `${antiga.id}.json`), JSON.stringify(antiga, null, 2) + "\n");
    const t2 = await new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } }).tick(wsPath);
    expect(t2.checks.approvals_antigas).toBe(1);
    expect(t2.ordens).toHaveLength(1);
    expect((t2.ordens[0].ordem as string)).toContain(antiga.id);
  });

  it("(c) budget >80% é detectado e apenas registrado (sem ordem)", async () => {
    const { home, wsPath, store } = await ambiente();
    const { BudgetManager } = await import("../src/core/budget-manager.js");
    await store.set("budget.per_agent_usd", "0.5", { scope: "workspace", workspaceDir: wsPath });
    const budget = new BudgetManager({ homeDir: home, cwd: home });
    await budget.registrarConsumo(wsPath, "executor-padrao", 0.45, { modelo: "opencode/hy3-free", duracao_ms: 1 });
    const rodar = sessaoFalsa();
    const sup = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar }, budget });
    const t1 = await sup.tick(wsPath);
    expect(t1.checks.budget_80).toBe(1);
    expect(rodar).not.toHaveBeenCalled();
    const t2 = await new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar }, budget }).tick(wsPath);
    expect(t2.ignorados.some((c) => c.startsWith("budget_80:"))).toBe(true);
  });

  it("(d) tarefas delegadas da ata são detectadas e marcadas (v1: só registra)", async () => {
    const { home, wsPath } = await ambiente();
    const registros = new RegistryStore();
    await registros.garantirRegistro(wsPath, {
      categoria: "logs",
      id: "audit-log",
      descricao: "audit",
      criadoPor: "opencorp",
    });
    await registros.anexarEvento(wsPath, "logs", "audit-log", {
      ts: new Date().toISOString(),
      por: "opencorp",
      evento: "tarefa_delegada",
      dono: "executor-padrao",
      resumo: "revisar budget.json diariamente",
      origem: "reuniao:teste",
    });
    const rodar = sessaoFalsa();
    const sup = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    const t1 = await sup.tick(wsPath);
    expect(t1.checks.tarefas_delegadas).toBe(1);
    expect(rodar).not.toHaveBeenCalled();
    expect((await sup.lerEstado(wsPath)).chaves_tratadas.some((c) => c.startsWith("tarefa_delegada:"))).toBe(true);
  });
});

describe("Supervisor — pidfile/lock", () => {
  it("lock de duplicidade: pid vivo recusa, pid obsoleto permite", async () => {
    const { wsPath } = await ambiente();
    const vivo: PidInfo = {
      pid: process.pid,
      workspace_id: "corp-sup",
      workspace_path: wsPath,
      intervalo_minutes: 15,
      iniciado_em: new Date().toISOString(),
      ultimo_tick: null,
    };
    await gravarPidfile(wsPath, vivo);
    expect(await estaRodando(wsPath)).toBe(true);
    const obsoleto: PidInfo = { ...vivo, pid: 999999999 };
    await gravarPidfile(wsPath, obsoleto);
    expect(await estaRodando(wsPath)).toBe(false);
    await removerPidfile(wsPath);
    expect(await lerPidfile(wsPath)).toBeNull();
    expect(await estaRodando(wsPath)).toBe(false);
  });

  it("estado sobrevive ao restart (lerEstado da nova instância mantém chaves)", async () => {
    const { home, wsPath } = await ambiente();
    await criarExecucaoFalha(wsPath, "exec-restart");
    const rodar = sessaoFalsa();
    const sup1 = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    await sup1.tick(wsPath);
    const sup2 = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    expect((await sup2.lerEstado(wsPath)).chaves_tratadas).toContain("execucao_falha:exec-restart:healing:1");
  });
});
