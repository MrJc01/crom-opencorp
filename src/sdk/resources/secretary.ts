/**
 * @module sdk/resources/secretary — Recurso Secretary do OpenCorp SDK
 *
 * Encapsula endpoints do Secretário Executivo:
 * status, sessões, histórico e envio de mensagens.
 */

import type { HttpClient } from "../http-client.js";

// ── Tipos de resposta ───────────────────────────────────────────────

export interface SecretarioStatus {
  rodando: boolean;
  porta?: number;
  pid?: number;
  iniciado_em?: string;
  [key: string]: unknown;
}

export interface SessaoResumo {
  id: string;
  title?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface MensagemConversa {
  role: string;
  content: string;
  [key: string]: unknown;
}

export interface ConversaResponse {
  resposta?: string;
  sessao_id?: string;
  [key: string]: unknown;
}

export interface HistoricoResponse {
  id: string;
  messages?: MensagemConversa[];
  [key: string]: unknown;
}

// ── Payload de envio ────────────────────────────────────────────────

export interface EnviarMensagemPayload {
  mensagem: string;
  agente?: string;
  modelo?: string;
  workspace?: string;
  /** Se true, desabilita o "thinking" do modelo (para modelos que suportam). */
  no_think?: boolean;
}

// ── Recurso ─────────────────────────────────────────────────────────

export class SecretaryResource {
  constructor(private readonly http: HttpClient) {}

  /** GET /secretario/status — estado do serviço do Secretário. */
  async getStatus(): Promise<SecretarioStatus> {
    return this.http.get<SecretarioStatus>("/secretario/status");
  }

  /** GET /secretario/sessoes — lista conversas recentes. */
  async getSessoes(): Promise<SessaoResumo[]> {
    return this.http.get<SessaoResumo[]>("/secretario/sessoes");
  }

  /** GET /sessions/:id — histórico de uma sessão específica. */
  async getHistorico(sessaoId: string): Promise<HistoricoResponse> {
    return this.http.get<HistoricoResponse>(`/sessions/${encodeURIComponent(sessaoId)}`);
  }

  /** POST /secretario/conversa — envia mensagem ao Secretário. */
  async enviarMensagem(payload: EnviarMensagemPayload): Promise<ConversaResponse> {
    return this.http.post<ConversaResponse>("/secretario/conversa", payload);
  }

  /** POST /secretario/stop — para o serviço do Secretário. */
  async parar(): Promise<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>("/secretario/stop");
  }
}
