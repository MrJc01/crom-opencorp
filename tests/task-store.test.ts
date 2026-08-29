import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskError, TaskStore } from "../src/core/task-store.js";

const raizes: string[] = [];

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

let relogio = 0;
let wsPath = "";
let store: TaskStore;

beforeEach(async () => {
  const home = await mkdtemp(join(tmpdir(), "opencorp-task-"));
  raizes.push(home);
  const { WorkspaceManager } = await import("../src/core/workspace-manager.js");
  const ws = await new WorkspaceManager({ homeDir: home, cwd: home }).criar("corp-task");
  wsPath = ws.path;
  relogio = Date.now();
  store = new TaskStore({ agora: () => new Date((relogio += 60_000)) });
});

describe("TaskStore — CRUD", () => {
  it("cria task com padrões e lista ordenada por coluna,pos", async () => {
    const a = await store.criar(wsPath, { titulo: "Primeira" });
    const a2 = await store.criar(wsPath, { titulo: "Primeira-b" });
    const b = await store.criar(wsPath, { titulo: "Segunda", coluna: "fazendo", prioridade: "alta", labels: ["api", "urgente"] });
    expect(a.id).toMatch(/^tsk-/);
    expect(a.coluna).toBe("backlog");
    expect(a.prioridade).toBe("media");
    expect(b.pos).toBeGreaterThan(0);
    expect(a2.pos).toBeGreaterThan(a.pos);
    const lista = await store.listar(wsPath);
    expect(lista.map((t) => t.titulo)).toEqual(["Primeira", "Primeira-b", "Segunda"]);
  });

  it("recusa título vazio e prioridade inválida", async () => {
    await expect(store.criar(wsPath, { titulo: "  " })).rejects.toThrow(TaskError);
    await expect(store.criar(wsPath, { titulo: "x", prioridade: "critica" as "alta" })).rejects.toThrow(TaskError);
  });

  it("edita título/descrição/due e recusa título vazio", async () => {
    const t = await store.criar(wsPath, { titulo: "Original" });
    const e = await store.editar(wsPath, t.id, { titulo: "Editada", descricao: "texto", due: "2026-09-10" });
    expect(e.titulo).toBe("Editada");
    expect(e.descricao).toBe("texto");
    expect(e.due).toBe("2026-09-10");
    await expect(store.editar(wsPath, t.id, { titulo: " " })).rejects.toThrow(TaskError);
  });

  it("exclui task e seu chat", async () => {
    const t = await store.criar(wsPath, { titulo: "Temp" });
    await store.mensagem(wsPath, t.id, { autor: "humano", corpo: "olá" });
    await store.excluir(wsPath, t.id);
    expect(await store.listar(wsPath)).toEqual([]);
    await expect(store.chat(wsPath, t.id)).rejects.toThrow(TaskError);
  });
});

describe("TaskStore — mover/atribuir/labels", () => {
  it("move para o topo, meio e fim da coluna com pos coerente", async () => {
    const a = await store.criar(wsPath, { titulo: "A", coluna: "fazendo" });
    const b = await store.criar(wsPath, { titulo: "B", coluna: "fazendo" });
    const c = await store.criar(wsPath, { titulo: "C", coluna: "fazendo" });
    const t = await store.criar(wsPath, { titulo: "Mover" });
    await store.mover(wsPath, t.id, "fazendo", 1);
    let ordem = (await store.listar(wsPath, { coluna: "fazendo" })).map((x) => x.titulo);
    expect(ordem[0]).toBe("Mover");
    await store.mover(wsPath, t.id, "fazendo", 3);
    ordem = (await store.listar(wsPath, { coluna: "fazendo" })).map((x) => x.titulo);
    expect(ordem).toEqual(["A", "B", "C", "Mover"].filter((x) => x !== "Mover").slice(0, 2).concat(["Mover", "C"]));
    void b;
    const fim = (await store.listar(wsPath, { coluna: "fazendo" })).every((x, i, arr) => i === 0 || arr[i - 1]!.pos < x.pos);
    expect(fim).toBe(true);
  });

  it("mover para feito emite task.concluida", async () => {
    const t = await store.criar(wsPath, { titulo: "Concluir" });
    const eventos: string[] = [];
    const off = (await import("../src/core/event-bus.js")).eventBus.on((ev) => eventos.push(ev.tipo));
    try {
      await store.mover(wsPath, t.id, "feito");
    } finally {
      off();
    }
    expect(eventos).toContain("task.movida");
    expect(eventos).toContain("task.concluida");
  });

  it("atribui e gerencia labels add/remove", async () => {
    const t = await store.criar(wsPath, { titulo: "Com labels" });
    const r = await store.atribuir(wsPath, t.id, "agente:executor-padrao");
    expect(r.responsavel).toBe("agente:executor-padrao");
    const l1 = await store.label(wsPath, t.id, "add", ["bug", "api"]);
    expect(l1.labels.sort()).toEqual(["api", "bug"]);
    const l2 = await store.label(wsPath, t.id, "remove", ["bug"]);
    expect(l2.labels).toEqual(["api"]);
    await expect(store.label(wsPath, t.id, "add", [])).rejects.toThrow(TaskError);
  });
});

