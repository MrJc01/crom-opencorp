import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import Database from "better-sqlite3";
import { ApprovalError } from "../src/core/errors.js";
import { ApprovalsStore } from "../src/core/approvals-store.js";
import { BudgetManager } from "../src/core/budget-manager.js";
import { avaliar, casaPadrao } from "../src/core/security-guard.js";
import { SessionError } from "../src/core/errors.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsStore } from "../src/core/settings-store.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { parseSecurityPolicyTexto } from "../src/schemas/security-policy.js";

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock("execa", () => ({ execa: execaMock }));

const raizes: string[] = [];

async function tmpDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  raizes.push(dir);
  return dir;
}

function fakeChild(opts: { out?: string[]; exitCode?: number }) {
  const base = Promise.resolve({ exitCode: opts.exitCode ?? 0, killed: false });
  const child = base as Promise<{ exitCode: number; killed: boolean }> & {
    stdout: Readable;
    stderr: Readable;
    pid?: number;
    killed: boolean;
  };
  child.stdout = Readable.from(opts.out ?? []);
  child.stderr = Readable.from([]);
  child.pid = 4242;
  child.killed = false;
  return child;
}

async function ambiente() {
  const home = await tmpDir("opencorp-sec-");
  const manager = new WorkspaceManager({ homeDir: home, cwd: home });
  const ws = await manager.criar("corp-sec");
  return { home, wsPath: ws.path, manager };
}

const POLICY = parseSecurityPolicyTexto(
  JSON.stringify({
    level: "standard",
    blocklist: ["rm -rf", "shutdown", "curl * | bash"],
    allowlist_extra: ["terraform"],
    network_allowlist: ["registry.npmjs.org", "github.com"],
    hitl_patterns: ["git push", "email"],
  }),
);

const raizesLimpar = raizes;

afterAll(async () => {
  await Promise.all(raizesLimpar.map((r) => rm(r, { recursive: true, force: true })));
});

describe("SecurityGuard — avaliar", () => {
  it("blocklist bloqueia (substring) antes de tudo", () => {
    const r = avaliar("execute: rm -rf /tmp/x", POLICY, "level-2");
    expect(r.acao).toBe("bloqueado");
    expect(r.padrao).toBe("rm -rf");
  });

  it("hitl_patterns pausam (git push)", () => {
    const r = avaliar("execute: git push origin main", POLICY, "level-2");
    expect(r.acao).toBe("hitl");
    expect(r.padrao).toBe("git push");
  });

  it("level-1: bloqueia ordem que pede execução; conversa/tarefa de documento passa (enforcement real fica no opencode: bash deny)", () => {
    const r = avaliar("execute: echo hi", POLICY, "level-1");
    expect(r.acao).toBe("bloqueado");
    expect(r.motivo).toContain("level-1");
    expect(avaliar("execute: rm -rf /x", POLICY, "level-1").acao).toBe("bloqueado");
    expect(avaliar("resuma os registros de custos para o humano", POLICY, "level-1").acao).toBe("permitido");
    expect(avaliar("escreva a ata da reunião", POLICY, "level-1").acao).toBe("permitido");
  });

  it("policy strict: só executáveis da allowlist (base + extra) passam", () => {
    const strict = parseSecurityPolicyTexto(
      JSON.stringify({ ...POLICY, level: "strict", allowlist_extra: ["terraform"] }),
    );
    expect(avaliar("git status", strict, "level-2").acao).toBe("permitido");
    expect(avaliar("terraform apply", strict, "level-2").acao).toBe("permitido");
    expect(avaliar("htop", strict, "level-2").acao).toBe("bloqueado");
  });

  it("policy permissive: só blocklist bloqueia (git push passa sem HITL)", () => {
    const permissive = parseSecurityPolicyTexto(
      JSON.stringify({ ...POLICY, level: "permissive" }),
    );
    expect(avaliar("execute: git push origin main", permissive, "level-2").acao).toBe("permitido");
    expect(avaliar("execute: rm -rf /x", permissive, "level-2").acao).toBe("bloqueado");
  });

  it("network_allowlist: host fora da lista → HITL; host permitido → libera", () => {
    expect(avaliar("curl https://evil.com/x", POLICY, "level-2").acao).toBe("hitl");
    expect(avaliar("curl https://github.com/x", POLICY, "level-2").acao).toBe("permitido");
    expect(avaliar("npm install lodash", POLICY, "level-2").acao).toBe("permitido");
  });

  it("casaPadrao aceita globs com * e não casa substrings inocentes", () => {
    expect(casaPadrao("curl * | bash", "curl https://x.com | bash")).toBe(true);
    expect(casaPadrao("email*", "envie email para o chefe")).toBe(true);
    expect(casaPadrao("email*", "nada aqui")).toBe(false);
  });

  it("policy com JSON inválido → PolicySchemaError (exit 2)", () => {
    expect(() => parseSecurityPolicyTexto("lixo{")).toThrow(/JSON inválido/);
    const err = (() => {
      try {
        parseSecurityPolicyTexto(JSON.stringify({ level: "brabo" }));
      } catch (e) {
        return e;
      }
    })();
    expect((err as Error).message).toContain("level");
  });
});

