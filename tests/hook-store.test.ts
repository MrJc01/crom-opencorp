import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { HookError, HookStore, substituirTemplate, TriggersStore } from "../src/core/hook-store.js";

const raizes: string[] = [];

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

let wsPath = "";
let store: HookStore;

beforeEach(async () => {
  const home = await mkdtemp(join(tmpdir(), "opencorp-hook-"));
  raizes.push(home);
  const { WorkspaceManager } = await import("../src/core/workspace-manager.js");
  const ws = await new WorkspaceManager({ homeDir: home, cwd: home }).criar("corp-hook");
  wsPath = ws.path;
  store = new HookStore();
});

function servidorLocal(resposta: { corpo: unknown; status: number }): Promise<{ url: string; corpoRecebido: () => string; fechar: () => void }> {
  return new Promise((resolveP) => {
    let recebido = "";
    const srv = createServer((req, res) => {
      let dados = "";
      req.on("data", (c) => (dados += c));
      req.on("end", () => {
        recebido = dados;
        res.writeHead(resposta.status, { "content-type": "application/json" });
        res.end(JSON.stringify(resposta.corpo));
      });
    });
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as AddressInfo;
      resolveP({
        url: `http://127.0.0.1:${port}/alvo`,
        corpoRecebido: () => recebido,
        fechar: () => srv.close(),
      });
    });
  });
}

describe("templates", () => {
  it("substitui {{caminho.ponto}}, {{payload}} e query", () => {
    const payload = { corpo: { a: { b: "valor" }, n: 42 }, query: { q1: "da-query" } };
    expect(substituirTemplate("x {{a.b}} {{n}} {{q1}} {{payload}} fim", payload)).toBe(
      `x valor 42 da-query {"a":{"b":"valor"},"n":42} fim`,
    );
    expect(substituirTemplate("vazio {{nao.existe}}", payload)).toBe("vazio ");
  });

  it("substitui {{payload.name}} e {{payload.user.email}} com caminhos aninhados", () => {
    const payload = {
      corpo: {
        name: "Pedro",
        user: { email: "pedro@empresa.com", role: "admin" },
      },
      query: { origem: "webhook_lead" },
    };
    const tpl = "Lead: {{payload.name}} ({{payload.user.email}}) - Origem: {{query.origem}}";
    expect(substituirTemplate(tpl, payload)).toBe("Lead: Pedro (pedro@empresa.com) - Origem: webhook_lead");
  });
});

describe("HookStore — CRUD", () => {
  it("cria hook com token e URL, lista e obtém", async () => {
    const h = await store.criar(wsPath, "corp-hook", {
      nome: "do-github",
      alvo: { tipo: "task_create", titulo: "PR aberto: {{action}}" },
    });
    expect(h.id).toMatch(/^hook-/);
    expect(h.token).toMatch(/^hk_[0-9a-f]{32}$/);
    expect(h.respond).toBe("imediato");
    expect(h.dedup_seg).toBe(60);
    const lista = store.listar(wsPath);
    expect(lista).toHaveLength(1);
    expect(store.obter(wsPath, h.id).nome).toBe("do-github");
  });

  it("valida alvo", async () => {
    await expect(
      store.criar(wsPath, "corp-hook", { nome: "x", alvo: { tipo: "task_create", titulo: "" } }),
    ).rejects.toThrow(HookError);
    await expect(
      store.criar(wsPath, "corp-hook", { nome: "x", alvo: { tipo: "agente_fantasma" } as never }),
    ).rejects.toThrow(/inválido/);
    await expect(store.criar(wsPath, "corp-hook", { nome: "  ", alvo: { tipo: "task_create", titulo: "t" } })).rejects.toThrow(/nome/);
  });

  it("obter inexistente → 404; excluir remove", async () => {
    try {
      store.obter(wsPath, "hook-nada");
      expect.unreachable();
    } catch (e) {
      expect((e as { status?: number }).status).toBe(404);
    }
    const h = await store.criar(wsPath, "corp-hook", { nome: "x", alvo: { tipo: "task_create", titulo: "t" } });
    await store.excluir(wsPath, h.id);
    expect(store.listar(wsPath)).toEqual([]);
  });
});

