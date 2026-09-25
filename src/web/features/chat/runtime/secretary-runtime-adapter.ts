import { useState, useCallback, useRef, useEffect } from "react";
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
 * Converte mensagens retornadas da API /secretario/sessoes/:id/mensagens
 * para o formato ThreadMessageLike do @assistant-ui/react.
 */
export function converterMensagensBackend(
  mensagens: any[],
  sessaoId: string,
): ThreadMessageLike[] {
  if (!Array.isArray(mensagens)) return [];

  return mensagens.map((m: any, idx: number) => {
    if (m.role === "user") {
      return {
        id: m.id || `user_${sessaoId}_${idx}`,
        role: "user",
        content: [{ type: "text", text: m.content || "" }],
        createdAt: m.criado_em ? new Date(m.criado_em) : new Date(),
      };
    }

    const partes = buildAssistantParts(
      m.pensamento || "",
      m.acoes || [],
      m.content || "",
    );

    return {
      id: m.id || `asst_${sessaoId}_${idx}`,
      role: "assistant",
      content: partes,
      createdAt: m.criado_em ? new Date(m.criado_em) : new Date(),
    };
  });
}

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
 * de streaming SSE nativo (`POST /secretario/conversa/stream`) e hidrata
 * o histórico de mensagens da sessão ativa no F5.
 */
export function useOpenCorpSecretarioRuntime(
  options: SecretaryRuntimeOptions = {},
): AssistantRuntime {
  const [messages, setMessages] = useState<ThreadMessageLike[]>(
    options.initialMessages ?? [],
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const sessaoIdRef = useRef<string | undefined>(options.sessaoId);
  const abortControllerRef = useRef<AbortController | null>(null);

  const urlBase = options.url ?? "/secretario/conversa/stream";
  const wsId = options.workspaceId ?? "default";

  // Hidratação no F5 ou troca de aba: carrega mensagens persistidas no backend
  useEffect(() => {
    sessaoIdRef.current = options.sessaoId;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsRunning(false);
    }

    const sid = options.sessaoId?.trim();
    if (!sid) {
      setMessages(options.initialMessages ?? []);
      return;
    }

    // Sessão rascunho criada localmente: inicia vazia sem disparar requisição 404
    const isRascunhoLocal =
      (sid.startsWith("sessao-") || sid.startsWith("draft-")) &&
      !options.sessaoPersistida;
    if (isRascunhoLocal) {
      setMessages(options.initialMessages ?? []);
      return;
    }

    // Sessão existente com ID persistido: carrega histórico do backend
    const controller = new AbortController();
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://127.0.0.1:4100";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(wsId ? { "x-opencorp-workspace": wsId } : {}),
      ...(options.headers ?? {}),
    };

    void fetch(
      `${origin}/secretario/sessoes/${encodeURIComponent(sid)}/mensagens`,
      {
        headers,
        signal: controller.signal,
      },
    )
      .then(async (res) => {
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setMessages([]);
          return;
        }
        const data = await res.json();
        const convertidas = converterMensagensBackend(data, sid);
        setMessages(convertidas);
      })
      .catch((_err: unknown) => {
        if (controller.signal.aborted) return;
        setMessages([]);
      });

    return () => {
      controller.abort();
    };
  }, [options.sessaoId, options.sessaoPersistida, wsId]);

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

      // Dispara callback de primeira mensagem para atualizar o título da aba
      if (messages.length === 0) {
        options.onPrimeiraMensagem?.(userText);
      }

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
