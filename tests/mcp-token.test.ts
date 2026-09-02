import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  caminhoMcpToken,
  garantirMcpToken,
  gravarMcpToken,
  validarMcpToken,
} from "../src/cli/commands/tool.js";

// O binário oficial (bin/opencorp.mjs) roda dist/ — nos testes a CLI é executada
// direto do FONTE via tsx, para não depender de build prévio.
const caminhoCli = join(process.cwd(), "src", "cli", "index.ts");

function argvCli(args: string[]): string[] {
  return ["--import", "tsx", caminhoCli, ...args];
}

const raizes: string[] = [];
let home = "";

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "opencorp-mcp-token-"));
  raizes.push(home);
});

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

function modo(path: string): number {
  return statSync(path).mode & 0o777;
}

describe("validarMcpToken (pura)", () => {
  it("aceita token igual (string ou env)", () => {
    expect(validarMcpToken("abc123", "abc123")).toBeNull();
  });

  it("recusa token ausente/vazio com mensagem clara", () => {
    const erro = validarMcpToken(undefined, "abc123");
    expect(erro).toMatch(/token obrigatório/);
    expect(validarMcpToken("", "abc123")).toMatch(/token obrigatório/);
  });

  it("recusa token errado (mesmo tamanho ou não)", () => {
    expect(validarMcpToken("xxxxxx", "abc123")).toMatch(/token inválido/);
    expect(validarMcpToken("abc123 ", "abc123")).toMatch(/token inválido/);
  });
});

describe("garantirMcpToken / gravarMcpToken", () => {
  it("gera token hex de 48 chars com modo 0600 quando o arquivo não existe", async () => {
    const path = caminhoMcpToken(home);
    // await obrigatório: sem ele a asserção roda DEPOIS de garantirMcpToken criar o arquivo (race)
    await expect(stat(path).then(() => true).catch(() => false)).resolves.toBe(false);
    const token = garantirMcpToken(home);
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(modo(path)).toBe(0o600);
    expect(readFileSync(path, "utf8").trim()).toBe(token);
  });

  it("é idempotente: segunda chamada retorna o MESMO token", () => {
    const t1 = garantirMcpToken(home);
    const t2 = garantirMcpToken(home);
    expect(t2).toBe(t1);
  });

  it("não deixa o modo afrouxado se o arquivo já existia com 0644", async () => {
    gravarMcpToken(home, "tokenfixo");
    await writeFile(caminhoMcpToken(home), "tokenfixo\n", { mode: 0o644 });
    const t = garantirMcpToken(home);
    expect(t).toBe("tokenfixo");
    expect(modo(caminhoMcpToken(home))).toBe(0o600);
  });

  it("arquivo ilegível (vazio) → regenera (self-heal)", () => {
    gravarMcpToken(home, ""); // cria dirs e deixa conteúdo vazio
    const t = garantirMcpToken(home);
    expect(t).toMatch(/^[0-9a-f]{48}$/);
  });
});

describe("mcp serve via CLI — fail-closed", () => {
  async function criarWorkspace(): Promise<void> {
    const { WorkspaceManager } = await import("../src/core/workspace-manager.js");
    await new WorkspaceManager({ homeDir: home, cwd: home }).criar("corp-mcp");
  }

  interface Resultado {
    codigo: number;
    stderr: string;
    stdout: string[];
  }

  function servir(args: string[], envExtra: Record<string, string> = {}): Promise<Resultado> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        process.execPath,
        argvCli(["mcp", "serve", ...args]),
        { env: { ...process.env, OPENCORP_HOME: home, ...envExtra }, cwd: process.cwd(), timeout: 30_000 },
        (erro) => {
          if (erro && !("code" in erro)) reject(erro);
        },
      );
      child.stdin!.end();
      let stderr = "";
      child.stderr!.on("data", (d: Buffer) => (stderr += d.toString()));
      const stdout: string[] = [];
      child.stdout!.on("data", (d: Buffer) => {
        for (const linha of d.toString().split("\n")) if (linha.trim()) stdout.push(linha);
      });
      child.on("close", (codigo) => resolve({ codigo: codigo ?? -1, stderr, stdout }));
    });
  }

  it("sem token → exit 1 e NENHUMA tool servida (não responde JSON-RPC)", async () => {
    await criarWorkspace();
    const r = await servir([]);
    expect(r.codigo).toBe(1);
    expect(r.stderr).toMatch(/token obrigatório/);
    expect(r.stdout).toEqual([]);
  });

  it("token errado → exit 1 e nenhuma resposta", async () => {
    await criarWorkspace();
    const r = await servir(["--token", "nao-e-o-token"]);
    expect(r.codigo).toBe(1);
    expect(r.stderr).toMatch(/token inválido/);
    expect(r.stdout).toEqual([]);
  });

  it("env OPENCORP_MCP_TOKEN errado → exit 1", async () => {
    await criarWorkspace();
    const r = await servir([], { OPENCORP_MCP_TOKEN: "errado" });
    expect(r.codigo).toBe(1);
    expect(r.stderr).toMatch(/token inválido/);
    expect(r.stdout).toEqual([]);
  });

  it("token certo (via --token) → responde initialize e tools/list", async () => {
    await criarWorkspace();
    const token = garantirMcpToken(home);
    const child = execFile(process.execPath, argvCli(["mcp", "serve", "--token", token]), {
      env: { ...process.env, OPENCORP_HOME: home },
      cwd: process.cwd(),
      timeout: 30_000,
    });
    child.stdin!.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`);
    child.stdin!.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
    child.stdin!.end();
    const stdout: string[] = [];
    for await (const linha of child.stdout!) {
      stdout.push(linha.toString());
      if (stdout.length >= 2) break;
    }
    child.kill();
    const init = JSON.parse(stdout[0]!) as { result: { serverInfo: { name: string } } };
    expect(init.result.serverInfo.name).toBe("opencorp");
    const lista = JSON.parse(stdout[1]!) as { result: { tools: { name: string }[] } };
    expect(lista.result.tools.map((t) => t.name)).toContain("task.create");
  });

  it("token certo (via env OPENCORP_MCP_TOKEN) → responde initialize", async () => {
    await criarWorkspace();
    const token = garantirMcpToken(home);
    const child = execFile(process.execPath, argvCli(["mcp", "serve"]), {
      env: { ...process.env, OPENCORP_HOME: home, OPENCORP_MCP_TOKEN: token },
      cwd: process.cwd(),
      timeout: 30_000,
    });
    child.stdin!.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`);
    child.stdin!.end();
    const stdout: string[] = [];
    for await (const linha of child.stdout!) {
      stdout.push(linha.toString());
      if (stdout.length >= 1) break;
    }
    child.kill();
    const init = JSON.parse(stdout[0]!) as { result: { serverInfo: { name: string } } };
    expect(init.result.serverInfo.name).toBe("opencorp");
  });
});
