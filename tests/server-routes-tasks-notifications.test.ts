import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiServer, type ApiServerOptions, type SessaoApi } from "../src/server/index.js";

const raizes: string[] = [];

describe("Modularização de Rotas HTTP — Tasks e Notificações (MICRO-PASSO 9)", () => {
  let home: string;
  let token = "token-test-passo9";
  let port: number;
  let server: ReturnType<typeof createApiServer>["server"];
  let fetchApi: (path: string, opts?: RequestInit) => Promise<{ status: number; json: any; headers: Headers }>;

  const fakeSessoes: SessaoApi = {
    async rodar(opcoes) {
      return {
        id: opcoes.execId ?? "exec-1",
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
    home = await mkdtemp(join(tmpdir(), "routes-p9-"));
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

    await fetchApi("/workspaces", { method: "POST", body: JSON.stringify({ id: "ws-p9" }) });
  });

  afterAll(async () => {
    server.close();
    await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
  });

  const wsParam = "?workspace=ws-p9";

  describe("1. Rotas Modulares de Tasks", () => {
    let taskId = "";

    it("GET /tasks/colunas retorna as colunas padrão", async () => {
      const { status, json } = await fetchApi(`/tasks/colunas${wsParam}`);
      expect(status).toBe(200);
      expect(Array.isArray(json)).toBe(true);
      expect(json.includes("a_fazer") || json.includes("backlog")).toBe(true);
    });

    it("POST /tasks cria nova task com sucesso", async () => {
      const { status, json } = await fetchApi(`/tasks${wsParam}`, {
        method: "POST",
        body: JSON.stringify({
          titulo: "Implementar autenticação modular",
          descricao: "Extração de rotas e testes",
          prioridade: "alta",
          labels: ["backend", "seguranca"],
        }),
      });
      expect(status).toBe(201);
      expect(json.id).toMatch(/^tsk-/);
      expect(json.titulo).toBe("Implementar autenticação modular");
      expect(json.labels).toEqual(["backend", "seguranca"]);
      taskId = json.id;
    });

    it("GET /tasks lista a task criada", async () => {
      const { status, json } = await fetchApi(`/tasks${wsParam}`);
      expect(status).toBe(200);
      expect(Array.isArray(json)).toBe(true);
      expect(json.some((t: any) => t.id === taskId)).toBe(true);
    });

    it("GET /tasks/:id retorna os detalhes e flag de bloqueada", async () => {
      const { status, json } = await fetchApi(`/tasks/${taskId}${wsParam}`);
      expect(status).toBe(200);
      expect(json.id).toBe(taskId);
      expect(json.bloqueada).toBe(false);
    });

    it("POST /tasks/:id/move move para outra coluna", async () => {
      const { status, json } = await fetchApi(`/tasks/${taskId}/move${wsParam}`, {
        method: "POST",
        body: JSON.stringify({ coluna: "fazendo" }),
      });
      expect(status).toBe(200);
      expect(json.coluna).toBe("fazendo");
    });

    it("POST /tasks/:id/mover (alias) também move com sucesso", async () => {
      const { status, json } = await fetchApi(`/tasks/${taskId}/mover${wsParam}`, {
        method: "POST",
        body: JSON.stringify({ coluna: "concluido" }),
      });
      expect(status).toBe(200);
      expect(json.coluna).toBe("concluido");
    });

    it("POST /tasks/:id/lock e DELETE /tasks/:id/lock gerenciam a trava", async () => {
      const trava = await fetchApi(`/tasks/${taskId}/lock${wsParam}`, {
        method: "POST",
        body: JSON.stringify({ por: "agente-x", minutos: 10 }),
      });
      expect(trava.status).toBe(200);
      expect(trava.json.lock_por).toBe("agente-x");

      const destrava = await fetchApi(`/tasks/${taskId}/lock${wsParam}`, {
        method: "DELETE",
        body: JSON.stringify({ por: "agente-x" }),
      });
      expect(destrava.status).toBe(200);
      expect(destrava.json.lock_por).toBeNull();
    });

    it("POST /tasks/:id/chat adiciona comentário e GET /tasks/:id/chat lista", async () => {
      const msg = await fetchApi(`/tasks/${taskId}/chat${wsParam}`, {
        method: "POST",
        body: JSON.stringify({
          autor: "revisor",
          corpo: "Revisão concluída com 100% de aprovação.",
          tipo: "decisao",
        }),
      });
      expect(msg.status).toBe(201);
      expect(msg.json.autor).toBe("revisor");

      const chat = await fetchApi(`/tasks/${taskId}/chat${wsParam}`);
      expect(chat.status).toBe(200);
      expect(Array.isArray(chat.json)).toBe(true);
      expect(chat.json.some((m: any) => m.corpo.includes("Revisão concluída"))).toBe(true);
    });

    it("PATCH /tasks/:id edita campos da task", async () => {
      const { status, json } = await fetchApi(`/tasks/${taskId}${wsParam}`, {
        method: "PATCH",
        body: JSON.stringify({
          titulo: "Título atualizado pelo PATCH",
        }),
      });
      expect(status).toBe(200);
      expect(json.titulo).toBe("Título atualizado pelo PATCH");
    });

    it("DELETE /tasks/:id exclui a task", async () => {
      const { status, json } = await fetchApi(`/tasks/${taskId}${wsParam}`, {
        method: "DELETE",
      });
      expect(status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.id).toBe(taskId);

      const posDelete = await fetchApi(`/tasks/${taskId}${wsParam}`);
      expect(posDelete.status).toBe(404);
    });
  });

  describe("2. Rotas Modulares de Notificações", () => {
    let notifId = "";

    it("POST /notifications cria uma nova notificação", async () => {
      const { status, json } = await fetchApi(`/notifications${wsParam}`, {
        method: "POST",
        body: JSON.stringify({
          titulo: "Alerta de Build",
          corpo: "Build e testes passaram no CI.",
          tipo: "info",
          origem: "pipeline",
        }),
      });
      expect(status).toBe(201);
      expect(json.id).toMatch(/^not-/);
      expect(json.titulo).toBe("Alerta de Build");
      expect(json.lida).toBe(false);
      notifId = json.id;
    });

    it("GET /notifications lista notificações com resumo", async () => {
      const { status, json } = await fetchApi(`/notifications${wsParam}`);
      expect(status).toBe(200);
      expect(json.notificacoes.length).toBeGreaterThanOrEqual(1);
      expect(json.resumo.nao_lidas).toBeGreaterThanOrEqual(1);
    });

    it("POST /notifications/:id/lida marca uma notificação específica", async () => {
      const { status, json } = await fetchApi(`/notifications/${notifId}/lida${wsParam}`, {
        method: "POST",
      });
      expect(status).toBe(200);
      expect(json.lida).toBe(true);
    });

    it("POST /notifications/lidas marca todas como lidas", async () => {
      await fetchApi(`/notifications${wsParam}`, {
        method: "POST",
        body: JSON.stringify({ titulo: "Outra notif", corpo: "corpo" }),
      });
      const { status, json } = await fetchApi(`/notifications/lidas${wsParam}`, {
        method: "POST",
      });
      expect(status).toBe(200);
      expect(json.ok).toBe(true);

      const lista = await fetchApi(`/notifications${wsParam}`);
      expect(lista.json.resumo.nao_lidas).toBe(0);
    });

    it("DELETE /notifications limpa o repositório de notificações", async () => {
      const { status, json } = await fetchApi(`/notifications${wsParam}`, {
        method: "DELETE",
      });
      expect(status).toBe(200);
      expect(json.ok).toBe(true);

      const lista = await fetchApi(`/notifications${wsParam}`);
      expect(lista.json.notificacoes).toHaveLength(0);
    });

    it("Suporta aliases em português /notificacoes", async () => {
      const criada = await fetchApi(`/notificacoes${wsParam}`, {
        method: "POST",
        body: JSON.stringify({ titulo: "Notificação em PT", corpo: "teste" }),
      });
      expect(criada.status).toBe(201);

      const lista = await fetchApi(`/notificacoes${wsParam}`);
      expect(lista.status).toBe(200);
      expect(lista.json.notificacoes.length).toBe(1);

      const limpa = await fetchApi(`/notificacoes${wsParam}`, { method: "DELETE" });
      expect(limpa.status).toBe(200);
    });
  });
});
