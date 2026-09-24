/**
 * @module sdk/resources/teams — Recurso Teams (Equipes Multi-Agente) do OpenCorp SDK
 *
 * Encapsula endpoints de gestão de equipes autônomas multi-agente
 * com suporte aos 4 padrões de orquestração: Pipeline, Fan-out, Review e Debate.
 */

import type { HttpClient, RequestOptions } from "../http-client.js";

export interface TeamPasso {
  agente: string;
  ordem: string;
}

export interface TeamSpec {
  id: string;
  titulo: string;
  padrao: "pipeline" | "fanout" | "review" | "debate";
  passos?: TeamPasso[];
  paralelos?: TeamPasso[];
  sintese?: TeamPasso;
  executor?: TeamPasso;
  revisor?: TeamPasso;
  turnos?: number;
  proponentes?: TeamPasso[];
  moderador?: { agente: string };
  max_mensagens_auto_h?: number;
  criado_em?: string;
  [key: string]: unknown;
}

export interface TeamOptions extends RequestOptions {
  workspaceId?: string;
}

export class TeamsResource {
  constructor(private readonly http: HttpClient) {}

  private resolverHeaders(opts?: TeamOptions): Record<string, string> | undefined {
    if (!opts?.workspaceId) return opts?.headers;
    return {
      ...(opts.headers ?? {}),
      "x-opencorp-workspace": opts.workspaceId,
    };
  }

  /** GET /teams — lista equipes multi-agente cadastradas. */
  async listar(opts?: TeamOptions): Promise<TeamSpec[]> {
    return this.http.get<TeamSpec[]>("/teams", {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** GET /teams/:id — obtém a spec de uma equipe específica. */
  async obter(id: string, opts?: TeamOptions): Promise<TeamSpec> {
    return this.http.get<TeamSpec>(`/teams/${encodeURIComponent(id)}`, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** POST /teams — cria uma nova spec de equipe. */
  async criar(spec: TeamSpec, opts?: TeamOptions): Promise<TeamSpec> {
    return this.http.post<TeamSpec>("/teams", spec, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** PUT /teams/:id — edita uma spec de equipe existente. */
  async atualizar(id: string, spec: Partial<TeamSpec>, opts?: TeamOptions): Promise<TeamSpec> {
    return this.http.put<TeamSpec>(`/teams/${encodeURIComponent(id)}`, spec, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** DELETE /teams/:id — exclui uma equipe. */
  async excluir(id: string, opts?: TeamOptions): Promise<{ ok: boolean; id: string }> {
    return this.http.delete<{ ok: boolean; id: string }>(`/teams/${encodeURIComponent(id)}`, {
      ...opts,
      headers: this.resolverHeaders(opts),
    });
  }

  /** POST /teams/:id/run — dispara execução da equipe via orquestrador. */
  async executar(
    id: string,
    payload: { ordem: string; [key: string]: unknown },
    opts?: TeamOptions,
  ): Promise<{ exec_id?: string; status?: string; [key: string]: unknown }> {
    return this.http.post<{ exec_id?: string; status?: string }>(
      `/teams/${encodeURIComponent(id)}/run`,
      payload,
      {
        ...opts,
        headers: this.resolverHeaders(opts),
      },
    );
  }
}
