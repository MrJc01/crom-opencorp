/**
 * @module sdk/resources/tasks — Recurso Tasks do OpenCorp SDK
 *
 * Encapsula endpoints de gestão de tarefas do Kanban operacional.
 */

import type { HttpClient, RequestOptions } from "../http-client.js";

// ── Tipos de resposta ───────────────────────────────────────────────

export interface TaskResumo {
  id: string;
  titulo?: string;
  status?: string;
  coluna?: string;
  prioridade?: string;
  responsavel?: string;
  agente?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TaskDetalhada extends TaskResumo {
  descricao?: string;
  pos?: number;
  labels?: string[];
  due?: string | null;
  task_pai?: string | null;
  bloqueado_por?: string[];
  lock_por?: string | null;
  lock_expira?: string | null;
  criado_por?: string;
  criado_em?: string;
  atualizado_em?: string;
  bloqueada?: boolean;
  resultado?: string;
  [key: string]: unknown;
}

export type Task = TaskDetalhada;

// ── Entradas de Mutação ─────────────────────────────────────────────

export interface CriarTaskInput {
  titulo: string;
  descricao?: string;
  coluna?: string;
  prioridade?: "baixa" | "media" | "alta" | string;
  responsavel?: string;
  responsavel_agente_id?: string;
  labels?: string[];
  tags?: string[];
  due?: string;
  task_pai?: string;
  bloqueado_por?: string[];
  metadata?: Record<string, unknown>;
  executar_agora?: boolean;
  quando?: string;
  cron?: string;
  repete?: string;
  intervalo_min?: number;
  [key: string]: unknown;
}

export interface AtualizarTaskInput {
  titulo?: string;
  descricao?: string;
  coluna?: string;
  pos?: number;
  prioridade?: "baixa" | "media" | "alta" | string;
  responsavel?: string;
  due?: string | null;
  labels?: string[];
  tags?: string[];
  task_pai?: string | null;
  bloqueado_por?: string[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MoverTaskInput {
  coluna: string;
  pos?: number;
  ordem?: number;
}

// ── Opções e Filtros ────────────────────────────────────────────────

export interface TaskOptions extends RequestOptions {
  workspaceId?: string;
}

export interface ListarTasksOpts extends TaskOptions {
  status?: string;
  coluna?: string;
  agente?: string;
  responsavel?: string;
  limite?: number;
}

// ── Recurso ─────────────────────────────────────────────────────────

export class TasksResource {
  constructor(private readonly http: HttpClient) {}

  private resolverHeaders(opts?: TaskOptions): Record<string, string> | undefined {
    if (!opts?.workspaceId) return opts?.headers;
    return {
      ...(opts.headers ?? {}),
      "x-opencorp-workspace": opts.workspaceId,
    };
  }

  /** GET /tasks — lista tarefas com filtros opcionais. */
  async listar(opts?: ListarTasksOpts): Promise<TaskResumo[]> {
    return this.http.get<TaskResumo[]>("/tasks", {
      ...opts,
      headers: this.resolverHeaders(opts),
      query: {
        workspace: opts?.workspaceId,
        coluna: opts?.coluna ?? opts?.status,
        status: opts?.status,
        agente: opts?.agente,
        responsavel: opts?.responsavel ?? opts?.agente,
        limite: opts?.limite,
      },
    });
  }

  /** GET /tasks/:id — detalhes de uma tarefa específica. */
  async obter(id: string, opts?: TaskOptions): Promise<TaskDetalhada> {
    return this.http.get<TaskDetalhada>(`/tasks/${encodeURIComponent(id)}`, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** POST /tasks — cria uma nova tarefa no Kanban. */
  async criar(input: CriarTaskInput, opts?: TaskOptions): Promise<Task> {
    const responsavel =
      input.responsavel ??
      (input.responsavel_agente_id
        ? input.responsavel_agente_id.startsWith("agente:")
          ? input.responsavel_agente_id
          : `agente:${input.responsavel_agente_id}`
        : undefined);

    const labels = input.labels ?? input.tags;

    const payload: Record<string, unknown> = {
      ...input,
      ...(responsavel !== undefined ? { responsavel } : {}),
      ...(labels !== undefined ? { labels } : {}),
    };

    return this.http.post<Task>("/tasks", payload, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** PUT /tasks/:id — atualiza campos de uma tarefa existente. */
  async atualizar(id: string, input: AtualizarTaskInput, opts?: TaskOptions): Promise<Task> {
    const labels = input.labels ?? input.tags;
    const payload: Record<string, unknown> = {
      ...input,
      ...(labels !== undefined ? { labels } : {}),
    };

    return this.http.put<Task>(`/tasks/${encodeURIComponent(id)}`, payload, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** POST /tasks/:id/mover — move uma tarefa para outra coluna e posição opcional. */
  async mover(
    id: string,
    colunaOuInput: string | MoverTaskInput,
    ordem?: number,
    opts?: TaskOptions,
  ): Promise<Task> {
    const coluna = typeof colunaOuInput === "string" ? colunaOuInput : colunaOuInput.coluna;
    const pos =
      typeof colunaOuInput === "string"
        ? ordem
        : (colunaOuInput.pos ?? colunaOuInput.ordem ?? ordem);

    return this.http.post<Task>(
      `/tasks/${encodeURIComponent(id)}/mover`,
      { coluna, ...(pos !== undefined ? { pos } : {}) },
      {
        ...opts,
        headers: this.resolverHeaders(opts),
      },
    );
  }

  /** DELETE /tasks/:id — exclui uma tarefa do workspace. */
  async deletar(id: string, opts?: TaskOptions): Promise<{ ok: boolean; id: string }> {
    return this.http.delete<{ ok: boolean; id: string }>(`/tasks/${encodeURIComponent(id)}`, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }
}

