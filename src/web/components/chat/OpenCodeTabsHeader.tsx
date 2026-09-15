import { type Component, For, Show, createSignal, createEffect } from "solid-js";
import {
  MessageSquare,
  Plus,
  X,
  History,
  Settings2,
  Brain,
  Terminal,
  Globe,
  Square,
} from "lucide-solid";
import type { SessaoResumo } from "./HistoricoModal";

export interface OpenCodeTabsHeaderProps {
  sessoes: SessaoResumo[];
  sessaoAtivaId: string | null;
  emNovaConversa?: boolean;
  onSelecionarSessao: (id: string) => void;
  onNovaSessao: () => void;
  onExcluirSessao?: (id: string, e: MouseEvent) => void;
  onFecharAba?: (id: string, e: MouseEvent) => void;
  onAbrirHistorico?: () => void;
  onAbrirConfiguracoes?: () => void;
  carregando?: boolean;
  onParar?: () => void;
  mostrarPensamento?: boolean;
  onTogglePensamento?: () => void;
  mostrarAcoes?: boolean;
  onToggleAcoes?: () => void;
  iframeHabilitado?: boolean;
  iframeAberto?: boolean;
  onToggleIframe?: () => void;
  motorInferido?: string;
  modeloAtivo?: string;
}

const CHAVE_ABAS_ABERTAS = "oc-secretario-abas-abertas";

/** Lê as IDs das abas salvas pelo usuário no localStorage */
function carregarAbasSalvas(): string[] {
  try {
    const salvo = localStorage.getItem(CHAVE_ABAS_ABERTAS);
    if (salvo) {
      const parsed = JSON.parse(salvo);
      if (Array.isArray(parsed)) {
        return parsed.filter((id) => typeof id === "string" && id.trim().length > 0);
      }
    }
  } catch {}
  return [];
}

/** Salva as abas abertas no localStorage */
function salvarAbasNoStorage(ids: string[]) {
  try {
    localStorage.setItem(CHAVE_ABAS_ABERTAS, JSON.stringify(ids));
  } catch {}
}

/** Limpa prefixos técnicos de workspace do título da aba para ficar legível */
function formatarTituloAba(titulo?: string): string {
  if (!titulo) return "Nova conversa";
  // Remove prefixos automáticos como [WORKSPACE ATIVO: "..."]
  const limpo = titulo.replace(/^\[WORKSPACE[^\]]+\]\s*(?:\([^)]*\)\s*)?/i, "").trim();
  return limpo || "Conversa";
}