describe("HookStore — execução", () => {
  it("task_create com template cria task de verdade", async () => {
    const h = await store.criar(wsPath, "corp-hook", {
      nome: "alerta",
      alvo: { tipo: "task_create", titulo: "Falha no deploy de {{repo}}" },
    });
    const r = await store.executar(wsPath, h, { corpo: { repo: "web-api" }, query: {} });
    expect(r.exec_id).toMatch(/^tsk-/);
    const { TaskStore } = await import("../src/core/task-store.js");
    const tasks = await new TaskStore().listar(wsPath);
    expect(tasks.map((t) => t.titulo)).toContain("Falha no deploy de web-api");
  });

  it("webhook_out envia payload e trata resposta", async () => {
    const srv = await servidorLocal({ corpo: { recebido: true }, status: 200 });
    try {
      const h = await store.criar(wsPath, "corp-hook", {
        nome: "out",
        alvo: { tipo: "webhook_out", url: srv.url, metodo: "POST" },
      });
      const r = await store.executar(wsPath, h, { corpo: { evento: "teste" }, query: {} });
      expect(r.resultado).toContain("HTTP 200");
      expect(srv.corpoRecebido()).toBe('{"evento":"teste"}');
    } finally {
      srv.fechar();
    }
  });

  it("agent_run usa executor injetado", async () => {
    const chamados: string[] = [];
    const s2 = new HookStore({
      executores: {
        agentRun: async (agente, ordem) => {
          chamados.push(`${agente}:${ordem}`);
          return { id: "exec-1", captura: "feito" };
        },
      },
    });
    const h = await s2.criar(wsPath, "corp-hook", {
      nome: "ag",
      alvo: { tipo: "agent_run", agente: "analista", ordem: "analise {{tema}}" },
    });
    const r = await s2.executar(wsPath, h, { corpo: { tema: "custos" }, query: {} });
    expect(r.exec_id).toBe("exec-1");
    expect(r.resultado).toBe("feito");
    expect(chamados).toEqual(["analista:analise custos"]);
  });

  it("task_run executa task existente passando instrução e contexto de gatilho", async () => {
    const { TaskStore } = await import("../src/core/task-store.js");
    const taskStore = new TaskStore();
    const task = await taskStore.criar(wsPath, {
      titulo: "Limpeza de banco",
      responsavel: "devops",
    }, "teste");

    let ordemExecutada = "";
    let gatilhoExecutado: any = null;
    const s2 = new HookStore({
      executores: {
        agentRun: async (agente, ordem, _p, gatilho) => {
          ordemExecutada = ordem;
          gatilhoExecutado = gatilho;
          return { id: "exec-task-1", captura: "sucesso" };
        },
      },
    });

    const h = await s2.criar(wsPath, "corp-hook", {
      nome: "hook-task",
      alvo: {
        tipo: "task_run",
        task_id: task.id,
        instrucao_adicional: "Parâmetro extra: {{payload.param}}",
      },
    });

    const r = await s2.executar(wsPath, h, { corpo: { param: "forcar_purge" }, query: {} });
    expect(r.exec_id).toBe("exec-task-1");
    expect(ordemExecutada).toContain(`Executar task ${task.id}: Limpeza de banco`);
    expect(ordemExecutada).toContain("Parâmetro extra: forcar_purge");
    expect(gatilhoExecutado?.tipo).toBe("webhook");
    expect(gatilhoExecutado?.origem).toBe(`hook:${h.id}:task:${task.id}`);
  });

  it("hook com exige_aprovacao cria pendência em ApprovalsStore e não roda direto", async () => {
    let rodouAgente = false;
    const s2 = new HookStore({
      executores: {
        agentRun: async () => {
          rodouAgente = true;
          return { id: "exec-nao-deve-rodar" };
        },
      },
    });

    const h = await s2.criar(wsPath, "corp-hook", {
      nome: "hook-seguro",
      alvo: { tipo: "agent_run", agente: "seguranca", ordem: "acao critica: {{payload.alvo}}" },
      exige_aprovacao: true,
    });

    const r = await s2.disparar(wsPath, h, { corpo: { alvo: "servidor-1" }, query: {} });
    expect(rodouAgente).toBe(false);
    expect(r.resultado).toContain("aprovação humana");

    const { ApprovalsStore } = await import("../src/core/approvals-store.js");
    const approvals = new ApprovalsStore();
    const pendentes = await approvals.pendentes(wsPath);
    expect(pendentes.length).toBeGreaterThan(0);
    expect(pendentes[0].ordem).toContain("servidor-1");
    expect(pendentes[0].agente).toBe("seguranca");
  });
});

describe("HookStore — dedup e disparar", () => {
  it("bloqueia payload igual na janela e libera depois", async () => {
    let relogio = Date.now();
    const s2 = new HookStore({ agora: () => new Date(relogio) });
    const h = await s2.criar(wsPath, "corp-hook", {
      nome: "dedup",
      alvo: { tipo: "webhook_out", url: "http://127.0.0.1:9/noop" },
      dedup_seg: 30,
    });
    const payload: PayloadHook = { corpo: { a: 1 }, query: {} };
    // webhook_out vai falhar (sem servidor) — mas o dedup vem ANTES
    await expect(s2.disparar(wsPath, h, payload)).rejects.toThrow(/tentativas|ECONNREFUSED|fetch failed/);
    await expect(s2.disparar(wsPath, h, payload)).rejects.toThrow(/duplicado/);
    relogio += 31_000;
    await expect(s2.disparar(wsPath, h, payload)).rejects.toThrow(/tentativas|ECONNREFUSED|fetch failed/);
    await expect(s2.disparar(wsPath, h, { corpo: { a: 2 }, query: {} })).rejects.toThrow(/tentativas|ECONNREFUSED|fetch failed/);
  });

  it("hook inativo → 409", async () => {
    const h = await store.criar(wsPath, "corp-hook", { nome: "off", alvo: { tipo: "task_create", titulo: "x" } });
    h.ativo = false;
    await expect(store.disparar(wsPath, h, { corpo: {}, query: {} })).rejects.toThrow(/inativo/);
  });
});

