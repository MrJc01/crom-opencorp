/** @jsxImportSource react */
import type { ThreadMessageLike } from "@assistant-ui/react";

export interface SecretaryRuntimeOptions {
  url?: string;
  workspaceId?: string;
  agente?: string;
  modelo?: string;
  headers?: Record<string, string>;
  initialMessages?: ThreadMessageLike[];
  onSessaoCriada?: (sessaoId: string) => void;
  onErro?: (erro: Error) => void;
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