export const OpenCodeTabsHeader: Component<OpenCodeTabsHeaderProps> = (props) => {
  // Lista de IDs das abas atualmente abertas pelo usuário
  const [abasAbertasIds, setAbasAbertasIds] = createSignal<string[]>(carregarAbasSalvas());

  // Sincroniza sessão ativa com a lista de abas abertas
  createEffect(() => {
    const ativa = props.sessaoAtivaId;
    if (ativa && !props.emNovaConversa) {
      setAbasAbertasIds((prev) => {
        if (!prev.includes(ativa)) {
          const proximo = [...prev, ativa];
          salvarAbasNoStorage(proximo);
          return proximo;
        }
        return prev;
      });
    }
  });

  // Mapeia os IDs abertos para os objetos de SessaoResumo correspondentes
  const abasExibidas = () => {
    const ids = abasAbertasIds();
    const todasSessoes = props.sessoes || [];
    const mapa = new Map(todasSessoes.map((s) => [s.id, s]));

    const res: Array<{ id: string; titulo: string }> = [];
    for (const id of ids) {
      const encontrada = mapa.get(id);
      if (encontrada) {
        res.push({
          id,
          titulo: formatarTituloAba(encontrada.titulo),
        });
      } else if (id === props.sessaoAtivaId) {
        res.push({
          id,
          titulo: "Sessão Atual",
        });
      } else {
        res.push({
          id,
          titulo: id.length > 15 ? `${id.slice(0, 8)}...` : id,
        });
      }
    }

    // Se houver sessão ativa que ainda não esteja na lista, adiciona de forma reativa
    if (
      props.sessaoAtivaId &&
      !props.emNovaConversa &&
      !res.some((a) => a.id === props.sessaoAtivaId)
    ) {
      const s = mapa.get(props.sessaoAtivaId);
      res.push({
        id: props.sessaoAtivaId,
        titulo: formatarTituloAba(s?.titulo || "Sessão Atual"),
      });
    }

    return res;
  };

  const isNovaAtiva = () => props.emNovaConversa || (!props.sessaoAtivaId && abasExibidas().length === 0);

  // Fecha uma aba específica do topo e atualiza o localStorage
  const fecharAba = (tabId: string, e: MouseEvent) => {
    e.stopPropagation();
    const atuais = abasAbertasIds();
    const novos = atuais.filter((id) => id !== tabId);
    setAbasAbertasIds(novos);
    salvarAbasNoStorage(novos);

    props.onFecharAba?.(tabId, e);

    // Se fechou a aba que estava ativa, troca para outra aba aberta ou inicia nova conversa
    if (props.sessaoAtivaId === tabId) {
      if (novos.length > 0) {
        const idxAntigo = atuais.indexOf(tabId);
        const novoIdx = Math.max(0, Math.min(idxAntigo - 1, novos.length - 1));
        props.onSelecionarSessao(novos[novoIdx]);
      } else {
        props.onNovaSessao();
      }
    }
  };

  return (
    <header
      id="opencode-tabs-header"
      class="h-11 bg-[#121316] border-b border-zinc-800/80 flex items-center px-2.5 gap-2 overflow-x-auto scrollbar-none shrink-0 z-20 select-none"
    >
      {/* ─── Lista de Abas de Sessões (Apenas abas abertas pelo usuário) ─── */}
      <nav aria-label="Abas de conversas" class="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto scrollbar-none py-1">
        {/* Aba de Nova Conversa (visível se estiver em nova conversa ou não houver nenhuma aba aberta) */}
        <Show when={isNovaAtiva() || abasExibidas().length === 0}>
          <div class="relative flex items-center shrink-0">
            <div
              class="h-8 px-3 rounded-lg flex items-center gap-2 cursor-pointer transition-all text-xs bg-[#1c1d22] text-zinc-100 font-medium shadow-xs border border-zinc-700/60"
            >
              <MessageSquare size={16} class="text-emerald-400 shrink-0" />
              <span class="max-w-[130px] truncate">Nova sessão</span>
            </div>
          </div>
        </Show>

        <For each={abasExibidas()}>
          {(tab) => {
            const isActive = () => tab.id === props.sessaoAtivaId && !isNovaAtiva();
            return (
              <div class="relative flex items-center shrink-0">
                <div
                  onClick={() => props.onSelecionarSessao(tab.id)}
                  class={`group relative h-8 px-3 rounded-lg flex items-center gap-2 cursor-pointer transition-all text-xs select-none ${
                    isActive()
                      ? "bg-[#1c1d22] text-zinc-100 font-medium shadow-xs border border-zinc-700/60"
                      : "bg-transparent hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 border border-transparent"
                  }`}
                  title={tab.titulo}
                >
                  <MessageSquare
                    size={16}
                    class={isActive() ? "text-emerald-400 shrink-0" : "text-zinc-400 shrink-0 group-hover:text-zinc-300"}
                  />
                  <span class="max-w-[110px] sm:max-w-[160px] truncate">
                    {tab.titulo}
                  </span>

                  {/* Botão Fechar Aba (x) */}
                  <button
                    type="button"
                    data-testid="btn-fechar-aba"
                    onClick={(e) => fecharAba(tab.id, e)}
                    class={`h-5.5 w-5.5 rounded-md flex items-center justify-center shrink-0 ml-1 cursor-pointer transition-colors ${
                      isActive()
                        ? "text-zinc-300 hover:text-rose-400 hover:bg-zinc-800/90 active:scale-95"
                        : "text-zinc-400 hover:text-rose-400 hover:bg-zinc-800/80 active:scale-95"
                    }`}
                    title="Fechar aba"
                    aria-label={`Fechar aba ${tab.titulo}`}
                  >
                    <X size={14} class="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
                  </button>
                </div>
              </div>
            );
          }}
        </For>

        {/* Botão + (Nova Sessão Imediata) */}
        <button
          type="button"
          data-testid="btn-nova-conversa"
          onClick={props.onNovaSessao}
          class="h-8 w-8 shrink-0 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 flex items-center justify-center transition-colors cursor-pointer border border-transparent hover:border-zinc-700/40 ml-0.5"
          title="Nova sessão"
          aria-label="Nova sessão"
        >
          <Plus size={16} class="w-4 h-4 shrink-0" strokeWidth={2} />
        </button>
      </nav>

      {/* ─── Ações da Direita ─── */}
      <div class="flex items-center gap-1.5 text-xs shrink-0 pl-2 border-l border-zinc-800/80">
        {/* Status de Execução Ao Vivo / Parar */}
        <Show when={props.carregando}>
          <div class="flex items-center gap-1.5 mr-1 font-mono text-[11px]">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 animate-pulse">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              AO VIVO
            </span>
            <Show when={props.onParar}>
              <button
                type="button"
                onClick={props.onParar}
                class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                title="Interromper agente"
              >
                <Square size={9} fill="currentColor" />
                Parar
              </button>
            </Show>
          </div>
        </Show>

        {/* Badge do Motor OpenCode */}
        <span class="hidden xl:flex items-center gap-2 text-zinc-400 font-mono text-xs px-2 mr-1">
          <span class="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>OpenCode Engine</span>
        </span>

        {/* Toggle Pensamento */}
        <Show when={props.onTogglePensamento}>
          <button
            type="button"
            title={
              props.mostrarPensamento
                ? "Ocultar Raciocínio / Pensamento"
                : "Exibir Raciocínio / Pensamento"
            }
            onClick={props.onTogglePensamento!}
            class={`h-8 w-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              props.mostrarPensamento
                ? "text-purple-300 bg-purple-500/15 border border-purple-500/40 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 border border-transparent"
            }`}
          >
            <Brain size={17} strokeWidth={1.8} class="shrink-0" />
          </button>
        </Show>

        {/* Toggle Ações */}
        <Show when={props.onToggleAcoes}>
          <button
            type="button"
            title={
              props.mostrarAcoes
                ? "Ocultar Passos de Ferramentas"
                : "Exibir Passos de Ferramentas"
            }
            onClick={props.onToggleAcoes!}
            class={`h-8 w-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              props.mostrarAcoes
                ? "text-sky-300 bg-sky-500/15 border border-sky-500/40 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 border border-transparent"
            }`}
          >
            <Terminal size={17} strokeWidth={1.8} class="shrink-0" />
          </button>
        </Show>

        {/* Toggle Preview Iframe */}
        <Show when={props.iframeHabilitado && props.onToggleIframe}>
          <button
            type="button"
            title={props.iframeAberto ? "Fechar Preview Lateral" : "Abrir Preview Lateral (Iframe)"}
            onClick={props.onToggleIframe!}
            class={`h-8 w-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              props.iframeAberto
                ? "text-blue-300 bg-blue-500/20 border border-blue-500/40 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 border border-transparent"
            }`}
          >
            <Globe size={17} strokeWidth={1.8} class="shrink-0" />
          </button>
        </Show>

        {/* Botão de Histórico Completo de Sessões */}
        <Show when={props.onAbrirHistorico}>
          <button
            type="button"
            title="Histórico de Sessões"
            onClick={props.onAbrirHistorico!}
            class="h-8 w-8 rounded-lg flex items-center justify-center transition-all cursor-pointer text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 border border-transparent hover:border-zinc-700/50"
          >
            <History size={17} strokeWidth={1.8} class="shrink-0" />
          </button>
        </Show>

        {/* Botão de Configuração do Motor */}
        <Show when={props.onAbrirConfiguracoes}>
          <button
            type="button"
            title="Configurar Agente / Motor"
            data-testid="btn-configurar-motor"
            onClick={props.onAbrirConfiguracoes!}
            class="h-8 w-8 rounded-lg flex items-center justify-center transition-all cursor-pointer text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 border border-transparent hover:border-zinc-700/50"
          >
            <Settings2 size={17} strokeWidth={1.8} class="shrink-0" />
          </button>
        </Show>
      </div>
    </header>
  );
};
