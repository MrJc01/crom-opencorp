import type { ThreadMessageLike } from "@assistant-ui/react";

export interface SecretaryRuntimeOptions {
  url?: string;
  workspaceId?: string;
  sessaoId?: string;
  agente?: string;
  modelo?: string;
  headers?: Record<string, string>;
  initialMessages?: ThreadMessageLike[];
  sessaoPersistida?: boolean;
  onSessaoCriada?: (sessaoId: string) => void;
  onPrimeiraMensagem?: (texto: string) => void;
  onErro?: (erro: Error) => void;
  obterContextoEnvio?: () => {
    agente?: string;
    modelo?: string;
    imagens?: Array<{ nome?: string; mime?: string; url?: string }>;
    contexto?: string[];
  };
  onLimparContextoEnvio?: () => void;
}

export interface ToolExecutionItem {
  toolName: string;
  toolCallId?: string;
  resumo?: string;
  sucesso?: boolean;
  args?: Record<string, unknown>;
  resultado?: unknown;
}

export interface ChatSessionMetadata {
  sessaoId?: string;
  workspaceId?: string;
  agente: string;
  modelo?: string;
}
