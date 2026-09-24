/**
 * Módulo de Migração ETL: Banco Consolidado OpenCorp
 *
 * Responsável por migrar com segurança máxima (transacional e com backup preventivo)
 * os dados legados de:
 * - corp.db (sessoes, execucoes, mensagens, acoes_agentes)
 * - tasks.db (tasks, task_mensagens)
 * - notifications.json
 *
 * Para o novo banco unificado: opencorp.db
 */

import Database from "better-sqlite3";
import { existsSync, cpSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  inicializarBancoConsolidado,
  type StatusSession,
  type RoleMessage,
  type StatusSpan,
} from "./schema.js";

export interface OpcoesMigracao {
  backup?: boolean;
  workspaceId?: string;
  agora?: () => Date;
}

export interface EstatisticasMigracao {
  tasks: number;
  taskLabels: number;
  taskDependencies: number;
  sessions: number;
  messages: number;
  spans: number;
  notifications: number;
}

export interface ResultadoMigracao {
  sucesso: boolean;
  workspacePath: string;
  backupPath: string | null;
  estatisticas: EstatisticasMigracao;
  tempoMs: number;
  erros?: string[];
}

function parseDataParaMs(valor: unknown, padrao: number = Date.now()): number {
  if (typeof valor === "number" && !isNaN(valor) && valor > 0) return Math.floor(valor);
  if (typeof valor === "string" && valor.trim().length > 0) {
    const ms = Date.parse(valor);
    if (!isNaN(ms)) return ms;
  }
  return padrao;
}

function normalizarStatusSession(statusBruto: string | null | undefined, temFim: boolean): StatusSession {
  const s = String(statusBruto ?? "").toLowerCase().trim();
  if (["concluido", "sucesso", "ok", "done"].includes(s)) return "concluido";
  if (["falhou", "erro", "error", "failed"].includes(s)) return "falhou";
  if (["executando", "running"].includes(s)) return "executando";
  if (["cancelado", "abortado", "cancelled"].includes(s)) return "cancelado";
  return temFim ? "concluido" : "pendente";
}

function normalizarRoleMessage(roleBruto: string | null | undefined): RoleMessage {
  const r = String(roleBruto ?? "").toLowerCase().trim();
  if (["user", "assistant", "system", "tool"].includes(r)) return r as RoleMessage;
  return "user";
}

function normalizarStatusSpan(statusBruto: string | null | undefined): StatusSpan {
  const s = String(statusBruto ?? "").toLowerCase().trim();
  if (["sucesso", "ok", "success"].includes(s)) return "sucesso";
  if (["falhou", "erro", "failed", "error"].includes(s)) return "falhou";
  if (["timeout"].includes(s)) return "timeout";
  if (["abortado", "cancelado"].includes(s)) return "abortado";
  return "sucesso";
}

