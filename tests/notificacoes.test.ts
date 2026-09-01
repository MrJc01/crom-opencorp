import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiServer, type ApiServerOptions, type SessaoApi } from "../src/server/index.js";
import { ToolRegistry } from "../src/core/tool-registry.js";
import { eventBus } from "../src/core/event-bus.js";
import { CAP_NOTIFICACOES } from "../src/core/notification-store.js";

const raizes: string[] = [];

/** Etapa 7 (P-24) — notificações: endpoints + tool `notificar` */
describe("API — notificações", () => {
  let home: string;
  let token = "t1";
  let port: number;
  let fetchApi: (path: string, opts?: RequestInit) => Promise<{ status: number; json: any; headers: Headers }>;
  let server: ReturnType<typeof createApiServer>["server"];
  let wsPath = "";

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
    home = await mkdtemp(join(tmpdir(), "opencorp-notif-"));
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
    const criado = await fetchApi("/workspaces", { method: "POST", body: JSON.stringify({ id: "ws1" }) });
    wsPath = (criado.json as { caminho: string }).caminho;
    await fetchApi("/notifications?workspace=ws1", { method: "DELETE" });
  });

  afterAll(async () => {
    server.close();
    await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
  });

  const wsq = "?workspace=ws1";

  it("POST /notifications cria (201 com id) e GET lista com resumo.nao_lidas", async () => {
    const criada = await fetchApi(`/notifications${wsq}`, {
      method: "POST",
      body: JSON.stringify({ titulo: "Resumo da execução", corpo: "Publicamos 3 posts no blog.", tipo: "resumo", origem: "conteudo" }),
    });
    expect(criada.status).toBe(201);
    expect((criada.json as { id: string }).id).toMatch(/^not-/);
    expect((criada.json as { lida: boolean }).lida).toBe(false);

    const lista = await fetchApi(`/notifications${wsq}`);
    expect(lista.status).toBe(200);
    const corpo = lista.json as { notificacoes: Array<{ titulo: string; tipo: string }>; resumo: { nao_lidas: number } };
    expect(corpo.notificacoes).toHaveLength(1);
    expect(corpo.notificacoes[0].titulo).toBe("Resumo da execução");
    expect(corpo.resumo.nao_lidas).toBe(1);
  });

  it("GET ?nao_lidas=1 filtra apenas as não lidas", async () => {
    await fetchApi(`/notifications${wsq}`, {
      method: "POST",
      body: JSON.stringify({ titulo: "Segunda", corpo: "Aviso importante", tipo: "aviso" }),
    });
    const listaAtual = (await fetchApi(`/notifications${wsq}`)).json as { notificacoes: Array<{ id: string; lida: boolean }> };
    const idPrimeira = listaAtual.notificacoes.at(-1)!.id; // mais antiga = primeira criada
    await fetchApi(`/notifications/${idPrimeira}/lida?workspace=ws1`, { method: "POST" });

    const filtrada = await fetchApi(`/notifications${wsq}&nao_lidas=1`);
    const corpo = filtrada.json as { notificacoes: Array<{ lida: boolean }>; resumo: { nao_lidas: number } };
    expect(corpo.notificacoes.every((n) => !n.lida)).toBe(true);
    expect(corpo.notificacoes).toHaveLength(1);
    expect(corpo.resumo.nao_lidas).toBe(1);
  });

  it("POST /notifications/:id/lida muda a contagem; /notifications/lidas zera", async () => {
    await fetchApi(`/notifications${wsq}`, { method: "DELETE" });
    const a = await fetchApi(`/notifications${wsq}`, { method: "POST", body: JSON.stringify({ titulo: "A", corpo: "a" }) });
    await fetchApi(`/notifications${wsq}`, { method: "POST", body: JSON.stringify({ titulo: "B", corpo: "b" }) });
    const idA = (a.json as { id: string }).id;

    const marcada = await fetchApi(`/notifications/${idA}/lida?workspace=ws1`, { method: "POST" });
    expect(marcada.status).toBe(200);
    expect((marcada.json as { lida: boolean }).lida).toBe(true);
    expect(((await fetchApi(`/notifications${wsq}`)).json as { resumo: { nao_lidas: number } }).resumo.nao_lidas).toBe(1);

    await fetchApi(`/notifications/lidas?workspace=ws1`, { method: "POST" });
    expect(((await fetchApi(`/notifications${wsq}`)).json as { resumo: { nao_lidas: number } }).resumo.nao_lidas).toBe(0);

    const inexistente = await fetchApi(`/notifications/not-xx/lida?workspace=ws1`, { method: "POST" });
    expect(inexistente.status).toBe(404);
  });

  it("cap 100 FIFO — adicionar 105 mantém as 100 mais recentes", async () => {
    await fetchApi(`/notifications${wsq}`, { method: "DELETE" });
    for (let i = 1; i <= 105; i++) {
      const r = await fetchApi(`/notifications${wsq}`, {
        method: "POST",
        body: JSON.stringify({ titulo: `n${i}`, corpo: `corpo ${i}` }),
      });
      expect(r.status).toBe(201);
    }
    const lista = await fetchApi(`/notifications${wsq}`);
    const corpo = lista.json as { notificacoes: Array<{ titulo: string }>; resumo: { total: number; nao_lidas: number } };
    expect(corpo.notificacoes).toHaveLength(CAP_NOTIFICACOES);
    // mais recentes primeiro: a 105ª é a primeira da lista; as 5 mais antigas caíram fora
    expect(corpo.notificacoes[0].titulo).toBe("n105");
    expect(corpo.notificacoes.at(-1)!.titulo).toBe("n6");
    expect(corpo.notificacoes.some((n) => n.titulo === "n1")).toBe(false);
    expect(corpo.resumo.total).toBe(CAP_NOTIFICACOES);
    expect(corpo.resumo.nao_lidas).toBe(CAP_NOTIFICACOES);

    // arquivo em disco também respeita o cap (JSON por workspace, write atômico)
    const raw = JSON.parse(await readFile(join(wsPath, ".opencorp", "notifications.json"), "utf8")) as unknown[];
    expect(raw).toHaveLength(100);
  });

  it("DELETE /notifications limpa tudo", async () => {
    const apagado = await fetchApi(`/notifications${wsq}`, { method: "DELETE" });
    expect(apagado.status).toBe(200);
    const lista = await fetchApi(`/notifications${wsq}`);
    const corpo = lista.json as { notificacoes: unknown[]; resumo: { nao_lidas: number; total: number } };
    expect(corpo.notificacoes).toHaveLength(0);
    expect(corpo.resumo.nao_lidas).toBe(0);
    expect(corpo.resumo.total).toBe(0);
  });

  it("tool notificar grava no workspace e emite evento (notificacao.nova)", async () => {
    await mkdir(join(wsPath, ".opencorp"), { recursive: true });
    const eventos: string[] = [];
    const off = eventBus.on((ev) => { if (ev.tipo === "notificacao.nova") eventos.push(String(ev.dados.titulo)); });

    const registry = new ToolRegistry({ homeDir: home });
    const spec = registry.obter("notificar", wsPath);
    expect(spec.handler).toEqual({ tipo: "interno", id: "notificar" });
    expect(spec.inputSchema.required).toEqual(["titulo", "corpo"]);

    const r = await registry.executar("notificar", { titulo: "Feito pelo agente", corpo: "Resumo via tool", tipo: "resumo" }, wsPath);
    expect(r.ok).toBe(true);
    expect(eventos).toContain("Feito pelo agente");

    const bruto = JSON.parse(await readFile(join(wsPath, ".opencorp", "notifications.json"), "utf8")) as Array<{ origem: string; titulo: string }>;
    expect(bruto.some((n) => n.titulo === "Feito pelo agente" && n.origem === "tool:notificar")).toBe(true);
    off();

    // input inválido (falta corpo) é barrado pelo schema
    await expect(registry.executar("notificar", { titulo: "só título" }, wsPath)).rejects.toThrow(/corpo/);
  });
});
