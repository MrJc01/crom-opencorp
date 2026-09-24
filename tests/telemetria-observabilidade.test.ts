import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CorpDb, type LinhaAcaoAgente } from "../src/core/contexts/storage/corp-db.js";
import {
  sanitizarSegredos,
  truncarComHash,
  gerarTraceId,
  gerarSpanId,
  TelemetryCollector,
  type TraceContext,
} from "../src/core/contexts/platform/telemetry-collector.js";
import type { PassoChat } from "../src/core/contexts/execution/opencode-server.js";
import { WorkspaceManager } from "../src/core/contexts/workspace/workspace-manager.js";
import { createApiServer } from "../src/server/index.js";

const raizes: string[] = [];

async function criarDbTemporario(): Promise<{ home: string; db: CorpDb }> {
  const home = await mkdtemp(join(tmpdir(), "opencorp-telemetria-"));
  raizes.push(home);
  const db = new CorpDb(join(home, "corp.db"));
  return { home, db };
}

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

describe("Sanitização de Segredos & Truncamento (telemetry-collector)", () => {
  it("mascara chaves OpenAI e Anthropic", () => {
    const texto = "Usando api_key sk-abcdef1234567890abcdef1234 e também sk-ant-api03-abcdef1234567890abcdef123456";
    const sanitizado = sanitizarSegredos(texto);
    expect(sanitizado).not.toContain("sk-abcdef1234567890abcdef1234");
    expect(sanitizado).not.toContain("sk-ant-api03-abcdef1234567890abcdef123456");
    expect(sanitizado).toContain("***REDACTED***");
  });

  it("mascara tokens GitHub e chaves Google AIza", () => {
    const texto = "ghp_123456789012345678901234567890123456 e AIzaSyD1234567890123456789012345678901";
    const sanitizado = sanitizarSegredos(texto);
    expect(sanitizado).not.toContain("ghp_123456789012345678901234567890123456");
    expect(sanitizado).not.toContain("AIzaSyD1234567890123456789012345678901");
    expect(sanitizado).toContain("***REDACTED***");
  });

  it("mascara senhas e segredos em env vars", () => {
    const texto = "export PASSWORD=super_secret_pass_123; export SECRET=my_jwt_token";
    const sanitizado = sanitizarSegredos(texto);
    expect(sanitizado).not.toContain("super_secret_pass_123");
    expect(sanitizado).toContain("***REDACTED***");
  });

  it("retorna nulo se o texto for nulo ou indefinido", () => {
    expect(sanitizarSegredos(null)).toBeNull();
    expect(sanitizarSegredos(undefined)).toBeNull();
  });

  it("trunca saídas maiores que o limite e adiciona hash SHA-256", () => {
    const textoLongo = "A".repeat(1000);
    const truncado = truncarComHash(textoLongo, 100);
    expect(truncado).toBeDefined();
    expect(truncado!.length).toBeLessThan(textoLongo.length);
    expect(truncado).toContain("[... truncado: 1000 bytes originais, SHA-256:");
  });

  it("não altera textos menores que o limite de bytes", () => {
    const textoCurto = "Texto pequeno dentro do limite";
    const resultado = truncarComHash(textoCurto, 1000);
    expect(resultado).toBe(textoCurto);
  });
});

