/**
 * Schema Consolidado OpenCorp (opencorp.db)
 *
 * Implementa a Tríade conceitual unificada:
 * Trigger -> Flow -> Session -> Message
 *
 * Características:
 * - PRAGMA foreign_keys = ON;
 * - PRAGMA journal_mode = WAL;
 * - Tipagem monetária estrita com inteiros (micro-dólares: $1.00 = 1_000_000);
 * - Normalização 1NF eliminando listas CSV (task_labels, task_dependencies);
 * - Chaves estrangeiras com regras explícitas (ON DELETE CASCADE / SET NULL).
 */

import type Database from "better-sqlite3";

// ─── DDL CONSTANTS ────────────────────────────────────────────────────────────

export const PRAGMAS_CONSOLIDADOS = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
`;

export const DDL_TRIGGERS = `
CREATE TABLE IF NOT EXISTS triggers (
  id TEXT PRIMARY KEY,
  workspace TEXT NOT NULL DEFAULT '',
  tipo TEXT CHECK(tipo IN ('cron', 'intervalo', 'webhook', 'manual', 'evento')) NOT NULL,
  expressao_cron TEXT,
  alvo_flow_id TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_triggers_flow ON triggers (alvo_flow_id);
CREATE INDEX IF NOT EXISTS idx_triggers_workspace ON triggers (workspace, ativo);
`;

export const DDL_SESSIONS = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  workspace TEXT NOT NULL DEFAULT '',
  agente TEXT NOT NULL DEFAULT '',
  modelo TEXT NOT NULL DEFAULT '',
  trigger_id TEXT REFERENCES triggers(id) ON DELETE SET NULL,
  flow_id TEXT,
  status TEXT CHECK(status IN ('pendente', 'executando', 'concluido', 'falhou', 'cancelado')) NOT NULL DEFAULT 'pendente',
  inicio_ms INTEGER NOT NULL,
  fim_ms INTEGER,
  duracao_ms INTEGER,
  custo_micro_usd INTEGER NOT NULL DEFAULT 0,
  exit_code INTEGER,
  erro TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions (workspace, inicio_ms DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_flow ON sessions (flow_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status);
`;

export const DDL_MESSAGES = `
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  autor TEXT NOT NULL,
  role TEXT CHECK(role IN ('user', 'assistant', 'system', 'tool')) NOT NULL,
  tipo TEXT CHECK(tipo IN ('conversa', 'comentario', 'handoff', 'sistema', 'artefato', 'decisao')) NOT NULL DEFAULT 'conversa',
  conteudo TEXT NOT NULL DEFAULT '',
  mencoes_json TEXT NOT NULL DEFAULT '[]',
  criado_em_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session_chrono ON messages (session_id, criado_em_ms ASC);
`;

export const DDL_SPANS = `
CREATE TABLE IF NOT EXISTS spans (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL UNIQUE,
  parent_span_id TEXT REFERENCES spans(span_id) ON DELETE SET NULL,
  ferramenta TEXT,
  input_json TEXT,
  output_json TEXT,
  status TEXT CHECK(status IN ('sucesso', 'falhou', 'timeout', 'abortado')) NOT NULL DEFAULT 'sucesso',
  duracao_ms INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  saida_tokens INTEGER NOT NULL DEFAULT 0,
  custo_micro_usd INTEGER NOT NULL DEFAULT 0,
  criado_em_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spans_session ON spans (session_id, criado_em_ms ASC);
CREATE INDEX IF NOT EXISTS idx_spans_trace ON spans (trace_id);
CREATE INDEX IF NOT EXISTS idx_spans_parent ON spans (parent_span_id);
`;

export const DDL_TASKS = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workspace TEXT NOT NULL DEFAULT '',
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  coluna TEXT NOT NULL DEFAULT 'backlog',
  posicao REAL NOT NULL DEFAULT 0,
  prioridade TEXT CHECK(prioridade IN ('baixa', 'media', 'alta')) NOT NULL DEFAULT 'media',
  responsavel TEXT NOT NULL DEFAULT '',
  due TEXT,
  due_ms INTEGER,
  task_pai_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  lock_por TEXT,
  lock_expira TEXT,
  lock_expira_ms INTEGER,
  criado_por TEXT NOT NULL DEFAULT '',
  criado_em_ms INTEGER NOT NULL,
  atualizado_em_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_kanban ON tasks (workspace, coluna, posicao ASC);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks (task_pai_id);
CREATE INDEX IF NOT EXISTS idx_tasks_responsavel ON tasks (responsavel, coluna);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (due_ms);
`;

export const DDL_TASK_LABELS = `
CREATE TABLE IF NOT EXISTS task_labels (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  PRIMARY KEY (task_id, label)
);
CREATE INDEX IF NOT EXISTS idx_task_labels_lookup ON task_labels (label);
`;

export const DDL_TASK_DEPENDENCIES = `
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  bloqueado_por_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, bloqueado_por_task_id)
);
CREATE INDEX IF NOT EXISTS idx_task_dep_blocked ON task_dependencies (bloqueado_por_task_id);
`;

export const DDL_NOTIFICATIONS = `
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  workspace TEXT NOT NULL DEFAULT '',
  tipo TEXT CHECK(tipo IN ('resumo', 'aviso', 'erro', 'info')) NOT NULL DEFAULT 'info',
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'painel',
  lida INTEGER NOT NULL DEFAULT 0,
  acoes_json TEXT NOT NULL DEFAULT '[]',
  repeticoes INTEGER NOT NULL DEFAULT 1,
  criado_em_ms INTEGER NOT NULL,
  atualizado_em_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notifications_ws_recent ON notifications (workspace, lida, criado_em_ms DESC);
