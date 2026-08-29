import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { SessionManager } from "../src/core/session-manager.js";
import { Supervisor } from "../src/core/supervisor.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { RegistryStore, type MetaRegistro } from "../src/core/registry-store.js";
import { SettingsStore } from "../src/core/settings-store.js";
import type { OpcoesRun, ResultadoRun } from "../src/core/session-manager.js";

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock("execa", () => ({ execa: execaMock }));

const raizes: string[] = [];

async function tmpDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  raizes.push(dir);
  return dir;
}

async function ambiente() {
  const home = await tmpDir("opencorp-heal-");
  const manager = new WorkspaceManager({ homeDir: home, cwd: home });
  const ws = await manager.criar("corp-heal");
  return { home, wsPath: ws.path, store: new SettingsStore({ homeDir: home, cwd: home }) };
}

function sessaoFalsa() {
  const rodar = vi.fn(async (opcoes: OpcoesRun) => ({
    id: `exec-${Math.random().toString(36).slice(2, 8)}`,
    status: "concluido" as const,
    exit_code: 0,
  }));
  return { rodar };
}

function falhaFake(wsPath: string, id: string, extras: Record<string, unknown> = {}): void {
  const dir = join(wsPath, ".opencorp", "registries", "execucoes", id);
  mkdirSync(dir, { recursive: true });
  const meta: MetaRegistro = {
    id,
    categoria: "execucoes",
    descricao: `Ordem: falha de teste ${id}`,
    criado_por: "executor-padrao",
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    permissoes: { leitura: ["*"], escrita: ["executor-padrao"], modificacao_meta: [] },
    tags: [],
    referencias: [],
    extras: { status: "falhou", modelo: "opencode/hy3-free", ordem: "x", exit_code: 1, ...extras },
  };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
}

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

beforeEach(() => {
  execaMock.mockClear();
});

