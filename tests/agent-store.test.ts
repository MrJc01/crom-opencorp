import { afterAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { AgentError, } from "../src/core/errors.js";
import { AgentStore } from "../src/core/agent-store.js";
import { AgentSchemaError } from "../src/schemas/agent.js";

const raizes: string[] = [];

async function ambiente() {
  const home = await mkdtemp(join(tmpdir(), "opencorp-agent-"));
  raizes.push(home);
  const manager = new WorkspaceManager({ homeDir: home, cwd: home });
  const ws = await manager.criar("corp-ag");
  return { home, ws, store: new AgentStore() };
}

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

describe("AgentStore — criar", () => {
  it("cria a partir de executor-padrao mantendo o modelo da origem", async () => {
    const { ws, store } = await ambiente();
    const r = await store.criar(ws.path, "auditor", {});
    expect(r.frontmatter.id).toBe("auditor");
    expect(r.frontmatter.model).toBe("opencode/nemotron-3-ultra-free");
    expect(r.frontmatter.category).toBe("operario");
    expect(existsSync(r.path)).toBe(true);
    expect(r.corpo).toContain("executor padrão");
  });

  it("--model sobrepõe o modelo da origem", async () => {
    const { ws, store } = await ambiente();
    const r = await store.criar(ws.path, "auditor", { model: "opencode/mimo-v2.5-free" });
    expect(r.frontmatter.model).toBe("opencode/mimo-v2.5-free");
    const bruto = readFileSync(r.path!, "utf8");
    expect(bruto).toContain("model: opencode/mimo-v2.5-free");
    expect(bruto).toContain("daily_usd: 1.00");
  });

  it("normaliza o id (espaços/underscores/maiúsculas)", async () => {
    const { ws, store } = await ambiente();
    const r = await store.criar(ws.path, "Auditor Fiscal_X", {});
    expect(r.frontmatter.id).toBe("auditor-fiscal-x");
    expect(existsSync(join(ws.path, ".opencorp", "agents", "auditor-fiscal-x.md"))).toBe(true);
  });

  it("rejeita id duplicado", async () => {
    const { ws, store } = await ambiente();
    await store.criar(ws.path, "auditor", {});
    const err = await store.criar(ws.path, "auditor", {}).catch((e) => e);
    expect(err).toBeInstanceOf(AgentError);
    expect(err.message).toContain("já existe");
  });

  it("rejeita origem inexistente", async () => {
    const { ws, store } = await ambiente();
    const err = await store.criar(ws.path, "novo", { de: "fantasma" }).catch((e) => e);
    expect(err).toBeInstanceOf(AgentError);
    expect(err.message).toContain("origem");
  });

  it("gera o arquivo do bridge opencode na criação", async () => {
    const { ws, store } = await ambiente();
    await store.criar(ws.path, "auditor", {});
    const bridgeFile = join(ws.path, ".opencorp", "opencode", "agent", "auditor.md");
    expect(existsSync(bridgeFile)).toBe(true);
    expect(existsSync(join(ws.path, ".opencode", "agent", "auditor.md"))).toBe(true);
  });
});

describe("AgentStore — clone/listar/carregar", () => {
  it("clona agente do workspace e registra evento clonado", async () => {
    const { ws, store } = await ambiente();
    await store.criar(ws.path, "auditor", {});
    const journalPath = join(ws.path, ".opencorp", "registries", "agentes", "agentes-log", "journal.jsonl");
    const antes = readFileSync(journalPath, "utf8");
    const linhasAntes = antes.trim().split("\n");
    expect(linhasAntes).toHaveLength(2);
    expect(linhasAntes[0]).toContain('"evento":"criado"');
    expect(linhasAntes[1]).toContain('"evento":"criado"');
    await store.clonar(ws.path, "auditor", "auditor-rapido");
    const depois = readFileSync(journalPath, "utf8");
    const linhas = depois.trim().split("\n");
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toBe(linhasAntes[0]);
    expect(linhas[1]).toBe(linhasAntes[1]);
    expect(linhas[2]).toContain('"evento":"clonado"');
    expect(existsSync(join(ws.path, ".opencorp", "agents", "auditor-rapido.md"))).toBe(true);
  });

  it("clonar para o mesmo id falha", async () => {
    const { ws, store } = await ambiente();
    const err = await store.clonar(ws.path, "executor-padrao", "executor-padrao").catch((e) => e);
    expect(err).toBeInstanceOf(AgentError);
    expect(err.message).toContain("iguais");
  });

  it("listar retorna os agentes ordenados com resumo completo", async () => {
    const { ws, store } = await ambiente();
    await store.criar(ws.path, "auditor", {});
    const agentes = await store.listar(ws.path);
    expect(agentes.map((a) => a.id)).toEqual(["auditor", "ceo-documentos", "executor-padrao", "secretario", "secretario-exec"]);
    const auditor = agentes.find((a) => a.id === "auditor")!;
    expect(auditor.permissions).toBe("level-2");
    expect(auditor.budget_daily_usd).toBe(1);
  });

  it("carregar agente inexistente falha com AgentError", async () => {
    const { ws, store } = await ambiente();
    const err = await store.carregar(ws.path, "fantasma").catch((e) => e);
    expect(err).toBeInstanceOf(AgentError);
    expect(err.message).toContain("não encontrado");
  });

  it("arquivo de agente inválido é rejeitado apontando o campo", async () => {
    const { ws, store } = await ambiente();
    const { writeFileAtomic } = await import("../src/utils/fs-safe.js");
    await writeFileAtomic(
      join(ws.path, ".opencorp", "agents", "quebrado.md"),
      "---\nid: quebrado\nrole: X\ncategory: patrao\nmodel: a/b\ntools: [read]\npermissions: level-1\nbudget:\n  daily_usd: 1\n  max_turns: 5\nmemory:\n  reads: []\n  writes: []\n---\n\ncorpo\n",
    );
    const err = await store.listar(ws.path).catch((e) => e);
    expect(err).toBeInstanceOf(AgentSchemaError);
    expect(err.message).toContain("(quebrado.md)");
    expect(err.message).toContain('"category"');
  });

  it("posEditar re-sincroniza o bridge quando o arquivo muda", async () => {
    const { ws, store } = await ambiente();
    await store.criar(ws.path, "auditor", {});
    const { writeFileAtomic } = await import("../src/utils/fs-safe.js");
    const path = join(ws.path, ".opencorp", "agents", "auditor.md");
    await writeFileAtomic(path, readFileSync(path, "utf8").replace("permissions: level-2", "permissions: level-3"));
    await store.posEditar(ws.path, "auditor", true);
    const bridgeFile = readFileSync(join(ws.path, ".opencorp", "opencode", "agent", "auditor.md"), "utf8");
    expect(bridgeFile).toContain("webfetch: allow");
  });
});