`;

export const SCHEMA_CONSOLIDADO_DDL = `
${DDL_TRIGGERS}
${DDL_SESSIONS}
${DDL_MESSAGES}
${DDL_SPANS}
${DDL_TASKS}
${DDL_TASK_LABELS}
${DDL_TASK_DEPENDENCIES}
${DDL_NOTIFICATIONS}
`;

/**
 * Inicializa a estrutura consolidada ativando foreign keys e tabelas
 */
export function inicializarBancoConsolidado(db: Database.Database): void {
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA_CONSOLIDADO_DDL);
}

// ─── TYPESCRIPT TYPES ─────────────────────────────────────────────────────────

export type TipoTrigger = "cron" | "intervalo" | "webhook" | "manual" | "evento";

export interface TriggerRow {
  id: string;
  workspace: string;
  tipo: TipoTrigger;
  expressao_cron: string | null;
  alvo_flow_id: string;
  ativo: number;
  metadata_json: string;
  criado_em: string;
}

export type StatusSession = "pendente" | "executando" | "concluido" | "falhou" | "cancelado";

export interface SessionRow {
  id: string;
  workspace: string;
  agente: string;
  modelo: string;
  trigger_id: string | null;
  flow_id: string | null;
  status: StatusSession;
  inicio_ms: number;
  fim_ms: number | null;
  duracao_ms: number | null;
  custo_micro_usd: number;
  exit_code: number | null;
  erro: string | null;
}

export type RoleMessage = "user" | "assistant" | "system" | "tool";
export type TipoMessage = "conversa" | "comentario" | "handoff" | "sistema" | "artefato" | "decisao";

export interface MessageRow {
  id: string;
  session_id: string;
  autor: string;
  role: RoleMessage;
  tipo: TipoMessage;
  conteudo: string;
  mencoes_json: string;
  criado_em_ms: number;
}

export type StatusSpan = "sucesso" | "falhou" | "timeout" | "abortado";

export interface SpanRow {
  id: string;
  session_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  ferramenta: string | null;
  input_json: string | null;
  output_json: string | null;
  status: StatusSpan;
  duracao_ms: number;
  prompt_tokens: number;
  saida_tokens: number;
  custo_micro_usd: number;
  criado_em_ms: number;
}

export type PrioridadeTask = "baixa" | "media" | "alta";

export interface TaskRow {
  id: string;
  workspace: string;
  titulo: string;
  descricao: string;
  coluna: string;
  posicao: number;
  prioridade: PrioridadeTask;
  responsavel: string;
  due: string | null;
  due_ms: number | null;
  task_pai_id: string | null;
  lock_por: string | null;
  lock_expira: string | null;
  lock_expira_ms: number | null;
  criado_por: string;
  criado_em_ms: number;
  atualizado_em_ms: number;
}

export interface TaskLabelRow {
  task_id: string;
  label: string;
}

export interface TaskDependencyRow {
  task_id: string;
  bloqueado_por_task_id: string;
}

export type TipoNotification = "resumo" | "aviso" | "erro" | "info";

export interface NotificationRow {
  id: string;
  workspace: string;
  tipo: TipoNotification;
  titulo: string;
  mensagem: string;
  origem: string;
  lida: number;
  acoes_json: string;
  repeticoes: number;
  criado_em_ms: number;
  atualizado_em_ms: number | null;
}
