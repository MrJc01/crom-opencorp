import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  compararTokensSeguro,
  extrairTokenBearer,
  extrairTokenRequisicao,
  verificarAutenticacao,
} from "../src/server/middleware/auth.js";
import {
  ehOrigemPermitida,
  obterHeadersCors,
  processarCors,
} from "../src/server/middleware/cors.js";
import { createApiServer } from "../src/server/index.js";

const raizes: string[] = [];

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

describe("Middlewares de Segurança da API (MICRO-PASSO 8)", () => {
  describe("1. Autenticação & Prevenção de Timing Attack", () => {
    it("compara tokens idênticos retornando true", () => {
      expect(compararTokensSeguro("segredo-super-secreto-123", "segredo-super-secreto-123")).toBe(true);
    });

    it("compara tokens de tamanhos diferentes sem disparar exceção", () => {
      expect(compararTokensSeguro("curto", "um-token-muito-mais-longo-que-o-primeiro")).toBe(false);
      expect(compararTokensSeguro("a", "abcde")).toBe(false);
      expect(compararTokensSeguro("12345678", "1234567")).toBe(false);
    });

    it("compara tokens de mesmo tamanho mas conteúdos diferentes retornando false", () => {
      expect(compararTokensSeguro("token-secreto-a", "token-secreto-b")).toBe(false);
    });

    it("rejeita tokens vazios, nulos ou indefinidos de forma segura", () => {
      expect(compararTokensSeguro("", "")).toBe(false);
      expect(compararTokensSeguro(null, "token")).toBe(false);
      expect(compararTokensSeguro("token", undefined)).toBe(false);
      expect(compararTokensSeguro(null, null)).toBe(false);
    });

    it("extrai token do header Authorization: Bearer <token> case-insensitive", () => {
      expect(extrairTokenBearer("Bearer meu-token-123")).toBe("meu-token-123");
      expect(extrairTokenBearer("bearer meu-token-123")).toBe("meu-token-123");
      expect(extrairTokenBearer("  BEARER   token-espacado   ")).toBe("token-espacado");
      expect(extrairTokenBearer("Basic dXNlcjpwYXNz")).toBeNull();
      expect(extrairTokenBearer("")).toBeNull();
      expect(extrairTokenBearer(undefined)).toBeNull();
    });

    it("extrairTokenRequisicao prioriza header Bearer sobre query string", () => {
      const req = {
        headers: { authorization: "Bearer token-header" },
      } as IncomingMessage;
      const url = new URL("http://localhost:4399/tasks?token=token-query");

      const resultado = extrairTokenRequisicao(req, url, true);
      expect(resultado.token).toBe("token-header");
      expect(resultado.via).toBe("bearer");
    });

    it("extrairTokenRequisicao aceita query string quando permitido para transição e SSE", () => {
      const req = {
        headers: {},
      } as IncomingMessage;
      const url = new URL("http://localhost:4399/events?token=token-query");

      const resultado = extrairTokenRequisicao(req, url, true);
      expect(resultado.token).toBe("token-query");
      expect(resultado.via).toBe("query");
    });

    it("extrairTokenRequisicao rejeita query string quando desativado", () => {
      const req = {
        headers: {},
      } as IncomingMessage;
      const url = new URL("http://localhost:4399/events?token=token-query");

      const resultado = extrairTokenRequisicao(req, url, false);
      expect(resultado.token).toBeNull();
      expect(resultado.via).toBe("none");
    });

    it("verificarAutenticacao libera rotas públicas (/health, /doc, /status, webhooks)", () => {
      const req = { headers: {} } as IncomingMessage;

      expect(verificarAutenticacao(req, new URL("http://local/health"), "/health", { tokenEsperado: "token" }).autenticado).toBe(true);
      expect(verificarAutenticacao(req, new URL("http://local/doc"), "/doc", { tokenEsperado: "token" }).autenticado).toBe(true);
      expect(verificarAutenticacao(req, new URL("http://local/status"), "/status", { tokenEsperado: "token" }).autenticado).toBe(true);
      expect(verificarAutenticacao(req, new URL("http://local/hooks/deploy/prod"), "/hooks/deploy/prod", { tokenEsperado: "token" }).autenticado).toBe(true);
    });

    it("verificarAutenticacao rejeita token incorreto ou ausente em rotas privadas", () => {
      const reqSemAuth = { headers: {} } as IncomingMessage;
      const r1 = verificarAutenticacao(reqSemAuth, new URL("http://local/workspaces"), "/workspaces", { tokenEsperado: "segredo" });
      expect(r1.autenticado).toBe(false);

      const reqAuthErrado = { headers: { authorization: "Bearer errado" } } as IncomingMessage;
      const r2 = verificarAutenticacao(reqAuthErrado, new URL("http://local/workspaces"), "/workspaces", { tokenEsperado: "segredo" });
      expect(r2.autenticado).toBe(false);
    });
  });

  describe("2. Middleware de CORS Restrito", () => {
    it("permite origens loopback padrão (localhost e 127.0.0.1 em qualquer porta)", () => {
      expect(ehOrigemPermitida("http://localhost:3000")).toBe(true);
      expect(ehOrigemPermitida("http://localhost:5173")).toBe(true);
      expect(ehOrigemPermitida("http://127.0.0.1:4399")).toBe(true);
      expect(ehOrigemPermitida("https://localhost:8443")).toBe(true);
      expect(ehOrigemPermitida(null)).toBe(true);
      expect(ehOrigemPermitida(undefined)).toBe(true);
    });

    it("rejeita origens externas desconhecidas por padrão", () => {
      expect(ehOrigemPermitida("https://attacker.evil.com")).toBe(false);
      expect(ehOrigemPermitida("http://malicious-site.org")).toBe(false);
      expect(ehOrigemPermitida("https://external-domain.com")).toBe(false);
    });

    it("permite origens adicionais configuradas explicitamente", () => {
      const permitidas = ["https://painel.minhaempresa.com", "https://app.opencorp.ai"];
      expect(ehOrigemPermitida("https://painel.minhaempresa.com", permitidas)).toBe(true);
      expect(ehOrigemPermitida("https://app.opencorp.ai", permitidas)).toBe(true);
      expect(ehOrigemPermitida("https://outro.com", permitidas)).toBe(false);
    });

    it("obterHeadersCors reflete a origem permitida com vary: Origin", () => {
      const req = { headers: { origin: "http://localhost:3000" } } as IncomingMessage;
      const headers = obterHeadersCors(req);
      expect(headers["access-control-allow-origin"]).toBe("http://localhost:3000");
      expect(headers["vary"]).toBe("Origin");
    });

    it("processarCors bloqueia mutações (POST, PUT, DELETE) vindas de origens não permitidas com 403", () => {
      let statusRetornado = 0;
      let corpoRetornado = "";
      const res = {
        setHeader() {},
        writeHead(status: number) { statusRetornado = status; },
        end(data?: string) { corpoRetornado = data ?? ""; },
      } as unknown as ServerResponse;

      const reqPost = {
        method: "POST",
        headers: { origin: "https://evil-site.com" },
      } as IncomingMessage;

      const prosseguir = processarCors(reqPost, res, { bloquearMutacaoDesconhecida: true });
      expect(prosseguir).toBe(false);
      expect(statusRetornado).toBe(403);
      expect(corpoRetornado).toContain("CORS");
    });

    it("processarCors responde preflight OPTIONS para origem confiável com 204", () => {
      let statusRetornado = 0;
      let headersSet: Record<string, string> = {};
      const res = {
        setHeader(k: string, v: string) { headersSet[k] = v; },
        writeHead(status: number) { statusRetornado = status; },
        end() {},
      } as unknown as ServerResponse;

      const reqOptions = {
        method: "OPTIONS",
        headers: { origin: "http://localhost:3000" },
      } as IncomingMessage;

      const prosseguir = processarCors(reqOptions, res);
      expect(prosseguir).toBe(false);
      expect(statusRetornado).toBe(204);
      expect(headersSet["access-control-allow-origin"]).toBe("http://localhost:3000");
    });
  });

  describe("3. Servidor de API com Middlewares Integrados (End-to-End)", () => {
    let porta: number;
    let token = "token-secreto-teste";
    let server: ReturnType<typeof createApiServer>["server"];

    beforeAll(async () => {
      const home = await mkdtemp(join(tmpdir(), "sec-middleware-srv-"));
      raizes.push(home);

      const api = createApiServer({
        homeDir: home,
        cwd: home,
        token,
        instalarMencoes: false,
      });
      server = api.server;
      server.listen(0, "127.0.0.1");
      porta = await api.porta;
    });

    afterAll(() => {
      server.close();
    });

    it("GET /workspaces sem token retorna 401", async () => {
      const res = await fetch(`http://127.0.0.1:${porta}/workspaces`);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.erro).toContain("token");
    });

    it("GET /workspaces com token incorreto retorna 401", async () => {
      const res = await fetch(`http://127.0.0.1:${porta}/workspaces`, {
        headers: { authorization: "Bearer token-invalido" },
      });
      expect(res.status).toBe(401);
    });

    it("GET /workspaces com Authorization: Bearer correto retorna 200", async () => {
      const res = await fetch(`http://127.0.0.1:${porta}/workspaces`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
    });

    it("GET /workspaces com ?token=<token> via query string é aceito por compatibilidade", async () => {
      const res = await fetch(`http://127.0.0.1:${porta}/workspaces?token=${token}`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
    });

    it("POST /workspaces com Origin externa desconhecida é bloqueado com 403 pelo CORS", async () => {
      const res = await fetch(`http://127.0.0.1:${porta}/workspaces`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          origin: "https://evil-cross-site-origin.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({ id: "malicious-workspace" }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.erro).toContain("CORS");
    });

    it("OPTIONS preflight para origem confiável retorna 204 com headers CORS permitidos", async () => {
      const res = await fetch(`http://127.0.0.1:${porta}/workspaces`, {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:5173",
        },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    });
  });
});
