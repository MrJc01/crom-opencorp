import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ThinkParser,
  parseProblemDetails,
  executarSecretarioStream,
} from "../../../src/web/lib/chat/secretary-stream.js";
import { ProblemDetailsError } from "../../../src/sdk/index.js";

describe("secretary-stream — ThinkParser", () => {
  it("separa conteúdo e pensamento em chunks com tags completas", () => {
    const parser = new ThinkParser();
    const res = parser.processDelta("<think>analisando requisitos</think>Resposta final");
    expect(res.deltaPensamento).toBe("analisando requisitos");
    expect(res.deltaConteudo).toBe("Resposta final");
  });

  it("sustenta o estado de pensamento através de múltiplos deltas", () => {
    const parser = new ThinkParser();
    const r1 = parser.processDelta("Início <think>primeira parte");
    expect(r1.deltaConteudo).toBe("Início ");
    expect(r1.deltaPensamento).toBe("primeira parte");

    const r2 = parser.processDelta(" segunda parte");
    expect(r2.deltaConteudo).toBe("");
    expect(r2.deltaPensamento).toBe(" segunda parte");

    const r3 = parser.processDelta(" fim do raciocínio</think> Conclusão.");
    expect(r3.deltaPensamento).toBe(" fim do raciocínio");
    expect(r3.deltaConteudo).toBe(" Conclusão.");
  });

  it("trata múltiplos blocos de think no mesmo fluxo", () => {
    const parser = new ThinkParser();
    const r = parser.processDelta("<think>p1</think>c1<think>p2</think>c2");
    expect(r.deltaPensamento).toBe("p1p2");
    expect(r.deltaConteudo).toBe("c1c2");
  });
});

describe("secretary-stream — parseProblemDetails", () => {
  it("converte resposta RFC 7807 em ProblemDetailsError", async () => {
    const mockResponse = new Response(
      JSON.stringify({
        type: "https://opencorp.dev/errors/validation",
        title: "Erro de Validação",
        status: 422,
        detail: "Campos obrigatórios ausentes",
        invalidParams: [{ name: "mensagem", reason: "não pode ser vazia" }],
      }),
      { status: 422, headers: { "Content-Type": "application/problem+json" } },
    );

    const err = await parseProblemDetails(mockResponse);
    expect(err).toBeInstanceOf(ProblemDetailsError);
    expect(err.status).toBe(422);
    expect(err.title).toBe("Erro de Validação");
    expect(err.detail).toBe("Campos obrigatórios ausentes");
    expect(err.invalidParams).toHaveLength(1);
    expect(err.invalidParams?.[0].name).toBe("mensagem");
  });

  it("converte resposta de erro legada com campo 'erro'", async () => {
    const mockResponse = new Response(
      JSON.stringify({ erro: "Sessão ocupada em outra execução" }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );

    const err = await parseProblemDetails(mockResponse);
    expect(err).toBeInstanceOf(ProblemDetailsError);
    expect(err.status).toBe(409);
    expect(err.detail).toBe("Sessão ocupada em outra execução");
  });

  it("fornece fallback gracioso quando o corpo não for JSON", async () => {
    const mockResponse = new Response("Bad Gateway", { status: 502, statusText: "Bad Gateway" });
    const err = await parseProblemDetails(mockResponse);
    expect(err).toBeInstanceOf(ProblemDetailsError);
    expect(err.status).toBe(502);
    expect(err.title).toBe("Erro HTTP 502");
  });
});

describe("secretary-stream — executarSecretarioStream", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("lança ProblemDetailsError quando resposta !resp.ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ erro: "Sessão ocupada" }), { status: 409 }),
    );

    const onError = vi.fn();
    await expect(
      executarSecretarioStream({
        url: "/secretario/conversa/stream",
        headers: {},
        body: { mensagem: "oi" },
        callbacks: { onError },
      }),
    ).rejects.toThrow(ProblemDetailsError);
  });

  it("consome eventos SSE e aciona callbacks correspondentes", async () => {
    const sseData = [
      'event: inicio\ndata: {"sessao_id":"sessao-123"}\n\n',
      'event: delta\ndata: {"delta":"<think>pensando...</think>Olá mundo!"}\n\n',
      'event: acao\ndata: {"itens":[{"ferramenta":"bash","resumo":"executando","sucesso":true}]}\n\n',
      'event: fim\ndata: {"resposta":"Olá mundo!"}\n\n',
    ].join("");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseData));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    );

    const onSessaoId = vi.fn();
    const onDelta = vi.fn();
    const onPensamento = vi.fn();
    const onAcao = vi.fn();
    const onFim = vi.fn();

    await executarSecretarioStream({
      url: "/secretario/conversa/stream",
      headers: {},
      body: { mensagem: "oi" },
      callbacks: { onSessaoId, onDelta, onPensamento, onAcao, onFim },
    });

    expect(onSessaoId).toHaveBeenCalledWith("sessao-123");
    expect(onPensamento).toHaveBeenCalledWith("pensando...", "pensando...");
    expect(onDelta).toHaveBeenCalledWith("Olá mundo!", "Olá mundo!");
    expect(onAcao).toHaveBeenCalledWith([
      { ferramenta: "bash", resumo: "executando", sucesso: true },
    ]);
    expect(onFim).toHaveBeenCalled();
  });
});