export function migrarWorkspaceParaSchemaConsolidado(
  workspacePath: string,
  options: OpcoesMigracao = {},
): ResultadoMigracao {
  const inicioTimer = Date.now();
  const wsPath = resolve(workspacePath);
  const opencorpDir = join(wsPath, ".opencorp");
  const wsId = options.workspaceId ?? wsPath.split("/").filter(Boolean).pop() ?? "default";

  const corpDbPath = join(opencorpDir, "corp.db");
  const tasksDbPath = join(opencorpDir, "tasks.db");
  const notifJsonPath = join(opencorpDir, "notifications.json");
  const destinoDbPath = join(opencorpDir, "opencorp.db");

  let backupPath: string | null = null;

  // 1. Backup Preventivo
  if (options.backup !== false) {
    const ts = (options.agora ? options.agora() : new Date()).toISOString().replace(/[:.]/g, "-");
    backupPath = join(opencorpDir, `backup_pre_migration_${ts}`);
    mkdirSync(backupPath, { recursive: true });

    if (existsSync(corpDbPath)) cpSync(corpDbPath, join(backupPath, "corp.db"));
    if (existsSync(tasksDbPath)) cpSync(tasksDbPath, join(backupPath, "tasks.db"));
    if (existsSync(notifJsonPath)) cpSync(notifJsonPath, join(backupPath, "notifications.json"));
  }

  // 2. Conecta ao novo opencorp.db e inicializa schema
  mkdirSync(opencorpDir, { recursive: true });
  const dbDestino = new Database(destinoDbPath);
  inicializarBancoConsolidado(dbDestino);

  const stats: EstatisticasMigracao = {
    tasks: 0,
    taskLabels: 0,
    taskDependencies: 0,
    sessions: 0,
    messages: 0,
    spans: 0,
    notifications: 0,
  };

  // Prepara statements de inserção no banco unificado
  const insertTaskStmt = dbDestino.prepare(`
    INSERT OR REPLACE INTO tasks
      (id, workspace, titulo, descricao, coluna, posicao, prioridade, responsavel, due, due_ms, task_pai_id, lock_por, lock_expira, lock_expira_ms, criado_por, criado_em_ms, atualizado_em_ms)
    VALUES
      (@id, @workspace, @titulo, @descricao, @coluna, @posicao, @prioridade, @responsavel, @due, @due_ms, @task_pai_id, @lock_por, @lock_expira, @lock_expira_ms, @criado_por, @criado_em_ms, @atualizado_em_ms)
  `);

  const insertLabelStmt = dbDestino.prepare(`
    INSERT OR IGNORE INTO task_labels (task_id, label) VALUES (?, ?)
  `);

  const insertDepStmt = dbDestino.prepare(`
    INSERT OR IGNORE INTO task_dependencies (task_id, bloqueado_por_task_id) VALUES (?, ?)
  `);

  const insertSessionStmt = dbDestino.prepare(`
    INSERT OR REPLACE INTO sessions
      (id, workspace, agente, modelo, trigger_id, flow_id, status, inicio_ms, fim_ms, duracao_ms, custo_micro_usd, exit_code, erro)
    VALUES
      (@id, @workspace, @agente, @modelo, @trigger_id, @flow_id, @status, @inicio_ms, @fim_ms, @duracao_ms, @custo_micro_usd, @exit_code, @erro)
  `);

  const insertMessageStmt = dbDestino.prepare(`
    INSERT OR REPLACE INTO messages
      (id, session_id, autor, role, tipo, conteudo, mencoes_json, criado_em_ms)
    VALUES
      (@id, @session_id, @autor, @role, @tipo, @conteudo, @mencoes_json, @criado_em_ms)
  `);

  const insertSpanStmt = dbDestino.prepare(`
    INSERT OR REPLACE INTO spans
      (id, session_id, trace_id, span_id, parent_span_id, ferramenta, input_json, output_json, status, duracao_ms, prompt_tokens, saida_tokens, custo_micro_usd, criado_em_ms)
    VALUES
      (@id, @session_id, @trace_id, @span_id, @parent_span_id, @ferramenta, @input_json, @output_json, @status, @duracao_ms, @prompt_tokens, @saida_tokens, @custo_micro_usd, @criado_em_ms)
  `);

  const insertNotifStmt = dbDestino.prepare(`
    INSERT OR REPLACE INTO notifications
      (id, workspace, tipo, titulo, mensagem, origem, lida, acoes_json, repeticoes, criado_em_ms, atualizado_em_ms)
    VALUES
      (@id, @workspace, @tipo, @titulo, @mensagem, @origem, @lida, @acoes_json, @repeticoes, @criado_em_ms, @atualizado_em_ms)
  `);

  // Executa toda a migração atomicamente em transação
  const executarEtl = dbDestino.transaction(() => {
    const sessionIdsValidas = new Set<string>();
    const taskIdsValidas = new Set<string>();

    // ── 3. ETL de tasks.db ───────────────────────────────────────────────────
    if (existsSync(tasksDbPath)) {
      const dbTasks = new Database(tasksDbPath, { readonly: true });
      try {
        const tasksExistentes = dbTasks.prepare("SELECT * FROM tasks").all() as any[];
        tasksExistentes.forEach((t) => taskIdsValidas.add(t.id));

        const labelsPendentes: Array<{ task_id: string; label: string }> = [];
        const depsPendentes: Array<{ task_id: string; blocked_by: string }> = [];

        for (const t of tasksExistentes) {
          const criadoMs = parseDataParaMs(t.criado_em);
          const atualizadoMs = parseDataParaMs(t.atualizado_em, criadoMs);
          const dueMs = t.due ? parseDataParaMs(t.due) : null;
          const lockExpiraMs = t.lock_expira ? parseDataParaMs(t.lock_expira) : null;
          const paiId = t.task_pai && taskIdsValidas.has(t.task_pai) ? t.task_pai : null;

          const prioridade = ["baixa", "media", "alta"].includes(t.prioridade) ? t.prioridade : "media";

          insertTaskStmt.run({
            id: t.id,
            workspace: wsId,
            titulo: t.titulo || "Sem título",
            descricao: t.descricao || "",
            coluna: t.coluna || "backlog",
            posicao: Number(t.pos) || 0,
            prioridade,
            responsavel: t.responsavel || "",
            due: t.due || null,
            due_ms: dueMs,
            task_pai_id: paiId,
            lock_por: t.lock_por || null,
            lock_expira: t.lock_expira || null,
            lock_expira_ms: lockExpiraMs,
            criado_por: t.criado_por || "humano",
            criado_em_ms: criadoMs,
            atualizado_em_ms: atualizadoMs,
          });
          stats.tasks++;

          // Quebra labels CSV
          if (typeof t.labels === "string" && t.labels.trim().length > 0) {
            const rawLabels = t.labels.split(",").map((l: string) => l.trim()).filter(Boolean);
            const dedupeLabels = Array.from(new Set(rawLabels));
            for (const lbl of dedupeLabels) {
              labelsPendentes.push({ task_id: t.id, label: lbl as string });
            }
          }

          // Quebra dependências CSV
          if (typeof t.bloqueado_por === "string" && t.bloqueado_por.trim().length > 0) {
            const rawDeps = t.bloqueado_por.split(",").map((d: string) => d.trim()).filter(Boolean);
            for (const depId of rawDeps) {
              if (taskIdsValidas.has(depId) && depId !== t.id) {
                depsPendentes.push({ task_id: t.id, blocked_by: depId });
              }
            }
          }
        }

        // Insere labels normalizadas
        for (const l of labelsPendentes) {
          insertLabelStmt.run(l.task_id, l.label);
          stats.taskLabels++;
        }

        // Insere dependências normalizadas
        for (const d of depsPendentes) {
          insertDepStmt.run(d.task_id, d.blocked_by);
          stats.taskDependencies++;
        }
      } finally {
        dbTasks.close();
      }
    }

    // ── 4. ETL de corp.db (Sessoes, Execucoes, Mensagens, Spans) ────────────
    if (existsSync(corpDbPath)) {
      const dbCorp = new Database(corpDbPath, { readonly: true });
      try {
        // 4.1. Sessoes
        const sessoesLegadas = dbCorp.prepare("SELECT * FROM sessoes").all() as any[];
        for (const s of sessoesLegadas) {
          const inicioMs = parseDataParaMs(s.inicio);
          const fimMs = s.fim ? parseDataParaMs(s.fim) : null;
          const custoMicroUsd = Math.round(Number(s.custo_usd || 0) * 1_000_000);
          const status = normalizarStatusSession(s.status, fimMs !== null);
          const duracaoMs = fimMs && inicioMs ? Math.max(0, fimMs - inicioMs) : null;

          insertSessionStmt.run({
            id: s.id,
            workspace: wsId,
            agente: s.agente || "",
            modelo: s.modelo || "",
            trigger_id: null,
            flow_id: s.flow_id || null,
            status,
            inicio_ms: inicioMs,
            fim_ms: fimMs,
            duracao_ms: duracaoMs,
            custo_micro_usd: custoMicroUsd,
            exit_code: null,
            erro: null,
          });
          sessionIdsValidas.add(s.id);
          stats.sessions++;
        }

        // 4.2. Execucoes (ledger)
        const execucoesLegadas = dbCorp.prepare("SELECT * FROM execucoes").all() as any[];
        for (const e of execucoesLegadas) {
          const inicioMs = parseDataParaMs(e.inicio);
          const fimMs = e.fim ? parseDataParaMs(e.fim) : null;
          const custoMicroUsd = Math.round(Number(e.custo_usd || 0) * 1_000_000);
          const status = normalizarStatusSession(e.status, fimMs !== null);
          const duracaoMs = typeof e.duracao_ms === "number" ? e.duracao_ms : fimMs ? fimMs - inicioMs : null;

          insertSessionStmt.run({
            id: e.id,
            workspace: wsId,
            agente: e.agente || "",
            modelo: e.modelo || "",
            trigger_id: null,
            flow_id: null,
            status,
            inicio_ms: inicioMs,
            fim_ms: fimMs,
            duracao_ms: duracaoMs,
            custo_micro_usd: custoMicroUsd,
            exit_code: typeof e.exit_code === "number" ? e.exit_code : null,
            erro: e.erro || null,
          });
          sessionIdsValidas.add(e.id);
          stats.sessions++;
        }

        // 4.3. Mensagens
        const mensagensLegadas = dbCorp.prepare("SELECT * FROM mensagens").all() as any[];
        for (const m of mensagensLegadas) {
          // Garante sessão pai para integridade referencial
          if (!sessionIdsValidas.has(m.sessao_id)) {
            insertSessionStmt.run({
              id: m.sessao_id,
              workspace: wsId,
              agente: m.agente || "agente-legado",
              modelo: "legado",
              trigger_id: null,
              flow_id: null,
              status: "concluido",
              inicio_ms: parseDataParaMs(m.criado_em),
              fim_ms: parseDataParaMs(m.criado_em),
              duracao_ms: 0,
              custo_micro_usd: 0,
              exit_code: 0,
              erro: null,
            });
            sessionIdsValidas.add(m.sessao_id);
            stats.sessions++;
          }

          insertMessageStmt.run({
            id: m.id,
            session_id: m.sessao_id,
            autor: m.agente || "anon",
            role: normalizarRoleMessage(m.role),
            tipo: "conversa",
            conteudo: m.conteudo || "",
            mencoes_json: "[]",
            criado_em_ms: parseDataParaMs(m.criado_em),
          });
          stats.messages++;
        }

        // 4.4. Ações de Agentes -> Spans
        const acoesLegadas = dbCorp.prepare("SELECT * FROM acoes_agentes").all() as any[];
        const spanIdsExistentes = new Set(acoesLegadas.map((a) => a.span_id));

        for (const a of acoesLegadas) {
          if (!sessionIdsValidas.has(a.sessao_id)) {
            insertSessionStmt.run({
              id: a.sessao_id,
              workspace: wsId,
              agente: a.agente || "agente-span",
              modelo: a.modelo || "",
              trigger_id: null,
              flow_id: null,
              status: "concluido",
              inicio_ms: parseDataParaMs(a.criado_em),
              fim_ms: parseDataParaMs(a.criado_em),
              duracao_ms: 0,
              custo_micro_usd: 0,
              exit_code: 0,
              erro: null,
            });
            sessionIdsValidas.add(a.sessao_id);
            stats.sessions++;
          }

          const parentSpan = a.parent_span_id && spanIdsExistentes.has(a.parent_span_id) ? a.parent_span_id : null;
          const custoMicroUsd = Math.round(Number(a.custo_usd || 0) * 1_000_000);

          insertSpanStmt.run({
            id: a.id,
            session_id: a.sessao_id,
            trace_id: a.trace_id,
            span_id: a.span_id,
            parent_span_id: parentSpan,
            ferramenta: a.ferramenta || null,
            input_json: a.input_json || null,
            output_json: a.output_json || null,
            status: normalizarStatusSpan(a.status),
            duracao_ms: Number(a.duracao_ms) || 0,
            prompt_tokens: Number(a.tokens_prompt) || 0,
            saida_tokens: Number(a.tokens_saida) || 0,
            custo_micro_usd: custoMicroUsd,
            criado_em_ms: parseDataParaMs(a.criado_em),
          });
          stats.spans++;
        }
      } finally {
        dbCorp.close();
      }
    }

    // ── 4.5. Migração de task_mensagens -> messages ─────────────────────────
    if (existsSync(tasksDbPath)) {
      const dbTasks = new Database(tasksDbPath, { readonly: true });
      try {
        const msgsTask = dbTasks.prepare("SELECT * FROM task_mensagens").all() as any[];
        for (const tm of msgsTask) {
          const sessaoTaskId = `task-sessao-${tm.task_id}`;
          if (!sessionIdsValidas.has(sessaoTaskId)) {
            insertSessionStmt.run({
              id: sessaoTaskId,
              workspace: wsId,
              agente: "task-manager",
              modelo: "kanban",
              trigger_id: null,
              flow_id: null,
              status: "concluido",
              inicio_ms: parseDataParaMs(tm.criado_em),
              fim_ms: parseDataParaMs(tm.criado_em),
              duracao_ms: 0,
              custo_micro_usd: 0,
              exit_code: 0,
              erro: null,
            });
            sessionIdsValidas.add(sessaoTaskId);
            stats.sessions++;
          }

          const rawMencoes = tm.menciona ? tm.menciona.split(",").map((m: string) => m.trim()).filter(Boolean) : [];
          const rawRefs = tm.refs ? tm.refs.split(",").map((r: string) => r.trim()).filter(Boolean) : [];

          insertMessageStmt.run({
            id: tm.id,
            session_id: sessaoTaskId,
            autor: tm.autor || "usuario",
            role: "user",
            tipo: "comentario",
            conteudo: tm.corpo || "",
            mencoes_json: JSON.stringify([...rawMencoes, ...rawRefs]),
            criado_em_ms: parseDataParaMs(tm.criado_em),
          });
          stats.messages++;
        }
      } finally {
        dbTasks.close();
      }
    }

    // ── 5. ETL de notifications.json ────────────────────────────────────────
    if (existsSync(notifJsonPath)) {
      try {
        const conteudo = readFileSync(notifJsonPath, "utf8");
        const notifs = JSON.parse(conteudo);
        if (Array.isArray(notifs)) {
          for (const n of notifs) {
            const tipo = ["resumo", "aviso", "erro", "info"].includes(n.tipo) ? n.tipo : "info";
            insertNotifStmt.run({
              id: n.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              workspace: wsId,
              tipo,
              titulo: n.titulo || "Notificação",
              mensagem: n.mensagem || n.corpo || "",
              origem: n.origem || "painel",
              lida: n.lida ? 1 : 0,
              acoes_json: JSON.stringify(n.acoes || []),
              repeticoes: Number(n.repeticoes) || 1,
              criado_em_ms: parseDataParaMs(n.criado_em),
              atualizado_em_ms: n.atualizado_em ? parseDataParaMs(n.atualizado_em) : null,
            });
            stats.notifications++;
          }
        }
      } catch {}
    }
  });

  try {
    executarEtl();
    dbDestino.close();
    return {
      sucesso: true,
      workspacePath: wsPath,
      backupPath,
      estatisticas: stats,
      tempoMs: Date.now() - inicioTimer,
    };
  } catch (err) {
    dbDestino.close();
    throw err;
  }
}

