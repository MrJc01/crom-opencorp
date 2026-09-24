/**
 * @module sdk/resources/flows — Recurso Flows do OpenCorp SDK
 *
 * Encapsula endpoints do motor de fluxos declarativos (n8n-inspired).
 */

import type { HttpClient, RequestOptions } from "../http-client.js";

// ── Tipos ───────────────────────────────────────────────────────────

export interface FlowNode {
  id: string;
  tipo: string;
  nome?: string;
  config?: Record<string, unknown>;
  posicao?: { x: number; y: number };
  join?: "all" | "any";
  [key: string]: unknown;
}

export interface FlowEdge {
  origem: string;
  destino: string;
  condicao?: string;
  [key: string]: unknown;
}

export interface FlowResumo {
  id: string;
  nome: string;
  ativo?: boolean;
  nos?: FlowNode[];
  arestas?: FlowEdge[];
  gatilhos?: string[];
  criado_em?: string;
  atualizado_em?: string;
  [key: string]: unknown;
}

export interface FlowExecucao {
  id: string;
  flow_id: string;
  status: "executando" | "concluido" | "falhou" | "cancelado";
  inicio: string;
  fim?: string;
  erro?: string;
  [key: string]: unknown;
}

export interface FlowImportPayload {
  flow?: unknown;
  nos?: FlowNode[];
  arestas?: FlowEdge[];
  sobrescrever?: boolean;
  force?: boolean;
  novoId?: string;
  id?: string;
  [key: string]: unknown;
}

export interface FlowOptions extends RequestOptions {
  workspaceId?: string;
}

// ── Recurso ─────────────────────────────────────────────────────────

export class FlowsResource {
  constructor(private readonly http: HttpClient) {}

  private resolverHeaders(opts?: FlowOptions): Record<string, string> | undefined {
    if (!opts?.workspaceId) return opts?.headers;
    return {
      ...(opts.headers ?? {}),
      "x-opencorp-workspace": opts.workspaceId,
    };
  }

  /** GET /flows — lista fluxos do workspace. */
  async listar(opts?: FlowOptions): Promise<FlowResumo[]> {
    return this.http.get<FlowResumo[]>("/flows", {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** GET /flows/:id — detalhes completos de um fluxo. */
  async obter(flowId: string, opts?: FlowOptions): Promise<FlowResumo> {
    return this.http.get<FlowResumo>(`/flows/${encodeURIComponent(flowId)}`, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** POST /flows — cria ou atualiza um fluxo. */
  async criar(flow: Partial<FlowResumo> & { id: string }, opts?: FlowOptions): Promise<FlowResumo> {
    return this.http.post<FlowResumo>("/flows", flow, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** PUT /flows/:id — atualiza um fluxo existente. */
  async atualizar(flowId: string, dados: Partial<FlowResumo>, opts?: FlowOptions): Promise<FlowResumo> {
    return this.http.put<FlowResumo>(`/flows/${encodeURIComponent(flowId)}`, dados, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** DELETE /flows/:id — remove um fluxo. */
  async deletar(flowId: string, opts?: FlowOptions): Promise<{ ok: boolean; id: string }> {
    return this.http.delete<{ ok: boolean; id: string }>(`/flows/${encodeURIComponent(flowId)}`, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** POST /flows/:id/run — dispara execução de um fluxo. */
  async executar(flowId: string, payload?: unknown, opts?: FlowOptions): Promise<FlowExecucao> {
    return this.http.post<FlowExecucao>(`/flows/${encodeURIComponent(flowId)}/run`, payload, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** GET /flows/:id/export — exporta a definição do fluxo em JSON. */
  async exportar(flowId: string, opts?: FlowOptions): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`/flows/${encodeURIComponent(flowId)}/export`, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** POST /flows/import — importa um fluxo. */
  async importar(payload: FlowImportPayload, opts?: FlowOptions): Promise<{ ok: boolean; flow: FlowResumo }> {
    return this.http.post<{ ok: boolean; flow: FlowResumo }>("/flows/import", payload, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** GET /flows/:id/execucoes — histórico de execuções do fluxo. */
  async listarExecucoes(flowId: string, opts?: FlowOptions): Promise<FlowExecucao[]> {
    return this.http.get<FlowExecucao[]>(`/flows/${encodeURIComponent(flowId)}/execucoes`, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** GET /flows/:id/status — status da última execução. */
  async status(flowId: string, opts?: FlowOptions): Promise<FlowExecucao | null> {
    return this.http.get<FlowExecucao | null>(`/flows/${encodeURIComponent(flowId)}/status`, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }
}
