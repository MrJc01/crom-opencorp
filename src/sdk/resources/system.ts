/**
 * @module sdk/resources/system — Recurso System do OpenCorp SDK
 *
 * Encapsula endpoints de status e saúde do servidor.
 */

import type { HttpClient, RequestOptions } from "../http-client.js";

// ── Tipos de resposta ───────────────────────────────────────────────

export interface SaudeResponse {
  status: string;
  version?: string;
  uptime?: number;
  [key: string]: unknown;
}

export interface HealthResponse {
  ok: boolean;
  [key: string]: unknown;
}

// ── Recurso ─────────────────────────────────────────────────────────

export class SystemResource {
  constructor(private readonly http: HttpClient) {}

  /** GET /health — verificação rápida de disponibilidade do servidor. */
  async getHealth(opts?: RequestOptions): Promise<HealthResponse> {
    return this.http.get<HealthResponse>("/health", opts);
  }

  /** GET /saude — diagnóstico estendido de saúde (se o servidor expor). */
  async getSaude(opts?: RequestOptions): Promise<SaudeResponse> {
    return this.http.get<SaudeResponse>("/saude", opts);
  }

  /** GET /status — status geral do sistema. */
  async getStatus(opts?: RequestOptions): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>("/status", opts);
  }
}
