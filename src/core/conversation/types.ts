export interface ConversaStreamOpts {
  sessaoId: string;
  mensagem: string;
  agente: string;
  modelo?: string;
  imagens?: Array<{ mime: string; url: string }>;
  wsPath: string;
  wsId: string;
  contexto?: string[];
}

export interface StreamEvent {
  tipo: "inicio" | "delta" | "pensamento" | "passos" | "acao" | "fim" | "erro" | "status";
  dados: Record<string, unknown>;
}

export interface ConversaSyncOpts extends ConversaStreamOpts {}

export interface ConversaSyncResult {
  resposta: string;
  sessaoId: string;
  modelo: string;
  motor: string;
}

export interface ConversationDriver {
  id: string;
  enviarMensagemStream(
    opts: ConversaStreamOpts,
    onEvent: (evento: StreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  enviarMensagemSync(opts: ConversaSyncOpts, signal?: AbortSignal): Promise<ConversaSyncResult>;
  abortar(sessaoId: string): Promise<void>;
}
