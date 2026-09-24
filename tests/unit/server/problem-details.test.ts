/**
 * @file Testes unitários para o módulo RFC 7807 e validador Zod.
 *
 * Cobre:
 * 1. Serialização correta de ProblemDetails
 * 2. Conversão de ZodError complexo em RFC 7807 (status 422)
 * 3. criarProblema — mapeamento automático de status para type/title
 * 4. enviarProblema — headers e serialização na ServerResponse
 * 5. validarCorpo — cenários de sucesso, falha Zod (422), JSON inválido (400)
 * 6. caminhoIssue — formatação legível de paths
 */
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  formatarZodProblem,
  criarProblema,
  enviarProblema,
  ProblemType,
  type ProblemDetails,
} from "../../../src/server/http/problem-details.js";
import { validarCorpo } from "../../../src/server/http/validator.js";
import type { IncomingMessage, ServerResponse } from "node:http";

// ── Helpers ──────────────────────────────────────────────────────────

function criarMockRes(): ServerResponse & {
  _statusCode: number;
  _headers: Record<string, string>;
  _corpo: string;
} {
  const headers: Record<string, string> = {};
  let corpo = "";
  let statusCode = 200;

  return {
    writableEnded: false,
    writeHead(status: number, h?: Record<string, string>) {
      statusCode = status;
      if (h) Object.assign(headers, h);
      return this;
    },
    end(data?: string) {
      if (data) corpo = data;
      (this as unknown as { writableEnded: boolean }).writableEnded = true;
      return this;
    },
    get _statusCode() { return statusCode; },
    get _headers() { return headers; },
    get _corpo() { return corpo; },
  } as unknown as ServerResponse & { _statusCode: number; _headers: Record<string, string>; _corpo: string };
}

function criarMockReq(url = "/test"): IncomingMessage {
  return { url } as IncomingMessage;
}

// ── Testes: ProblemDetails ──────────────────────────────────────────

describe("problem-details.ts — formatarZodProblem", () => {
  it("converte ZodError com campo obrigatório ausente em ProblemDetails 422", () => {
    const schema = z.object({
      nome: z.string().min(2),
      email: z.string().email(),
    });

    const resultado = schema.safeParse({});
    if (resultado.success) throw new Error("deveria falhar");

    const problema = formatarZodProblem(resultado.error, "/api/agentes");

    expect(problema.type).toBe(ProblemType.VALIDATION_FAILED);
    expect(problema.title).toBe("Dados da Requisição Inválidos");
    expect(problema.status).toBe(422);
    expect(problema.instance).toBe("/api/agentes");
    expect(problema.invalidParams).toBeDefined();
    expect(problema.invalidParams!.length).toBe(2);

    const nomes = problema.invalidParams!.map((p) => p.name);
    expect(nomes).toContain("nome");
    expect(nomes).toContain("email");
  });

  it("gera detail singular quando há apenas 1 campo inválido", () => {
    const schema = z.object({ agente: z.string().min(2) });
    const resultado = schema.safeParse({ agente: "a" });
    if (resultado.success) throw new Error("deveria falhar");

    const problema = formatarZodProblem(resultado.error);

    expect(problema.detail).toContain("agente");
    expect(problema.invalidParams!.length).toBe(1);
  });

  it("gera detail plural quando há múltiplos campos inválidos", () => {
    const schema = z.object({
      a: z.string(),
      b: z.number(),
      c: z.boolean(),
    });
    const resultado = schema.safeParse({});
    if (resultado.success) throw new Error("deveria falhar");

    const problema = formatarZodProblem(resultado.error);

    expect(problema.detail).toContain("3 campos");
  });

  it("formata paths aninhados corretamente (config.entao, nos[0].id)", () => {
    const schema = z.object({
      config: z.object({
        entao: z.string(),
      }),
      nos: z.array(z.object({ id: z.string() })),
    });

    const resultado = schema.safeParse({ config: {}, nos: [{}] });
    if (resultado.success) throw new Error("deveria falhar");

    const problema = formatarZodProblem(resultado.error);
    const nomes = problema.invalidParams!.map((p) => p.name);

    expect(nomes).toContain("config.entao");
    expect(nomes).toContain("nos[0].id");
  });

  it("omite instance quando não fornecido", () => {
    const schema = z.object({ x: z.number() });
    const resultado = schema.safeParse({});
    if (resultado.success) throw new Error("deveria falhar");

    const problema = formatarZodProblem(resultado.error);

    expect(problema.instance).toBeUndefined();
  });
});

describe("problem-details.ts — criarProblema", () => {
  it("mapeia status 400 para type BAD_REQUEST", () => {
    const p = criarProblema(400, "corpo ausente");

    expect(p.type).toBe(ProblemType.BAD_REQUEST);
    expect(p.title).toBe("Requisição Inválida");
    expect(p.status).toBe(400);
    expect(p.detail).toBe("corpo ausente");
  });

  it("mapeia status 404 para type NOT_FOUND", () => {
    const p = criarProblema(404, "agente não encontrado", { instance: "/agentes/xyz" });

    expect(p.type).toBe(ProblemType.NOT_FOUND);
    expect(p.instance).toBe("/agentes/xyz");
  });

  it("mapeia status 500+ para type INTERNAL", () => {
    const p = criarProblema(503, "banco de dados indisponível");
    expect(p.type).toBe(ProblemType.INTERNAL);
  });

  it("gera type genérico para status sem mapeamento", () => {
    const p = criarProblema(418, "I'm a teapot");
    expect(p.type).toBe("https://opencorp.dev/errors/http-418");
    expect(p.title).toBe("Erro HTTP 418");
  });

  it("aceita type customizado", () => {
    const p = criarProblema(422, "falha", { type: "https://custom.dev/err" });
    expect(p.type).toBe("https://custom.dev/err");
  });
});

