/** @jsxImportSource react */
import { useState, useCallback, useRef } from "react";
import {
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
  type AssistantRuntime,
} from "@assistant-ui/react";
import { executarSecretarioStream } from "../../../lib/chat/secretary-stream.js";
import { ProblemDetailsError } from "@opencorp/sdk";
import type { SecretaryRuntimeOptions } from "../types.js";

/**
 * Constrói ordenadamente as partes internas da mensagem do assistente:
 * 1. Raciocínio (reasoning / think block)
 * 2. Chamadas de ferramentas (tool-calls)
 * 3. Texto visível (text response)
 */
export function buildAssistantParts(
  pensamento: string,
  ferramentas: Array<{ ferramenta: string; resumo: string; sucesso: boolean }>,
  texto: string,
): any[] {
  const partes: any[] = [];

  if (pensamento && pensamento.trim().length > 0) {
    partes.push({
      type: "reasoning",
      text: pensamento,
    });
  }

  if (ferramentas && ferramentas.length > 0) {
    for (let i = 0; i < ferramentas.length; i++) {
      const item = ferramentas[i];
      partes.push({
        type: "tool-call",
        toolName: item.ferramenta || "ferramenta",
        toolCallId: `tool_${i}_${item.ferramenta}`,
        args: {},
        result: item.resumo || "Concluído",
        isError: item.sucesso === false,
      });
    }
  }

  if (texto && texto.length > 0) {
    partes.push({
      type: "text",
      text: texto,
    });
  }

  return partes;
}

/**
 * Hook oficial do OpenCorp que conecta o `@assistant-ui/react` ao endpoint
 * de streaming SSE nativo (`POST /secretario/conversa/stream`).
 */
export function useOpenCorpSecretarioRuntime(
  options: SecretaryRuntimeOptions = {},
): AssistantRuntime {
  const [messages, setMessages] = useState<ThreadMessageLike[]>(
    options.initialMessages ?? [],
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const sessaoIdRef = useRef<string | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);

  const urlBase = options.url ?? "/secretario/conversa/stream";
  const wsId = options.workspaceId ?? "default";

  const onCancel = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      // Extração determinística do texto do usuário
      let userText = "";
      if (typeof message.content === "string") {
        userText = message.content;
      } else if (Array.isArray(message.content)) {
        userText = message.content
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("\n");
      }

      if (!userText.trim()) return;

      const userMsgId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const asstMsgId = `asst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const userMsg: ThreadMessageLike = {
        id: userMsgId,
        role: "user",
        content: [{ type: "text", text: userText }],
        createdAt: new Date(),
      };

      const asstMsg: ThreadMessageLike = {
        id: asstMsgId,
        role: "assistant",
        content: [],
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, asstMsg]);
      setIsRunning(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      let pensamentoBuffer = "";
      let textoBuffer = "";
      let ferramentasBuffer: Array<{ ferramenta: string; resumo: string; sucesso: boolean }> = [];

      const sincronizarAssistente = () => {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === asstMsgId);
          if (idx === -1) return prev;

          const partes = buildAssistantParts(
            pensamentoBuffer,
            ferramentasBuffer,
            textoBuffer,
          );

          const copia = [...prev];
          copia[idx] = {
            ...prev[idx],
            content: partes,
          };
          return copia;
        });
      };

      try {
        const queryParams = new URLSearchParams();
        if (sessaoIdRef.current) queryParams.set("sessao", sessaoIdRef.current);
        if (wsId) queryParams.set("workspace", wsId);
        const urlFinal = `${urlBase}?${queryParams.toString()}`;

        const body: Record<string, unknown> = {
          cliente_id: `react_${Date.now().toString(36)}`,
          mensagem: userText,
          prompt: userText,
          agente: options.agente ?? "secretario",
        };
        if (sessaoIdRef.current) body.sessao_id = sessaoIdRef.current;
        if (options.modelo) {
          body.modelo = options.modelo;
          body.model = options.modelo;
        }

        await executarSecretarioStream({
          url: urlFinal,
          headers: {
            "Content-Type": "application/json",
            ...(options.headers ?? {}),
          },
          body,
          signal: controller.signal,
          callbacks: {
            onSessaoId: (sid) => {
              sessaoIdRef.current = sid;
              options.onSessaoCriada?.(sid);
            },
            onPensamento: (_delta, acumulado) => {
              pensamentoBuffer = acumulado;
              sincronizarAssistente();
            },
            onDelta: (_delta, acumulado) => {
              textoBuffer = acumulado;
              sincronizarAssistente();
            },
            onAcao: (itens) => {
              ferramentasBuffer = itens;
              sincronizarAssistente();
            },
            onFim: () => {
              setIsRunning(false);
              abortControllerRef.current = null;
            },
            onError: (err) => {
              setIsRunning(false);
              abortControllerRef.current = null;
              options.onErro?.(err);
              if (!textoBuffer) {
                textoBuffer = `⚠️ Erro ao processar resposta: ${err.message}`;
                sincronizarAssistente();
              }
            },
          },
        });
      } catch (err: any) {
        setIsRunning(false);
        abortControllerRef.current = null;
        const msgErro =
          err instanceof ProblemDetailsError
            ? `${err.title}: ${err.detail || err.message}`
            : err.message || "Falha na comunicação com o Secretário";
        options.onErro?.(err);
        if (!textoBuffer) {
          textoBuffer = `⚠️ ${msgErro}`;
          sincronizarAssistente();
        }
      }
    },
    [options, urlBase, wsId],
  );

  return useExternalStoreRuntime({
    messages,
    isRunning,
    convertMessage: (msg: ThreadMessageLike) => msg,
    onNew,
    onCancel,
  });
}
