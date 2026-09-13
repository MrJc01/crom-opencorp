/**
 * OpencorpDb: Repositório / DAO Unificado (Data Access Object)
 *
 * Provê uma camada de acesso a dados estritamente tipada, transacional e segura
 * sobre o banco consolidado `opencorp.db`.
 *
 * Recursos:
 * - Cache de conexões ativas por workspace;
 * - Auto-migração transparente a partir de corp.db/tasks.db legados;
 * - Normalização 1NF para tarefas, labels e dependências;
 * - Conversão de precisão monetária (micro-dólares <-> USD);
 * - Gestão unificada de sessões, mensagens, telemetria (spans) e notificações.
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  inicializarBancoConsolidado,
  type SessionRow,
  type MessageRow,
  type SpanRow,
  type TaskRow,
  type NotificationRow,
  type StatusSession,
  type RoleMessage,
  type TipoMessage,
  type StatusSpan,
  type PrioridadeTask,
  type TipoNotification,
} from "./schema.js";
import { migrarWorkspaceParaSchemaConsolidado } from "./migrator.js";

// ─── CONVERSÃO MONETÁRIA ──────────────────────────────────────────────────────

export function microUsdToUsd(micro: number): number {
  return Number((micro / 1_000_000).toFixed(6));
}

export function usdToMicroUsd(usd: number): number {
  return Math.round((usd || 0) * 1_000_000);
}

function gerarId(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── INTERFACES DE ENTRADA E SAÍDA ───────────────────────────────────────────

export interface NovaTaskInput {
  id?: string;
  workspace?: string;
  titulo: string;
  descricao?: string;
  coluna?: string;
  posicao?: number;
  prioridade?: PrioridadeTask;
  responsavel?: string;
  due?: string | null;
  due_ms?: number | null;
  task_pai_id?: string | null;
  criado_por?: string;
  criado_em_ms?: number;
  atualizado_em_ms?: number;
  labels?: string[];
  bloqueado_por?: string[];
}

export interface TaskComRelacoes extends TaskRow {
  labels: string[];
  bloqueado_por: string[];
}

export interface UpdateTaskInput {
  titulo?: string;
  descricao?: string;
  coluna?: string;
  posicao?: number;
  prioridade?: PrioridadeTask;
  responsavel?: string;
  due?: string | null;
  due_ms?: number | null;
  task_pai_id?: string | null;
  lock_por?: string | null;
  lock_expira?: string | null;
  lock_expira_ms?: number | null;
  atualizado_em_ms?: number;
  labels?: string[];
  bloqueado_por?: string[];
}

export interface NovaSessaoInput {
  id?: string;
  workspace?: string;
  agente: string;
  modelo?: string;
  trigger_id?: string | null;
  flow_id?: string | null;
  status?: StatusSession;
  inicio_ms?: number;
  custo_usd?: number;
}

export interface NovaMensagemInput {
  id?: string;
  session_id: string;
  autor: string;
  role?: RoleMessage;
  tipo?: TipoMessage;
  conteudo: string;
  mencoes?: string[];
  criado_em_ms?: number;
}

export interface NovoSpanInput {
  id?: string;
  session_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string | null;
  ferramenta?: string | null;
  input_json?: string | null;
  output_json?: string | null;
  status?: StatusSpan;
  duracao_ms?: number;
  prompt_tokens?: number;
  saida_tokens?: number;
  custo_usd?: number;
  criado_em_ms?: number;
}

export interface NovaNotificacaoInput {
  id?: string;
  workspace?: string;
  tipo?: TipoNotification;
  titulo: string;
  mensagem: string;
  origem?: string;
  lida?: boolean;
  acoes?: Array<Record<string, unknown>>;
  repeticoes?: number;
  criado_em_ms?: number;
  atualizado_em_ms?: number;
}

// ─── CLASSE DAO PRINCIPAL ─────────────────────────────────────────────────────

export class OpencorpDb {
  private static readonly instancias = new Map<string, OpencorpDb>();
  private readonly db: Database.Database;
  public readonly wsPath: string;
  public readonly wsId: string;

  constructor(workspacePath: string) {
    this.wsPath = resolve(workspacePath);
    this.wsId = this.wsPath.split("/").filter(Boolean).pop() ?? "default";
    const opencorpDir = join(this.wsPath, ".opencorp");
    mkdirSync(opencorpDir, { recursive: true });

    const destinoDbPath = join(opencorpDir, "opencorp.db");

    // Auto-migração transparente se opencorp.db não existir e bancos legados existirem
    const corpDbPath = join(opencorpDir, "corp.db");
    const tasksDbPath = join(opencorpDir, "tasks.db");
    const precisaAutoMigrar = !existsSync(destinoDbPath) && (existsSync(corpDbPath) || existsSync(tasksDbPath));

    if (precisaAutoMigrar) {
      migrarWorkspaceParaSchemaConsolidado(this.wsPath, { workspaceId: this.wsId, backup: true });
    }

    this.db = new Database(destinoDbPath);
    inicializarBancoConsolidado(this.db);
  }

  /**
   * Obtém instância única (Singleton / Cache por Workspace)
   */
  static obter(workspacePath: string): OpencorpDb {
    const normalizado = resolve(workspacePath);
    let inst = OpencorpDb.instancias.get(normalizado);
    if (!inst) {
      inst = new OpencorpDb(normalizado);
      OpencorpDb.instancias.set(normalizado, inst);
    }
    return inst;
  }

  /**
   * Fecha e remove uma instância específica do cache
   */
  static fecharInstancia(workspacePath: string): void {
    const normalizado = resolve(workspacePath);
    const inst = OpencorpDb.instancias.get(normalizado);
    if (inst) {
      try {
        inst.fechar();
      } catch {}
      OpencorpDb.instancias.delete(normalizado);
    }
  }

  /**
   * Limpa cache de instâncias abertas (útil em teardown de testes)
   */
  static limparCache(): void {
    for (const inst of OpencorpDb.instancias.values()) {
      try {
        inst.fechar();
      } catch {}
    }
    OpencorpDb.instancias.clear();
  }

  fechar(): void {
    this.db.close();
  }

  /** Acesso direto ao handle do banco para transações avançadas se necessário */
  get handle(): Database.Database {
    return this.db;
  }

  // ─── TAREFAS (TASKS) ────────────────────────────────────────────────────────

  proximaPos(coluna: string, workspace?: string): number {
    const ws = workspace || this.wsId;
    const r = this.db
      .prepare("SELECT MAX(posicao) AS m FROM tasks WHERE workspace = ? AND coluna = ?")
      .get(ws, coluna) as { m: number | null } | undefined;
    return (r?.m ?? 0) + 1024;
  }

  criarTask(input: NovaTaskInput): TaskComRelacoes {
    const id = input.id || gerarId("tsk");
    const agora = input.criado_em_ms || Date.now();
    const ws = input.workspace || this.wsId;
    const prioridade = input.prioridade || "media";
    const labels = Array.from(new Set((input.labels || []).map((l) => l.trim()).filter(Boolean))).sort();
    const bloqueadoPor = Array.from(new Set((input.bloqueado_por || []).map((d) => d.trim()).filter(Boolean))).sort();
    const dueMs = input.due_ms !== undefined ? input.due_ms : input.due ? Date.parse(input.due) || null : null;
    const dueStr = input.due !== undefined ? input.due : input.due_ms ? new Date(input.due_ms).toISOString() : null;
    const criadoPor = input.criado_por || "humano";

    const tx = this.db.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO tasks
            (id, workspace, titulo, descricao, coluna, posicao, prioridade, responsavel, due, due_ms, task_pai_id, lock_por, lock_expira, lock_expira_ms, criado_por, criado_em_ms, atualizado_em_ms)
          VALUES
            (@id, @workspace, @titulo, @descricao, @coluna, @posicao, @prioridade, @responsavel, @due, @due_ms, @task_pai_id, NULL, NULL, NULL, @criado_por, @criado_em_ms, @atualizado_em_ms)
        `)
        .run({
          id,
          workspace: ws,
          titulo: input.titulo,
          descricao: input.descricao || "",
          coluna: input.coluna || "backlog",
          posicao: Number(input.posicao) || 0,
          prioridade,
          responsavel: input.responsavel || "",
          due: dueStr,
          due_ms: dueMs,
          task_pai_id: input.task_pai_id ?? null,
          criado_por: criadoPor,
          criado_em_ms: agora,
          atualizado_em_ms: input.atualizado_em_ms || agora,
        });

      const stmtLabel = this.db.prepare("INSERT OR IGNORE INTO task_labels (task_id, label) VALUES (?, ?)");
      for (const lbl of labels) {
        stmtLabel.run(id, lbl);
      }

      const stmtDep = this.db.prepare("INSERT OR IGNORE INTO task_dependencies (task_id, bloqueado_por_task_id) VALUES (?, ?)");
      for (const depId of bloqueadoPor) {
        stmtDep.run(id, depId);
      }
    });

    tx();

    return {
      id,
      workspace: ws,
      titulo: input.titulo,
      descricao: input.descricao || "",
      coluna: input.coluna || "backlog",
      posicao: Number(input.posicao) || 0,
      prioridade,
      responsavel: input.responsavel || "",
      due: dueStr,
      due_ms: dueMs,
      task_pai_id: input.task_pai_id ?? null,
      lock_por: null,
      lock_expira: null,
      lock_expira_ms: null,
      criado_por: criadoPor,
      criado_em_ms: agora,
      atualizado_em_ms: input.atualizado_em_ms || agora,
      labels,
      bloqueado_por: bloqueadoPor,
    };
  }

  obterTask(id: string): TaskComRelacoes | undefined {
    const task = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
    if (!task) return undefined;

    const allLabels = this.db
      .prepare("SELECT label FROM task_labels WHERE task_id = ? ORDER BY label ASC")
      .all(id) as Array<{ label: string }>;

    const allDeps = this.db
      .prepare("SELECT bloqueado_por_task_id FROM task_dependencies WHERE task_id = ?")
      .all(id) as Array<{ bloqueado_por_task_id: string }>;

    return {
      ...task,
      labels: allLabels.map((l) => l.label),
      bloqueado_por: allDeps.map((d) => d.bloqueado_por_task_id),
    };
  }

  listarTasks(workspace?: string): TaskComRelacoes[] {
    const ws = workspace || this.wsId;
    const tasks = this.db
      .prepare("SELECT * FROM tasks WHERE workspace = ? ORDER BY coluna ASC, posicao ASC, criado_em_ms ASC")
      .all(ws) as TaskRow[];

    if (!tasks.length) return [];

    const taskIds = tasks.map((t) => t.id);
    const ph = taskIds.map(() => "?").join(",");

    const allLabels = this.db
      .prepare(`SELECT task_id, label FROM task_labels WHERE task_id IN (${ph}) ORDER BY label ASC`)
      .all(...taskIds) as Array<{ task_id: string; label: string }>;

    const allDeps = this.db
      .prepare(`SELECT task_id, bloqueado_por_task_id FROM task_dependencies WHERE task_id IN (${ph})`)
      .all(...taskIds) as Array<{ task_id: string; bloqueado_por_task_id: string }>;

    const labelMap = new Map<string, string[]>();
    for (const row of allLabels) {
      const arr = labelMap.get(row.task_id) ?? [];
      arr.push(row.label);
      labelMap.set(row.task_id, arr);
    }

    const depMap = new Map<string, string[]>();
    for (const row of allDeps) {
      const arr = depMap.get(row.task_id) ?? [];
      arr.push(row.bloqueado_por_task_id);
      depMap.set(row.task_id, arr);
    }

    return tasks.map((t) => ({
      ...t,
      labels: labelMap.get(t.id) ?? [],
      bloqueado_por: depMap.get(t.id) ?? [],
    }));
  }

  atualizarTask(id: string, updates: Partial<UpdateTaskInput>): void {
    const agora = updates.atualizado_em_ms !== undefined ? updates.atualizado_em_ms : Date.now();
    const setClauses: string[] = ["atualizado_em_ms = @agora"];
    const params: Record<string, unknown> = { id, agora };

    if (updates.titulo !== undefined) { setClauses.push("titulo = @titulo"); params.titulo = updates.titulo; }
    if (updates.descricao !== undefined) { setClauses.push("descricao = @descricao"); params.descricao = updates.descricao; }
    if (updates.coluna !== undefined) { setClauses.push("coluna = @coluna"); params.coluna = updates.coluna; }
    if (updates.posicao !== undefined) { setClauses.push("posicao = @posicao"); params.posicao = updates.posicao; }
    if (updates.prioridade !== undefined) { setClauses.push("prioridade = @prioridade"); params.prioridade = updates.prioridade; }
    if (updates.responsavel !== undefined) { setClauses.push("responsavel = @responsavel"); params.responsavel = updates.responsavel; }
    if (updates.due !== undefined) { setClauses.push("due = @due"); params.due = updates.due; }
    if (updates.due_ms !== undefined) { setClauses.push("due_ms = @due_ms"); params.due_ms = updates.due_ms; }
    if (updates.task_pai_id !== undefined) { setClauses.push("task_pai_id = @task_pai_id"); params.task_pai_id = updates.task_pai_id; }
    if (updates.lock_por !== undefined) { setClauses.push("lock_por = @lock_por"); params.lock_por = updates.lock_por; }
    if (updates.lock_expira !== undefined) { setClauses.push("lock_expira = @lock_expira"); params.lock_expira = updates.lock_expira; }
    if (updates.lock_expira_ms !== undefined) { setClauses.push("lock_expira_ms = @lock_expira_ms"); params.lock_expira_ms = updates.lock_expira_ms; }

    const tx = this.db.transaction(() => {
      this.db.prepare(`UPDATE tasks SET ${setClauses.join(", ")} WHERE id = @id`).run(params);

      if (updates.labels !== undefined) {
        this.db.prepare("DELETE FROM task_labels WHERE task_id = ?").run(id);
        const stmtLabel = this.db.prepare("INSERT OR IGNORE INTO task_labels (task_id, label) VALUES (?, ?)");
        const dedupe = Array.from(new Set(updates.labels.map((l) => l.trim()).filter(Boolean)));
        for (const l of dedupe) stmtLabel.run(id, l);
      }

      if (updates.bloqueado_por !== undefined) {
        this.db.prepare("DELETE FROM task_dependencies WHERE task_id = ?").run(id);
        const stmtDep = this.db.prepare("INSERT OR IGNORE INTO task_dependencies (task_id, bloqueado_por_task_id) VALUES (?, ?)");
        const dedupe = Array.from(new Set(updates.bloqueado_por.map((d) => d.trim()).filter(Boolean)));
        for (const depId of dedupe) stmtDep.run(id, depId);
      }
    });

    tx();
  }

  deletarTask(id: string): void {
    this.db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  }

  // ─── SESSÕES E MENSAGENS (SESSIONS & MESSAGES) ──────────────────────────────

  criarSessao(input: NovaSessaoInput): SessionRow {
    const id = input.id || gerarId("sess");
    const inicioMs = input.inicio_ms || Date.now();
    const ws = input.workspace || this.wsId;
    const custoMicroUsd = input.custo_usd !== undefined ? usdToMicroUsd(input.custo_usd) : 0;
    const status = input.status || "executando";

    const sessao: SessionRow = {
      id,
      workspace: ws,
      agente: input.agente,
      modelo: input.modelo || "",
      trigger_id: input.trigger_id ?? null,
      flow_id: input.flow_id ?? null,
      status,
      inicio_ms: inicioMs,
      fim_ms: null,
      duracao_ms: null,
      custo_micro_usd: custoMicroUsd,
      exit_code: null,
      erro: null,
    };

    this.db
      .prepare(`
        INSERT INTO sessions
          (id, workspace, agente, modelo, trigger_id, flow_id, status, inicio_ms, fim_ms, duracao_ms, custo_micro_usd, exit_code, erro)
        VALUES
          (@id, @workspace, @agente, @modelo, @trigger_id, @flow_id, @status, @inicio_ms, @fim_ms, @duracao_ms, @custo_micro_usd, @exit_code, @erro)
      `)
      .run(sessao);

    return sessao;
  }

  finalizarSessao(
    id: string,
    status: StatusSession,
    resultado?: { custo_usd?: number; exit_code?: number; erro?: string },
  ): void {
    const fimMs = Date.now();
    const custoMicro = resultado?.custo_usd !== undefined ? usdToMicroUsd(resultado.custo_usd) : null;

    this.db
      .prepare(`
        UPDATE sessions
        SET status = @status,
            fim_ms = @fim_ms,
            duracao_ms = CASE WHEN inicio_ms > 0 THEN (@fim_ms - inicio_ms) ELSE 0 END,
            custo_micro_usd = COALESCE(@custo_micro, custo_micro_usd),
            exit_code = COALESCE(@exit_code, exit_code),
            erro = COALESCE(@erro, erro)
        WHERE id = @id
      `)
      .run({
        id,
        status,
        fim_ms: fimMs,
        custo_micro: custoMicro,
        exit_code: resultado?.exit_code ?? null,
        erro: resultado?.erro ?? null,
      });
  }

  obterSessao(id: string): SessionRow | undefined {
    return this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  }

  inserirMensagem(msg: NovaMensagemInput): MessageRow {
    const id = msg.id || gerarId("msg");
    const criadoMs = msg.criado_em_ms || Date.now();
    const role = msg.role || "user";
    const tipo = msg.tipo || "conversa";
    const mencoesJson = JSON.stringify(msg.mencoes || []);

    const linha: MessageRow = {
      id,
      session_id: msg.session_id,
      autor: msg.autor,
      role,
      tipo,
      conteudo: msg.conteudo,
      mencoes_json: mencoesJson,
      criado_em_ms: criadoMs,
    };

    this.db
      .prepare(`
        INSERT INTO messages
          (id, session_id, autor, role, tipo, conteudo, mencoes_json, criado_em_ms)
        VALUES
          (@id, @session_id, @autor, @role, @tipo, @conteudo, @mencoes_json, @criado_em_ms)
      `)
      .run(linha);

    return linha;
  }

  listarMensagens(sessionId: string): MessageRow[] {
    return this.db
      .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY criado_em_ms ASC, rowid ASC")
      .all(sessionId) as MessageRow[];
  }

  // ─── TELEMETRIA (SPANS) ─────────────────────────────────────────────────────

  inserirSpan(span: NovoSpanInput): void {
    const id = span.id || gerarId("span");
    const criadoMs = span.criado_em_ms || Date.now();
    const custoMicro = span.custo_usd !== undefined ? usdToMicroUsd(span.custo_usd) : 0;

    this.db
      .prepare(`
        INSERT INTO spans
          (id, session_id, trace_id, span_id, parent_span_id, ferramenta, input_json, output_json, status, duracao_ms, prompt_tokens, saida_tokens, custo_micro_usd, criado_em_ms)
        VALUES
          (@id, @session_id, @trace_id, @span_id, @parent_span_id, @ferramenta, @input_json, @output_json, @status, @duracao_ms, @prompt_tokens, @saida_tokens, @custo_micro_usd, @criado_em_ms)
      `)
      .run({
        id,
        session_id: span.session_id,
        trace_id: span.trace_id,
        span_id: span.span_id,
        parent_span_id: span.parent_span_id ?? null,
        ferramenta: span.ferramenta ?? null,
        input_json: span.input_json ?? null,
        output_json: span.output_json ?? null,
        status: span.status || "sucesso",
        duracao_ms: span.duracao_ms || 0,
        prompt_tokens: span.prompt_tokens || 0,
        saida_tokens: span.saida_tokens || 0,
        custo_micro_usd: custoMicro,
        criado_em_ms: criadoMs,
      });
  }

  listarSpans(sessionId: string): SpanRow[] {
    return this.db
      .prepare("SELECT * FROM spans WHERE session_id = ? ORDER BY criado_em_ms ASC, rowid ASC")
      .all(sessionId) as SpanRow[];
  }

  // ─── NOTIFICAÇÕES ───────────────────────────────────────────────────────────

  inserirNotificacao(notif: NovaNotificacaoInput, cap = 100): NotificationRow {
    const id = notif.id || gerarId("notif");
    const criadoMs = notif.criado_em_ms || Date.now();
    const ws = notif.workspace || this.wsId;
    const lida = notif.lida ? 1 : 0;
    const origem = notif.origem || "painel";
    const acoesJson = JSON.stringify(notif.acoes || []);
    const repeticoes = notif.repeticoes !== undefined ? notif.repeticoes : 1;
    const atualizadoMs = notif.atualizado_em_ms ?? null;

    const row: NotificationRow = {
      id,
      workspace: ws,
      tipo: notif.tipo || "info",
      titulo: notif.titulo,
      mensagem: notif.mensagem,
      origem,
      lida,
      acoes_json: acoesJson,
      repeticoes,
      criado_em_ms: criadoMs,
      atualizado_em_ms: atualizadoMs,
    };

    const tx = this.db.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO notifications
            (id, workspace, tipo, titulo, mensagem, origem, lida, acoes_json, repeticoes, criado_em_ms, atualizado_em_ms)
          VALUES
            (@id, @workspace, @tipo, @titulo, @mensagem, @origem, @lida, @acoes_json, @repeticoes, @criado_em_ms, @atualizado_em_ms)
        `)
        .run(row);

      // FIFO: estourou o cap -> remove as mais antigas do workspace
      if (cap > 0) {
        this.db
          .prepare(`
            DELETE FROM notifications
            WHERE workspace = ?
              AND id NOT IN (
                SELECT id FROM notifications
                WHERE workspace = ?
                ORDER BY criado_em_ms DESC, rowid DESC
                LIMIT ?
              )
          `)
          .run(ws, ws, cap);
      }
    });

    tx();
    return row;
  }

  obterNotificacao(id: string): NotificationRow | undefined {
    return this.db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as NotificationRow | undefined;
  }

  buscarNotificacaoRecente(workspace: string, titulo: string, origem: string): NotificationRow | undefined {
    const rows = this.db
      .prepare(`
        SELECT * FROM notifications
        WHERE workspace = ?
        ORDER BY criado_em_ms DESC, rowid DESC
        LIMIT 5
      `)
      .all(workspace) as NotificationRow[];
    return rows.find((r) => r.titulo === titulo && r.origem === origem);
  }

  atualizarNotificacao(
    id: string,
    updates: {
      mensagem?: string;
      origem?: string;
      lida?: number;
      acoes_json?: string;
      repeticoes?: number;
      atualizado_em_ms?: number | null;
    },
  ): void {
    const setClauses: string[] = [];
    const params: Record<string, unknown> = { id };

    if (updates.mensagem !== undefined) { setClauses.push("mensagem = @mensagem"); params.mensagem = updates.mensagem; }
    if (updates.origem !== undefined) { setClauses.push("origem = @origem"); params.origem = updates.origem; }
    if (updates.lida !== undefined) { setClauses.push("lida = @lida"); params.lida = updates.lida; }
    if (updates.acoes_json !== undefined) { setClauses.push("acoes_json = @acoes_json"); params.acoes_json = updates.acoes_json; }
    if (updates.repeticoes !== undefined) { setClauses.push("repeticoes = @repeticoes"); params.repeticoes = updates.repeticoes; }
    if (updates.atualizado_em_ms !== undefined) { setClauses.push("atualizado_em_ms = @atualizado_em_ms"); params.atualizado_em_ms = updates.atualizado_em_ms; }

    if (setClauses.length > 0) {
      this.db.prepare(`UPDATE notifications SET ${setClauses.join(", ")} WHERE id = @id`).run(params);
    }
  }

  listarNotificacoes(
    workspace?: string,
    opcoes?: number | { apenasNaoLidas?: boolean; limite?: number },
  ): NotificationRow[] {
    const ws = workspace || this.wsId;
    let apenasNaoLidas = false;
    let limite = 50;

    if (typeof opcoes === "number") {
      limite = opcoes;
    } else if (opcoes && typeof opcoes === "object") {
      if (opcoes.apenasNaoLidas !== undefined) apenasNaoLidas = opcoes.apenasNaoLidas;
      if (opcoes.limite !== undefined) limite = opcoes.limite;
    }

    if (apenasNaoLidas) {
      return this.db
        .prepare(`
          SELECT * FROM notifications
          WHERE workspace = ? AND lida = 0
          ORDER BY criado_em_ms DESC, rowid DESC
          LIMIT ?
        `)
        .all(ws, Math.max(1, Math.floor(limite))) as NotificationRow[];
    }

    return this.db
      .prepare(`
        SELECT * FROM notifications
        WHERE workspace = ?
        ORDER BY criado_em_ms DESC, rowid DESC
        LIMIT ?
      `)
      .all(ws, Math.max(1, Math.floor(limite))) as NotificationRow[];
  }

  contarNotificacoes(workspace?: string, apenasNaoLidas = false): number {
    const ws = workspace || this.wsId;
    const r = this.db
      .prepare(`
        SELECT COUNT(*) AS c FROM notifications
        WHERE workspace = ? ${apenasNaoLidas ? "AND lida = 0" : ""}
      `)
      .get(ws) as { c: number } | undefined;
    return r?.c ?? 0;
  }

  marcarNotificacaoComoLida(id: string): NotificationRow | undefined {
    this.db.prepare("UPDATE notifications SET lida = 1 WHERE id = ?").run(id);
    return this.obterNotificacao(id);
  }

  marcarTodasNotificacoesLidas(workspace?: string): number {
    const ws = workspace || this.wsId;
    const r = this.db.prepare("UPDATE notifications SET lida = 1 WHERE workspace = ? AND lida = 0").run(ws);
    return r.changes;
  }

  limparNotificacoes(workspace?: string): void {
    const ws = workspace || this.wsId;
    this.db.prepare("DELETE FROM notifications WHERE workspace = ?").run(ws);
  }
}
