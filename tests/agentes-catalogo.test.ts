import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createApiServer, type ApiServerOptions, type SessaoApi } from "../src/server/index.js";

const raizes: string[] = [];

/** Etapa 5 (PLANO-PAINEL-V2) — campo ativo, guard de execução e semear-catalogo. */
describe("API — Agentes: catálogo, toggle e guard de execução", () => {
  let home: string;
  let token: string;
  let port: number;
  let fetchApi: (path: string, opts?: RequestInit) => Promise<{ status: number; json: any; headers: Headers }>;
  let server: ReturnType<typeof createApiServer>["server"];

  const fakeSessoes: SessaoApi = {
    async rodar(opcoes) {
      return {
        id: opcoes.execId ?? "exec-fake",
        agente: opcoes.agente,
        modelo: opcoes.model ?? "test-model",
        ordem: opcoes.ordem ?? "",
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

  const MD_LEGADO = `---
id: %ID%
role: Testador legado
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

prompt do agente legado
`;

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "opencorp-catalogo-"));
    raizes.push(home);
    token = "t1";

    // Catálogo do repositório disponível no <home>/templates (como o createApiServer resolve)
    const catalogoRepo = join(fileURLToPath(new URL("../templates/default/.opencorp/agents", import.meta.url)));
    const catalogoHome = join(home, "templates", "default", ".opencorp", "agents");
    mkdirSync(catalogoHome, { recursive: true });
    for (const f of ["agente-vendas.md", "agente-marketing.md", "agente-financeiro.md", "agente-suporte.md", "agente-juridico.md", "agente-ops.md"]) {
      cpSync(join(catalogoRepo, f), join(catalogoHome, f));
    }

    // ws2 manual (sem template — para provar que o semear CRIA do zero)
    await mkdir(join(home, ".opencorp", "workspaces", "ws2", ".opencorp"), { recursive: true });
    writeFileSync(join(home, ".opencorp", "workspaces", "ws2", ".opencorp", "config.json"), "{}");
    writeFileSync(
      join(home, ".opencorp", "workspaces.json"),
      JSON.stringify({ version: 1, ativo: "ws2", workspaces: [{ id: "ws2", criado_em: new Date().toISOString() }] }, null, 2),
    );

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

    // agentes legados (MD sem campo ativo) no ws1
    const dir = join(home, ".opencorp", "workspaces", "ws1", ".opencorp", "agents");
    await mkdir(dir, { recursive: true });
    writeFileSync(join(dir, "ag-legado.md"), MD_LEGADO.replaceAll("%ID%", "ag-legado"), "utf8");
    writeFileSync(join(dir, "ag-legado2.md"), MD_LEGADO.replaceAll("%ID%", "ag-legado2"), "utf8");
  });

  afterAll(async () => {
    server.close();
    await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
  });

  const ws1 = "?workspace=ws1";
  const ws2 = "?workspace=ws2";

  it("E5.1 — MD legado sem campo ativo → ativo:true (default)", async () => {
    const detalhe = await fetchApi(`/agents/ag-legado2${ws1}`);
    expect(detalhe.status).toBe(200);
    expect((detalhe.json as { ativo: boolean }).ativo).toBe(true);
  });

  it("E5.2 — PUT ativo:false persiste (GET e arquivo em disco); idempotente", async () => {
    const desativado = await fetchApi(`/agents/ag-legado${ws1}`, {
      method: "PUT",
      body: JSON.stringify({ ativo: false }),
    });
    expect(desativado.status).toBe(200);
    expect((desativado.json as { ativo: boolean }).ativo).toBe(false);

    const deNovo = await fetchApi(`/agents/ag-legado${ws1}`, {
      method: "PUT",
      body: JSON.stringify({ ativo: false }),
    });
    expect(deNovo.status).toBe(200);

    const detalhe = await fetchApi(`/agents/ag-legado${ws1}`);
    expect((detalhe.json as { ativo: boolean }).ativo).toBe(false);
    const md = readFileSync(join(home, ".opencorp", "workspaces", "ws1", ".opencorp", "agents", "ag-legado.md"), "utf8");
    expect(md).toContain("ativo: false");
  });

  it("E5.3 — POST run de desativado → 409; reativado → 202", async () => {
    const bloqueado = await fetchApi(`/agents/ag-legado/run${ws1}`, {
      method: "POST",
      body: JSON.stringify({ ordem: "faça algo" }),
    });
    expect(bloqueado.status).toBe(409);
    expect((bloqueado.json as { erro: string }).erro).toBe(
      "agente 'ag-legado' está desativado — ative no painel de agentes",
    );

    const ativado = await fetchApi(`/agents/ag-legado${ws1}`, {
      method: "PUT",
      body: JSON.stringify({ ativo: true }),
    });
    expect(ativado.status).toBe(200);
    const liberado = await fetchApi(`/agents/ag-legado/run${ws1}`, {
      method: "POST",
      body: JSON.stringify({ ordem: "faça algo" }),
    });
    expect(liberado.status).toBe(202);
    expect((liberado.json as { status: string }).status).toBe("iniciado");
  });

  it("E5.4 — semear-catalogo: 1ª chamada cria, 2ª devolve existentes (idempotente)", async () => {
    const primeira = await fetchApi(`/agents/semear-catalogo${ws2}`, { method: "POST" });
    expect(primeira.status).toBe(200);
    const r1 = primeira.json as { criados: string[]; existentes: string[] };
    expect([...r1.criados].sort()).toEqual([
      "agente-financeiro", "agente-juridico", "agente-marketing", "agente-ops", "agente-suporte", "agente-vendas",
    ]);
    expect(r1.existentes).toEqual([]);

    const segunda = await fetchApi(`/agents/semear-catalogo${ws2}`, { method: "POST" });
    expect(segunda.status).toBe(200);
    const r2 = segunda.json as { criados: string[]; existentes: string[] };
    expect(r2.criados).toEqual([]);
    expect([...r2.existentes].sort()).toEqual([
      "agente-financeiro", "agente-juridico", "agente-marketing", "agente-ops", "agente-suporte", "agente-vendas",
    ]);

    // semeados nascem DESATIVADOS (e visíveis na lista)
    const lista = await fetchApi(`/agents${ws2}`);
    const todos = lista.json as Array<{ id: string; ativo: boolean }>;
    for (const id of r1.criados) {
      const ag = todos.find((a) => a.id === id);
      expect(ag?.ativo).toBe(false);
    }
  });

  it("E5.5 — PUT ativo não-boolean → 422", async () => {
    const invalido = await fetchApi(`/agents/ag-legado2${ws1}`, {
      method: "PUT",
      body: JSON.stringify({ ativo: "sim" }),
    });
    expect(invalido.status).toBe(422);
    expect((invalido.json as { erro: string }).erro).toContain("boolean");
  });
});