describe("Supervisor — self-healing", () => {
  it("ordem de correção carrega contexto (transcript + log) e metadados de healing", async () => {
    const { home, wsPath } = await ambiente();
    falhaFake(wsPath, "exec-h1");
    const { writeFileAtomic } = await import("../src/utils/fs-safe.js");
    const { mkdirSync: mkdirS } = await import("node:fs");
    const chatDir = join(wsPath, ".opencorp", "registries", "chats", "exec-h1");
    mkdirS(chatDir, { recursive: true });
    writeFileSync(
      join(chatDir, "meta.json"),
      JSON.stringify({
        id: "exec-h1",
        categoria: "chats",
        descricao: "transcript da execução falha",
        criado_por: "executor-padrao",
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        permissoes: { leitura: ["*"], escrita: ["executor-padrao"], modificacao_meta: [] },
        tags: [],
        referencias: [],
      }, null, 2) + "\n",
    );
    await writeFileAtomic(
      join(chatDir, "conteudo.md"),
      "## Turno 1\n\nexplode: arquivo inexistente\n",
    );
    mkdirS(join(wsPath, "logs"), { recursive: true });
    writeFileSync(join(wsPath, "logs", "exec-h1.log"), "stderr: ENOENT sandbox/inexistente.sh\n");
    const { rodar } = sessaoFalsa();
    const sup = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    await sup.tick(wsPath);
    expect(rodar).toHaveBeenCalledTimes(1);
    const chamada = (rodar as ReturnType<typeof vi.fn>).mock.calls[0]![0] as OpcoesRun;
    expect(chamada.ordem).toContain("CAUSA RAIZ");
    expect(chamada.ordem).toContain("exec-h1");
    expect(chamada.ordem).toContain("explode: arquivo inexistente");
    expect(chamada.ordem).toContain("ENOENT");
    expect(chamada.referencias).toEqual(["exec-h1"]);
    expect(chamada.tipo).toBe("healing");
  });

  it("bireferência: original ganha healing_tentativas + evento healing_disparado", async () => {
    const { home, wsPath } = await ambiente();
    falhaFake(wsPath, "exec-h2");
    const { rodar } = sessaoFalsa();
    const sup = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    const t1 = await sup.tick(wsPath);
    const original = JSON.parse(
      readFileSync(join(wsPath, ".opencorp", "registries", "execucoes", "exec-h2", "meta.json"), "utf8"),
    );
    expect(original.extras.healing_tentativas).toBe(1);
    const journal = readFileSync(
      join(wsPath, ".opencorp", "registries", "execucoes", "exec-h2", "journal.jsonl"),
      "utf8",
    );
    expect(journal).toContain('"evento":"healing_disparado"');
    expect(journal).toContain(t1.ordens[0]!.exec_id);
  });

  it("max_retries esgotado → escala-humano (sem ordem, marcada e auditada)", async () => {
    const { home, wsPath } = await ambiente();
    falhaFake(wsPath, "exec-h3", { healing_tentativas: 2 });
    const { rodar } = sessaoFalsa();
    const sup = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    const t1 = await sup.tick(wsPath);
    expect(rodar).not.toHaveBeenCalled();
    expect(t1.escalacoes).toHaveLength(1);
    const original = JSON.parse(
      readFileSync(join(wsPath, ".opencorp", "registries", "execucoes", "exec-h3", "meta.json"), "utf8"),
    );
    expect(original.extras.healing_escala_humano).toBe(true);
    const journal = readFileSync(
      join(wsPath, ".opencorp", "registries", "execucoes", "exec-h3", "journal.jsonl"),
      "utf8",
    );
    expect(journal).toContain('"evento":"escala_humano"');
    const audit = readFileSync(
      join(wsPath, ".opencorp", "registries", "logs", "audit-log", "journal.jsonl"),
      "utf8",
    );
    expect(audit).toContain('"evento":"escala_humano"');
  });

  it("healing.enabled=false → nenhuma ordem, apenas registra", async () => {
    const { home, wsPath, store } = await ambiente();
    falhaFake(wsPath, "exec-h4");
    await store.set("healing.enabled", "false", { scope: "workspace", workspaceDir: wsPath });
    const { rodar } = sessaoFalsa();
    const sup = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    const t1 = await sup.tick(wsPath);
    expect(rodar).not.toHaveBeenCalled();
    expect(t1.checks.execucoes_falhas).toBe(1);
    expect(t1.ordens).toHaveLength(0);
    expect((await sup.lerEstado(wsPath)).chaves_tratadas).toContain("execucao_falha:exec-h4");
  });

  it("correção (tipo healing) falha não re-triggera healing", async () => {
    const { home, wsPath } = await ambiente();
    falhaFake(wsPath, "exec-correcao", { tipo: "healing", healing_origem: "exec-original-x" });
    const { rodar } = sessaoFalsa();
    const sup = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    const t1 = await sup.tick(wsPath);
    expect(rodar).not.toHaveBeenCalled();
    expect(t1.checks.execucoes_falhas).toBe(0);
  });

  it("cadeia encerrada: correção de sucesso não gera nova tentativa e marca healing_ok no estado", async () => {
    const { home, wsPath } = await ambiente();
    falhaFake(wsPath, "exec-orig", { healing_tentativas: 1 });
    falhaFake(wsPath, "exec-correcao-ok", {
      tipo: "healing",
      healing_origem: "exec-orig",
      status: "concluido",
    });
    const { rodar } = sessaoFalsa();
    const sup = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    const t1 = await sup.tick(wsPath);
    expect(rodar).not.toHaveBeenCalled();
    expect(t1.ordens).toHaveLength(0);
    expect(t1.escalacoes).toHaveLength(0);
    const estado = await sup.lerEstado(wsPath);
    expect(estado.chaves_tratadas).toContain("healing_ok:exec-orig");
    const t2 = await sup.tick(wsPath);
    expect(t2.ordens).toHaveLength(0);
    expect(rodar).not.toHaveBeenCalled();
  });

  it("cadeia continua quando a correção ANTERIOR falhou (tentativa conta até max_retries)", async () => {
    const { home, wsPath } = await ambiente();
    falhaFake(wsPath, "exec-orig-f", { healing_tentativas: 1 });
    falhaFake(wsPath, "exec-correcao-falha", {
      tipo: "healing",
      referencias: ["exec-orig-f"],
      status: "falhou",
    });
    const { rodar } = sessaoFalsa();
    const sup = new Supervisor({ homeDir: home, cwd: home, sessoes: { rodar } });
    const t1 = await sup.tick(wsPath);
    expect(rodar).toHaveBeenCalledTimes(1);
    const chamada = (rodar as ReturnType<typeof vi.fn>).mock.calls[0]![0] as OpcoesRun;
    expect(chamada.referencias).toEqual(["exec-orig-f"]);
    expect(chamada.tipo).toBe("healing");
    expect(t1.escalacoes).toHaveLength(0);
  });
});

describe("SessionManager — referencias e tipo na execução de correção (execa mockado)", () => {
  it("execução de correção leva referencias=[original] e extras.tipo=healing", async () => {
    const { home, wsPath } = await ambiente();
    const sessoes = new SessionManager({ homeDir: home, cwd: home });
    execaMock.mockImplementation(() => {
      const base = Promise.resolve({ exitCode: 0, killed: false });
      const child = base as Promise<{ exitCode: number; killed: boolean }> & {
        stdout: Readable;
        stderr: Readable;
        pid?: number;
        killed: boolean;
      };
      child.stdout = Readable.from(["corrigido\n"]);
      child.stderr = Readable.from([]);
      child.pid = 4242;
      child.killed = false;
      return child;
    });
    const r = await sessoes.rodar({
      agente: "executor-padrao",
      ordem: "corrija a causa raiz",
      workspaceDir: wsPath,
      referencias: ["exec-original-9"],
      tipo: "healing",
    });
    const meta = JSON.parse(
      readFileSync(join(wsPath, ".opencorp", "registries", "execucoes", r.id, "meta.json"), "utf8"),
    );
    expect(meta.referencias).toEqual(["exec-original-9"]);
    expect(meta.extras.tipo).toBe("healing");

  });
});