describe("Persistência e Consulta no CorpDb (acoes_agentes)", () => {
  it("grava ações em lote e recupera por sessão", async () => {
    const { db } = await criarDbTemporario();
    const traceId = gerarTraceId();
    const span1 = gerarSpanId();
    const span2 = gerarSpanId();

    const acoes: LinhaAcaoAgente[] = [
      {
        id: "act-1",
        trace_id: traceId,
        span_id: span1,
        sessao_id: "ses-100",
        agente: "secretario-exec",
        modelo: "glm-5.3-flash",
        workspace: "/tmp/ws",
        tipo_acao: "tool",
        ferramenta: "bash",
        comando_resumo: "ls -la",
        input_json: JSON.stringify({ cmd: "ls -la" }),
        output_json: "total 0",
        status: "sucesso",
        duracao_ms: 120,
        criado_em: new Date(Date.now() - 2000).toISOString(),
      },
      {
        id: "act-2",
        trace_id: traceId,
        span_id: span2,
        parent_span_id: span1,
        sessao_id: "ses-100",
        agente: "secretario-exec",
        modelo: "glm-5.3-flash",
        workspace: "/tmp/ws",
        tipo_acao: "tool",
        ferramenta: "view_file",
        comando_resumo: "view README.md",
        input_json: JSON.stringify({ file: "README.md" }),
        output_json: "# OpenCorp",
        status: "sucesso",
        duracao_ms: 45,
        criado_em: new Date().toISOString(),
      },
    ];

    db.gravarAcoesEmLote(acoes);

    const sessoesRecuperadas = db.listarAcoesSessao("ses-100");
    expect(sessoesRecuperadas).toHaveLength(2);
    expect(sessoesRecuperadas[0]?.id).toBe("act-1");
    expect(sessoesRecuperadas[0]?.ferramenta).toBe("bash");
    expect(sessoesRecuperadas[1]?.id).toBe("act-2");
    expect(sessoesRecuperadas[1]?.parent_span_id).toBe(span1);

    const traceRecuperado = db.listarAcoesPorTrace(traceId);
    expect(traceRecuperado).toHaveLength(2);
    expect(traceRecuperado[0]?.trace_id).toBe(traceId);
  });

  it("calcula resumo de telemetria com agregações corretas", async () => {
    const { db } = await criarDbTemporario();
    const traceId = gerarTraceId();

    const acoes: LinhaAcaoAgente[] = [
      {
        id: "act-a",
        trace_id: traceId,
        span_id: gerarSpanId(),
        sessao_id: "ses-200",
        agente: "dev-backend",
        modelo: "claude-3.5-sonnet",
        workspace: "/tmp/ws",
        tipo_acao: "tool",
        ferramenta: "bash",
        status: "sucesso",
        duracao_ms: 200,
        custo_usd: 0.005,
        criado_em: new Date().toISOString(),
      },
      {
        id: "act-b",
        trace_id: traceId,
        span_id: gerarSpanId(),
        sessao_id: "ses-200",
        agente: "dev-backend",
        modelo: "claude-3.5-sonnet",
        workspace: "/tmp/ws",
        tipo_acao: "tool",
        ferramenta: "bash",
        status: "falhou",
        duracao_ms: 100,
        custo_usd: 0.005,
        erro: "command not found",
        criado_em: new Date().toISOString(),
      },
      {
        id: "act-c",
        trace_id: traceId,
        span_id: gerarSpanId(),
        sessao_id: "ses-200",
        agente: "qa-tester",
        modelo: "glm-5.3-flash",
        workspace: "/tmp/ws",
        tipo_acao: "tool",
        ferramenta: "test_runner",
        status: "sucesso",
        duracao_ms: 600,
        custo_usd: 0.001,
        criado_em: new Date().toISOString(),
      },
    ];

    db.gravarAcoesEmLote(acoes);

    const resumo = db.resumoTelemetria({ sessao_id: "ses-200" });
    expect(resumo.total_acoes).toBe(3);
    expect(resumo.total_falhas).toBe(1);

    const bash = resumo.ferramentas.find((f) => f.ferramenta === "bash");
    expect(bash).toBeDefined();
    expect(bash?.total).toBe(2);
    expect(bash?.falhas).toBe(1);
    expect(bash?.media_ms).toBe(150);

    const dev = resumo.agentes.find((a) => a.agente === "dev-backend");
    expect(dev).toBeDefined();
    expect(dev?.total).toBe(2);
    expect(dev?.falhas).toBe(1);

    const qa = resumo.agentes.find((a) => a.agente === "qa-tester");
    expect(qa).toBeDefined();
    expect(qa?.total).toBe(1);
    expect(qa?.falhas).toBe(0);
  });

  it("limpa a tabela acoes_agentes no método limpar()", async () => {
    const { db } = await criarDbTemporario();
    db.gravarAcoesEmLote([
      {
        id: "act-clean",
        trace_id: "tr-1",
        span_id: "sp-1",
        sessao_id: "ses-clean",
        agente: "secretario",
        modelo: "model",
        workspace: "ws",
        tipo_acao: "tool",
        status: "sucesso",
        criado_em: new Date().toISOString(),
      },
    ]);

    expect(db.listarAcoesSessao("ses-clean")).toHaveLength(1);
    db.limpar();
    expect(db.listarAcoesSessao("ses-clean")).toHaveLength(0);
  });
});

describe("TelemetryCollector e Extração de Passos", () => {
  it("converte PassoChat[] em LinhaAcaoAgente[] sanitizado e persiste via flush", async () => {
    const { db } = await criarDbTemporario();
    const tc = new TelemetryCollector();
    tc.conectar(db);

    const traceCtx: TraceContext = {
      trace_id: gerarTraceId(),
      sessao_id: "ses-chat-test",
      agente: "secretario-exec",
      modelo: "glm-5.3-flash",
      workspace: "/test/ws",
    };

    const passos: PassoChat[] = [
      {
        tipo: "acao",
        ferramenta: "curl",
        resumo: "curl -H 'Authorization: Bearer sk-ant-secret123456789012345678' https://api.com",
        saida: "status: 200 ok (sk-12345678901234567890)",
        sucesso: true,
      },
      {
        tipo: "pensamento",
        texto: "Pensando na estratégia de observabilidade...",
      },
      {
        tipo: "texto",
        texto: "Aqui está o relatório final.",
      },
    ];

    tc.registrarPassos(traceCtx, passos);
    expect(tc.tamanhoBuffer()).toBe(3);

    tc.flush();
    expect(tc.tamanhoBuffer()).toBe(0);

    const gravadas = db.listarAcoesSessao("ses-chat-test");
    expect(gravadas).toHaveLength(3);

    const acaoTool = gravadas.find((g) => g.tipo_acao === "tool");
    expect(acaoTool).toBeDefined();
    expect(acaoTool?.ferramenta).toBe("curl");
    expect(acaoTool?.comando_resumo).not.toContain("sk-ant-secret123456789012345678");
    expect(acaoTool?.comando_resumo).toContain("***REDACTED***");
    expect(acaoTool?.output_json).not.toContain("sk-12345678901234567890");

    const acaoPensamento = gravadas.find((g) => g.tipo_acao === "pensamento");
    expect(acaoPensamento).toBeDefined();
    expect(acaoPensamento?.output_json).toContain("Pensando na estratégia");

    const acaoResposta = gravadas.find((g) => g.tipo_acao === "resposta");
    expect(acaoResposta).toBeDefined();
    expect(acaoResposta?.output_json).toContain("Aqui está o relatório final");

    tc.desconectar();
  });
});