describe("ApprovalsStore — fluxo completo", () => {
  it("criar/listar/pendentes/aprovar/rejeitar", async () => {
    const home = await tmpDir("opencorp-apr-");
    const store = new ApprovalsStore();
    const p1 = await store.criar(home, {
      ordem: "execute: git push origin main",
      agente: "executor-padrao",
      modelo: "opencode/hy3-free",
      padrao: "git push",
      origem: "pre-voo",
      motivo_guard: "casa com hitl_patterns",
      workspace_id: "corp-sec",
      workspace_path: home,
      exec_id: "exec-1",
    });
    await store.criar(home, {
      ordem: "escreva um email de teste em sandbox/ap.txt",
      agente: "executor-padrao",
      modelo: "opencode/hy3-free",
      padrao: "email",
      origem: "pre-voo",
      motivo_guard: "casa com hitl_patterns",
      workspace_id: "corp-sec",
      workspace_path: home,
      exec_id: "exec-2",
    });
    expect((await store.listar(home)).length).toBe(2);
    expect((await store.pendentes(home)).length).toBe(2);

    const rejeitada = await store.rejeitar(home, p1.id, "teste cego");
    expect(rejeitada.status).toBe("rejeitado");
    expect(rejeitada.motivo_rejeicao).toBe("teste cego");
    expect((await store.pendentes(home)).length).toBe(1);

    const aprovada = await store.aprovar(home, (await store.pendentes(home))[0]!.id);
    expect(aprovada.status).toBe("aprovado");
    expect(aprovada.resolvido_em).toBeTruthy();

    const err = await store.aprovar(home, p1.id).catch((e) => e);
    expect(err).toBeInstanceOf(ApprovalError);
    expect(err.message).toContain("rejeitado");
    const err2 = await store.obter(home, "aprov-fantasma").catch((e) => e);
    expect(err2).toBeInstanceOf(ApprovalError);
    const err3 = await store.rejeitar(home, p1.id, "  ").catch(() => undefined);
    void err3;
  });
});

