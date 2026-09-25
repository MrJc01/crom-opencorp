import React, { useState, type FC } from "react";
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  type AssistantRuntime,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import {
  Bot,
  User,
  Sparkles,
  Send,
  Square,
  ChevronDown,
  ChevronRight,
  Terminal,
  GitBranch,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Brain,
  Copy,
} from "lucide-react";
import { useOpenCorpSecretarioRuntime } from "../runtime/secretary-runtime-adapter.js";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { SUGESTOES_RAPIDAS } from "../../../lib/chat/constants.js";
import type { SecretaryRuntimeOptions } from "../types.js";

/**
 * Componente de exibição de blocos de raciocínio (Chain of Thought).
 * Suporta expansão/colapso suave e tipografia monoespaçada discreta.
 */
export const ReasoningView: FC<{ text?: string }> = ({ text = "" }) => {
  const [expandido, setExpandido] = useState(false);

  if (!text || text.trim().length === 0) return null;

  return (
    <div className="my-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 text-xs overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => setExpandido((prev) => !prev)}
        className="w-full flex items-center justify-between px-3.5 py-2 bg-zinc-900/60 hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 transition-colors text-left font-mono cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-purple-400 animate-pulse" />
          <span className="font-semibold text-zinc-300">Raciocínio do Modelo</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950/40 border border-purple-800/30 text-purple-300">
            Chain of Thought
          </span>
        </div>
        <div className="flex items-center gap-1 text-zinc-500">
          <span>{expandido ? "Ocultar" : "Inspecionar"}</span>
          {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {expandido && (
        <div className="p-3.5 bg-black/40 font-mono text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap border-t border-zinc-800/40 max-h-72 overflow-y-auto">
          {text}
        </div>
      )}
    </div>
  );
};

/**
 * Componente para exibição de invocações de ferramentas (bash, git, MCP, etc.)
 */
export const ToolCallView: FC<{
  toolName?: string;
  result?: unknown;
  isError?: boolean;
}> = ({ toolName = "ferramenta", result, isError }) => {
  const nomeLower = toolName.toLowerCase();

  const IconeFerramenta = nomeLower.includes("git")
    ? GitBranch
    : nomeLower.includes("bash") || nomeLower.includes("sh") || nomeLower.includes("terminal")
    ? Terminal
    : Wrench;

  const resultadoTexto =
    typeof result === "string"
      ? result
      : result !== undefined && result !== null
      ? JSON.stringify(result, null, 2)
      : null;

  return (
    <div className="my-2 rounded-xl border border-zinc-800 bg-zinc-900/50 text-xs overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60 bg-zinc-900/70">
        <div className="flex items-center gap-2 font-mono">
          <IconeFerramenta size={14} className="text-emerald-400" />
          <span className="font-semibold text-zinc-200">{toolName}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isError ? (
            <span className="flex items-center gap-1 text-[10px] text-rose-400 bg-rose-950/40 border border-rose-800/40 px-2 py-0.5 rounded-full">
              <AlertCircle size={10} /> Falha
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
              <CheckCircle2 size={10} /> Executado
            </span>
          )}
        </div>
      </div>

      {resultadoTexto && (
        <div className="p-2.5 bg-black/60 font-mono text-[11px] text-zinc-300 max-h-48 overflow-x-auto overflow-y-auto whitespace-pre">
          {resultadoTexto}
        </div>
      )}
    </div>
  );
};

import {
  ChatComposer,
  type ContextChip,
  type AnexoImagem,
} from "./ChatComposer.js";

export interface SecretarioChatProps {
  runtime?: AssistantRuntime;
  options?: SecretaryRuntimeOptions;
  sessaoId?: string;
  aoAtualizarTitulo?: (sessaoId: string, titulo: string) => void;
  aoSessaoCriada?: (sid: string) => void;
  className?: string;
}

/**
 * Componente visual Flagship do Secretário Executivo com @assistant-ui/react
 */
