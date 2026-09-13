import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiServer, type ApiServerOptions, type SessaoApi } from "../src/server/index.js";

const raizes: string[] = [];

describe("Modularização de Rotas HTTP — Meetings e Workspaces (MICRO-PASSO 10)", () => {
  let home: string;
  let token = "token-test-passo10";
  let port: number;
  let server: ReturnType<typeof createApiServer>["server"];
  let fetchApi: (path: string, opts?: RequestInit) => Promise<{ status: number; json: any; headers: Headers }>;

  const fakeSessoes: SessaoApi = {
    async rodar(opcoes) {
      return {
        id: opcoes.execId ?? "exec-10",
        agente: opcoes.agente,
        modelo: opcoes.model ?? "test-model",
        ordem: opcoes.ordem,
        inicio: new Date().toISOString(),
        fim: new Date().toISOString(),
        status: "concluido",
        exit_code: 0,
        duracao_ms: 50,
        pid: null,
        log: "fake.log",
        captura: "ok",
        custo_usd: 0.0001,
      };
    },
    async listarExecucoes() {
      return [];
    },
    async logDe() {
      return "fake log";
    },
  };

  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), "routes-p10-"));
    raizes.push(home);

    const srv = createApiServer({
      homeDir: home,
      token,
      sessoes: fakeSessoes,
      instalarMencoes: false,
    } as ApiServerOptions);
    server = srv.server;
    token = srv.token;
    server.listen(0, "127.0.0.1");
    port = await srv.porta;

    const base = `http://127.0.0.1:${port}`;
    fetchApi = async (path, opts = {}) => {
      const res = await fetch(`${base}${path}`, {
        ...opts,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          ...(opts.headers ?? {}),
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

    await fetchApi("/workspaces", { method: "POST", body: JSON.stringify({ id: "ws-principal" }) });
  });

  afterAll(async () => {
    server.close();
    await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
  });

  const wsParam = "?workspace=ws-principal";

  describe("1. Rotas Modulares de Workspaces", () => {
    it("GET /workspaces lista os workspaces disponíveis", async () => {
      const { status, json } = await fetchApi("/workspaces");
      expect(status).toBe(200);
      expect(Array.isArray(json)).toBe(true);
      expect(json.some((w: any) => w.id === "ws-principal")).toBe(true);
    });

    it("POST /workspaces cria novo workspace com perfil editorial", async () => {
      const { status, json } = await fetchApi("/workspaces", {
        method: "POST",
        body: JSON.stringify({
          id: "ws-secundario",
          perfil: {
            empresa: "Empresa Secundária",
            nicho: "Tecnologia",
            tom: "Técnico e Direto",
          },
        }),
      });
      expect(status).toBe(201);
      expect(json.id).toBe("ws-secundario");
      expect(json.caminho).toContain("ws-secundario");
    });

    it("GET /workspaces/current e GET /workspaces/ativo retornam dados do workspace atual", async () => {
      const r1 = await fetchApi(`/workspaces/current${wsParam}`);
      expect(r1.status).toBe(200);
      expect(r1.json.id).toBe("ws-principal");

      const r2 = await fetchApi(`/workspaces/ativo${wsParam}`);
      expect(r2.status).toBe(200);
      expect(r2.json.id).toBe("ws-principal");
    });

    it("POST /workspaces/ativo alterna o workspace ativo", async () => {
      const { status, json } = await fetchApi("/workspaces/ativo", {
        method: "POST",
        body: JSON.stringify({ id: "ws-secundario" }),
      });
      expect(status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.id).toBe("ws-secundario");

      const atual = await fetchApi("/workspaces/ativo");
      expect(atual.json.id).toBe("ws-secundario");
    });

    it("GET /workspaces/:id detalha configurações do workspace", async () => {
      const { status, json } = await fetchApi("/workspaces/ws-secundario");
      expect(status).toBe(200);
      expect(json.id).toBe("ws-secundario");
      expect(json.path).toBeDefined();
    });

    it("DELETE /workspaces/:id remove workspace", async () => {
      // cria temporário para deleção
      await fetchApi("/workspaces", { method: "POST", body: JSON.stringify({ id: "ws-temp-del" }) });

      const del = await fetchApi("/workspaces/ws-temp-del", { method: "DELETE" });
      expect(del.status).toBe(200);
      expect(del.json.ok).toBe(true);
      expect(del.json.id).toBe("ws-temp-del");

      const lista = await fetchApi("/workspaces");
      expect(lista.json.some((w: any) => w.id === "ws-temp-del")).toBe(false);
    });
  });

  describe("2. Rotas Modulares de Meetings (Reuniões)", () => {
    let meetingChatId = "";

    it("GET /meetings lista reuniões existentes", async () => {
      const { status, json } = await fetchApi(`/meetings${wsParam}`);
      expect(status).toBe(200);
      expect(Array.isArray(json)).toBe(true);
    });

    it("POST /meetings com pauta vazia retorna 422", async () => {
      const { status } = await fetchApi(`/meetings${wsParam}`, {
        method: "POST",
        body: JSON.stringify({ pauta: "   " }),
      });
      expect(status).toBe(422);
    });

    it("POST /meetings inicia reunião com 202 e status iniciado", async () => {
      const { status, json } = await fetchApi(`/meetings${wsParam}`, {
        method: "POST",
        body: JSON.stringify({ pauta: "Alinhamento Estratégico Q3" }),
      });
      expect(status).toBe(202);
      expect(json.status).toBe("iniciado");
      expect(json.id).toMatch(/^reuniao-/);
    });

    it("POST /meetings/chat cria reunião em modo chat interativo", async () => {
      const { status, json } = await fetchApi(`/meetings/chat${wsParam}`, {
        method: "POST",
        body: JSON.stringify({ pauta: "Brainstorming de Arquitetura Modular" }),
      });
      expect(status).toBe(201);
      expect(json.ok).toBe(true);
      expect(json.id).toMatch(/^reuniao-/);
      expect(json.pauta).toBe("Brainstorming de Arquitetura Modular");
      meetingChatId = json.id;
    });

    it("GET /meetings/:id retorna detalhes da sala", async () => {
      const { status, json } = await fetchApi(`/meetings/${meetingChatId}${wsParam}`);
      expect(status).toBe(200);
      expect(json.id).toBe(meetingChatId);
      expect(json.pauta).toBe("Brainstorming de Arquitetura Modular");
      expect(Array.isArray(json.mensagens)).toBe(true);
    });

    it("POST /meetings/:id/mensagem envia mensagem do usuário e registra na reunião", async () => {
      const { status, json } = await fetchApi(`/meetings/${meetingChatId}/mensagem${wsParam}`, {
        method: "POST",
        body: JSON.stringify({
          mensagem: "Olá time, qual é o plano de migração?",
          responder: false,
        }),
      });
      expect(status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.mensagemUsuario.texto).toBe("Olá time, qual é o plano de migração?");
      expect(json.estado.mensagens.some((m: any) => m.texto.includes("plano de migração"))).toBe(true);
    });

    it("POST /meetings/:id/concluir encerra a reunião e gera ata", async () => {
      const { status, json } = await fetchApi(`/meetings/${meetingChatId}/concluir${wsParam}`, {
        method: "POST",
      });
      expect(status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.id).toBe(meetingChatId);
      expect(json.status).toBe("encerrada");
    });

    it("GET /meetings/:id desconhecida retorna 404", async () => {
      const { status, json } = await fetchApi(`/meetings/reuniao-fantasma-inexistente${wsParam}`);
      expect(status).toBe(404);
      expect(json.erro).toContain("não encontrada");
    });

    it("Suporta aliases em português /reunioes", async () => {
      const { status, json } = await fetchApi(`/reunioes${wsParam}`);
      expect(status).toBe(200);
      expect(Array.isArray(json)).toBe(true);
    });
  });
});
