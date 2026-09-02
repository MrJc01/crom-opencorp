import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolError, ToolRegistry, validarContraSchema } from "../src/core/tool-registry.js";

const raizes: string[] = [];

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

let wsPath = "";
let home = "";
let registry: ToolRegistry;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "opencorp-tool-"));
  raizes.push(home);
  const { WorkspaceManager } = await import("../src/core/workspace-manager.js");
  const ws = await new WorkspaceManager({ homeDir: home, cwd: home }).criar("corp-tool");
  wsPath = ws.path;
  registry = new ToolRegistry({ homeDir: home });
});

describe("validação de schema", () => {
  const schema = {
    type: "object" as const,
    properties: {
      titulo: { type: "string" },
      n: { type: "number" },
      flag: { type: "boolean" },
      itens: { type: "array" },
    },
    required: ["titulo"],
  };
  it("aceita válido, recusa ausente e tipo errado", () => {
    expect(validarContraSchema({ titulo: "a" }, schema)).toBeNull();
    expect(validarContraSchema({ titulo: "a", n: 3 }, schema)).toBeNull();
    expect(validarContraSchema({}, schema)).toMatch(/ausente/);
    expect(validarContraSchema({ titulo: 1 }, schema)).toMatch(/deve ser string/);
    expect(validarContraSchema({ titulo: "a", itens: "x" }, schema)).toMatch(/deve ser array/);
    expect(validarContraSchema("não-objeto", schema)).toMatch(/objeto/);
  });
});

describe("ToolRegistry — built-ins", () => {
  it("lista built-ins incluindo task.* e query.sql", () => {
    const ids = registry.listar(wsPath, true).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["task.list", "task.create", "task.move", "task.chat", "query.sql", "http.get"]));
  });

  it("task.create + task.list + task.move funcionam no workspace", async () => {
    const r1 = await registry.executar("task.create", { titulo: "Via tool" }, wsPath);
    expect(r1.ok).toBe(true);
    const lista = JSON.parse((await registry.executar("task.list", {}, wsPath)).resultado) as { titulo: string }[];
    expect(lista.map((t) => t.titulo)).toContain("Via tool");
    const id = (JSON.parse((await registry.executar("task.list", {}, wsPath)).resultado) as { id: string; titulo: string }[]).find(
      (t) => t.titulo === "Via tool",
    )!.id;
    const r3 = await registry.executar("task.move", { id, coluna: "feito" }, wsPath);
    expect(r3.resultado).toContain("feito");
  });

  it("query.sql bloqueia não-SELECT", async () => {
    await expect(registry.executar("query.sql", { sql: "DELETE FROM registros" }, wsPath)).rejects.toThrow(/SELECT/);
    await expect(registry.executar("query.sql", { sql: "select 1; drop table x" }, wsPath)).rejects.toThrow(/;/);
  });

  it("input inválido → erro do schema", async () => {
    await expect(registry.executar("task.create", {}, wsPath)).rejects.toThrow(/ausente/);
    await expect(registry.executar("task.nada", {}, wsPath)).rejects.toThrow(/não encontrada/);
  });

  it("approval 'sempre' bloqueia sem --aprovado e libera com", async () => {
    await expect(registry.executar("http.get", { url: "http://127.0.0.1:9/x" }, wsPath)).rejects.toThrow(/aprovação/);
    await expect(registry.executar("http.get", { url: "http://127.0.0.1:9/x" }, wsPath, { aprovado: true })).rejects.toThrow(
      /ECONNREFUSED|fetch failed/,
    );
  });

  it("rate limit bloqueia excesso", async () => {
    const r = registry.obter("query.sql", wsPath);
    for (let i = 0; i < (r.rate_limit_min ?? 0); i++) {
      await registry.executar("query.sql", { sql: "select 1" }, wsPath).catch(() => undefined);
    }
    await expect(registry.executar("query.sql", { sql: "select 1" }, wsPath)).rejects.toThrow(/rate limit/);
  }, 30_000);
});

describe("ToolRegistry — manifests plugáveis", () => {
  it("carrega manifest do home e do workspace (ws sobrescreve)", async () => {
    await registry.criarManifesto(null, {
      id: "hello",
      titulo: "Hello",
      descricao: "ferramenta de teste via comando",
      inputSchema: { type: "object", properties: {} },
      handler: { tipo: "comando", comando: ["echo", "olá"] },
      approval: "nunca",
    });
    const ids = registry.listar(wsPath, true).map((f) => f.id);
    expect(ids).toContain("hello");
    const r = await registry.executar("hello", { x: 1 }, wsPath);
    expect(r.resultado).toContain("olá");
    void wsPath;
  });

  it("manifest inválido é rejeitado", async () => {
    await expect(
      registry.criarManifesto(null, { id: "", titulo: "", descricao: "", inputSchema: { type: "object" }, handler: { tipo: "comando", comando: [] } }),
    ).rejects.toThrow(ToolError);
  });
});

describe("MCP stdio", () => {
  it("tools/list e tools/call funcionam via binário", async () => {
    // CLI rodada do FONTE via tsx (bin/opencorp.mjs exigiria dist/ atualizado)
    const { garantirMcpToken } = await import("../src/cli/commands/tool.js");
    const cli = join(process.cwd(), "src", "cli", "index.ts");
    const child = execFile(
      process.execPath,
      ["--import", "tsx", cli, "mcp", "serve", "--token", garantirMcpToken(home)],
      {
        env: { ...process.env, OPENCORP_HOME: home },
        cwd: process.cwd(),
        timeout: 30_000,
      },
    );
    child.stdin!.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`);
    child.stdin!.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    child.stdin!.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
    child.stdin!.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "task.create", arguments: { titulo: "Via MCP" } } })}\n`,
    );
    child.stdin!.end();
    const saida: string[] = [];
    for await (const linha of child.stdout!) {
      saida.push(linha.toString());
      if (saida.length >= 3) break;
    }
    child.kill();
    const init = JSON.parse(saida[0]!) as { result: { serverInfo: { name: string } } };
    expect(init.result.serverInfo.name).toBe("opencorp");
    const lista = JSON.parse(saida[1]!) as { result: { tools: { name: string }[] } };
    expect(lista.result.tools.map((t) => t.name)).toContain("task.create");
    const chamada = JSON.parse(saida[2]!) as { result: { content: { text: string }[]; isError: boolean } };
    expect(chamada.result.isError).toBe(false);
    expect(chamada.result.content[0]!.text).toMatch(/tsk-.*criada/);
  });
});
