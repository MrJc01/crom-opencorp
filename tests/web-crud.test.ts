import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiServer, type ApiServerOptions, type SessaoApi } from "../src/server/index.js";

const raizes: string[] = [];

/** Novas superfícies de CRUD (PLANO-WEB-CRUD B/C/F):
 *  PATCH amplo de schedules · PUT/DELETE flows · PUT teams · PUT/DELETE agents (+guarda 409). */
describe("API — CRUD da web (B/C)", () => {
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
    home = await mkdtemp(join(tmpdir(), "opencorp-crud-"));
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
    await fetchApi("/workspaces", { method: "POST", body: JSON.stringify({ id: "ws1" }) });
  });

  afterAll(async () => {
    server.close();
    await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
  });

  const wsq = "?workspace=ws1";

  it("B1 — PATCH /schedules/:id edita nome/agenda/args (e valida args)", async () => {
    const criado = await fetchApi("/schedules", {
      method: "POST",
      body: JSON.stringify({ nome: "rotina-x", agenda_tipo: "intervalo_min", agenda_valor: "30", args: ["doctor"], workspace: "ws1" }),
    });
    expect(criado.status).toBe(201);
    const id = (criado.json as { id: string }).id;

    const editado = await fetchApi(`/schedules/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ nome: "rotina-y", agenda_tipo: "cron", agenda_valor: "*/5 * * * *", args: ["doctor", "--rapido"] }),
    });
    expect(editado.status).toBe(200);
    expect((editado.json as { nome: string }).nome).toBe("rotina-y");
    expect((editado.json as { agenda: { tipo: string } }).agenda.tipo).toBe("cron");
    expect((editado.json as { args: string[] }).args).toEqual(["doctor", "--rapido"]);

    const invalido = await fetchApi(`/schedules/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ args: ["rm-rf-tudo"] }),
    });
    expect(invalido.status).toBe(422);

    // auditoria #4: agenda_valor sem agenda_tipo → 422 (não converte cron em intervalo)
    const parIncompleto = await fetchApi(`/schedules/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ agenda_valor: "*/10 * * * *" }),
    });
    expect(parIncompleto.status).toBe(422);
  });

  it("A6 — GET /hooks NÃO expõe token na lista (só no detalhe)", async () => {
    await fetchApi(`/hooks${wsq}`, {
      method: "POST",
      body: JSON.stringify({
        nome: "hook-auditoria",
        alvo: { tipo: "task_create", titulo: "Do hook" },
        respond: "imediato",
        dedup_seg: 0,
      }),
    });
    const lista = await fetchApi(`/hooks${wsq}`);
    expect(lista.status).toBe(200);
    for (const h of lista.json as Array<Record<string, unknown>>) {
      expect(h.token === undefined || h.token === null || h.token === "").toBe(true);
    }
  });

  it("A7 — POST /flows ACEITA grafo (editor da web não perde passos)", async () => {
    const id = `flow-web-${Date.now().toString(36)}`;
    const criado = await fetchApi(`/flows${wsq}`, {
      method: "POST",
      body: JSON.stringify({
        id,
        nome: "Fluxo com passos",
        nos: [
          { id: "gatilho", tipo: "manual", config: {} },
          { id: "passo-1", tipo: "task_create", config: { titulo: "Passo um" } },
        ],
        arestas: [{ de: "gatilho", para: "passo-1" }],
      }),
    });
    expect(criado.status).toBe(201);
    const detalhe = await fetchApi(`/flows/${id}${wsq}`);
    const flow = detalhe.json as { nos: unknown[]; arestas: unknown[] };
    expect(flow.nos).toHaveLength(2);
    expect(flow.arestas).toHaveLength(1);

    // sem grafo no corpo → comportamento antigo (só gatilho)
    const simples = await fetchApi(`/flows${wsq}`, {
      method: "POST",
      body: JSON.stringify({ id: `${id}-simples`, nome: "Só gatilho" }),
    });
    expect(simples.status).toBe(201);
  });

  it("B2 — PUT/DELETE /flows/:id salvam e removem o grafo (com validação)", async () => {
    const criado = await fetchApi(`/flows${wsq}`, { method: "POST", body: JSON.stringify({ id: "fluxo-web", nome: "Fluxo Web" }) });
    expect(criado.status).toBe(201);

    const salvo = await fetchApi(`/flows/fluxo-web${wsq}`, {
      method: "PUT",
      body: JSON.stringify({
        id: "fluxo-web",
        nome: "Fluxo Web Editado",
        nos: [
          { id: "gatilho", tipo: "manual", config: {} },
          { id: "passo-1", tipo: "agente", config: { agente: "editor", ordem: "faça {{entrada}}" } },
        ],
        arestas: [{ de: "gatilho", para: "passo-1" }],
      }),
    });
    expect(salvo.status).toBe(200);
    const detalhe = await fetchApi(`/flows/fluxo-web${wsq}`);
    expect((detalhe.json as { nome: string }).nome).toBe("Fluxo Web Editado");

    // nó agente sem config.agente → semântica rejeita
    const invalido = await fetchApi(`/flows/fluxo-web${wsq}`, {
      method: "PUT",
      body: JSON.stringify({
        id: "fluxo-web", nome: "quebrado",
        nos: [{ id: "gatilho", tipo: "manual", config: {} }, { id: "a", tipo: "agente", config: {} }],
        arestas: [{ de: "gatilho", para: "a" }],
      }),
    });
    expect(invalido.status).toBeGreaterThanOrEqual(400);

    // nó fanout com 1 passo só → rejeita
    const fanoutRuim = await fetchApi(`/flows/fluxo-web${wsq}`, {
      method: "PUT",
      body: JSON.stringify({
        id: "fluxo-web", nome: "fanout ruim",
        nos: [{ id: "gatilho", tipo: "manual", config: {} }, { id: "f", tipo: "fanout", config: { paralelos: [{ agente: "a", ordem: "o" }] } }],
        arestas: [{ de: "gatilho", para: "f" }],
      }),
    });
    expect(fanoutRuim.status).toBeGreaterThanOrEqual(400);

    const excluido = await fetchApi(`/flows/fluxo-web${wsq}`, { method: "DELETE" });
    expect(excluido.status).toBe(200);
    const depois = await fetchApi(`/flows/fluxo-web${wsq}`);
    expect(depois.status).toBe(404);
  });

  it("B3 — PUT /teams/:id edita o spec validado", async () => {
    const criado = await fetchApi(`/teams${wsq}`, {
      method: "POST",
      body: JSON.stringify({ id: "time-web", titulo: "Time Web", padrao: "pipeline", passos: [{ agente: "a", ordem: "o" }] }),
    });
    expect(criado.status).toBe(201);

    const editado = await fetchApi(`/teams/time-web${wsq}`, {
      method: "PUT",
      body: JSON.stringify({ id: "time-web", titulo: "Time Web v2", padrao: "pipeline", passos: [{ agente: "a", ordem: "o" }, { agente: "b", ordem: "o2" }] }),
    });
    expect(editado.status).toBe(200);
    const detalhe = await fetchApi(`/teams/time-web${wsq}`);
    expect((detalhe.json as { titulo: string }).titulo).toBe("Time Web v2");
    expect((detalhe.json as { passos: unknown[] }).passos).toHaveLength(2);

    // spec inválido (review sem revisor) → 4xx
    const invalido = await fetchApi(`/teams/time-web${wsq}`, {
      method: "PUT",
      body: JSON.stringify({ id: "time-web", titulo: "x", padrao: "review" }),
    });
    expect(invalido.status).toBeGreaterThanOrEqual(400);
  });

  it("C — GET/PUT/DELETE /agents/:id com guarda 409 para agente em uso", async () => {
    // fixture de agente válido (sem depender de templates) — workspaces vivem em <home>/.opencorp/workspaces
    const dir = join(home, ".opencorp", "workspaces", "ws1", ".opencorp", "agents");
    await mkdir(dir, { recursive: true });
    const md = `---
id: ag-teste
role: Testador
category: custom
model: test/model
tools: [bash]
permissions: level-1
budget:
  daily_usd: 1.00
  max_turns: 10
memory:
  reads: []
  writes: []
---

prompt do agente
`;
    await writeFile(join(dir, "ag-teste.md"), md, "utf8");

    const detalhe = await fetchApi(`/agents/ag-teste${wsq}`);
    expect(detalhe.status).toBe(200);
    expect((detalhe.json as { role: string }).role).toBe("Testador");

    const editado = await fetchApi(`/agents/ag-teste${wsq}`, {
      method: "PUT",
      body: JSON.stringify({ model: "outro/model", permissions: "level-2", budget_daily_usd: 2.5, tools: ["bash", "read"] }),
    });
    expect(editado.status).toBe(200);
    const depois = await fetchApi(`/agents/ag-teste${wsq}`);
    expect((depois.json as { model: string }).model).toBe("outro/model");
    expect((depois.json as { permissions: string }).permissions).toBe("level-2");
    expect((depois.json as { budget: { daily_usd: number } }).budget.daily_usd).toBe(2.5);

    // guarda: task aberta com responsável agente:ag-teste → 409
    await fetchApi(`/tasks${wsq}`, { method: "POST", body: JSON.stringify({ titulo: "T", responsavel: "agente:ag-teste" }) });
    const bloqueado = await fetchApi(`/agents/ag-teste${wsq}`, { method: "DELETE" });
    expect(bloqueado.status).toBe(409);
    expect((bloqueado.json as { citacoes: string[] }).citacoes.length).toBeGreaterThan(0);

    // conclui a task → guarda libera → exclusão ok
    const tasks = await fetchApi(`/tasks${wsq}`);
    const t = (tasks.json as Array<{ id: string }>).find(x => (x as { titulo?: string }).titulo === "T") as { id: string };
    await fetchApi(`/tasks/${t.id}${wsq}`, { method: "PATCH", body: JSON.stringify({ coluna: "feito" }) });
    const liberado = await fetchApi(`/agents/ag-teste${wsq}`, { method: "DELETE" });
    expect(liberado.status).toBe(200);
    // padrão do projeto: agente inexistente → 422 (AgentError)
    const sumiu = await fetchApi(`/agents/ag-teste${wsq}`);
    expect(sumiu.status).toBe(422);
  });

  it("F3 — POST /flows/migrate-teams converte team legado (e arquivos continuam)", async () => {
    await fetchApi(`/teams${wsq}`, {
      method: "POST",
      body: JSON.stringify({ id: "time-migra", titulo: "Migra", padrao: "pipeline", passos: [{ agente: "a", ordem: "o" }] }),
    });
    const res = await fetchApi(`/flows/migrate-teams${wsq}`, { method: "POST" });
    expect(res.status).toBe(200);
    expect((res.json as { criados: string[] }).criados).toContain("time-migra");
    const fluxos = await fetchApi(`/flows${wsq}`);
    expect((fluxos.json as Array<{ id: string }>).some(f => f.id === "time-migra")).toBe(true);
  });
});
