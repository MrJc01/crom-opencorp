import {
  type ConversationDriver,
  type ConversaStreamOpts,
  type ConversaSyncOpts,
  type ConversaSyncResult,
  type StreamEvent,
} from "./types.js";
import { completarChatDirect, type MensagemChat } from "../contexts/execution/llm-client.js";

export interface DirectLlmDriverOptions {
  homeDir?: string;
  defaultModel?: string;
}

export class DirectLlmConversationDriver implements ConversationDriver {
  readonly id = "direct-llm";
  private homeDir?: string;
  private defaultModel: string;
  private historicoSessoes = new Map<string, MensagemChat[]>();

  constructor(options?: DirectLlmDriverOptions) {
    this.homeDir = options?.homeDir;
    this.defaultModel = options?.defaultModel || "openrouter/google/gemini-2.5-flash";
  }

  async abortar(_sessaoId: string): Promise<void> {
    // LLM direto via HTTP stateless — cancelamento gerenciado por AbortController
  }

  async enviarMensagemSync(opts: ConversaSyncOpts, signal?: AbortSignal): Promise<ConversaSyncResult> {
    const { sessaoId, mensagem, modelo } = opts;
    const modelToUse = modelo || this.defaultModel;

    let historico = this.historicoSessoes.get(sessaoId) ?? [];
    historico.push({ role: "user", content: mensagem });

    const systemPrompt: MensagemChat = {
      role: "system",
      content: `Você é o Secretário Executivo da OpenCorp operando no workspace "${opts.wsId}". Auxilie o usuário de forma analítica e objetiva.`,
    };

    const resposta = await completarChatDirect({
      model: modelToUse,
      messages: [systemPrompt, ...historico],
      homeDir: this.homeDir,
      signal,
    });

    historico.push({ role: "assistant", content: resposta.content });
    this.historicoSessoes.set(sessaoId, historico.slice(-20));

    return {
      resposta: resposta.content,
      sessaoId,
      modelo: modelToUse,
      motor: "direct-llm",
    };
  }

  async enviarMensagemStream(
    opts: ConversaStreamOpts,
    onEvent: (evento: StreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const { sessaoId, mensagem, agente, modelo } = opts;
    const modelToUse = modelo || this.defaultModel;

    onEvent({
      tipo: "inicio",
      dados: { sessao_id: sessaoId, agente, modelo: modelToUse, motor: "direct-llm" },
    });

    try {
      let historico = this.historicoSessoes.get(sessaoId) ?? [];
      historico.push({ role: "user", content: mensagem });

      const systemPrompt: MensagemChat = {
        role: "system",
        content: `Você é o Secretário Executivo da OpenCorp operando no workspace "${opts.wsId}". Auxilie o usuário de forma analítica e objetiva.`,
      };

      const resposta = await completarChatDirect({
        model: modelToUse,
        messages: [systemPrompt, ...historico],
        homeDir: this.homeDir,
        signal,
      });

      historico.push({ role: "assistant", content: resposta.content });
      this.historicoSessoes.set(sessaoId, historico.slice(-20));

      onEvent({
        tipo: "delta",
        dados: { delta: resposta.content },
      });

      onEvent({
        tipo: "fim",
        dados: { sessao_id: sessaoId, resposta: resposta.content, modelo: modelToUse, motor: "direct-llm" },
      });
    } catch (err) {
      onEvent({
        tipo: "erro",
        dados: { erro: `Falha no motor Direct-LLM: ${err instanceof Error ? err.message : String(err)}`, sessao_id: sessaoId },
      });
    }
  }
}