export const SecretarioChat: FC<SecretarioChatProps> = ({
  runtime: runtimeProp,
  options,
  sessaoId,
  aoAtualizarTitulo,
  aoSessaoCriada,
  className = "",
}) => {
  const { workspaceId } = useOpenCorp();
  const idSessaoAtiva = sessaoId ?? options?.sessaoId;

  // Estados locais para controle de modelo, agente e anexos no Composer
  const [modeloSelecionado, setModeloSelecionado] = useState<string>("gemini-2.5-flash");
  const [agenteAtivo, setAgenteAtivo] = useState<string | null>(null);
  const [chipsContexto, setChipsContexto] = useState<ContextChip[]>([]);
  const [anexosImagens, setAnexosImagens] = useState<AnexoImagem[]>([]);

  const internalRuntime = useOpenCorpSecretarioRuntime({
    workspaceId: options?.workspaceId ?? workspaceId ?? "default",
    sessaoId: idSessaoAtiva,
    modelo: modeloSelecionado,
    agente: agenteAtivo ?? options?.agente ?? "secretario",
    obterContextoEnvio: () => ({
      agente: agenteAtivo ?? undefined,
      modelo: modeloSelecionado,
      imagens: anexosImagens,
      contexto: chipsContexto.map((c) => c.rotulo),
    }),
    onLimparContextoEnvio: () => {
      setChipsContexto([]);
      setAnexosImagens([]);
    },
    onSessaoCriada: (sid) => {
      options?.onSessaoCriada?.(sid);
      aoSessaoCriada?.(sid);
    },
    onPrimeiraMensagem: (texto) => {
      options?.onPrimeiraMensagem?.(texto);
      if (idSessaoAtiva) {
        const tituloFormatado = texto.slice(0, 30).trim();
        aoAtualizarTitulo?.(idSessaoAtiva, tituloFormatado || "Conversa");
      }
    },
    ...options,
  });
  const runtime = runtimeProp ?? internalRuntime;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div
        className={`flex flex-col h-full w-full bg-zinc-950 text-zinc-100 font-sans select-text overflow-hidden ${className}`}
      >
        <ThreadPrimitive.Root className="flex flex-col flex-1 h-full min-h-0 overflow-hidden">
          {/* Viewport rolável com scroll suave automático */}
          <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
            <ThreadPrimitive.Empty>
              <div className="flex flex-col items-center justify-center h-full min-h-[360px] text-center p-8 space-y-4">
                <div className="h-16 w-16 rounded-2xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center shadow-lg shadow-emerald-950/20">
                  <Bot size={32} className="text-emerald-400" />
                </div>
                <div className="max-w-md space-y-1.5">
                  <h3 className="text-lg font-semibold text-zinc-100 flex items-center justify-center gap-2">
                    Secretário Executivo
                    <Sparkles size={16} className="text-emerald-400" />
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Orquestrador residente do workspace OpenCorp. Capaz de executar ferramentas,
                    gerenciar o Kanban, planejar automações e coordenar agentes de IA.
                  </p>
                </div>

                {/* Sugestões Rápidas (Chips Clicáveis) */}
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2 max-w-lg">
                  {SUGESTOES_RAPIDAS.map((sugestao) => (
                    <button
                      key={sugestao}
                      type="button"
                      onClick={() => {
                        const inputEl = document.getElementById(
                          "chat-input",
                        ) as HTMLTextAreaElement | null;
                        if (inputEl) {
                          const protoSetter = Object.getOwnPropertyDescriptor(
                            window.HTMLTextAreaElement.prototype,
                            "value",
                          )?.set;
                          if (protoSetter) {
                            protoSetter.call(inputEl, sugestao);
                          } else {
                            inputEl.value = sugestao;
                          }
                          inputEl.dispatchEvent(
                            new Event("input", { bubbles: true }),
                          );
                          inputEl.dispatchEvent(
                            new Event("change", { bubbles: true }),
                          );
                          setTimeout(() => {
                            const btnEnviar = document.getElementById(
                              "btn-enviar",
                            ) as HTMLButtonElement | null;
                            btnEnviar?.click();
                          }, 50);
                        }
                      }}
                      className="px-3 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 text-xs text-zinc-300 hover:text-emerald-300 transition-all cursor-pointer shadow-xs active:scale-95"
                    >
                      {sugestao}
                    </button>
                  ))}
                </div>
              </div>
            </ThreadPrimitive.Empty>

            {/* Lista de Mensagens do Chat com função children */}
            <ThreadPrimitive.Messages>
              {({ message }) => {
                if (message.role === "user") {
                  const textoUsuario = message.content
                    .filter(
                      (p): p is { type: "text"; text: string } =>
                        p.type === "text",
                    )
                    .map((p) => p.text)
                    .join("\n");

                  return (
                    <div className="flex justify-end my-4 oc-user group">
                      <div className="flex items-start gap-2 max-w-[85%] lg:max-w-[75%]">
                        <button
                          type="button"
                          title="Copiar prompt"
                          onClick={() => {
                            if (navigator.clipboard) {
                              void navigator.clipboard.writeText(textoUsuario);
                            }
                          }}
                          className="opacity-70 hover:opacity-100 p-1 text-zinc-500 hover:text-zinc-300 rounded transition-opacity cursor-pointer mt-2"
                        >
                          <Copy size={13} />
                        </button>
                        <div className="rounded-2xl rounded-tr-sm bg-emerald-950/40 border border-emerald-800/40 text-emerald-100 px-4 py-3 text-sm shadow-sm leading-relaxed whitespace-pre-wrap">
                          <MessagePrimitive.Parts
                            components={{
                              Text: () => (
                                <MarkdownTextPrimitive className="prose prose-invert prose-emerald text-sm max-w-none text-emerald-100 leading-relaxed break-words" />
                              ),
                            }}
                          />
                        </div>
                        <div className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 flex-shrink-0 mt-0.5">
                          <User size={16} />
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="flex justify-start my-4 oc-assistant">
                    <div className="flex items-start gap-3 max-w-[95%] lg:max-w-[88%] w-full">
                      <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white flex-shrink-0 shadow-md shadow-emerald-900/40 mt-0.5">
                        <Bot size={18} />
                      </div>
                      <div className="flex-1 min-w-0 rounded-2xl rounded-tl-sm bg-zinc-900/50 border border-zinc-800/80 px-4 py-3.5 text-sm shadow-sm">
                        <MessagePrimitive.Parts
                          components={{
                            Text: ({ text }: { text?: string }) => {
                              if (text && text.startsWith("```terminal\n")) {
                                const limpo = text
                                  .replace(/^```terminal\n/, "")
                                  .replace(/\n```$/, "");
                                return (
                                  <div className="bg-zinc-950 text-emerald-400 font-mono p-3 rounded-lg border border-zinc-800 text-xs overflow-x-auto whitespace-pre leading-relaxed shadow-inner">
                                    {limpo}
                                  </div>
                                );
                              }
                              return (
                                <MarkdownTextPrimitive className="prose prose-invert prose-emerald text-sm max-w-none text-zinc-100 leading-relaxed break-words" />
                              );
                            },
                            Reasoning: ({ text }: { text?: string }) => (
                              <ReasoningView text={text} />
                            ),
                            tools: {
                              Fallback: ({ toolName, result, isError }: any) => (
                                <ToolCallView
                                  toolName={toolName}
                                  result={result}
                                  isError={isError}
                                />
                              ),
                            },
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              }}
            </ThreadPrimitive.Messages>
          </ThreadPrimitive.Viewport>

          {/* Composer com Gatilhos (/, @, !), Autocomplete, Chips e Toolbar */}
          <div className="p-4 md:px-8 bg-zinc-950 border-t border-zinc-850">
            <ChatComposer
              modeloAtivo={modeloSelecionado}
              onTrocarModelo={(m) => setModeloSelecionado(m)}
              agenteAtivo={agenteAtivo}
              onDefinirAgente={(ag) => setAgenteAtivo(ag)}
              chipsContexto={chipsContexto}
              onAdicionarChip={(c) =>
                setChipsContexto((prev) => [...prev, c])
              }
              onRemoverChip={(id) =>
                setChipsContexto((prev) => prev.filter((c) => c.id !== id))
              }
              anexosImagens={anexosImagens}
              onAdicionarImagem={(img) =>
                setAnexosImagens((prev) => [...prev, img])
              }
              onRemoverImagem={(id) =>
                setAnexosImagens((prev) => prev.filter((i) => i.id !== id))
              }
              onLimparHistorico={() => {
                void runtime.thread.append({
                  role: "user",
                  content: [{ type: "text", text: "/clear" }],
                });
              }}
              onEnviar={({ texto: textoEnvio, agente, modelo }) => {
                if (agente) setAgenteAtivo(agente);
                if (modelo) setModeloSelecionado(modelo);
                void runtime.thread.append({
                  role: "user",
                  content: [{ type: "text", text: textoEnvio }],
                });
              }}
              isProcessando={runtime.thread.getState().isRunning}
              onCancelar={() => {
                runtime.thread.cancelRun();
              }}
            />
          </div>
        </ThreadPrimitive.Root>
      </div>
    </AssistantRuntimeProvider>
  );
};
