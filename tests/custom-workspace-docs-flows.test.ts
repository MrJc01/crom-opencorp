import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { createApiServer, type ApiServerOptions } from "../src/server/index.js";
import type { Server } from "node:http";

const tmpDirs: string[] = [];

async function criarTmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "opencorp-custom-test-"));
  tmpDirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe("Workspaces com Custom Path (Qualquer pasta do computador)", () => {
  it("permite criar workspace em pasta customizada arbitrária preservando arquivos existentes", async () => {
    const home = await criarTmp();
    const pastaDoProjeto = await criarTmp();

    // Simula um projeto existente do usuário com package.json e src/
    await writeFile(join(pastaDoProjeto, "package.json"), JSON.stringify({ name: "meu-app-existente" }));
    await mkdir(join(pastaDoProjeto, "src"), { recursive: true });
    await writeFile(join(pastaDoProjeto, "src", "index.js"), 'console.log("hello");');

    const m = new WorkspaceManager({ homeDir: home, cwd: home });

    // Cria workspace apontando para a pasta customizada
    const info = await m.criar("meu-app", { path: pastaDoProjeto });

    expect(info.id).toBe("meu-app");
    expect(info.path).toBe(pastaDoProjeto);
    expect(info.existe).toBe(true);

    // Verifica que arquivos originais foram preservados
    expect(existsSync(join(pastaDoProjeto, "package.json"))).toBe(true);
    expect(existsSync(join(pastaDoProjeto, "src", "index.js"))).toBe(true);

    // Verifica que a estrutura do OpenCorp foi inicializada dentro da pasta
    expect(existsSync(join(pastaDoProjeto, ".opencorp"))).toBe(true);
    expect(existsSync(join(pastaDoProjeto, ".opencorp", "config.json"))).toBe(true);
    expect(existsSync(join(pastaDoProjeto, ".opencorp", "security_policy.json"))).toBe(true);
    expect(existsSync(join(pastaDoProjeto, ".opencorp", "registries"))).toBe(true);

    // Verifica que m.listar() e m.resolver() retornam o path customizado
    const lista = await m.listar();
    const wsNaLista = lista.find((w) => w.id === "meu-app");
    expect(wsNaLista).toBeDefined();
    expect(wsNaLista?.path).toBe(pastaDoProjeto);

    const resolvido = await m.resolver("meu-app");
    expect(resolvido.path).toBe(pastaDoProjeto);
  });

  it("cria no path padrão quando nenhum path customizado for fornecido", async () => {
    const home = await criarTmp();
    const m = new WorkspaceManager({ homeDir: home, cwd: home });

    const info = await m.criar("padrao-teste");
    expect(info.path).toBe(join(home, ".opencorp", "workspaces", "padrao-teste"));
    expect(existsSync(info.path)).toBe(true);
  });
});

describe("Endpoints da API e Documentação (servidor efêmero)", () => {
  let server: Server;
  let port: number;
  let token: string;
  let home: string;

  function apiUrl(path: string): string {
    return `http://127.0.0.1:${port}${path}`;
  }

  beforeAll(async () => {
    home = await criarTmp();
    // Cria um workspace padrão para os testes que precisam
    const m = new WorkspaceManager({ homeDir: home, cwd: home });
    await m.criar("pulso-diario");

    const result = createApiServer({
      homeDir: home,
      instalarMencoes: false,
    } as ApiServerOptions);
    server = result.server;
    token = result.token;
    server.listen(0, "127.0.0.1");
    port = await result.porta;
  });

  afterAll(() => {
    server?.close();
  });

  it("GET /health responde status ok", async () => {
    const res = await fetch(apiUrl("/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("GET /docs retorna catálogo de documentação", async () => {
    const res = await fetch(apiUrl("/docs"), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const docs = await res.json();
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBeGreaterThan(0);
  });

  it("GET /docs/:slug inexistente retorna 404", async () => {
    const res = await fetch(apiUrl("/docs/nao-existe-12345"), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });

  it("GET /settings retorna configuração válida", async () => {
    const getRes = await fetch(apiUrl("/settings"), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getRes.status).toBe(200);
  });

  it("PUT /settings suporta configuração de runner", async () => {
    const putRes = await fetch(apiUrl("/settings"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        runner: {
          engine: "opencode",
          binary_path: "opencode",
          timeout_min: 25,
        },
      }),
    });
    expect(putRes.status).toBe(200);
  });
});