describe("Endpoints de Telemetria no Servidor HTTP", () => {
  let home: string;
  const token = "t-telemetria";
  let port: number;
  let fetchApi: (path: string, opts?: RequestInit) => Promise<{ status: number; json: any }>;
  let server: ReturnType<typeof createApiServer>["server"];
  let wsDir: string;
  let corpDb: CorpDb;

  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), "opencorp-server-tel-"));
    raizes.push(home);
    const wm = new WorkspaceManager({ homeDir: home, cwd: home });
    const ws = await wm.criar("corp-tel");
    wsDir = ws.path;
    corpDb = new CorpDb(join(wsDir, ".opencorp", "corp.db"));

    corpDb.gravarAcoesEmLote([
      {
        id: "act-api-1",
        trace_id: "trace-api-xyz",
        span_id: "span-10",
        sessao_id: "ses-api-1",
        agente: "secretario",
        modelo: "glm-5.3-flash",
        workspace: wsDir,
        tipo_acao: "tool",
        ferramenta: "bash",
        comando_resumo: "git status",
        status: "sucesso",
        duracao_ms: 50,
        criado_em: new Date().toISOString(),
      },
      {
        id: "act-api-2",
        trace_id: "trace-api-xyz",
        span_id: "span-11",
        sessao_id: "ses-api-1",
        agente: "secretario",
        modelo: "glm-5.3-flash",
        workspace: wsDir,
        tipo_acao: "tool",
        ferramenta: "view_file",
        status: "falhou",
        erro: "not found",
        duracao_ms: 20,
        criado_em: new Date().toISOString(),
      },
    ]);

    const api = createApiServer({
      homeDir: home,
      cwd: home,
      token,
      port: 0,
    });
    server = api.server;
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        port = typeof addr === "object" && addr ? addr.port : 0;
        fetchApi = async (path: string, opts: RequestInit = {}) => {
          const res = await fetch(`http://127.0.0.1:${port}${path}`, {
            ...opts,
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${token}`,
              ...opts.headers,
            },
          });
          const text = await res.text();
          let json: any;
          try {
            json = text ? JSON.parse(text) : undefined;
          } catch {
            json = text;
          }
          return { status: res.status, json };
        };
        resolve();
      });
    });
  });

  afterAll(async () => {
    corpDb.fechar();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET /acoes retorna a lista de ações registradas", async () => {
    const res = await fetchApi("/acoes");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json)).toBe(true);
    const lista = res.json as any[];
    expect(lista.length).toBeGreaterThanOrEqual(2);
  });

  it("GET /acoes/:sessao_id retorna ações da sessão específica", async () => {
    const res = await fetchApi("/acoes/ses-api-1");
    expect(res.status).toBe(200);
    const lista = res.json as any[];
    expect(lista).toHaveLength(2);
    expect(lista[0]?.ferramenta).toBe("bash");
    expect(lista[1]?.ferramenta).toBe("view_file");
  });

  it("GET /telemetria/trace/:trace_id retorna timeline do trace", async () => {
    const res = await fetchApi("/telemetria/trace/trace-api-xyz");
    expect(res.status).toBe(200);
    const lista = res.json as any[];
    expect(lista).toHaveLength(2);
    expect(lista[0]?.trace_id).toBe("trace-api-xyz");
  });

  it("GET /telemetria/resumo agrega métricas por ferramenta e agente", async () => {
    const res = await fetchApi("/telemetria/resumo");
    expect(res.status).toBe(200);
    const resumo = res.json as any;
    expect(resumo.total_acoes).toBeGreaterThanOrEqual(2);
    expect(resumo.ferramentas).toBeDefined();
    expect(resumo.agentes).toBeDefined();
    expect(resumo.ferramentas.some((f: any) => f.ferramenta === "bash")).toBe(true);
  });
});
