import { useState, useRef, useEffect, useMemo } from "react";
import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ThreadMessageLike,
  AssistantRuntime,
} from "@assistant-ui/react";
import { useLocalRuntime } from "@assistant-ui/react";
import { ThinkParser, parseProblemDetails } from "../../../lib/chat/secretary-stream.js";
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

export function obterAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const t =
      localStorage.getItem("oc-token") ||
      localStorage.getItem("opencorp_token");
    if (t) {
      headers["Authorization"] = `Bearer ${t.trim()}`;
    }
  }
  return headers;
}

/**
 * Cria o ChatModelAdapter idiomático do Secretário Executivo com suporte a:
 * - Streaming contínuo via gerador assíncrono (async *run)
 * - Cancelamento nativo com abortSignal
 * - Segregação em tempo real de blocos <think> (Reasoning / Chain-of-Thought)
 * - Chamadas de ferramentas nativas (tool-call)
 * - Execução direta de shell via "!comando"
 */
export function criarSecretarioModelAdapter(
  options: SecretaryRuntimeOptions,
  sessaoIdRef: React.MutableRefObject<string | undefined>,
): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }: ChatModelRunOptions) {
      const lastMsg = messages[messages.length - 1];
      let userText = "";

      if (lastMsg) {
        if (typeof lastMsg.content === "string") {
          userText = lastMsg.content;
        } else if (Array.isArray(lastMsg.content)) {
          userText = lastMsg.content
            .filter((p: any) => p && p.type === "text" && typeof p.text === "string")
            .map((p: any) => p.text)
            .join("\n");
        }
      }

      const trimmed = userText.trim();
      if (!trimmed) return;

      // ── /clear: Limpeza de histórico ──
      if (trimmed.toLowerCase() === "/clear") {
        yield { content: [] };
        return;
      }

      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : "http://127.0.0.1:4100";
      const wsId = options.workspaceId || "default";

      // ── !comando: Execução Direta de Shell (POST /terminal) ──
      if (trimmed.startsWith("!")) {
        const comandoBruto = trimmed.slice(1).trim();

        yield {
          content: [
            {
              type: "text",
              text: `\`\`\`terminal\n$ !${comandoBruto}\n[executando comando no terminal do workspace ${wsId}...]\n\`\`\``,
            },
          ],
        };

        try {
          const authHeaders = obterAuthHeaders();
          const res = await fetch(
            `${origin}/terminal?workspace=${encodeURIComponent(wsId)}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...authHeaders,
                ...(options.headers ?? {}),
              },
              body: JSON.stringify({ comando: comandoBruto, workspace: wsId }),
              signal: abortSignal,
            },
          );

          const data = await res.json().catch(() => ({}));
          let saida = "";
          if (data.saida) {
            saida = data.saida;
          } else if (data.erro) {
            saida = `Erro: ${data.erro}`;
          } else if (!res.ok) {
            saida = `Erro HTTP ${res.status}: falha na execução do comando`;
          } else {
            saida = "(Comando executado com sucesso)";
          }

          yield {
            content: [
              {
                type: "text",
                text: `\`\`\`terminal\n$ !${comandoBruto}\n${saida}\n\`\`\``,
              },
            ],
          };
        } catch (err: any) {
          if (abortSignal.aborted) return;
          yield {
            content: [
              {
                type: "text",
                text: `\`\`\`terminal\n$ !${comandoBruto}\nFalha de conexão com terminal: ${err.message}\n\`\`\``,
              },
            ],
          };
        }
        return;
      }

      // Notifica a primeira mensagem para renomear aba
      if (messages.length <= 1) {
        options.onPrimeiraMensagem?.(userText);
      }

      const queryParams = new URLSearchParams();
      if (sessaoIdRef.current) queryParams.set("sessao", sessaoIdRef.current);
      if (wsId) queryParams.set("workspace", wsId);
      const urlBase = options.url ?? "/secretario/conversa/stream";
      const urlFinal = `${urlBase}?${queryParams.toString()}`;

      const extra = options.obterContextoEnvio?.();
      const body: Record<string, unknown> = {
        cliente_id: `react_${Date.now().toString(36)}`,
        mensagem: userText,
        prompt: userText,
        agente: extra?.agente ?? options.agente ?? "secretario",
      };
      if (sessaoIdRef.current) body.sessao_id = sessaoIdRef.current;
      const modeloEfetivo = extra?.modelo ?? options.modelo;
      if (modeloEfetivo) {
        body.modelo = modeloEfetivo;
        body.model = modeloEfetivo;
      }
      if (extra?.imagens && extra.imagens.length > 0) {
        body.imagens = extra.imagens;
      }
      if (extra?.contexto && extra.contexto.length > 0) {
        body.contexto = extra.contexto;
      }

      let resp: Response;
      try {
        resp = await fetch(urlFinal, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...obterAuthHeaders(),
            ...(options.headers ?? {}),
          },
          body: JSON.stringify(body),
          signal: abortSignal,
        });
      } catch (err: any) {
        if (abortSignal.aborted) return;
        yield {
          content: [
            {
              type: "text",
              text: `⚠️ Erro de conexão com o Secretário: ${err.message}`,
            },
          ],
        };
        return;
      }

      // Se o secretário não estiver rodando (409), tenta iniciar e repetir uma vez
      if (resp.status === 409) {
        try {
          await fetch(`${origin}/secretario/start`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...obterAuthHeaders(),
              ...(options.headers ?? {}),
            },
            signal: abortSignal,
          });
          await new Promise((r) => setTimeout(r, 600));
          resp = await fetch(urlFinal, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...obterAuthHeaders(),
              ...(options.headers ?? {}),
            },
            body: JSON.stringify(body),
            signal: abortSignal,
          });
        } catch {}
      }

      if (!resp.ok) {
        const problem = await parseProblemDetails(resp);
        options.onErro?.(problem);
        yield {
          content: [
            {
              type: "text",
              text: `⚠️ ${problem.title || "Erro"}: ${problem.detail || problem.message}`,
            },
          ],
        };
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        yield {
          content: [{ type: "text", text: "⚠️ Resposta vazia recebida do servidor." }],
        };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let textoAcumulado = "";
      let pensamentoAcumulado = "";
      const thinkParser = new ThinkParser();
      const acoesAcumuladas: Array<{ ferramenta: string; resumo: string; sucesso: boolean }> = [];

      try {
        while (true) {
          if (abortSignal.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const linhas = buffer.split("\n");
          buffer = linhas.pop() || "";

          let evento = "mensagem";
          let dados = "";

          for (const linha of linhas) {
            if (linha.startsWith("event: ")) {
              evento = linha.slice(7).trim();
            } else if (linha.startsWith("data: ")) {
              dados = linha.slice(6);
            } else if (linha === "" && dados) {
              try {
                const parsed = JSON.parse(dados);

                if ((evento === "inicio" || evento === "sessao" || evento === "fim") && parsed.sessao_id) {
                  const realId = String(parsed.sessao_id).trim();
                  if (realId && sessaoIdRef.current !== realId) {
                    sessaoIdRef.current = realId;
                    options.onSessaoCriada?.(realId);
                  }
                } else if (evento === "pensamento") {
                  pensamentoAcumulado =
                    parsed.acumulado || pensamentoAcumulado + (parsed.delta || "");
                } else if (evento === "delta") {
                  const deltaStr = parsed.delta || "";
                  const { deltaConteudo, deltaPensamento } = thinkParser.processDelta(deltaStr);
                  if (deltaPensamento) pensamentoAcumulado += deltaPensamento;
                  if (deltaConteudo) textoAcumulado += deltaConteudo;
                } else if (evento === "acao") {
                  const itens = Array.isArray(parsed) ? parsed : [parsed];
                  for (const it of itens) {
                    acoesAcumuladas.push({
                      ferramenta: it.ferramenta || "ferramenta",
                      resumo: it.resumo || "Concluído",
                      sucesso: it.sucesso !== false,
                    });
                  }
                } else if (evento === "fim") {
                  if (parsed.resposta && !textoAcumulado) {
                    textoAcumulado = parsed.resposta;
                  }
                } else if (evento === "erro") {
                  const msgErro = parsed.mensagem || parsed.erro || "Erro interno no agente";
                  textoAcumulado += `\n\n⚠️ ${msgErro}`;
                }
              } catch {}

              dados = "";
              evento = "mensagem";

              // Despacha atualização imediata das partes para o runtime
              const partes = buildAssistantParts(
                pensamentoAcumulado,
                acoesAcumuladas,
                textoAcumulado,
              );
              if (partes.length > 0) {
                yield { content: partes };
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
        options.onLimparContextoEnvio?.();
      }

      // Emissão final garantida
      const partesFinais = buildAssistantParts(
        pensamentoAcumulado,
        acoesAcumuladas,
        textoAcumulado,
      );
      if (partesFinais.length > 0) {
        yield { content: partesFinais };
      }
    },
  };
}

/**
 * Hook oficial do OpenCorp que implementa a arquitetura nativa com useLocalRuntime
 * e ChatModelAdapter, eliminando a necessidade de loops manuais e permitindo
 * streaming fluido em tempo real sem F5.
 */
export function useOpenCorpSecretarioRuntime(
  options: SecretaryRuntimeOptions = {},
): AssistantRuntime {
  const sessaoIdRef = useRef<string | undefined>(options.sessaoId);
  sessaoIdRef.current = options.sessaoId;

  // Adapter gerador com streaming contínuo
  const chatModelAdapter = useMemo(
    () => criarSecretarioModelAdapter(options, sessaoIdRef),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.sessaoId, options.workspaceId, options.agente, options.modelo],
  );

  return useLocalRuntime(chatModelAdapter, {
    initialMessages: options.initialMessages,
  });
}
