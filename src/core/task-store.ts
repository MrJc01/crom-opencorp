/**
 * TaskStore: Camada de Negócio de Tarefas sobre OpencorpDb
 *
 * Delega persistência, transações e integridade relacional ao banco consolidado
 * OpencorpDb, eliminando o antipadrão CSV e unificando o stream de mensagens
 * na tabela universal `messages`.
 */

import { TaskError } from "./errors.js";
import { eventBus } from "./event-bus.js";
import {
  OpencorpDb,
  type TaskComRelacoes,
  type UpdateTaskInput,
} from "./db/opencorp-db.js";
import type { MessageRow, PrioridadeTask } from "./db/schema.js";

export { TaskError } from "./errors.js";

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

function gerarId(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Deriva o id do workspace do caminho (<home>/workspaces/<id> → id). */
export function workspaceIdDoPath(wsPath: string): string {
  const segs = wsPath.replace(/[\\/]+$/, "").split("/");
  return segs[segs.length - 1] ?? "";
}

export class TaskStore {
  private readonly agora: () => Date;
  private readonly maxMensagensHora: number;

  constructor(opcoes: OpcoesTaskStore = {}) {
    this.agora = opcoes.agora ?? (() => new Date());
    this.maxMensagensHora = opcoes.max_mensagens_hora ?? 30;
  }

  private taskRowParaTask(r: TaskComRelacoes): Task {
    return {
      id: r.id,
      titulo: r.titulo,
      descricao: r.descricao,
      coluna: r.coluna,
      pos: r.posicao,
      prioridade: (["baixa", "media", "alta"].includes(r.prioridade) ? r.prioridade : "media") as Task["prioridade"],
      labels: r.labels || [],
      responsavel: r.responsavel,
      due: r.due ?? (r.due_ms ? new Date(r.due_ms).toISOString() : null),
      task_pai: r.task_pai_id,
      bloqueado_por: r.bloqueado_por || [],
      lock_por: r.lock_por,
      lock_expira: r.lock_expira ?? (r.lock_expira_ms ? new Date(r.lock_expira_ms).toISOString() : null),
      criado_por: r.criado_por,
      criado_em: r.criado_em_ms ? new Date(r.criado_em_ms).toISOString() : "",
      atualizado_em: r.atualizado_em_ms ? new Date(r.atualizado_em_ms).toISOString() : "",
    };
  }

  private messageRowParaMsg(m: MessageRow, taskId: string): MensagemTask {
    let menciona: string[] = [];
    let refs: string[] = [];

    try {
      const parsed = JSON.parse(m.mencoes_json);
      if (Array.isArray(parsed)) {
        menciona = parsed;
      } else if (parsed && typeof parsed === "object") {
        menciona = Array.isArray(parsed.menciona) ? parsed.menciona : [];
        refs = Array.isArray(parsed.refs) ? parsed.refs : [];
      }
    } catch {}

    return {
      id: m.id,
      task_id: taskId,
      autor: m.autor,
      tipo: (["comentario", "handoff", "sistema", "artefato", "decisao"].includes(m.tipo)
        ? m.tipo
        : "comentario") as MensagemTask["tipo"],
      corpo: m.conteudo,
      menciona,
      refs,
      criado_em: m.criado_em_ms ? new Date(m.criado_em_ms).toISOString() : "",
    };
  }

  private async tocar(wsPath: string, id: string): Promise<void> {
    const db = OpencorpDb.obter(wsPath);
    db.handle
      .prepare("UPDATE tasks SET atualizado_em_ms = ? WHERE id = ?")
      .run(this.agora().getTime(), id);
  }

  async criar(wsPath: string, dados: NovaTask, por = "humano"): Promise<Task> {
    const titulo = dados.titulo.trim();
    if (titulo.length === 0) throw new TaskError('titulo obrigatório: opencorp task create --titulo "..."');
    const agora = this.agora();
    const agoraMs = agora.getTime();
    const coluna = (dados.coluna ?? "backlog").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(coluna)) throw new TaskError(`coluna inválida: "${coluna}"`);
    const prioridade = dados.prioridade ?? "media";
    if (!["baixa", "media", "alta"].includes(prioridade)) throw new TaskError(`prioridade inválida: "${prioridade}"`);

    const db = OpencorpDb.obter(wsPath);
    const pos = db.proximaPos(coluna);

    const taskRow = db.criarTask({
      id: gerarId("tsk"),
      workspace: db.wsId,
      titulo,
      descricao: dados.descricao ?? "",
      coluna,
      posicao: pos,
      prioridade: prioridade as PrioridadeTask,
      labels: dados.labels ?? [],
      responsavel: dados.responsavel ?? "",
      due: dados.due ?? null,
      task_pai_id: dados.task_pai ?? null,
      bloqueado_por: dados.bloqueado_por ?? [],
      criado_por: por,
      criado_em_ms: agoraMs,
      atualizado_em_ms: agoraMs,
    });

    const task = this.taskRowParaTask(taskRow);
    eventBus.emit("task.criada", {
      task_id: task.id,
      titulo: task.titulo,
      coluna: task.coluna,
      por,
      workspace: workspaceIdDoPath(wsPath),
    });
    return task;
  }

  async listar(wsPath: string, filtro: { coluna?: string; responsavel?: string } = {}): Promise<Task[]> {
    const db = OpencorpDb.obter(wsPath);
    const tasks = db.listarTasks();
    return tasks
      .map((t) => this.taskRowParaTask(t))
      .filter((t) => (filtro.coluna ? t.coluna === filtro.coluna : true))
      .filter((t) => (filtro.responsavel ? t.responsavel === filtro.responsavel : true));
  }

  async obter(wsPath: string, id: string): Promise<Task> {
    const db = OpencorpDb.obter(wsPath);
    const r = db.obterTask(id);
    if (!r) throw new TaskError(`task "${id}" não encontrada — veja "opencorp task list"`, { status: 404 });
    return this.taskRowParaTask(r);
  }

  async mover(wsPath: string, id: string, coluna: string, posOrdinal?: number): Promise<Task> {
    const col = coluna.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(col)) throw new TaskError(`coluna inválida: "${col}"`);
    const atual = await this.obter(wsPath, id);
    const db = OpencorpDb.obter(wsPath);

    const vizinhas = (
      db.handle
        .prepare("SELECT id FROM tasks WHERE workspace = ? AND coluna = ? AND id != ? ORDER BY posicao")
        .all(db.wsId, col, id) as { id: string }[]
    ).map((r) => r.id);

    let pos: number;
    const ordinal = posOrdinal ?? vizinhas.length + 1;
    if (ordinal <= 1) {
      const primeiro = vizinhas.length > 0
        ? (db.handle.prepare("SELECT posicao FROM tasks WHERE id = ?").get(vizinhas[0]) as { posicao: number }).posicao
        : 2048;
      pos = primeiro / 2;
    } else if (ordinal > vizinhas.length) {
      pos = db.proximaPos(col);
    } else {
      const antes = (db.handle.prepare("SELECT posicao FROM tasks WHERE id = ?").get(vizinhas[ordinal - 2]) as { posicao: number }).posicao;
      const depois = (db.handle.prepare("SELECT posicao FROM tasks WHERE id = ?").get(vizinhas[ordinal - 1]) as { posicao: number }).posicao;
      pos = (antes + depois) / 2;
    }

    db.atualizarTask(id, {
      coluna: col,
      posicao: pos,
      atualizado_em_ms: this.agora().getTime(),
    });

    if (col === "feito" && atual.coluna !== "feito") {
      eventBus.emit("task.concluida", { task_id: id, por: "task.mover" });
    }
    eventBus.emit("task.movida", { task_id: id, de: atual.coluna, para: col, pos });
    return this.obter(wsPath, id);
  }

  async atribuir(wsPath: string, id: string, responsavel: string): Promise<Task> {
    await this.obter(wsPath, id);
    const db = OpencorpDb.obter(wsPath);
    db.atualizarTask(id, {
      responsavel: responsavel.trim(),
      atualizado_em_ms: this.agora().getTime(),
    });
    eventBus.emit("task.atribuida", { task_id: id, responsavel: responsavel.trim() });
    return this.obter(wsPath, id);
  }

  async label(wsPath: string, id: string, acao: "add" | "remove", labels: string[]): Promise<Task> {
    if (labels.length === 0) throw new TaskError("informe labels: --add a,b ou --remove c");
    const atual = await this.obter(wsPath, id);
    const conjunto = new Set(atual.labels);
    for (const l of labels) {
      if (acao === "add") conjunto.add(l.trim());
      else conjunto.delete(l.trim());
    }
    const db = OpencorpDb.obter(wsPath);
    db.atualizarTask(id, {
      labels: [...conjunto],
      atualizado_em_ms: this.agora().getTime(),
    });
    return this.obter(wsPath, id);
  }

  async editar(
    wsPath: string,
    id: string,
    campos: { titulo?: string; descricao?: string; prioridade?: string; due?: string | null },
  ): Promise<Task> {
    await this.obter(wsPath, id);
    if (campos.titulo !== undefined && campos.titulo.trim().length === 0) {
      throw new TaskError("titulo não pode ficar vazio");
    }
    if (campos.prioridade !== undefined && !["baixa", "media", "alta"].includes(campos.prioridade)) {
      throw new TaskError(`prioridade inválida: "${campos.prioridade}"`);
    }

    const updates: Partial<UpdateTaskInput> = {
      atualizado_em_ms: this.agora().getTime(),
    };
    if (campos.titulo !== undefined) updates.titulo = campos.titulo;
    if (campos.descricao !== undefined) updates.descricao = campos.descricao;
    if (campos.prioridade !== undefined) updates.prioridade = campos.prioridade as PrioridadeTask;
    if (campos.due !== undefined) {
      updates.due = campos.due;
      updates.due_ms = campos.due ? Date.parse(campos.due) || null : null;
    }

    const db = OpencorpDb.obter(wsPath);
    db.atualizarTask(id, updates);
    eventBus.emit("task.editada", { task_id: id });
    return this.obter(wsPath, id);
  }

  async excluir(wsPath: string, id: string): Promise<void> {
    await this.obter(wsPath, id);
    const db = OpencorpDb.obter(wsPath);
    const sessaoTaskId = `task-sessao-${id}`;
    db.handle.prepare("DELETE FROM messages WHERE session_id = ?").run(sessaoTaskId);
    db.handle.prepare("DELETE FROM sessions WHERE id = ?").run(sessaoTaskId);
    db.deletarTask(id);
    eventBus.emit("task.excluida", { task_id: id });
  }

  async colunas(wsPath: string): Promise<string[]> {
    const db = OpencorpDb.obter(wsPath);
    const linhas = db.handle
      .prepare("SELECT DISTINCT coluna FROM tasks WHERE workspace = ?")
      .all(db.wsId) as { coluna: string }[];
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
    // Suporta "@fake-a" e "@agente:fake-a" (o : é parte do id na forma completa)
    for (const m of corpo.matchAll(/@([\w-]+(?::[\w-]+)?)/g)) {
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
    await this.obter(wsPath, taskId);
    const autor = dados.autor.trim();
    if (autor.length === 0) throw new TaskError("autor obrigatório (humano ou agente:<id>)");
    const corpo = dados.corpo.trim();
    if (corpo.length === 0) throw new TaskError("corpo da mensagem vazio");
    const tipo = dados.tipo ?? "comentario";
    if (!["comentario", "handoff", "sistema", "artefato", "decisao"].includes(tipo)) {
      throw new TaskError(`tipo de mensagem inválido: "${tipo}"`);
    }

    const agora = this.agora();
    const agoraMs = agora.getTime();
    const umaHoraAtrasMs = agoraMs - 3600_000;
    const sessaoTaskId = `task-sessao-${taskId}`;
    const db = OpencorpDb.obter(wsPath);

    const r = db.handle
      .prepare("SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND criado_em_ms > ?")
      .get(sessaoTaskId, umaHoraAtrasMs) as { n: number };

    if (r && r.n >= this.maxMensagensHora) {
      throw new TaskError(
        `rate limit: task "${taskId}" atingiu ${this.maxMensagensHora} mensagens/hora — aguarde ou aumente o limite`,
        { status: 429 },
      );
    }

    // Garante que a sessão pai exista na tabela universal de sessões
    db.handle.prepare(`
      INSERT OR IGNORE INTO sessions
        (id, workspace, agente, modelo, trigger_id, flow_id, status, inicio_ms, duracao_ms, custo_micro_usd)
      VALUES
        (?, ?, ?, 'kanban', NULL, NULL, 'concluido', ?, 0, 0)
    `).run(sessaoTaskId, db.wsId, autor, agoraMs);

    const msgId = gerarId("msg");
    const mencoes = this.extrairMencoes(corpo);
    const refs = dados.refs ?? [];
    const mencoesJson = JSON.stringify({ menciona: mencoes, refs });

    db.handle.prepare(`
      INSERT INTO messages
        (id, session_id, autor, role, tipo, conteudo, mencoes_json, criado_em_ms)
      VALUES
        (?, ?, ?, 'user', ?, ?, ?, ?)
    `).run(msgId, sessaoTaskId, autor, tipo, corpo, mencoesJson, agoraMs);

    await this.tocar(wsPath, taskId);

    const msg: MensagemTask = {
      id: msgId,
      task_id: taskId,
      autor,
      tipo,
      corpo,
      menciona: mencoes,
      refs,
      criado_em: agora.toISOString(),
    };

    eventBus.emit("task.mensagem", {
      task_id: taskId,
      msg_id: msg.id,
      autor: msg.autor,
      menciona: msg.menciona,
      tipo: msg.tipo,
      ws_path: wsPath,
    });

    return msg;
  }

  /** Alias para manter conformidade com novas convenções de repositório */
  async adicionarMensagem(
    wsPath: string,
    taskId: string,
    dados: { autor: string; corpo: string; tipo?: MensagemTask["tipo"]; refs?: string[] },
  ): Promise<MensagemTask> {
    return this.mensagem(wsPath, taskId, dados);
  }

  /** Define as dependências (barreira da orquestração fan-out/fan-in). */
  async definirDependencias(wsPath: string, id: string, deps: string[]): Promise<Task> {
    await this.obter(wsPath, id);
    const db = OpencorpDb.obter(wsPath);
    db.atualizarTask(id, {
      bloqueado_por: deps,
      atualizado_em_ms: this.agora().getTime(),
    });
    return this.obter(wsPath, id);
  }

  async chat(wsPath: string, taskId: string, limite = 100): Promise<MensagemTask[]> {
    await this.obter(wsPath, taskId);
    const db = OpencorpDb.obter(wsPath);
    const sessaoTaskId = `task-sessao-${taskId}`;
    const linhas = db.handle
      .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY criado_em_ms ASC, rowid ASC LIMIT ?")
      .all(sessaoTaskId, Math.max(1, Math.floor(limite))) as MessageRow[];
    return linhas.map((l) => this.messageRowParaMsg(l, taskId));
  }

  /** Alias para chat() */
  async listarMensagens(wsPath: string, taskId: string, limite = 100): Promise<MensagemTask[]> {
    return this.chat(wsPath, taskId, limite);
  }

  async resumoChat(wsPath: string, taskId: string, ultimas = 30): Promise<MensagemTask[]> {
    const todas = await this.chat(wsPath, taskId, 1000);
    return todas.slice(-ultimas);
  }

  // ── lock/lease (usado pela orquestração da etapa 24) ──

  async travar(wsPath: string, id: string, por: string, minutos = 30): Promise<void> {
    const task = await this.obter(wsPath, id);
    if (task.lock_por && task.lock_expira) {
      const expira = new Date(task.lock_expira).getTime();
      if (expira > this.agora().getTime() && task.lock_por !== por) {
        throw new TaskError(`task "${id}" travada por ${task.lock_por} até ${task.lock_expira}`, { status: 409 });
      }
    }
    const expiraData = new Date(this.agora().getTime() + minutos * 60_000);
    const expiraIso = expiraData.toISOString();
    const expiraMs = expiraData.getTime();
    const db = OpencorpDb.obter(wsPath);
    db.atualizarTask(id, {
      lock_por: por,
      lock_expira: expiraIso,
      lock_expira_ms: expiraMs,
      atualizado_em_ms: this.agora().getTime(),
    });
  }

  async liberar(wsPath: string, id: string, por: string): Promise<void> {
    const task = await this.obter(wsPath, id);
    if (task.lock_por && task.lock_por !== por) {
      throw new TaskError(`lock da task "${id}" pertence a ${task.lock_por} — não é ${por}`, { status: 409 });
    }
    const db = OpencorpDb.obter(wsPath);
    db.atualizarTask(id, {
      lock_por: null,
      lock_expira: null,
      lock_expira_ms: null,
      atualizado_em_ms: this.agora().getTime(),
    });
  }

  /**
   * Libera locks de tasks cuja validade (lease) já expirou — anti-stale:
   * sessão morreu com lock preso; a próxima execução herda estado limpo.
   * @returns ids das tasks destravadas
   */
  async limparLocksExpirados(wsPath: string): Promise<string[]> {
    const agoraIso = this.agora().toISOString();
    const agoraMs = this.agora().getTime();
    const db = OpencorpDb.obter(wsPath);
    const linhas = db.handle
      .prepare(`
        SELECT id FROM tasks
        WHERE workspace = ?
          AND lock_por IS NOT NULL
          AND ((lock_expira_ms IS NOT NULL AND lock_expira_ms <= ?) OR (lock_expira IS NOT NULL AND lock_expira <= ?))
      `)
      .all(db.wsId, agoraMs, agoraIso) as { id: string }[];

    for (const linha of linhas) {
      db.atualizarTask(linha.id, {
        lock_por: null,
        lock_expira: null,
        lock_expira_ms: null,
        atualizado_em_ms: agoraMs,
      });
      await this.mensagem(wsPath, linha.id, {
        autor: "orquestrador",
        corpo: "anti-stale: lock expirado liberado automaticamente (execução anterior morreu sem liberar)",
        tipo: "sistema",
      });
    }
    return linhas.map((l) => l.id);
  }

  bloqueado(wsPath: string, task: Task): boolean {
    if (task.bloqueado_por.length === 0) return false;
    const db = OpencorpDb.obter(wsPath);
    for (const dep of task.bloqueado_por) {
      try {
        const linha = db.handle
          .prepare("SELECT coluna FROM tasks WHERE id = ?")
          .get(dep) as { coluna: string } | undefined;
        if (!linha || linha.coluna !== "feito") return true;
      } catch {
        return true;
      }
    }
    return false;
  }

  fechar(wsPath: string): void {
    OpencorpDb.fecharInstancia(wsPath);
  }
}
