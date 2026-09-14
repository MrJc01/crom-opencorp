import {
  type Component,
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  For,
  Show,
  createMemo,
} from "solid-js";
import {
  Bot,
  Brain,
  Terminal,
  Globe,
  Plus,
  History,
  Settings2,
  Sparkles,
  ArrowDown,
  ArrowUp,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  Check,
  X,
  Clock,
  ExternalLink,
  Square,
} from "lucide-solid";
import { SessionTurn } from "./SessionTurn";
import { PromptInput, type Anexo } from "./PromptInput";
import { FollowupQueueDock } from "./FollowupQueueDock";
import { ChatIframeEmbed } from "./ChatIframeEmbed";
import { OpenCodeTabsHeader } from "./OpenCodeTabsHeader";
import { OpenCodeWatermark } from "./OpenCodeWatermark";
import { IconButton } from "../../ui/IconButton";
import { Button } from "../../ui/Button";
import type { UniversalChatProps } from "./types";

export const UniversalChat: Component<UniversalChatProps> = (props) => {
  // Configurações de visibilidade dos blocos
  const [mostrarPensamento, setMostrarPensamento] = createSignal(
    props.mostrarPensamentoPadrao !== false
  );
  const [mostrarAcoes, setMostrarAcoes] = createSignal(
    props.mostrarAcoesPadrao !== false
  );

  // Estado do Iframe Lateral Embutido
  const [iframeAberto, setIframeAberto] = createSignal(
    props.iframeConfig?.aberto ?? false
  );
  const [iframeUrl, setIframeUrl] = createSignal(props.iframeConfig?.url || "");
  const [iframeExpandido, setIframeExpandido] = createSignal(false);
  const [abaMobile, setAbaMobile] = createSignal<"chat" | "preview">("chat");

  // Estado local do Prompt (texto e anexos)
  const [localPrompt, setLocalPrompt] = createSignal(props.valorPrompt || "");
  const [localAnexos, setLocalAnexos] = createSignal<Anexo[]>([]);

  // Sincroniza valor externo do prompt (ex: restaurar ao editar)
  createEffect(() => {
    if (props.valorPrompt !== undefined) {
      setLocalPrompt(props.valorPrompt);
    }
  });

  // Sincroniza props de iframe quando mudarem externamente
  createEffect(() => {
    if (props.iframeConfig?.url) {
      setIframeUrl(props.iframeConfig.url);
    }
    if (props.iframeConfig?.aberto !== undefined) {
      setIframeAberto(props.iframeConfig.aberto);
    }
  });

  const abrirIframeComUrl = (url: string) => {
    setIframeUrl(url);
    setIframeAberto(true);
    setAbaMobile("preview");
    props.iframeConfig?.onUrlChange?.(url);
    props.iframeConfig?.onToggle?.(true);
  };

  const fecharIframe = () => {
    setIframeAberto(false);
    setIframeExpandido(false);
    setAbaMobile("chat");
    props.iframeConfig?.onToggle?.(false);
  };

  // Scroll automático
  let scrollContainerRef: HTMLDivElement | undefined;
  let usuarioRolouManual = false;
  const [mostrarBotaoFim, setMostrarBotaoFim] = createSignal(false);
  let carregandoAnterioresEmAndamento = false;

  const rolarParaFim = (suave = true) => {
    if (!scrollContainerRef) return;
    scrollContainerRef.scrollTo({
      top: scrollContainerRef.scrollHeight,
      behavior: suave ? "smooth" : "auto",
    });
    usuarioRolouManual = false;
    setMostrarBotaoFim(false);
  };

  const carregarAnterioresPreservandoScroll = async () => {
    if (
      !scrollContainerRef ||
      !props.onCarregarAnteriores ||
      props.carregandoAnteriores ||
      carregandoAnterioresEmAndamento ||
      !props.temMaisMensagensAnteriores
    ) {
      return;
    }
    carregandoAnterioresEmAndamento = true;
    const alturaAnterior = scrollContainerRef.scrollHeight;
    const topoAnterior = scrollContainerRef.scrollTop;

    try {
      await props.onCarregarAnteriores();
      // Ajusta o scroll imediatamente para manter o foco relativo
      requestAnimationFrame(() => {
        if (scrollContainerRef) {
          const diferenca = scrollContainerRef.scrollHeight - alturaAnterior;
          scrollContainerRef.scrollTop = topoAnterior + diferenca;
        }
      });
    } finally {
      setTimeout(() => {
        carregandoAnterioresEmAndamento = false;
      }, 250);
    }
  };

  const onScroll = () => {
    if (!scrollContainerRef) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef;
    const distanciaFim = scrollHeight - scrollTop - clientHeight;
    const rolouParaCima = distanciaFim > 80;
    usuarioRolouManual = rolouParaCima;
    setMostrarBotaoFim(rolouParaCima);

    // Infinite scroll para cima: ao chegar a menos de 100px do topo, carrega automaticamente mensagens anteriores
    if (scrollTop < 100 && props.temMaisMensagensAnteriores && !props.carregandoAnteriores && !carregandoAnterioresEmAndamento) {
      void carregarAnterioresPreservandoScroll();
    }
  };

  createEffect(() => {
    props.mensagens.length;
    if (!usuarioRolouManual) {
      setTimeout(() => rolarParaFim(false), 30);
    }
  });

  onMount(() => {
    rolarParaFim(false);
  });

  const agenteId = () => props.agente?.id || "secretario-exec";
  const agenteNome = () => props.agente?.nome || "secretario-exec";
  const modeloNome = () => props.agente?.modelo || "";
  const podeEnviar = () =>
    props.podeEnviarPrompt !== false && props.modo !== "leitura";
  const modoVis = () => props.modoVisualizacao || "ambos";

  return (
    <div class="flex flex-col h-full w-full overflow-hidden bg-zinc-950 text-zinc-100 relative">
      {/* ─── Topbar com Abas de Sessões (Estilo OpenCode 1:1) ─── */}
      <Show when={modoVis() !== "app"}>
        <OpenCodeTabsHeader
          sessoes={props.sessoes || []}
          sessaoAtivaId={props.sessaoAtivaId ?? null}
          emNovaConversa={props.emNovaConversa}
          onSelecionarSessao={(id) => props.onSelecionarSessao?.(id)}
          onNovaSessao={() => props.onNovaSessao?.()}
          onExcluirSessao={(id, e) => props.onExcluirSessao?.(id, e)}
          onAbrirHistorico={props.onAbrirHistorico}
          onAbrirConfiguracoes={props.onAbrirConfiguracoes}
          carregando={props.carregando}
          onParar={props.onParar}
          mostrarPensamento={mostrarPensamento()}
          onTogglePensamento={() => setMostrarPensamento((p) => !p)}
          mostrarAcoes={mostrarAcoes()}
          onToggleAcoes={() => setMostrarAcoes((a) => !a)}
          iframeHabilitado={props.iframeConfig?.habilitado}
          iframeAberto={iframeAberto()}
          onToggleIframe={() => {
            if (iframeAberto()) fecharIframe();
            else {
              setIframeAberto(true);
              props.iframeConfig?.onToggle?.(true);
            }
          }}
          modeloAtivo={props.modeloAtivo || modeloNome()}
        />
      </Show>

      {/* ─── Corpo Principal (Chat + Iframe Split View) ──────────── */}
      <div class="flex flex-1 min-h-0 w-full overflow-hidden relative">
        {/* Painel do Chat */}
        <div
          class={`flex flex-col h-full min-w-0 transition-all duration-200 ${
            modoVis() === "app"
              ? "hidden"
              : modoVis() === "chat"
                ? "w-full flex"
                : iframeAberto()
                  ? iframeExpandido()
                    ? "hidden md:hidden"
                    : "w-full md:w-1/2 flex"
                  : "w-full flex"
          } ${iframeAberto() && abaMobile() === "preview" && modoVis() === "ambos" ? "hidden md:flex" : "flex"}`}
        >
          {/* Feed de Mensagens com Scroll */}
          <div
            ref={scrollContainerRef}
            onScroll={onScroll}
            class="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0 scrollbar-thin"
          >
            <Show
              when={props.mensagens.length > 0}
              fallback={
                <div class="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 select-none my-auto">
                  <OpenCodeWatermark
                    label="opencode"
                    sublabel="OpenCorp AI Studio · Secretário Executivo"
                  />

                  <Show when={props.sugestoesRapidas && props.sugestoesRapidas.length > 0}>
                    <div class="flex flex-wrap gap-2 justify-center max-w-lg mt-2">
                      <For each={props.sugestoesRapidas}>
                        {(s) => (
                          <button
                            type="button"
                            onClick={() => props.onEnviarPrompt?.(s.prompt)}
                            class="px-3 py-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 hover:text-zinc-100 transition-colors cursor-pointer text-left shadow-xs"
                          >
                            {s.rotulo}
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              }
            >
              <div class="max-w-3xl mx-auto w-full space-y-3">
                {/* Indicador de Mensagens Anteriores / Início da Conversa */}
                <Show when={props.temMaisMensagensAnteriores}>
                  <div class="flex justify-center py-2">
                    <Show
                      when={props.carregandoAnteriores}
                      fallback={
                        <button
                          type="button"
                          onClick={carregarAnterioresPreservandoScroll}
                          class="text-xs px-3.5 py-1.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-md hover:scale-102 active:scale-98"
                          title="Carregar mensagens anteriores desta conversa"
                        >
                          <ArrowUp size={13} class="text-emerald-400" />
                          <span>
                            Carregar mensagens anteriores
                            {props.totalMensagens && props.totalMensagens > props.mensagens.length
                              ? ` (${props.totalMensagens - props.mensagens.length} restantes)`
                              : ""}
                          </span>
                        </button>
                      }
                    >
                      <div class="text-xs px-3.5 py-1.5 rounded-full bg-zinc-900/90 border border-emerald-500/30 text-emerald-400 flex items-center gap-2 shadow-sm animate-pulse">
                        <Loader2 size={13} class="animate-spin text-emerald-400" />
                        <span>Carregando mensagens anteriores...</span>
                      </div>
                    </Show>
                  </div>
                </Show>
                <Show when={!props.temMaisMensagensAnteriores && (props.totalMensagens || 0) > 2}>
                  <div class="text-center py-2 text-[11px] text-zinc-600 flex items-center justify-center gap-2 select-none">
                    <span class="h-px w-12 bg-zinc-800/80"></span>
                    <span>Início do histórico da conversa</span>
                    <span class="h-px w-12 bg-zinc-800/80"></span>
                  </div>
                </Show>

                <For each={props.mensagens}>
                  {(msg, idx) => {
                    // Verifica se há uma mensagem do usuário APÓS esta mensagem do assistente
                    const jaRespondida = () => {
                      if (msg.role !== "assistant") return false;
                      const proximas = props.mensagens.slice(idx() + 1);
                      return proximas.some((m) => m.role === "user");
                    };
                    return (
                      <SessionTurn
                        mensagem={msg}
                        indice={idx()}
                        decorridoFmt={props.decorridoFmt}
                        mostrarPensamento={mostrarPensamento()}
                        mostrarAcoes={mostrarAcoes()}
                        mostrarTerminal={props.mostrarTerminalPadrao !== false}
                        onEditarPrompt={props.onEditarPrompt}
                        onAprovarHitl={props.onAprovarHitl}
                        onRejeitarHitl={props.onRejeitarHitl}
                        onAbrirIframeUrl={abrirIframeComUrl}
                        jaRespondida={jaRespondida()}
                        onSelecionarOpcao={(opcao) => {
                          if (props.onSelecionarOpcao) {
                            props.onSelecionarOpcao(opcao);
                          } else {
                            void props.onEnviarPrompt?.(opcao);
                          }
                        }}
                      />
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>

          {/* Botão Flutuante de Rolar para o Fim */}
          <Show when={mostrarBotaoFim()}>
            <button
              type="button"
              onClick={() => rolarParaFim(true)}
              class="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 shadow-lg hover:bg-zinc-800 flex items-center gap-1.5 transition-all animate-bounce cursor-pointer"
            >
              <ArrowDown size={13} /> Novas mensagens
            </button>
          </Show>

          {/* Prompt Input (Apenas se podeEnviar for verdadeiro) */}
          <Show when={podeEnviar()}>
            <div class="p-3 bg-zinc-950 border-t border-zinc-800/80 flex-shrink-0">
              <div class="max-w-3xl mx-auto w-full">
                {/* Dock da Fila de Espera (Prompts agendados/followups) */}
                <FollowupQueueDock
                  items={props.filaPrompts || []}
                  onAdiantar={props.onAdiantarFila}
                  onEditar={props.onEditarFila}
                  onRemover={props.onRemoverFila}
                />

                <PromptInput
                  id={props.inputId}
                  valor={props.valorPrompt !== undefined ? props.valorPrompt : localPrompt()}
                  onInput={(v) => {
                    setLocalPrompt(v);
                    props.onValorPromptChange?.(v);
                  }}
                  onEnfileirar={(txt, att) => {
                    if (props.onAdicionarFila) {
                      props.onAdicionarFila(txt, att);
                    }
                  }}
                  refTextarea={props.refTextarea}
                  anexos={localAnexos()}
                  onAdicionarAnexo={(a) => setLocalAnexos((prev) => [...prev, a])}
                  onRemoverAnexo={(idx) => setLocalAnexos((prev) => prev.filter((_, i) => i !== idx))}
                  placeholder={
                    props.placeholder || "Pergunte qualquer coisa, / para comandos, @ para contexto..."
                  }
                  carregando={props.carregando || false}
                  onParar={props.onParar}
                  agenteSelecionado={agenteId()}
                  onMudarAgente={() => {}}
                  modeloAtivo={props.modeloAtivo || modeloNome()}
                  onMudarModelo={props.onMudarModelo}
                  branchAtiva={props.branchAtiva}
                  workspaceId={props.workspaceId}
                  onAbrirConfig={props.onAbrirConfiguracoes}
                  onEnviar={() => {
                    const txt = props.valorPrompt !== undefined ? props.valorPrompt : localPrompt();
                    const att = localAnexos();
                    if (!txt.trim() && att.length === 0) return;
                    setLocalPrompt("");
                    props.onValorPromptChange?.("");
                    setLocalAnexos([]);
                    if (props.onEnviarPrompt) {
                      void props.onEnviarPrompt(txt, att);
                    }
                  }}
                />
              </div>
            </div>
          </Show>
        </div>

        {/* Painel do Iframe Embed (Split View ou Tela Cheia) */}
        <Show when={iframeAberto() && modoVis() !== "chat"}>
          <div
            class={`h-full min-w-0 transition-all duration-200 ${
              modoVis() === "app" || iframeExpandido() ? "w-full" : "w-full md:w-1/2"
            } ${abaMobile() === "chat" && modoVis() === "ambos" ? "hidden md:block" : "block"}`}
          >
            <ChatIframeEmbed
              url={iframeUrl()}
              titulo={props.iframeConfig?.titulo || "Preview"}
              aberto={true}
              onFechar={fecharIframe}
              onUrlChange={(u) => {
                setIframeUrl(u);
                props.iframeConfig?.onUrlChange?.(u);
              }}
              modoExpandido={modoVis() === "app" || iframeExpandido()}
              onToggleExpandido={() => setIframeExpandido((e) => !e)}
            />
          </div>
        </Show>
      </div>
    </div>
  );
};