// ─── RUNNER TRANSACIONAL DE MIGRAÇÕES (_schema_migrations) ────────────────────

export interface Migration {
  version: number;       // Ex: 1, 2, 3...
  name: string;          // Ex: "001_init_core_schema"
  up: (db: Database.Database) => void;
}

export interface ResultadoExecucaoMigracoes {
  aplicadas: number;
  versoes: number[];
}

/**
 * Runner transacional de migrações de schema com tabela de controle _schema_migrations.
 * Garante atomicidade (rollback automático em caso de erro), idempotência e ordenação.
 */
export class SchemaMigrator {
  /**
   * Garante a criação da tabela de controle _schema_migrations.
   */
  init(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
  }

  /**
   * Retorna a maior versão registrada ou 0 se nenhuma migração foi aplicada.
   */
  getVersaoAtual(db: Database.Database): number {
    this.init(db);
    const row = db
      .prepare(`SELECT MAX(version) as max_version FROM _schema_migrations`)
      .get() as { max_version?: number | null } | undefined;
    return row?.max_version ?? 0;
  }

  /**
   * Lista todas as migrações aplicadas no banco em ordem crescente.
   */
  listarVersoesAplicadas(
    db: Database.Database,
  ): Array<{ version: number; name: string; applied_at: string }> {
    this.init(db);
    return db
      .prepare(`SELECT version, name, applied_at FROM _schema_migrations ORDER BY version ASC`)
      .all() as Array<{ version: number; name: string; applied_at: string }>;
  }