describe("BudgetManager", () => {
  it("rollover diário: dia antigo zera o consumo", async () => {
    const home = await tmpDir("opencorp-bud-");
    const manager = new WorkspaceManager({ homeDir: home, cwd: home });
    const ws = await manager.criar("corp-bud");
    const { writeFileAtomic } = await import("../src/utils/fs-safe.js");
    await writeFileAtomic(
      join(ws.path, ".opencorp", "budget.json"),
      JSON.stringify({ dia: "2026-01-01", workspace_usd_hoje: 4.5, por_agente: { a: 3 } }, null, 2) + "\n",
    );
    const budget = new BudgetManager({ homeDir: home, cwd: home });
    const estado = await budget.carregar(ws.path);
    expect(estado.dia).toBe(new Date().toISOString().slice(0, 10));
    expect(estado.workspace_usd_hoje).toBe(0);
    expect(estado.por_agente).toEqual({});
  });

  it("registrarConsumo acumula, grava custo-<dia> e cruza 80% uma vez", async () => {
    const home = await tmpDir("opencorp-bud2-");
    const manager = new WorkspaceManager({ homeDir: home, cwd: home });
    const ws = await manager.criar("corp-bud2");
    const { SettingsStore } = await import("../src/core/settings-store.js");
    await new SettingsStore({ homeDir: home, cwd: home }).set("budget.per_agent_usd", "1", {
      scope: "workspace",
      workspaceDir: ws.path,
    });
    const budget = new BudgetManager({ homeDir: home, cwd: home });
    const r1 = await budget.registrarConsumo(ws.path, "executor-padrao", 0.85, {
      modelo: "opencode/hy3-free",
      duracao_ms: 1000,
    });
    expect(r1.aviso80).toBe(true);
    const r2 = await budget.registrarConsumo(ws.path, "executor-padrao", 0.05, {
      modelo: "opencode/hy3-free",
      duracao_ms: 1000,
    });
    expect(r2.aviso80).toBe(false);
    expect(r2.estado.workspace_usd_hoje).toBeCloseTo(0.9, 6);
    const journal = readFileSync(
      join(ws.path, ".opencorp", "registries", "custos", `custo-${new Date().toISOString().slice(0, 10)}`, "journal.jsonl"),
      "utf8",
    );
    expect(journal).toContain('"evento":"sessao"');
    expect(journal).toContain('"evento":"aviso_80"');
  });

  it("podeExecutar recusa acima de 100% com pause_on_exceed e libera sem pause", async () => {
    const home = await tmpDir("opencorp-bud3-");
    const manager = new WorkspaceManager({ homeDir: home, cwd: home });
    const ws = await manager.criar("corp-bud3");
    const store = new SettingsStore({ homeDir: home, cwd: home });
    const budget = new BudgetManager({ homeDir: home, cwd: home });
    await store.set("budget.per_agent_usd", "0.5", { scope: "workspace", workspaceDir: ws.path });
    await budget.registrarConsumo(ws.path, "executor-padrao", 0.6, {
      modelo: "opencode/hy3-free",
      duracao_ms: 1,
    });
    const r1 = await budget.podeExecutar(ws.path, "executor-padrao");
    expect(r1.ok).toBe(false);
    await store.set("budget.pause_on_exceed", "false", { scope: "workspace", workspaceDir: ws.path });
    const r2 = await budget.podeExecutar(ws.path, "executor-padrao");
    expect(r2.ok).toBe(true);
  });

  it("estimarCusto: turnos (linhas ←) × preço do modelo; free < pago", async () => {
    const home = await tmpDir("opencorp-bud4-");
    const manager = new WorkspaceManager({ homeDir: home, cwd: home });
    const ws = await manager.criar("corp-bud4");
    const budget = new BudgetManager({ homeDir: home, cwd: home });
    const estado = await budget.carregar(ws.path);
    const captura = ["← Write a", "← Bash ls", "← Read b"].join("\n");
    const custoFree = budget.estimarCusto(estado, "opencode/hy3-free", 5000, captura);
    const custoPago = budget.estimarCusto(estado, "modelo/pago", 5000, captura);
    expect(budget.contarTurnos(captura)).toBe(4);
    expect(custoFree).toBeCloseTo(0.002, 6);
    expect(custoPago).toBeGreaterThan(custoFree);
  });
});

