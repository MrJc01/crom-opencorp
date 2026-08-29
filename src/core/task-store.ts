import Database from "better-sqlite3";
import { mkdirRecursive } from "../utils/fs-safe.js";
import { join, dirname } from "node:path";
import { TaskError } from "./errors.js";
import { eventBus } from "./event-bus.js";

export interface Task {
  id: string;
  titulo: string;
  descricao: string;
  coluna: string;
  pos: number;
  prioridade: "baixa" | "media" | "alta";
  labels: string[];
  responsavel: string;
  due: string | null;
  task_pai: string | null;
  bloqueado_por: string[];
  lock_por: string | null;
  lock_expira: string | null;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
}

export interface MensagemTask {
  id: string;
  task_id: string;
  autor: string;
  tipo: "comentario" | "handoff" | "sistema" | "artefato" | "decisao";
  corpo: string;
  menciona: string[];
  refs: string[];
  criado_em: string;
}

export interface NovaTask {
  titulo: string;
  descricao?: string;
  coluna?: string;
  prioridade?: "baixa" | "media" | "alta";
  labels?: string[];
  responsavel?: string;
  due?: string;
  task_pai?: string;
  bloqueado_por?: string[];
}

export interface OpcoesTaskStore {
  agora?: () => Date;
  max_mensagens_hora?: number;
}

export const COLUNAS_PADRAO = ["backlog", "fazendo", "bloqueado", "feito"] as const;

interface LinhaTask {
  id: string;
  titulo: string;
  descricao: string;
  coluna: string;
  pos: number;
  prioridade: string;
  labels: string;
  responsavel: string;
  due: string | null;
  task_pai: string | null;
  bloqueado_por: string;
  lock_por: string | null;
  lock_expira: string | null;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
}

interface LinhaMsg {
  id: string;
  task_id: string;
  autor: string;
  tipo: string;
  corpo: string;
  menciona: string;
  refs: string;
  criado_em: string;
}

function deLista(s: string): string[] {
  return s.length === 0 ? [] : s.split(",").filter((x) => x.length > 0);
}

function paraLista(a: string[]): string {
  return a.join(",");
}