describe("problem-details.ts — enviarProblema", () => {
  it("envia headers corretos e corpo JSON serializado", () => {
    const res = criarMockRes();
    const problema: ProblemDetails = {
      type: ProblemType.NOT_FOUND,
      title: "Recurso Não Encontrado",
      status: 404,
      detail: "Fluxo 'xyz' não existe.",
      instance: "/flows/xyz",
    };

    enviarProblema(res, problema);

    expect(res._statusCode).toBe(404);
    expect(res._headers["content-type"]).toBe("application/problem+json; charset=utf-8");

    const corpo = JSON.parse(res._corpo) as ProblemDetails;
    expect(corpo.type).toBe(ProblemType.NOT_FOUND);
    expect(corpo.detail).toBe("Fluxo 'xyz' não existe.");
  });

  it("não escreve em resposta já finalizada", () => {
    const res = criarMockRes();
    (res as unknown as { writableEnded: boolean }).writableEnded = true;

    const writeHeadSpy = vi.spyOn(res, "writeHead");

    enviarProblema(res, criarProblema(500, "falha"));

    expect(writeHeadSpy).not.toHaveBeenCalled();
  });
});

// ── Testes: validarCorpo ────────────────────────────────────────────

describe("validator.ts — validarCorpo", () => {
  const schema = z.object({
    agente: z.string().min(2),
    modelo: z.string().optional(),
  });

  it("retorna sucesso com dados tipados quando payload é válido", async () => {
    const lerCorpo = vi.fn().mockResolvedValue({ agente: "redator", modelo: "gpt-4" });
    const req = criarMockReq("/api/run");

    const resultado = await validarCorpo(lerCorpo, req, schema);

    expect(resultado.sucesso).toBe(true);
    if (resultado.sucesso) {
      expect(resultado.dados.agente).toBe("redator");
      expect(resultado.dados.modelo).toBe("gpt-4");
    }
  });

  it("retorna sucesso sem campos opcionais", async () => {
    const lerCorpo = vi.fn().mockResolvedValue({ agente: "curador" });
    const req = criarMockReq();

    const resultado = await validarCorpo(lerCorpo, req, schema);

    expect(resultado.sucesso).toBe(true);
    if (resultado.sucesso) {
      expect(resultado.dados.agente).toBe("curador");
      expect(resultado.dados.modelo).toBeUndefined();
    }
  });

  it("retorna problema 422 quando campos obrigatórios estão ausentes", async () => {
    const lerCorpo = vi.fn().mockResolvedValue({});
    const req = criarMockReq("/secretario/stream");

    const resultado = await validarCorpo(lerCorpo, req, schema);

    expect(resultado.sucesso).toBe(false);
    if (!resultado.sucesso) {
      expect(resultado.problema.status).toBe(422);
      expect(resultado.problema.type).toBe(ProblemType.VALIDATION_FAILED);
      expect(resultado.problema.instance).toBe("/secretario/stream");
      expect(resultado.problema.invalidParams).toBeDefined();
      expect(resultado.problema.invalidParams!.some((p) => p.name === "agente")).toBe(true);
    }
  });

  it("retorna problema 422 com tipo errado (number em vez de string)", async () => {
    const lerCorpo = vi.fn().mockResolvedValue({ agente: 42 });
    const req = criarMockReq();

    const resultado = await validarCorpo(lerCorpo, req, schema);

    expect(resultado.sucesso).toBe(false);
    if (!resultado.sucesso) {
      expect(resultado.problema.status).toBe(422);
    }
  });

  it("retorna problema 400 quando lerCorpo lança SyntaxError (JSON inválido)", async () => {
    const lerCorpo = vi.fn().mockRejectedValue(new SyntaxError("Unexpected token"));
    const req = criarMockReq("/api/config");

    const resultado = await validarCorpo(lerCorpo, req, schema);

    expect(resultado.sucesso).toBe(false);
    if (!resultado.sucesso) {
      expect(resultado.problema.status).toBe(400);
      expect(resultado.problema.type).toBe(ProblemType.BAD_REQUEST);
      expect(resultado.problema.detail).toContain("JSON inválido");
      expect(resultado.problema.instance).toBe("/api/config");
    }
  });

  it("retorna problema 400 quando lerCorpo lança erro genérico (ex: corpo excedido)", async () => {
    const lerCorpo = vi.fn().mockRejectedValue(new Error("corpo excede 30000000 bytes"));
    const req = criarMockReq();

    const resultado = await validarCorpo(lerCorpo, req, schema);

    expect(resultado.sucesso).toBe(false);
    if (!resultado.sucesso) {
      expect(resultado.problema.status).toBe(400);
      expect(resultado.problema.detail).toContain("excede");
    }
  });

  it("usa instance customizado quando fornecido", async () => {
    const lerCorpo = vi.fn().mockResolvedValue({});
    const req = criarMockReq("/original");

    const resultado = await validarCorpo(lerCorpo, req, schema, "/custom/instance");

    expect(resultado.sucesso).toBe(false);
    if (!resultado.sucesso) {
      expect(resultado.problema.instance).toBe("/custom/instance");
    }
  });
});
