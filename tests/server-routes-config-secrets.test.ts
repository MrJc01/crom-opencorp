import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiServer, type SessaoApi } from "../src/server/index.js";

const raizes: string[] = [];

async function tmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "opencorp-config-secrets-"));
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

describe("Rotas Modulares de Configurações, Segredos, Motores e Apps (Micro-Passo 13)", () => {
  let home: string;
  let token = "test-token-config-secrets";
  let port: number;
  let fetchApi: ReturnType<typeof makeFetch>;
  let server: ReturnType<typeof createApiServer>["server"];

  const fakeSessoes: SessaoApi = {
    async rodar(opcoes) {
      return {
        id: opcoes.execId,
        agente: opcoes.agente,
        modelo: opcoes.model ?? "model-mock",
        ordem: opcoes.ordem,
        inicio: new Date().toISOString(),
        fim: new Date().toISOString(),
        status: "concluido",
      };
    },
    async listarExecucoes() {
      return [];
    },
    async logDe(_ws, id) {
      return `[LOG-EXEC ${id}] ok`;
    },
    async cancelar(_ws, _id) {
      return true;
    },
    async retomarDoErro(_ws, _id) {
      return { execId: "retry-1", status: "retomado" };
    },
    async reenviar(_ws, _id) {
      return { execId: "reenvio-1", status: "reenviado" };
    },
    async streamLog() {
      return () => undefined;
    },
  };

  beforeAll(async () => {
    home = await tmpDir();
    const inst = createApiServer({
      homeDir: home,
      token,
      sessoes: fakeSessoes,
    });
    server = inst.server;
    await new Promise<void>((res) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        port = typeof addr === "object" && addr ? addr.port : 0;
        res();
      });
    });
    fetchApi = makeFetch(port, token);

    // Inicializa workspace para rotas dependentes de contexto
    await fetchApi("/workspaces", {
      method: "POST",
      body: JSON.stringify({ id: "ws-config" }),
    });
  });

  afterAll(async () => {
    await new Promise<void>((res) => server.close(() => res()));
    for (const r of raizes) {
      await rm(r, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  describe("Configurações (/settings, /config)", () => {
    it("GET /settings e GET /config retornam as configurações ativas", async () => {
      const res1 = await fetchApi("/settings");
      expect(res1.status).toBe(200);
      expect(typeof res1.json).toBe("object");

      const res2 = await fetchApi("/config");
      expect(res2.status).toBe(200);
      expect(typeof res2.json).toBe("object");

      const resGlobal = await fetchApi("/settings?escopo=global");
      expect(resGlobal.status).toBe(200);
      expect(typeof resGlobal.json).toBe("object");
    });

    it("PUT /settings atualiza configurações com validação", async () => {
      const updateRes = await fetchApi("/settings", {
        method: "PUT",
        body: JSON.stringify({
          chave: "budget.per_agent_usd",
          valor: "5.0",
          scope: "workspace",
        }),
      });
      expect(updateRes.status).toBe(200);

      const getRes = await fetchApi("/settings");
      const entradas = (getRes.json as any) as Array<{ chave: string; valor: string }>;
      const item = entradas.find((e) => e.chave === "budget.per_agent_usd");
      expect(item).toBeDefined();
      expect(Number(item!.valor)).toBe(5);
    });

    it("GET e PUT /settings/seguranca manipulam política de segurança", async () => {
      const getSec = await fetchApi("/settings/seguranca");
      expect(getSec.status).toBe(200);

      const putSec = await fetchApi("/settings/seguranca", {
        method: "PUT",
        body: JSON.stringify({
          politica: "moderada",
        }),
      });
      expect(putSec.status).toBe(200);
      expect((putSec.json as any)?.ok).toBe(true);
    });
  });

  describe("Segredos (/secrets)", () => {
    it("POST /secrets salva um segredo com chave e valor", async () => {
      const res = await fetchApi("/secrets", {
        method: "POST",
        body: JSON.stringify({
          nome: "OPENAI_API_KEY",
          valor: "sk-super-secret-key-1234567890",
        }),
      });
      expect(res.status).toBe(201);
      const json = res.json as any;
      expect(json.ok).toBe(true);
      expect(json.nome).toBe("OPENAI_API_KEY");
    });

    it("GET /secrets lista segredos com valor estritamente mascarado", async () => {
      const res = await fetchApi("/secrets");
      expect(res.status).toBe(200);
      const lista = res.json as any[];
      expect(Array.isArray(lista)).toBe(true);

      const secret = lista.find((s: any) => s.nome === "OPENAI_API_KEY");
      expect(secret).toBeDefined();
      expect(secret.definido).toBe(true);
      expect(secret.origem).toBeDefined();
      expect(secret.valor).toBeUndefined();
    });

    it("DELETE /secrets/:nome remove o segredo", async () => {
      const delRes = await fetchApi("/secrets/OPENAI_API_KEY", {
        method: "DELETE",
      });
      expect(delRes.status).toBe(200);
      expect((delRes.json as any)?.ok).toBe(true);

      const listRes = await fetchApi("/secrets");
      const lista = listRes.json as any[];
      const secret = lista.find((s: any) => s.nome === "OPENAI_API_KEY");
      expect(secret).toBeUndefined();
    });
  });

  describe("Motores e Modelos (/engines, /motores, /modelos, /engine-accounts)", () => {
    it("GET /modelos retorna o catálogo de modelos", async () => {
      const res = await fetchApi("/modelos");
      expect(res.status).toBe(200);
      const json = res.json as any;
      expect(json.default_model).toBeDefined();
    });

    it("GET /engines e /motores retornam diagnóstico dos motores de execução", async () => {
      const resEngines = await fetchApi("/engines");
      expect(resEngines.status).toBe(200);

      const resMotores = await fetchApi("/motores");
      expect(resMotores.status).toBe(200);
      const json = resMotores.json as any;
      expect(json.ok).toBe(true);
      expect(Array.isArray(json.motores)).toBe(true);
    });

    it("GET /engine-accounts lista contas multi-motor", async () => {
      const res = await fetchApi("/engine-accounts");
      expect(res.status).toBe(200);
      const json = res.json as any;
      expect(Array.isArray(json.contas) || Array.isArray(json)).toBe(true);
    });

    it("GET /motores/status retorna status dos motores", async () => {
      const res = await fetchApi("/motores/status");
      expect(res.status).toBe(200);
      const json = res.json as any;
      expect(json.ok).toBe(true);
    });
  });

  describe("Mini-Apps (/apps, /api/apps)", () => {
    let appId: string;

    it("GET /apps lista as mini-aplicações", async () => {
      const res = await fetchApi("/apps");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.json)).toBe(true);
    });

    it("POST /api/apps/novo cria um novo mini-app", async () => {
      const res = await fetchApi("/api/apps/novo", {
        method: "POST",
        body: JSON.stringify({
          id: "calculadora-test",
          titulo: "Calculadora de Teste",
          descricao: "App simples para testar rotas",
          htmlInicial: "<!DOCTYPE html><html><body><h1>Calculadora</h1></body></html>",
        }),
      });
      expect(res.status).toBe(201);
      const json = res.json as any;
      expect(json.id).toBe("calculadora-test");
      appId = json.id;
    });

    it("GET /api/apps/:id/view renderiza os arquivos do app", async () => {
      const res = await fetchApi(`/api/apps/${appId}/view`);
      expect(res.status).toBe(200);
      expect(typeof res.json === "string" || typeof res.json === "object").toBe(true);
    });

    it("DELETE /apps/:id remove o mini-app", async () => {
      const res = await fetchApi(`/apps/${appId}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      expect((res.json as any)?.ok).toBe(true);
    });
  });
});
