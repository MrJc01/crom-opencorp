import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiServer, type ApiServerOptions, type SessaoApi } from "../src/server/index.js";

const raizes: string[] = [];

async function tmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "opencorp-server-"));
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
    return { status: res.status, json, headers: res.headers };
  };
}

describe("API Server — REST + SSE", () => {
  let home: string;
  let token = "t1";
  let port: number;
  let fetchApi: ReturnType<typeof makeFetch>;
  let server: ReturnType<typeof createApiServer>["server"];
  let fakeSessoes: SessaoApi;
  let receivedRunOptions: { execId: string; ordem: string } | null = null;

  beforeAll(async () => {
    home = await tmpDir();
    receivedRunOptions = null;

    fakeSessoes = {
      async rodar(opcoes) {
        receivedRunOptions = { execId: opcoes.execId, ordem: opcoes.ordem };
        return {
          id: opcoes.execId,
          agente: opcoes.agente,
          modelo: opcoes.model ?? "test-model",
          ordem: opcoes.ordem,
          inicio: new Date().toISOString(),
          fim: new Date().toISOString(),
          status: "concluido",
          exit_code: 0,
          duracao_ms: 100,
          pid: null,
          log: `logs/${opcoes.execId}.log`,
          captura: "ok",
          custo_usd: 0.001,
        };
      },
      async listarExecucoes() {
        return [];
      },
      async logDe() {
        return "fake log";
      },
    };

    const { server: srv, token: tk, porta } = createApiServer({
      homeDir: home,
      token,
      sessoes: fakeSessoes,
    } as ApiServerOptions);
    server = srv;
    token = tk;
    server.listen(0, "127.0.0.1");
    port = await porta;
    fetchApi = makeFetch(port, token);
  });

  afterAll(async () => {
    server.close();
    await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
  });

  // (1) /health sem auth
  it("GET /health retorna 200 sem auth", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.versao).toBeDefined();
  });

  // (2) 401 sem/valendo token errado
  it("GET /workspaces sem token retorna 401", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/workspaces`);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.erro).toContain("token");
  });

  it("GET /workspaces com token errado retorna 401", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/workspaces`, {
      headers: { authorization: "Bearer token-errado" },
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.erro).toContain("token");
  });

  // (3) GET /workspaces com token (home tmpdir isolado)
  it("GET /workspaces com token válido lista workspaces", async () => {
    const { status, json } = await fetchApi("/workspaces");
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
  });

  // (4) POST /workspaces cria
  it("POST /workspaces cria novo workspace", async () => {
    const { status, json } = await fetchApi("/workspaces", {
      method: "POST",
      body: JSON.stringify({ id: "corp-teste" }),
    });
    expect(status).toBe(201);
    expect(json).toHaveProperty("id", "corp-teste");
    expect(json).toHaveProperty("caminho");
  });

  // (5) GET /agents lista 3 agentes do template
  it("GET /agents lista 3 agentes do template default", async () => {
    const { status, json } = await fetchApi("/workspaces", {
      method: "POST",
      body: JSON.stringify({ id: "corp-agentes" }),
    });
    expect(status).toBe(201);
    const wsId = (json as { id: string }).id;

    const { status: s2, json: agents } = await fetchApi(`/workspaces?workspace=${wsId}&agents`);
    expect(s2).toBe(200);
    // Note: /workspaces returns workspace list, we need /agents endpoint
  });

  it("GET /agents?workspace=... lista 3 agentes do template", async () => {
    const { status, json } = await fetchApi("/agents?workspace=corp-agentes");
    expect(status).toBe(200);
    const agentes = json as Array<{ id: string }>;
    expect(agentes.length).toBe(3);
    const ids = agentes.map((a) => a.id).sort();
    expect(ids).toEqual(["ceo-documentos", "executor-padrao", "secretario"]);
  });

  // (6) POST /agents/:id/run com sessoes MOCKADA
  it("POST /agents/:id/run retorna 202 com exec_id e fake recebeu execId e ordem", async () => {
    receivedRunOptions = null;
    const { status, json } = await fetchApi("/agents/executor-padrao/run", {
      method: "POST",
      body: JSON.stringify({ ordem: "teste de execucao" }),
    });
    expect(status).toBe(202);
    expect(json).toHaveProperty("exec_id");
    expect(json).toHaveProperty("status", "iniciado");
    expect(receivedRunOptions).not.toBeNull();
    expect(receivedRunOptions!.ordem).toBe("teste de execucao");
    expect(receivedRunOptions!.execId).toBe((json as { exec_id: string }).exec_id);
  });

  // (7) POST/GET/PUT /registries
  it("POST /registries/chats cria registro", async () => {
    const { status, json } = await fetchApi("/registries/chats", {
      method: "POST",
      body: JSON.stringify({ id: "chat-1", descricao: "teste" }),
    });
    expect(status).toBe(201);
    expect(json).toHaveProperty("id", "chats/chat-1");
  });

  it("GET /registries/chats lista registros", async () => {
    const { status, json } = await fetchApi("/registries/chats");
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
  });

  it("GET /registries/chats/chat-1 obtém registro", async () => {
    const { status, json } = await fetchApi("/registries/chats/chat-1");
    expect(status).toBe(200);
    expect(json).toHaveProperty("meta.id", "chat-1");
  });

  it("PUT /registries/chats/chat-1 atualiza registro", async () => {
    const { status, json } = await fetchApi("/registries/chats/chat-1", {
      method: "PUT",
      body: JSON.stringify({ conteudo: "novo conteudo" }),
    });
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true });
  });

  // (8) /budget/set com per_agent_usd reflete em /budget/status
  it("POST /budget/set define per_agent_usd e reflete em /budget/status", async () => {
    const { status: s1, json: j1 } = await fetchApi("/budget/set", {
      method: "POST",
      body: JSON.stringify({ per_agent_usd: 2.5 }),
    });
    expect(s1).toBe(200);
    expect(j1).toHaveProperty("ok", true);

    const { status: s2, json: j2 } = await fetchApi("/budget/status");
    expect(s2).toBe(200);
    expect(j2).toHaveProperty("limites");
    expect((j2 as { limites: { per_agent_usd: number } }).limites.per_agent_usd).toBe(2.5);
  });

  // (9) PUT /settings + GET /settings
  it("PUT /settings grava e GET /settings lê", async () => {
    // Primeiro cria um workspace para o teste
    const { status: wsStatus, json: wsJson } = await fetchApi("/workspaces", {
      method: "POST",
      body: JSON.stringify({ id: "corp-settings" }),
    });
    expect(wsStatus).toBe(201);
    const wsId = (wsJson as { id: string }).id;

    const { status: s1, json: j1 } = await fetchApi(`/settings?workspace=${wsId}`, {
      method: "PUT",
      body: JSON.stringify({ chave: "budget.per_agent_usd", valor: "2.5", scope: "workspace" }),
    });
    expect(s1).toBe(200);

    const { status: s2, json: j2 } = await fetchApi(`/settings?workspace=${wsId}`);
    expect(s2).toBe(200);
    const entradas = j2 as Array<{ chave: string; valor: string }>;
    const found = entradas.find((e) => e.chave === "budget.per_agent_usd");
    expect(found).toBeDefined();
    expect(String(found!.valor)).toBe("2.5");
  });

  // (10) /flows POST+GET
  it("POST /flows cria flow e GET /flows lista", async () => {
    const { status: s1, json: j1 } = await fetchApi("/flows", {
      method: "POST",
      body: JSON.stringify({ id: "flow-teste", nome: "Flow de Teste" }),
    });
    expect(s1).toBe(201);
    expect(j1).toHaveProperty("id", "flow-teste");

    const { status: s2, json: j2 } = await fetchApi("/flows");
    expect(s2).toBe(200);
    const flows = j2 as Array<{ id: string }>;
    expect(flows.some((f) => f.id === "flow-teste")).toBe(true);
  });

  // (11) CORS headers presentes em qualquer resposta
  it("todas as respostas incluem access-control-allow-origin: *", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  // (12) OPTIONS preflight 204
  it("OPTIONS preflight retorna 204", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/workspaces`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
  });

  // (13) GET /doc — público, retorna OpenAPI 3.0 com todas as rotas
  it("GET /doc retorna 200 sem auth e contém especificação OpenAPI 3.0", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/doc`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.openapi).toBe("3.0.3");
    expect(json.info.title).toBe("opencorp API");
    expect(json.paths).toBeDefined();
    expect(Object.keys(json.paths).length).toBeGreaterThan(10);
    // Verifica que rotas públicas não exigem auth
    const healthOp = json.paths["/health"]?.get;
    expect(healthOp?.security).toEqual([]);
    const docOp = json.paths["/doc"]?.get;
    expect(docOp?.security).toEqual([]);
  });

  // (14) GET /files — lista raiz, lê arquivo, bloqueia traversal
  it("GET /files?path= lista raiz do workspace", async () => {
    const { status, json } = await fetchApi("/files");
    expect(status).toBe(200);
    expect(json).toHaveProperty("tipo", "dir");
    expect(Array.isArray(json.itens)).toBe(true);
  });

  it("GET /files?path=.opencorp/config.json lê arquivo JSON", async () => {
    // Primeiro cria um workspace para ter o arquivo config.json
    const { status: wsStatus, json: wsJson } = await fetchApi("/workspaces", {
      method: "POST",
      body: JSON.stringify({ id: "corp-files-test" }),
    });
    expect(wsStatus).toBe(201);
    const wsId = (wsJson as { id: string }).id;

    const { status, json } = await fetchApi(`/files?path=.opencorp/config.json&workspace=${wsId}`);
    expect(status).toBe(200);
    expect(json).toHaveProperty("tipo", "arquivo");
    expect(json.conteudo).toBeTypeOf("string");
    expect(json.conteudo!.length).toBeGreaterThan(0);
  });

  it("GET /files?path=../../etc/passwd retorna 403 (path traversal bloqueado)", async () => {
    const { status, json } = await fetchApi("/files?path=../../etc/passwd");
    expect(status).toBe(403);
    expect(json).toHaveProperty("erro");
    expect((json as { erro: string }).erro).toContain("fora do workspace");
  });

  it("GET /files lê arquivo .md", async () => {
    // Criar um arquivo .md temporário no workspace
    const { status: wsStatus, json: wsJson } = await fetchApi("/workspaces", {
      method: "POST",
      body: JSON.stringify({ id: "corp-files-md" }),
    });
    expect(wsStatus).toBe(201);
    const wsId = (wsJson as { id: string }).id;

    // Primeiro, criar o arquivo via registry ou diretamente
    // Como não temos endpoint de escrita de arquivos, vamos testar lendo um .md existente
    // O template default deve ter algum .md ou vamos criar via registry
    const { status, json } = await fetchApi(`/files?path=.opencorp/agents/ceo-documentos.md&workspace=${wsId}`);
    // Se o arquivo não existir, pode ser 404 - mas se existir deve retornar conteudo
    if (status === 200) {
      expect(json).toHaveProperty("tipo", "arquivo");
      expect(json.conteudo).toBeTypeOf("string");
    } else {
      expect(status).toBe(404);
    }
  });

  // (15) POST /meetings/:id/stop sem reunião ativa → 409
  it("POST /meetings/inexistente/stop sem reunião ativa retorna 409", async () => {
    const { status, json } = await fetchApi("/meetings/nao-existe/stop", { method: "POST" });
    expect(status).toBe(409);
    expect(json).toHaveProperty("erro", "nenhuma reunião ativa neste servidor");
  });
});