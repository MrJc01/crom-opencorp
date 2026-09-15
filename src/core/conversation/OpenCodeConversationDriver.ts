import {
  type ConversationDriver,
  type ConversaStreamOpts,
  type ConversaSyncOpts,
  type ConversaSyncResult,
  type StreamEvent,
} from "./types.js";
import { parsearModelo } from "../../server/routes/secretario/helpers.js";

export interface OpenCodeDriverOptions {
  porta: number;
  baseUrl?: string;
}

export class OpenCodeConversationDriver implements ConversationDriver {
  readonly id = "opencode";
  private porta: number;
  private baseUrl: string;

  constructor(options: OpenCodeDriverOptions) {
    this.porta = options.porta;
    this.baseUrl = options.baseUrl ?? `http://127.0.0.1:${this.porta}`;
  }

  async abortar(sessaoId: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/session/${encodeURIComponent(sessaoId)}/abort`, {
        method: "POST",
        signal: AbortSignal.timeout(3000),
      });
    } catch {}
  }

  async enviarMensagemSync(opts: ConversaSyncOpts, signal?: AbortSignal): Promise<ConversaSyncResult> {
    const { sessaoId, mensagem, agente, modelo } = opts;
    const { providerID, modelID } = parsearModelo(modelo || "opencode/nemotron-3-ultra-free");
    const modelPayload = providerID && modelID ? { providerID, modelID } : undefined;

    const res = await fetch(`${this.baseUrl}/session/${encodeURIComponent(sessaoId)}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionID: sessaoId,
        agent: agente,
        ...(modelPayload ? { model: modelPayload } : {}),
        parts: [{ type: "text", text: mensagem }],
      }),
      signal: signal ?? AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      throw new Error(`OpenCode daemon respondeu com status ${res.status}`);
    }

    const data = (await res.json()) as {
      parts?: Array<{ type: string; text?: string }>;
    };

    const resposta = (data.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("\n")
      .trim();

    return {
      resposta,
      sessaoId,
      modelo: modelo || "opencode/nemotron-3-ultra-free",
      motor: "opencode",
    };
  }

  async enviarMensagemStream(
    opts: ConversaStreamOpts,
    onEvent: (evento: StreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const { sessaoId, mensagem, agente, modelo, imagens } = opts;
    const { providerID, modelID } = parsearModelo(modelo || "opencode/nemotron-3-ultra-free");
    const modelPayload = providerID && modelID ? { providerID, modelID } : undefined;

    onEvent({
      tipo: "inicio",
      dados: { sessao_id: sessaoId, agente, modelo: modelo || "default", motor: "opencode" },
    });

    const res = await fetch(`${this.baseUrl}/session/${encodeURIComponent(sessaoId)}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionID: sessaoId,
        agent: agente,
        ...(modelPayload ? { model: modelPayload } : {}),
        parts: [
          { type: "text", text: mensagem },
          ...(imagens ?? []).map((img) => ({ type: "file", mime: img.mime, url: img.url })),
        ],
      }),
      signal: signal ?? AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      onEvent({
        tipo: "erro",
        dados: { erro: `Falha no motor OpenCode: HTTP ${res.status}`, sessao_id: sessaoId },
      });
      return;
    }

    const data = (await res.json()) as {
      parts?: Array<{ type: string; text?: string }>;
    };

    const texto = (data.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("\n");

    onEvent({
      tipo: "delta",
      dados: { delta: texto },
    });

    onEvent({
      tipo: "fim",
      dados: { sessao_id: sessaoId, resposta: texto, modelo, motor: "opencode" },
    });
  }
}