  /**
   * Executa em ordem sequencial todas as migrações com versão superior à atual.
   * Cada migração é executada atomicamente dentro de uma transação SQLite.
   * Se a função up() lançar erro, a transação reverte tudo automaticamente e interrompe a execução.
   *
   * Idempotência garantida: se todas as migrações já foram aplicadas, retorna { aplicadas: 0, versoes: [] }.
   */
  executarMigracoes(
    db: Database.Database,
    migracoes: Migration[],
  ): ResultadoExecucaoMigracoes {
    this.init(db);
    const versaoAtual = this.getVersaoAtual(db);

    const ordenadas = [...migracoes].sort((a, b) => a.version - b.version);
    const pendentes = ordenadas.filter((m) => m.version > versaoAtual);

    if (pendentes.length === 0) {
      return { aplicadas: 0, versoes: [] };
    }

    const versoesAplicadas: number[] = [];

    for (const migracao of pendentes) {
      const transacao = db.transaction(() => {
        migracao.up(db);
        db.prepare(
          `INSERT INTO _schema_migrations (version, name, applied_at) VALUES (?, ?, datetime('now'))`,
        ).run(migracao.version, migracao.name);
      });

      try {
        transacao();
        versoesAplicadas.push(migracao.version);
      } catch (err) {
        throw new Error(
          `Falha ao aplicar migração ${migracao.version} ("${migracao.name}"): ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
    }

    return {
      aplicadas: versoesAplicadas.length,
      versoes: versoesAplicadas,
    };
  }
}

/** Instância singleton do runner de migrações. */
export const schemaMigrator = new SchemaMigrator();

/** Função utilitária direta para execução de migrações em um banco. */
export function executarMigracoes(
  db: Database.Database,
  migracoes: Migration[],
): ResultadoExecucaoMigracoes {
  return schemaMigrator.executarMigracoes(db, migracoes);
}

