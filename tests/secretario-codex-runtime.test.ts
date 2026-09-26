import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiServer } from "../src/server/index.js";
import {
  CodexAdapter,
  ConversationRuntimeResolver,
  EngineRegistry,
} from "../src/core/engines/index.js";

const raizes: string[] = [];

async function tmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "opencorp-secretario-codex-"));
  raizes.push(dir);
  return dir;
}

function makeFetch(port: number, token: string) {
  const base = `http://127.0.0.1:${port}`;
  return async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`${base}${path}`, {
      ...opts,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...opts.headers,
      },
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    return { status: res.status, json, text, res };
  };
}

describe("ETAPA 8 — Prova de Independência do Secretário com Codex Runtime", () => {
  let home: string;
  let token = "test-token-sec-codex";
  let port: number;
  let fetchApi: ReturnType<typeof makeFetch>;
  let server: ReturnType<typeof createApiServer>["server"];

  beforeAll(async () => {
    home = await tmpDir();
    await mkdir(join(home, ".opencorp"), { recursive: true });
    await mkdir(join(home, "logs"), { recursive: true });

    // Workspace 1: Configurado para utilizar Codex
    const wsCodexDir = join(home, "workspaces", "ws-codex");
    await mkdir(join(wsCodexDir, ".opencorp"), { recursive: true });
    await writeFile(
      join(wsCodexDir, ".opencorp", "config.json"),
      JSON.stringify({
        conversationEngineOverride: "codex",
        default_conversation_engine: "codex",
      })
    );

    // Workspace 2: Configurado para utilizar OpenCode
    const wsOpencodeDir = join(home, "workspaces", "ws-opencode");
    await mkdir(join(wsOpencodeDir, ".opencorp"), { recursive: true });
    await writeFile(
      join(wsOpencodeDir, ".opencorp", "config.json"),
      JSON.stringify({
        conversationEngineOverride: "opencode",
        default_conversation_engine: "opencode",
      })
    );

    // Registra workspaces
    await writeFile(
      join(home, ".opencorp", "workspaces.json"),
      JSON.stringify({
        version: 1,
        ativo: "ws-codex",
        workspaces: [
          { id: "ws-codex", path: wsCodexDir, criado_em: new Date().toISOString() },
          { id: "ws-opencode", path: wsOpencodeDir, criado_em: new Date().toISOString() },
        ],
      })
    );

    // Settings global com fallback explícito
    await writeFile(
      join(home, ".opencorp", "settings.json"),
      JSON.stringify({
        default_conversation_engine: "codex",
      })
    );

    // Registra adaptador customizado com mock launcher para isolamento determinístico nos testes
    const customCodexAdapter = new CodexAdapter({
      homeDir: home,
      installStatusProbe: async () => ({ installed: true, path: "/fake/codex", version: "test" }),
      authStatusProbe: async () => ({ authenticated: true, method: "test" }),
      customProcessLauncher: async (opts) => {
        const text = opts.args[1] === "resume"
          ? "Codex continuando o diálogo anterior..."
          : "Codex: resposta gerada com raciocínio profundo.";
        async function* stream() {
          yield JSON.stringify({ type: "thread.started", thread_id: "thread-secretario-test" }) + "\n";
          yield JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } }) + "\n";
          yield JSON.stringify({ type: "turn.completed", usage: { input_tokens: 3, output_tokens: 2 } }) + "\n";
        }
        return {
          pid: 8888,
          stdout: stream(),
          exitCode: Promise.resolve(0),
          kill: () => {},
        };
      },
    });

    const registry = new EngineRegistry();
    registry.registerAdapter(customCodexAdapter);

    const runtimeResolver = new ConversationRuntimeResolver({
      homeDir: home,
      registry,
    });

    const app = createApiServer({
      homeDir: home,
      porta: 0,
      token,
      conversationRuntimeResolver: runtimeResolver,
    });

    server = app.server;
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        port = addr.port;
        fetchApi = makeFetch(port, token);
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
    for (const r of raizes) {
      await rm(r, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("1. GET /secretario/status: relata Codex como motor ativo do workspace ws-codex", async () => {
    const res = await fetchApi("/secretario/status?workspace=ws-codex");
    expect(res.status).toBe(200);

    const body = res.json as any;
    expect(body.motor).toBeDefined();
    expect(body.motor.engineId).toBe("codex");
    expect(body.motor.suportaConversa).toBe(true);
    expect(body.motor.preflight.supportsConversation).toBe(true);
  });

  it("2. POST /secretario/conversa: atende requisição usando o runtime conversacional do Codex", async () => {
    const res = await fetchApi("/secretario/conversa?workspace=ws-codex", {
      method: "POST",
      body: JSON.stringify({
        mensagem: "Olá Secretário, execute uma análise de código",
        modelo: "gpt-5.6-sol",
      }),
    });

    expect(res.status).toBe(200);
    const body = res.json as any;
    expect(body.ok).toBe(true);
    expect(body.sessao_id).toBeDefined();
    expect(body.motor).toBe("codex");
    expect(body.resposta).toContain("Codex: resposta gerada com raciocínio profundo.");
  });

  it("3. POST /secretario/conversa/stream: transmite eventos SSE estruturados gerados pelo Codex", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/secretario/conversa/stream?workspace=ws-codex`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        mensagem: "Streaming com Codex",
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("event: inicio");
    expect(text).toContain("event: delta");
    expect(text).toContain("event: fim");
    expect(text).toContain('"motor":"codex"');
  });

  it("4. Multi-turn conversacional: mantém sessão e continua diálogo no Codex", async () => {
    // Turno 1
    const res1 = await fetchApi("/secretario/conversa?workspace=ws-codex", {
      method: "POST",
      body: JSON.stringify({
        mensagem: "Primeira instrução",
      }),
    });
    expect(res1.status).toBe(200);
    const sId = (res1.json as any).sessao_id;

    // Turno 2 com o mesmo sessao_id
    const res2 = await fetchApi("/secretario/conversa?workspace=ws-codex", {
      method: "POST",
      body: JSON.stringify({
        sessao_id: sId,
        mensagem: "Segunda instrução subsequente",
      }),
    });
    expect(res2.status).toBe(200);
    const body2 = res2.json as any;
    expect(body2.sessao_id).toBe(sId);
    expect(body2.motor).toBe("codex");
    expect(body2.resposta).toContain("Codex continuando o diálogo anterior...");
  });

  it("5. Isolamento estrito entre workspaces: ws-codex (Codex) e ws-opencode (OpenCode) operam isoladamente", async () => {
    const stCodex = await fetchApi("/secretario/status?workspace=ws-codex");
    expect((stCodex.json as any).motor.engineId).toBe("codex");

    const stOpencode = await fetchApi("/secretario/status?workspace=ws-opencode");
    expect((stOpencode.json as any).motor.engineId).toBe("opencode");
  });
});
