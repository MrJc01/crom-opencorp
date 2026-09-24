/**
 * @file Testes unitários do SDK OpenCorp (HttpClient + recursos).
 *
 * Cobre:
 * 1. Inicialização com URLs padrão e customizadas
 * 2. GET com resposta de sucesso (200 OK)
 * 3. Interceptação de erro RFC 7807 → ProblemDetailsError
 * 4. Interceptação de erro legado { erro: string } → ProblemDetailsError
 * 5. Injeção de headers customizados (Authorization, x-opencorp-workspace)
 * 6. Tratamento de falha de rede → OpenCorpNetworkError
 * 7. POST com body serializado
 * 8. Query params
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  OpenCorpClient,
  ProblemDetailsError,
  OpenCorpNetworkError,
  HttpClient,
} from "../../../src/sdk/index.js";

// ── Mock do fetch global ────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockFetch(
  status: number,
  body: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : status === 404 ? "Not Found" : "Error",
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function mockFetchReject(error: Error): void {
  globalThis.fetch = vi.fn().mockRejectedValue(error);
}

beforeEach(() => {
  // Limpa env vars que podem interferir
  delete process.env.OPENCORP_API_URL;
  delete process.env.OPENCORP_TOKEN;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── Testes: Inicialização ───────────────────────────────────────────

describe("SDK — Inicialização", () => {
  it("usa URL padrão http://127.0.0.1:4100 quando nenhuma é fornecida", () => {
    const client = new OpenCorpClient();
    expect(client.http.baseUrl).toBe("http://127.0.0.1:4100");
  });

  it("usa URL customizada fornecida nas opções", () => {
    const client = new OpenCorpClient({ baseUrl: "http://meu-server:9999" });
    expect(client.http.baseUrl).toBe("http://meu-server:9999");
  });

  it("remove trailing slash da URL base", () => {
    const client = new OpenCorpClient({ baseUrl: "http://localhost:4100/" });
    expect(client.http.baseUrl).toBe("http://localhost:4100");
  });

  it("respeita OPENCORP_API_URL do ambiente", () => {
    process.env.OPENCORP_API_URL = "http://env-server:8080";
    const client = new OpenCorpClient();
    expect(client.http.baseUrl).toBe("http://env-server:8080");
  });

  it("expõe todos os recursos (system, secretary, tasks, flows, workspaces, agents)", () => {
    const client = new OpenCorpClient();
    expect(client.system).toBeDefined();
    expect(client.secretary).toBeDefined();
    expect(client.tasks).toBeDefined();
    expect(client.flows).toBeDefined();
    expect(client.workspaces).toBeDefined();
    expect(client.agents).toBeDefined();
  });
});

// ── Testes: Requisições GET com sucesso ─────────────────────────────

describe("SDK — GET com sucesso", () => {
  it("parseia resposta JSON de GET /health", async () => {
    mockFetch(200, { ok: true, version: "1.0.0" });

    const client = new OpenCorpClient({ baseUrl: "http://test:4100", token: "tok123" });
    const result = await client.system.getHealth();

    expect(result).toEqual({ ok: true, version: "1.0.0" });
    expect(globalThis.fetch).toHaveBeenCalledOnce();

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test:4100/health");
    expect(init.method).toBe("GET");
  });

  it("injeta header Authorization com Bearer token", async () => {
    mockFetch(200, {});

    const client = new OpenCorpClient({ baseUrl: "http://t:1", token: "meu-token" });
    await client.system.getHealth();

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer meu-token");
  });

  it("injeta header x-opencorp-workspace quando workspaceId fornecido", async () => {
    mockFetch(200, []);

    const client = new OpenCorpClient({ baseUrl: "http://t:1", workspaceId: "yt-factory-01" });
    await client.secretary.getSessoes();

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-opencorp-workspace"]).toBe("yt-factory-01");
  });
});

// ── Testes: POST com body ───────────────────────────────────────────

describe("SDK — POST com body", () => {
  it("serializa body como JSON e envia Content-Type correto", async () => {
    mockFetch(200, { resposta: "ok", sessao_id: "ses_123" });

    const client = new OpenCorpClient({ baseUrl: "http://t:1" });
    const result = await client.secretary.enviarMensagem({
      mensagem: "olá",
      agente: "redator",
    });

    expect(result.resposta).toBe("ok");

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://t:1/secretario/conversa");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ mensagem: "olá", agente: "redator" }));
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

// ── Testes: Interceptação RFC 7807 ──────────────────────────────────

describe("SDK — Interceptação de erros", () => {
  it("lança ProblemDetailsError em resposta RFC 7807 (422)", async () => {
    const problema = {
      type: "https://opencorp.dev/errors/validation-failed",
      title: "Dados da Requisição Inválidos",
      status: 422,
      detail: "Campo 'agente' é obrigatório.",
      instance: "/secretario/conversa",
      invalidParams: [{ name: "agente", reason: "Required" }],
    };

    mockFetch(422, problema, { "content-type": "application/problem+json; charset=utf-8" });

    const client = new OpenCorpClient({ baseUrl: "http://t:1" });

    await expect(client.secretary.enviarMensagem({ mensagem: "" }))
      .rejects.toThrow(ProblemDetailsError);

    try {
      await client.secretary.enviarMensagem({ mensagem: "" });
    } catch (err) {
      if (err instanceof ProblemDetailsError) {
        expect(err.status).toBe(422);
        expect(err.type).toBe("https://opencorp.dev/errors/validation-failed");
        expect(err.invalidParams).toHaveLength(1);
        expect(err.invalidParams![0].name).toBe("agente");
      }
    }
  });

  it("lança ProblemDetailsError em resposta legada { erro: string } (404)", async () => {
    mockFetch(404, { erro: "agente 'xyz' não encontrado" });

    const client = new OpenCorpClient({ baseUrl: "http://t:1" });

    try {
      await client.tasks.obter("xyz");
      expect.fail("deveria ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemDetailsError);
      if (err instanceof ProblemDetailsError) {
        expect(err.status).toBe(404);
        expect(err.detail).toContain("não encontrado");
      }
    }
  });

  it("ProblemDetailsError.formatarParaCli() retorna saída legível", () => {
    const err = new ProblemDetailsError({
      status: 422,
      type: "https://opencorp.dev/errors/validation-failed",
      title: "Dados Inválidos",
      detail: "2 campos falharam.",
      instance: "/api/test",
      invalidParams: [
        { name: "nome", reason: "Required" },
        { name: "email", reason: "Invalid email" },
      ],
    });

    const saida = err.formatarParaCli();
    expect(saida).toContain("[ERRO 422]");
    expect(saida).toContain("nome");
    expect(saida).toContain("email");
    expect(saida).toContain("/api/test");
  });
});

// ── Testes: Falha de rede ───────────────────────────────────────────

describe("SDK — Falha de rede", () => {
  it("lança OpenCorpNetworkError quando conexão é recusada", async () => {
    const causa = new Error("fetch failed");
    (causa as unknown as { cause: { code: string } }).cause = { code: "ECONNREFUSED" };
    mockFetchReject(causa);

    const client = new OpenCorpClient({ baseUrl: "http://localhost:4100" });

    await expect(client.system.getHealth())
      .rejects.toThrow(OpenCorpNetworkError);

    try {
      await client.system.getHealth();
    } catch (err) {
      if (err instanceof OpenCorpNetworkError) {
        expect(err.baseUrl).toBe("http://localhost:4100");
        expect(err.message).toContain("inacessível");
      }
    }
  });
});

// ── Testes: Query params ────────────────────────────────────────────

describe("SDK — Query params", () => {
  it("injeta query params corretamente nas requisições GET", async () => {
    mockFetch(200, []);

    const client = new OpenCorpClient({ baseUrl: "http://t:1" });
    await client.tasks.listar({ status: "pendente", limite: 10 });

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain("status=pendente");
    expect(url).toContain("limite=10");
  });

  it("omite query params undefined", async () => {
    mockFetch(200, []);

    const client = new OpenCorpClient({ baseUrl: "http://t:1" });
    await client.tasks.listar({ status: "ativo" });

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain("status=ativo");
    expect(url).not.toContain("agente");
    expect(url).not.toContain("limite");
  });
});

// ── Testes: FlowsResource ───────────────────────────────────────────

describe("SDK — FlowsResource", () => {
  it("lista fluxos com injeção do header de workspace quando fornecido", async () => {
    mockFetch(200, [{ id: "flow-1", nome: "Flow 1" }]);

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });
    const fluxos = await client.flows.listar({ workspaceId: "ws-yt" });

    expect(fluxos).toHaveLength(1);
    expect(fluxos[0].id).toBe("flow-1");

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test:4100/flows");
    expect((init.headers as Record<string, string>)["x-opencorp-workspace"]).toBe("ws-yt");
  });

  it("obter fluxo codifica URI do flowId", async () => {
    mockFetch(200, { id: "yt/boletim", nome: "Boletim" });

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });
    const fluxo = await client.flows.obter("yt/boletim");

    expect(fluxo.id).toBe("yt/boletim");
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe("http://test:4100/flows/yt%2Fboletim");
  });

  it("executar flow faz POST para /flows/:id/run", async () => {
    mockFetch(200, { id: "exec-1", flow_id: "meu-flow", status: "executando", inicio: "2026-09-24T00:00:00Z" });

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });
    const exec = await client.flows.executar("meu-flow", { entrada: "teste" });

    expect(exec.id).toBe("exec-1");
    expect(exec.status).toBe("executando");

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test:4100/flows/meu-flow/run");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ entrada: "teste" }));
  });
});

// ── Testes: WorkspacesResource ───────────────────────────────────────

describe("SDK — WorkspacesResource", () => {
  it("listar workspaces retorna lista de workspaces", async () => {
    mockFetch(200, [{ id: "ws-principal", path: "/tmp/ws1" }]);

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });
    const lista = await client.workspaces.listar();

    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe("ws-principal");
  });

  it("ativo retorna o workspace atual", async () => {
    mockFetch(200, { id: "ws-ativo", path: "/tmp/ativo" });

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });
    const ativo = await client.workspaces.ativo();

    expect(ativo.id).toBe("ws-ativo");
    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe("http://test:4100/workspaces/current");
  });

  it("definirAtivo faz POST para /workspaces/ativo com { id }", async () => {
    mockFetch(200, { ok: true, id: "ws-2" });

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });
    const resp = await client.workspaces.definirAtivo("ws-2");

    expect(resp.ok).toBe(true);
    expect(resp.id).toBe("ws-2");

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test:4100/workspaces/ativo");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ id: "ws-2" }));
  });
});

// ── Testes: AgentsResource ──────────────────────────────────────────

describe("SDK — AgentsResource", () => {
  it("listar agentes retorna lista e propaga workspaceId", async () => {
    mockFetch(200, [{ id: "redator", nome: "Agente Redator" }]);

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });
    const agentes = await client.agents.listar({ workspaceId: "ws-yt" });

    expect(agentes).toHaveLength(1);
    expect(agentes[0].id).toBe("redator");

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test:4100/agents");
    expect((init.headers as Record<string, string>)["x-opencorp-workspace"]).toBe("ws-yt");
  });

  it("gerarPrompt faz POST para /agents/gerar-prompt", async () => {
    mockFetch(200, { prompt: "Você é um agente..." });

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });
    const res = await client.agents.gerarPrompt({ nome: "Revisor", papel: "Revisão ortográfica" });

    expect(res.prompt).toBe("Você é um agente...");

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test:4100/agents/gerar-prompt");
    expect(init.method).toBe("POST");
  });
});

