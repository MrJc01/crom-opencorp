import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiServer, type ApiServerOptions, type SessaoApi } from "../src/server/index.js";

const raizes: string[] = [];

/** Perfis de app no secrets.json (PLANO-PAINEL-V2 Etapa 4.1):
 *  PUT app:<tipo>:<id> valida JSON por tipo; GET nunca retorna valores. */
describe("API — perfis de app em /secrets", () => {
  let home: string;
  let token = "t1";
  let port: number;
  let fetchApi: (path: string, opts?: RequestInit) => Promise<{ status: number; json: any; headers: Headers }>;
  let server: ReturnType<typeof createApiServer>["server"];

  const fakeSessoes: SessaoApi = {
    async rodar(opcoes) {
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

  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), "opencorp-app-perfis-"));
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
        headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
      });
      const text = await res.text();
      let json: unknown;
      try { json = text ? JSON.parse(text) : undefined; } catch { json = text; }
      return { status: res.status, json, headers: res.headers };
    };
  });

  afterAll(async () => {
    server.close();
    await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
  });

  it("PUT app:vps:x válido → 200 e GET /secrets mostra {nome, definido, tipo_app} SEM valor", async () => {
    const valor = JSON.stringify({
      rotulo: "Servidor de produção",
      host: "203.0.113.10",
      porta: 22,
      usuario: "deploy",
      senha: "senhasupersecreta-vps",
      chave_ssh: "ssh-ed25519 AAAA",
      notas: "n1",
    });
    const put = await fetchApi("/secrets/app%3Avps%3Ax", { method: "PUT", body: JSON.stringify({ valor }) });
    expect(put.status).toBe(200);

    const lista = await fetchApi("/secrets");
    expect(lista.status).toBe(200);
    const entrada = (lista.json as Array<Record<string, unknown>>).find((s) => s.nome === "app:vps:x");
    expect(entrada).toBeDefined();
    expect(entrada!.definido).toBe(true);
    expect(entrada!.tipo_app).toBe("vps");
    expect(Object.keys(entrada!).sort()).toEqual(["definido", "nome", "tipo_app"]);
    expect(JSON.stringify(lista.json)).not.toContain("senhasupersecreta-vps");
    expect(JSON.stringify(lista.json)).not.toContain("203.0.113.10");
  });

  it("PUT app:cartao:y com numero_completo (ou cvv) → 422", async () => {
    const comNumero = await fetchApi("/secrets/app%3Acartao%3Ay", {
      method: "PUT",
      body: JSON.stringify({
        valor: JSON.stringify({ rotulo: "R", bandeira: "visa", ultimos4: "4242", validade: "12/29", numero_completo: "4111111111111111" }),
      }),
    });
    expect(comNumero.status).toBe(422);
    expect((comNumero.json as { erro?: string }).erro).toMatch(/proibido/i);

    const comCvv = await fetchApi("/secrets/app%3Acartao%3Ay", {
      method: "PUT",
      body: JSON.stringify({
        valor: JSON.stringify({ rotulo: "R", bandeira: "visa", ultimos4: "4242", validade: "12/29", cvv: "123" }),
      }),
    });
    expect(comCvv.status).toBe(422);
    expect((comCvv.json as { erro?: string }).erro).toMatch(/proibido/i);
  });

  it("PUT app:mercadopago:z com ambiente 'staging' → 422", async () => {
    const put = await fetchApi("/secrets/app%3Amercadopago%3Az", {
      method: "PUT",
      body: JSON.stringify({
        valor: JSON.stringify({ rotulo: "MP", public_key: "pk", access_token: "tk", ambiente: "staging" }),
      }),
    });
    expect(put.status).toBe(422);
    expect((put.json as { erro?: string }).erro).toMatch(/ambiente|inválido/i);
  });

  it("PUT app:vps:BAD_ID (nome fora do padrão) → 422; JSON inválido no valor → 422", async () => {
    const nomeRuim = await fetchApi("/secrets/app%3Avps%3ABAD_ID", {
      method: "PUT",
      body: JSON.stringify({ valor: JSON.stringify({ rotulo: "R", host: "h", usuario: "u" }) }),
    });
    expect(nomeRuim.status).toBe(422);

    const jsonRuim = await fetchApi("/secrets/app%3Avps%3Ax", {
      method: "PUT",
      body: JSON.stringify({ valor: "não sou json" }),
    });
    expect(jsonRuim.status).toBe(422);

    const campoFaltando = await fetchApi("/secrets/app%3Awordpress%3Aw1", {
      method: "PUT",
      body: JSON.stringify({ valor: JSON.stringify({ rotulo: "R", url: "https://x.com" }) }),
    });
    expect(campoFaltando.status).toBe(422);
  });

  it("PUT de secret simples (nome comum) continua funcionando — tipo_app null", async () => {
    const put = await fetchApi("/secrets/minha_api_key", { method: "PUT", body: JSON.stringify({ valor: "abc123" }) });
    expect(put.status).toBe(200);
    const lista = await fetchApi("/secrets");
    const entrada = (lista.json as Array<Record<string, unknown>>).find((s) => s.nome === "minha_api_key");
    expect(entrada).toBeDefined();
    expect(entrada!.definido).toBe(true);
    expect(entrada!.tipo_app).toBeNull();
  });

  it("PUT app:custom:c1 válido → 200 e tipo_app 'custom'", async () => {
    const put = await fetchApi("/secrets/app%3Acustom%3Ac1", {
      method: "PUT",
      body: JSON.stringify({ valor: JSON.stringify({ rotulo: "Docs", conteudo: "chave api xyz", notas: "n" }) }),
    });
    expect(put.status).toBe(200);
    const lista = await fetchApi("/secrets");
    const entrada = (lista.json as Array<Record<string, unknown>>).find((s) => s.nome === "app:custom:c1");
    expect(entrada).toBeDefined();
    expect(entrada!.tipo_app).toBe("custom");
    expect(JSON.stringify(lista.json)).not.toContain("chave api xyz");
  });

  it("DELETE app:vps:x → some da lista (definido:false)", async () => {
    const del = await fetchApi("/secrets/app%3Avps%3Ax", { method: "DELETE" });
    expect(del.status).toBe(200);
    const lista = await fetchApi("/secrets");
    const aindaExiste = (lista.json as Array<{ nome: string }>).some((s) => s.nome === "app:vps:x");
    expect(aindaExiste).toBe(false);
  });
});
