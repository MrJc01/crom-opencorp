/**
 * @module sdk/resources/agents — Recurso Agents do OpenCorp SDK
 *
 * Encapsula endpoints de catálogo e gestão de agentes, skills e tools.
 */

import type { HttpClient, RequestOptions } from "../http-client.js";

// ── Tipos ───────────────────────────────────────────────────────────

export interface AgentResumo {
  id: string;
  nome?: string;
  descricao?: string;
  modelo?: string;
  temperatura?: number;
  skills?: string[];
  tools?: string[];
  sistema?: string;
  instrucoes?: string;
  arquivo?: string;
  [key: string]: unknown;
}

export interface SkillResumo {
  id: string;
  nome: string;
  descricao?: string;
  caminho?: string;
  [key: string]: unknown;
}

export interface ToolResumo {
  id: string;
  nome: string;
  descricao?: string;
  parametros?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentOptions extends RequestOptions {
  workspaceId?: string;
}

// ── Recurso ─────────────────────────────────────────────────────────

export class AgentsResource {
  constructor(private readonly http: HttpClient) {}

  private resolverHeaders(opts?: AgentOptions): Record<string, string> | undefined {
    if (!opts?.workspaceId) return opts?.headers;
    return {
      ...(opts.headers ?? {}),
      "x-opencorp-workspace": opts.workspaceId,
    };
  }

  /** GET /agents — lista todos os agentes do workspace. */
  async listar(opts?: AgentOptions): Promise<AgentResumo[]> {
    return this.http.get<AgentResumo[]>("/agents", {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** GET /agents/:id — detalhes completos de um agente. */
  async obter(id: string, opts?: AgentOptions): Promise<AgentResumo> {
    return this.http.get<AgentResumo>(`/agents/${encodeURIComponent(id)}`, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** POST /agents — cria ou atualiza a definição de um agente. */
  async salvar(agent: Partial<AgentResumo> & { id: string }, opts?: AgentOptions): Promise<AgentResumo> {
    return this.http.post<AgentResumo>("/agents", agent, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** GET /skills — lista as skills disponíveis. */
  async listarSkills(opts?: AgentOptions): Promise<SkillResumo[]> {
    return this.http.get<SkillResumo[]>("/skills", {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** GET /tools — lista as ferramentas disponíveis. */
  async listarTools(opts?: AgentOptions): Promise<ToolResumo[]> {
    return this.http.get<ToolResumo[]>("/tools", {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** POST /agents/gerar-prompt — gera prompt de sistema com base nas diretrizes. */
  async gerarPrompt(payload: { id?: string; nome?: string; papel?: string; workspace?: string }, opts?: AgentOptions): Promise<{ prompt: string }> {
    return this.http.post<{ prompt: string }>("/agents/gerar-prompt", payload, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** POST /agents/:id/run — dispara execução do agente com uma ordem. */
  async executar(
    id: string,
    payload: { ordem: string; [key: string]: unknown },
    opts?: AgentOptions,
  ): Promise<{ exec_id?: string; [key: string]: unknown }> {
    return this.http.post<{ exec_id?: string }>(
      `/agents/${encodeURIComponent(id)}/run`,
      payload,
      {
        ...opts,
        headers: this.resolverHeaders(opts),
      },
    );
  }
}