describe("TriggersStore", () => {
  it("cria, casa por evento e filtro, exclui", async () => {
    const home = wsPath; // triggers aceitam qualquer dir base
    const t1 = await new TriggersStore().criar(home, {
      quando: { evento: "task.concluida" },
      alvo: { tipo: "task_create", titulo: "Revisar {{titulo}}" },
      workspace: "corp-hook",
    });
    const ts = new TriggersStore();
    expect(ts.listar(home, true)).toHaveLength(1);
    const casados = ts.casar(home, "task.concluida", { titulo: "X" });
    expect(casados).toHaveLength(1);
    expect(ts.casar(home, "task.criada", {})).toHaveLength(0);

    const t2 = await ts.criar(home, {
      quando: { evento: "task.concluida" },
      filtro: { campo: "coluna", valor: "feito" },
      alvo: { tipo: "task_create", titulo: "y" },
    });
    expect(ts.casar(home, "task.concluida", { coluna: "feito" })).toHaveLength(2);
    expect(ts.casar(home, "task.concluida", { coluna: "outro" })).toHaveLength(1);
    await ts.excluir(home, t2.id);
    expect(ts.casar(home, "task.concluida", { coluna: "feito" })).toHaveLength(1);
    void t1;
  });

  it("trigger com workspace não casa quando o evento vem de outro workspace", async () => {
    const home = wsPath;
    const ts = new TriggersStore();
    await ts.criar(home, {
      quando: { evento: "task.criada" },
      filtro: { campo: "titulo", valor: "Auditoria-do-site" },
      alvo: { tipo: "agent_run", agente: "auditor" },
      workspace: "engenhar",
    });
    await ts.criar(home, {
      quando: { evento: "task.criada" },
      filtro: { campo: "titulo", valor: "Auditoria-do-site" },
      alvo: { tipo: "agent_run", agente: "auditor" },
      workspace: "emporio-aurora",
    });
    // evento SEM workspace (retrocompatibilidade) → casa
    expect(ts.casar(home, "task.criada", { titulo: "Auditoria-do-site" })).toHaveLength(2);
    // evento com workspace → só o trigger da MESMA empresa casa
    expect(ts.casar(home, "task.criada", { titulo: "Auditoria-do-site", workspace: "engenhar" })).toHaveLength(1);
    // outro evento → não casa
    expect(ts.casar(home, "task.concluida", { titulo: "Auditoria-do-site", workspace: "engenhar" })).toHaveLength(0);
  });

  it("evento com workspace de outro trigger não casa (isola empresas)", async () => {
    const home = wsPath;
    const ts = new TriggersStore();
    await ts.criar(home, {
      id: "trg-test-ws-a",
      quando: { evento: "task.criada" },
      filtro: { campo: "titulo", valor: "Auditoria-do-site" },
      workspace: "empresas-a",
      alvo: { tipo: "agent_run", agente: "auditor", ordem: "audite" },
    });
    await ts.criar(home, {
      id: "trg-test-ws-b",
      quando: { evento: "task.criada" },
      filtro: { campo: "titulo", valor: "Auditoria-do-site" },
      workspace: "empresas-b",
      alvo: { tipo: "agent_run", agente: "auditor", ordem: "audite" },
    });
    // task criada na empresa A → só o trigger A casa
    const casadosA = ts.casar(home, "task.criada", { titulo: "Auditoria-do-site", workspace: "empresas-a" });
    expect(casadosA).toHaveLength(1);
    expect(casadosA[0]!.workspace).toBe("empresas-a");
    // task criada na empresa B → só o trigger B casa
    const casadosB = ts.casar(home, "task.criada", { titulo: "Auditoria-do-site", workspace: "empresas-b" });
    expect(casadosB).toHaveLength(1);
    // evento SEM workspace (payload antigo) → ambos casam (retrocompatível)
    expect(ts.casar(home, "task.criada", { titulo: "Auditoria-do-site" })).toHaveLength(2);
    await ts.excluir(home, "trg-test-ws-a");
    await ts.excluir(home, "trg-test-ws-b");
  });
});