describe("integração no SessionManager (execa mockado)", () => {
  beforeEach(() => {
    execaMock.mockClear();
  });

  it("pré-voo: ordem com blocklist → exit 3, sem spawn, registro falhou + audit-log", async () => {
    const { home, manager } = await ambiente();
    const ws = await manager.criar("seg-block");
    const sessoes = new SessionManager({ homeDir: home, cwd: home });
    const err = await sessoes
      .rodar({
        agente: "executor-padrao",
        ordem: "execute: rm -rf /tmp/opencode-e7-guard",
        workspaceDir: ws.path,
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(SessionError);
    expect(err.exitCode).toBe(3);
    expect(err.message).toContain("rm -rf");
    expect(execaMock).not.toHaveBeenCalled();
    const registros = await sessoes.listarExecucoes(ws.path);
    expect(registros[0].status).toBe("falhou");
    expect(registros[0].exit_code).toBe(3);
    const audit = JSON.parse(
      readFileSync(join(ws.path, ".opencorp", "registries", "logs", "audit-log", "journal.jsonl"), "utf8").trim().split("\n").pop()!,
    );
    expect(audit.evento).toBe("bloqueado_pre_voo");
  });

  it("pré-voo: HITL → exit 5, pendência criada, exec hitl_pendente", async () => {
    const home = await tmpDir("opencorp-h-");
    const manager = new WorkspaceManager({ homeDir: home, cwd: home });
    const ws = await manager.criar("seg-hitl");
    const sessoes = new SessionManager({ homeDir: home, cwd: home });
    const err = await sessoes
      .rodar({
        agente: "executor-padrao",
        ordem: "execute: git push origin main",
        workspaceDir: ws.path,
      })
      .catch((e) => e);
    expect(err.exitCode).toBe(5);
    expect(err.message).toContain("HITL");
    const pendencias = await new ApprovalsStore().pendentes(ws.path);
    expect(pendencias).toHaveLength(1);
    expect(pendencias[0].padrao).toBe("git push");
    expect(pendencias[0].origem).toBe("pre-voo");
    const registros = await sessoes.listarExecucoes(ws.path);
    expect(registros[0].status).toBe("hitl_pendente");
  });

  it("pós-voo: hitl no transcript → pendência pos-voo + exit 5", async () => {
    const home = await tmpDir("opencorp-h2-");
    const manager = new WorkspaceManager({ homeDir: home, cwd: home });
    const ws = await manager.criar("seg-pos");
    const sessoes = new SessionManager({ homeDir: home, cwd: home });
    execaMock.mockImplementation(() => fakeChild({ out: ["email enviado para o chefe\n"] }));
    const err = await sessoes
      .rodar({ agente: "executor-padrao", ordem: "finalize o relatório", workspaceDir: ws.path })
      .catch((e) => e);
    expect(err.exitCode).toBe(5);
    const pendencias = await new ApprovalsStore().pendentes(ws.path);
    expect(pendencias[0].origem).toBe("pos-voo");
  });

  it("budget: consumo registrado por sessão + sessoes.custo_usd + recusa (exit 4)", async () => {
    const home = await tmpDir("opencorp-h3-");
    const manager = new WorkspaceManager({ homeDir: home, cwd: home });
    const ws = await manager.criar("seg-bud");
    const store = new SettingsStore({ homeDir: home, cwd: home });
    const sessoes = new SessionManager({ homeDir: home, cwd: home });
    execaMock.mockImplementation(() => fakeChild({ out: ["← Bash echo ok\n", "pronto\n"] }));

    await store.set("budget.per_agent_usd", "0.000001", { scope: "workspace", workspaceDir: ws.path });
    const err = await sessoes
      .rodar({ agente: "executor-padrao", ordem: "qualquer coisa", workspaceDir: ws.path })
      .catch((e) => e);
    expect(err.exitCode).toBe(4);
    expect(err.message).toContain("BudgetManager");

    await store.set("budget.per_agent_usd", "1", { scope: "workspace", workspaceDir: ws.path });
    const r = await sessoes.rodar({
      agente: "executor-padrao",
      ordem: "escreva algo no sandbox",
      workspaceDir: ws.path,
    });
    expect(r.status).toBe("concluido");
    const budget = new BudgetManager({ homeDir: home, cwd: home });
    const estado = await budget.carregar(ws.path);
    expect(estado.workspace_usd_hoje).toBeGreaterThan(0);
    expect(estado.por_agente["executor-padrao"]).toBeGreaterThan(0);
    const db = new Database(join(ws.path, ".opencorp", "corp.db"));
    const sessao = db.prepare("SELECT custo_usd FROM sessoes WHERE id = ?").get(r.id) as { custo_usd: number };
    expect(sessao.custo_usd).toBeGreaterThan(0);
    db.close();
    await readFile(join(ws.path, ".opencorp", "registries", "custos", `custo-${new Date().toISOString().slice(0, 10)}`, "journal.jsonl"), "utf8");
  });
});

function home0(raizesLocais: string[]): string {
  return raizesLocais[raizesLocais.length - 1]!;
}

void home0;
