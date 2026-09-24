/**
 * @module sdk/resources/tasks — Recurso Tasks do OpenCorp SDK
 *
 * Encapsula endpoints de gestão de tarefas do Kanban operacional.
 */

import type { HttpClient } from "../http-client.js";

// ── Tipos de resposta ───────────────────────────────────────────────

export interface TaskResumo {
  id: string;
  titulo?: string;
  status?: string;
  prioridade?: string;
  agente?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TaskDetalhada extends TaskResumo {
  descricao?: string;
  resultado?: string;
  [key: string]: unknown;
}

// ── Filtros ─────────────────────────────────────────────────────────

export interface ListarTasksOpts {
  workspaceId?: string;
  status?: string;
  agente?: string;
  limite?: number;
}

// ── Recurso ─────────────────────────────────────────────────────────

export class TasksResource {
  constructor(private readonly http: HttpClient) {}

  /** GET /tasks — lista tarefas com filtros opcionais. */
  async listar(opts?: ListarTasksOpts): Promise<TaskResumo[]> {
    return this.http.get<TaskResumo[]>("/tasks", {
      query: {
        workspace: opts?.workspaceId,
        status: opts?.status,
        agente: opts?.agente,
        limite: opts?.limite,
      },
    });
  }

  /** GET /tasks/:id — detalhes de uma tarefa específica. */
  async obter(id: string): Promise<TaskDetalhada> {
    return this.http.get<TaskDetalhada>(`/tasks/${encodeURIComponent(id)}`);
  }
}