function gerarId(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export class TaskStore {
  private readonly agora: () => Date;
  private readonly maxMensagensHora: number;
  private readonly dbs = new Map<string, Database.Database>();

  constructor(opcoes: OpcoesTaskStore = {}) {
    this.agora = opcoes.agora ?? (() => new Date());
    this.maxMensagensHora = opcoes.max_mensagens_hora ?? 30;
  }

  private db(wsPath: string): Database.Database {
    const existente = this.dbs.get(wsPath);
    if (existente) return existente;
    const caminho = join(wsPath, ".opencorp", "tasks.db");
    mkdirRecursive(dirname(caminho));
    const db = new Database(caminho);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        titulo TEXT NOT NULL,
        descricao TEXT NOT NULL DEFAULT '',
        coluna TEXT NOT NULL DEFAULT 'backlog',
        pos REAL NOT NULL DEFAULT 0,
        prioridade TEXT NOT NULL DEFAULT 'media',
        labels TEXT NOT NULL DEFAULT '',
        responsavel TEXT NOT NULL DEFAULT '',
        due TEXT,
        task_pai TEXT,
        bloqueado_por TEXT NOT NULL DEFAULT '',
        lock_por TEXT,
        lock_expira TEXT,
        criado_por TEXT NOT NULL DEFAULT '',
        criado_em TEXT NOT NULL DEFAULT '',
        atualizado_em TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS task_mensagens (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        autor TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'comentario',
        corpo TEXT NOT NULL DEFAULT '',
        menciona TEXT NOT NULL DEFAULT '',
        refs TEXT NOT NULL DEFAULT '',
        criado_em TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_msg_task ON task_mensagens (task_id, criado_em);
    `);
    this.dbs.set(wsPath, db);
    return db;
  }

  private linhaParaTask(l: LinhaTask): Task {
    return {
      id: l.id,
      titulo: l.titulo,
      descricao: l.descricao,
      coluna: l.coluna,
      pos: l.pos,
      prioridade: (["baixa", "media", "alta"].includes(l.prioridade) ? l.prioridade : "media") as Task["prioridade"],
      labels: deLista(l.labels),
      responsavel: l.responsavel,
      due: l.due,
      task_pai: l.task_pai,
      bloqueado_por: deLista(l.bloqueado_por),
      lock_por: l.lock_por,
      lock_expira: l.lock_expira,
      criado_por: l.criado_por,
      criado_em: l.criado_em,
      atualizado_em: l.atualizado_em,
    };
  }

  private linhaParaMsg(l: LinhaMsg): MensagemTask {
    return {
      id: l.id,
      task_id: l.task_id,
      autor: l.autor,
      tipo: (["comentario", "handoff", "sistema", "artefato", "decisao"].includes(l.tipo)
        ? l.tipo
        : "comentario") as MensagemTask["tipo"],
      corpo: l.corpo,
      menciona: deLista(l.menciona),
      refs: deLista(l.refs),
      criado_em: l.criado_em,
    };
  }

  private async obterLinha(wsPath: string, id: string): Promise<LinhaTask> {
    const l = this.db(wsPath).prepare("SELECT * FROM tasks WHERE id = ?").get(id) as LinhaTask | undefined;
    if (!l) throw new TaskError(`task "${id}" não encontrada — veja "opencorp task list"`, { status: 404 });
    return l;
  }

  private async tocar(wsPath: string, id: string): Promise<void> {
    this.db(wsPath)
      .prepare("UPDATE tasks SET atualizado_em = ? WHERE id = ?")
      .run(this.agora().toISOString(), id);
  }

  async criar(wsPath: string, dados: NovaTask, por = "humano"): Promise<Task> {
    const titulo = dados.titulo.trim();
    if (titulo.length === 0) throw new TaskError('titulo obrigatório: opencorp task create --titulo "..."');
    const agora = this.agora().toISOString();
    const coluna = (dados.coluna ?? "backlog").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(coluna)) throw new TaskError(`coluna inválida: "${coluna}"`);
    const prioridade = dados.prioridade ?? "media";
    if (!["baixa", "media", "alta"].includes(prioridade)) throw new TaskError(`prioridade inválida: "${prioridade}"`);
    const pos = this.proximaPos(wsPath, coluna);
    const t: LinhaTask = {
      id: gerarId("tsk"),
      titulo,
      descricao: dados.descricao ?? "",
      coluna,
      pos,
      prioridade,
      labels: paraLista(dados.labels ?? []),
      responsavel: dados.responsavel ?? "",
      due: dados.due ?? null,
      task_pai: dados.task_pai ?? null,
      bloqueado_por: paraLista(dados.bloqueado_por ?? []),
      lock_por: null,
      lock_expira: null,
      criado_por: por,
      criado_em: agora,
      atualizado_em: agora,
    };
    this.db(wsPath)
      .prepare(
        `INSERT INTO tasks (id, titulo, descricao, coluna, pos, prioridade, labels, responsavel, due, task_pai, bloqueado_por, lock_por, lock_expira, criado_por, criado_em, atualizado_em)
         VALUES (@id, @titulo, @descricao, @coluna, @pos, @prioridade, @labels, @responsavel, @due, @task_pai, @bloqueado_por, @lock_por, @lock_expira, @criado_por, @criado_em, @atualizado_em)`,
      )
      .run(t);
    const task = this.linhaParaTask(t);
    eventBus.emit("task.criada", { task_id: task.id, titulo: task.titulo, coluna: task.coluna, por });
    return task;
  }

  async listar(wsPath: string, filtro: { coluna?: string; responsavel?: string } = {}): Promise<Task[]> {
    const linhas = this.db(wsPath).prepare("SELECT * FROM tasks ORDER BY coluna, pos").all() as LinhaTask[];
    return linhas
      .map((l) => this.linhaParaTask(l))
      .filter((t) => (filtro.coluna ? t.coluna === filtro.coluna : true))
      .filter((t) => (filtro.responsavel ? t.responsavel === filtro.responsavel : true));
  }

  async obter(wsPath: string, id: string): Promise<Task> {
    return this.linhaParaTask(await this.obterLinha(wsPath, id));
  }

  private proximaPos(wsPath: string, coluna: string): number {
    const r = this.db(wsPath)
      .prepare("SELECT MAX(pos) AS m FROM tasks WHERE coluna = ?")
      .get(coluna) as { m: number | null };
    return (r.m ?? 0) + 1024;
  }

  async mover(wsPath: string, id: string, coluna: string, posOrdinal?: number): Promise<Task> {
    const col = coluna.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(col)) throw new TaskError(`coluna inválida: "${col}"`);
    const atual = this.linhaParaTask(await this.obterLinha(wsPath, id));
    const db = this.db(wsPath);
    const vizinhas = (
      db.prepare("SELECT id FROM tasks WHERE coluna = ? AND id != ? ORDER BY pos").all(col, id) as { id: string }[]
    ).map((r) => r.id);
    let pos: number;
    const ordinal = posOrdinal ?? vizinhas.length + 1;
    if (ordinal <= 1) {
      const primeiro = vizinhas.length > 0 ? (db.prepare("SELECT pos FROM tasks WHERE id = ?").get(vizinhas[0]) as { pos: number }).pos : 2048;
      pos = primeiro / 2;
    } else if (ordinal > vizinhas.length) {
      pos = this.proximaPos(wsPath, col);
    } else {
      const antes = (db.prepare("SELECT pos FROM tasks WHERE id = ?").get(vizinhas[ordinal - 2]) as { pos: number }).pos;
      const depois = (db.prepare("SELECT pos FROM tasks WHERE id = ?").get(vizinhas[ordinal - 1]) as { pos: number }).pos;
      pos = (antes + depois) / 2;
    }
    db.prepare("UPDATE tasks SET coluna = ?, pos = ? WHERE id = ?").run(col, pos, id);
    await this.tocar(wsPath, id);
    if (col === "feito" && atual.coluna !== "feito") {
      eventBus.emit("task.concluida", { task_id: id, por: "task.mover" });
    }
    eventBus.emit("task.movida", { task_id: id, de: atual.coluna, para: col, pos });
    return this.obter(wsPath, id);
  }

  async atribuir(wsPath: string, id: string, responsavel: string): Promise<Task> {
    this.db(wsPath).prepare("UPDATE tasks SET responsavel = ? WHERE id = ?").run(responsavel.trim(), id);
    await this.tocar(wsPath, id);
    eventBus.emit("task.atribuida", { task_id: id, responsavel: responsavel.trim() });
    return this.obter(wsPath, id);
  }

  async label(wsPath: string, id: string, acao: "add" | "remove", labels: string[]): Promise<Task> {
    if (labels.length === 0) throw new TaskError("informe labels: --add a,b ou --remove c");
    const atual = this.linhaParaTask(await this.obterLinha(wsPath, id));
    const conjunto = new Set(atual.labels);
    for (const l of labels) {
      if (acao === "add") conjunto.add(l.trim());
      else conjunto.delete(l.trim());
    }
    this.db(wsPath).prepare("UPDATE tasks SET labels = ? WHERE id = ?").run(paraLista([...conjunto]), id);
    await this.tocar(wsPath, id);
    return this.obter(wsPath, id);
  }

  async editar(
    wsPath: string,
    id: string,
    campos: { titulo?: string; descricao?: string; prioridade?: string; due?: string | null },
  ): Promise<Task> {
    const linha = await this.obterLinha(wsPath, id);
    if (campos.titulo !== undefined && campos.titulo.trim().length === 0) {
      throw new TaskError("titulo não pode ficar vazio");
    }
    if (campos.prioridade !== undefined && !["baixa", "media", "alta"].includes(campos.prioridade)) {
      throw new TaskError(`prioridade inválida: "${campos.prioridade}"`);
    }
    const titulo = campos.titulo ?? linha.titulo;
    const descricao = campos.descricao ?? linha.descricao;
    const prioridade = campos.prioridade ?? linha.prioridade;
    const due = campos.due === undefined ? linha.due : campos.due;
    this.db(wsPath)
      .prepare("UPDATE tasks SET titulo = ?, descricao = ?, prioridade = ?, due = ? WHERE id = ?")
      .run(titulo, descricao, prioridade, due, id);
    await this.tocar(wsPath, id);
    eventBus.emit("task.editada", { task_id: id });
    return this.obter(wsPath, id);
  }

  async excluir(wsPath: string, id: string): Promise<void> {
    await this.obterLinha(wsPath, id);
    const db = this.db(wsPath);
    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    db.prepare("DELETE FROM task_mensagens WHERE task_id = ?").run(id);
    eventBus.emit("task.excluida", { task_id: id });
  }

  async colunas(wsPath: string): Promise<string[]> {
    const linhas = this.db(wsPath).prepare("SELECT DISTINCT coluna FROM tasks").all() as { coluna: string }[];
    const conjunto = new Set<string>([...COLUNAS_PADRAO, ...linhas.map((l) => l.coluna)]);
    return [...conjunto].sort((a, b) => {
      const ia = COLUNAS_PADRAO.indexOf(a as (typeof COLUNAS_PADRAO)[number]);
      const ib = COLUNAS_PADRAO.indexOf(b as (typeof COLUNAS_PADRAO)[number]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
  }

  // ── chat ──

  private extrairMencoes(corpo: string): string[] {
    const saida = new Set<string>();
    for (const m of corpo.matchAll(/@([\w-]+)/g)) {
      const bruto = m[1];
      if (["humano", "sistema", "todos"].includes(bruto)) continue;
      saida.add(bruto.startsWith("agente:") ? bruto : `agente:${bruto}`);
    }
    return [...saida];
  }

  async mensagem(
    wsPath: string,
    taskId: string,
    dados: { autor: string; corpo: string; tipo?: MensagemTask["tipo"]; refs?: string[] },
  ): Promise<MensagemTask> {
    await this.obterLinha(wsPath, taskId);
    const autor = dados.autor.trim();
    if (autor.length === 0) throw new TaskError("autor obrigatório (humano ou agente:<id>)");
    const corpo = dados.corpo.trim();
    if (corpo.length === 0) throw new TaskError("corpo da mensagem vazio");
    const tipo = dados.tipo ?? "comentario";
    if (!["comentario", "handoff", "sistema", "artefato", "decisao"].includes(tipo)) {
      throw new TaskError(`tipo de mensagem inválido: "${tipo}"`);
    }
    const umaHoraAtras = new Date(this.agora().getTime() - 3600_000).toISOString();
    const r = this.db(wsPath)
      .prepare("SELECT COUNT(*) AS n FROM task_mensagens WHERE task_id = ? AND criado_em > ?")
      .get(taskId, umaHoraAtras) as { n: number };
    if (r.n >= this.maxMensagensHora) {
      throw new TaskError(
        `rate limit: task "${taskId}" atingiu ${this.maxMensagensHora} mensagens/hora — aguarde ou aumente o limite`,
        { status: 429 },
      );
    }
    const m: LinhaMsg = {
      id: gerarId("msg"),
      task_id: taskId,
      autor,
      tipo,
      corpo,
      menciona: paraLista(this.extrairMencoes(corpo)),
      refs: paraLista(dados.refs ?? []),
      criado_em: this.agora().toISOString(),
    };
    this.db(wsPath)
      .prepare(
        `INSERT INTO task_mensagens (id, task_id, autor, tipo, corpo, menciona, refs, criado_em)
         VALUES (@id, @task_id, @autor, @tipo, @corpo, @menciona, @refs, @criado_em)`,
      )
      .run(m);
    await this.tocar(wsPath, taskId);
    const msg = this.linhaParaMsg(m);
    eventBus.emit("task.mensagem", { task_id: taskId, msg_id: msg.id, autor: msg.autor, menciona: msg.menciona, tipo: msg.tipo });
    return msg;
  }

  async chat(wsPath: string, taskId: string, limite = 100): Promise<MensagemTask[]> {
    await this.obterLinha(wsPath, taskId);
    const linhas = this.db(wsPath)
      .prepare("SELECT * FROM task_mensagens WHERE task_id = ? ORDER BY criado_em, id LIMIT ?")
      .all(taskId, limite) as LinhaMsg[];
    return linhas.map((l) => this.linhaParaMsg(l));
  }

  async resumoChat(wsPath: string, taskId: string, ultimas = 30): Promise<MensagemTask[]> {
    const todas = await this.chat(wsPath, taskId, 1000);
    return todas.slice(-ultimas);
  }

  // ── lock/lease (usado pela orquestração da etapa 24) ──

  async travar(wsPath: string, id: string, por: string, minutos = 30): Promise<void> {
    const linha = await this.obterLinha(wsPath, id);
    if (linha.lock_por && linha.lock_expira) {
      const expira = new Date(linha.lock_expira).getTime();
      if (expira > this.agora().getTime() && linha.lock_por !== por) {
        throw new TaskError(`task "${id}" travada por ${linha.lock_por} até ${linha.lock_expira}`, { status: 409 });
      }
    }
    const expira = new Date(this.agora().getTime() + minutos * 60_000).toISOString();
    this.db(wsPath).prepare("UPDATE tasks SET lock_por = ?, lock_expira = ? WHERE id = ?").run(por, expira, id);
    await this.tocar(wsPath, id);
  }

  async liberar(wsPath: string, id: string, por: string): Promise<void> {
    const linha = await this.obterLinha(wsPath, id);
    if (linha.lock_por && linha.lock_por !== por) {
      throw new TaskError(`lock da task "${id}" pertence a ${linha.lock_por} — não é ${por}`, { status: 409 });
    }
    this.db(wsPath).prepare("UPDATE tasks SET lock_por = NULL, lock_expira = NULL WHERE id = ?").run(id);
    await this.tocar(wsPath, id);
  }

  bloqueado(wsPath: string, task: Task): boolean {
    if (task.bloqueado_por.length === 0) return false;
    for (const dep of task.bloqueado_por) {
      try {
        const linha = this.db(wsPath).prepare("SELECT coluna FROM tasks WHERE id = ?").get(dep) as
          | { coluna: string }
          | undefined;
        if (!linha || linha.coluna !== "feito") return true;
      } catch {
        return true;
      }
    }
    return false;
  }

  fechar(wsPath: string): void {
    const db = this.dbs.get(wsPath);
    if (db) {
      db.close();
      this.dbs.delete(wsPath);
    }
  }
}