describe("TaskStore — chat", () => {
  it("posta mensagem, extrai menções @agente e lista em ordem", async () => {
    const t = await store.criar(wsPath, { titulo: "Com chat" });
    await store.mensagem(wsPath, t.id, { autor: "humano", corpo: "verifica isso @executor" });
    const m2 = await store.mensagem(wsPath, t.id, {
      autor: "agente:executor-padrao",
      corpo: "feito @revisor e @todos ignorado",
      tipo: "handoff",
      refs: ["registries/conteudo/x"],
    });
    expect(m2.menciona).toEqual(["agente:revisor"]);
    expect(m2.tipo).toBe("handoff");
    const chat = await store.chat(wsPath, t.id);
    expect(chat.map((m) => m.autor)).toEqual(["humano", "agente:executor-padrao"]);
  });

  it("aplica rate limit por hora por task", async () => {
    const t = await store.criar(wsPath, { titulo: "Rate" });
    const pequeno = new TaskStore({ agora: () => new Date((relogio += 1000)), max_mensagens_hora: 3 });
    for (let i = 0; i < 3; i++) await pequeno.mensagem(wsPath, t.id, { autor: "humano", corpo: `m${i}` });
    await expect(pequeno.mensagem(wsPath, t.id, { autor: "humano", corpo: "m4" })).rejects.toThrow(/rate limit/i);
  });

  it("recusa mensagem em task inexistente e corpo vazio", async () => {
    await expect(store.mensagem(wsPath, "tsk-nada", { autor: "humano", corpo: "x" })).rejects.toThrow(TaskError);
    const t = await store.criar(wsPath, { titulo: "X" });
    await expect(store.mensagem(wsPath, t.id, { autor: "humano", corpo: "  " })).rejects.toThrow(TaskError);
  });
});

describe("TaskStore — lock/lease e dependências", () => {
  it("trava com lease, impede terceiro e libera dono", async () => {
    const t = await store.criar(wsPath, { titulo: "Lock" });
    await store.travar(wsPath, t.id, "agente:a", 30);
    await expect(store.travar(wsPath, t.id, "agente:b", 30)).rejects.toThrow(/travada por/);
    await store.travar(wsPath, t.id, "agente:a", 30);
    await store.liberar(wsPath, t.id, "agente:a");
    await store.travar(wsPath, t.id, "agente:b", 30);
    await expect(store.liberar(wsPath, t.id, "agente:a")).rejects.toThrow(/não é/);
  });

  it("lock expirado permite novo dono", async () => {
    const t = await store.criar(wsPath, { titulo: "Lease" });
    await store.travar(wsPath, t.id, "agente:a", 1);
    relogio += 10 * 60_000;
    await store.travar(wsPath, t.id, "agente:b", 30);
    const atual = await store.obter(wsPath, t.id);
    expect(atual.lock_por).toBe("agente:b");
  });

  it("bloqueado reflete dependência não concluída", async () => {
    const dep = await store.criar(wsPath, { titulo: "Dep" });
    const pai = await store.criar(wsPath, { titulo: "Pai", bloqueado_por: [dep.id] });
    expect(store.bloqueado(wsPath, pai)).toBe(true);
    await store.mover(wsPath, dep.id, "feito");
    expect(store.bloqueado(wsPath, pai)).toBe(false);
  });
});
