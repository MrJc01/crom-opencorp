import { type Component, createSignal, createMemo, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import {
  FolderPlus,
  Search,
  Settings,
  BookOpen,
  HelpCircle,
  Plus,
  Bot,
  ArrowRight,
  Sparkles,
  Building2,
  X,
  FileText,
  KeyRound,
  Shield,
} from "lucide-solid";
import { setWsAtivo, type WorkspaceInfo } from "../lib/context";
import { NovoWorkspaceModal } from "./NovoWorkspaceModal";

export interface HomeZeroStateProps {
  workspaces: WorkspaceInfo[];
}

export const HomeZeroState: Component<HomeZeroStateProps> = (props) => {
  const navigate = useNavigate();
  const [modalNovoWs, setModalNovoWs] = createSignal(false);
  const [modalAjuda, setModalAjuda] = createSignal(false);
  const [busca, setBusca] = createSignal("");

  // Ações e documentos pesquisáveis na barra rápida
  const catalogoPesquisa = [
    {
      tipo: "doc",
      titulo: "Arquitetura de SO Distribuído",
      subtitulo: "Filesystem como SSOT, SQLite WAL e isolamento",
      link: "/docs?doc=02-arquitetura",
      icone: BookOpen,
    },
    {
      tipo: "doc",
      titulo: "Manual do Secretário Executivo",
      subtitulo: "Governança, despacho autônomo e hot-swap",
      link: "/docs?doc=04-agentes",
      icone: Bot,
    },
    {
      tipo: "doc",
      titulo: "Blueprint Empresa Editorial WordPress",
      subtitulo: "Pipeline de redação, revisão e publicação",
      link: "/docs?doc=capacidades",
      icone: FileText,
    },
    {
      tipo: "config",
      titulo: "Configuração de Modelos & Rotação",
      subtitulo: "Ajustar modelos gratuitos e ordem de fallback",
      link: "/config?tab=modelos",
      icone: Settings,
    },
    {
      tipo: "config",
      titulo: "Chaves de API & Provedores",
      subtitulo: "OpenRouter, OpenCode-Go e BYOK",
      link: "/config?tab=chaves",
      icone: KeyRound,
    },
    {
      tipo: "config",
      titulo: "Políticas de Segurança (Security Guard)",
      subtitulo: "Allowlist estrita, blocklist e aprovação HITL",
      link: "/config?tab=seguranca",
      icone: Shield,
    },
  ];

  const resultadosBusca = createMemo(() => {
    const q = busca().trim().toLowerCase();
    if (!q) return [];
    const docsFiltrados = catalogoPesquisa.filter(
      (item) =>
        item.titulo.toLowerCase().includes(q) ||
        item.subtitulo.toLowerCase().includes(q)
    );
    const wsFiltrados = props.workspaces
      .filter((w) => w.id.toLowerCase().includes(q))
      .map((w) => ({
        tipo: "workspace",
        titulo: `Empresa: ${w.id}`,
        subtitulo: `Ativar workspace ${w.id}`,
        wsId: w.id,
        icone: Building2,
      }));
    return [...wsFiltrados, ...docsFiltrados];
  });

  const selecionarWorkspace = (id: string) => {
    setWsAtivo(id);
    navigate("/home");
  };

  return (
    <div class="h-full w-full p-2 sm:p-3 md:p-4 flex flex-col bg-zinc-950 overflow-y-auto select-none scrollbar-thin">
      {/* Card Principal Estilo OpenCode Home */}
      <div class="flex-1 min-h-0 w-full max-w-[1140px] mx-auto rounded-xl border border-zinc-800/80 bg-zinc-900/35 flex flex-col md:grid md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)] gap-4 md:gap-6 p-3 sm:p-5 md:p-6 shadow-2xl justify-between">
        
        {/* Barra de Projetos para Mobile (< md) */}
        <div class="flex md:hidden items-center justify-between pb-2.5 border-b border-zinc-800/60 shrink-0">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-zinc-300">Projetos</span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700/50">
              {props.workspaces.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setModalNovoWs(true)}
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 transition-colors cursor-pointer shadow-xs"
          >
            <FolderPlus size={13} class="text-zinc-400" />
            <span>Adicionar projeto</span>
          </button>
        </div>

        {/* Lista Horizontal de Empresas em Mobile (quando houver) */}
        <Show when={props.workspaces.length > 0}>
          <div class="flex md:hidden gap-1.5 overflow-x-auto py-1 scrollbar-none shrink-0">
            <For each={props.workspaces}>
              {(w) => (
                <button
                  type="button"
                  onClick={() => selecionarWorkspace(w.id)}
                  class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800/80 border border-zinc-700/60 text-xs text-zinc-300 shrink-0 active:scale-95"
                >
                  <Building2 size={12} class="text-zinc-400" />
                  <span>{w.id}</span>
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* Painel Esquerdo Desktop (visível a partir de md: 768px) */}
        <aside class="hidden md:flex flex-col justify-between py-1 border-r border-zinc-800/50 pr-4 lg:pr-6 shrink-0">
          <div class="space-y-3">
            {/* Header: Projetos / Empresas */}
            <div class="flex items-center justify-between pl-1">
              <span class="text-xs font-semibold text-zinc-400 tracking-wide">
                Projetos
              </span>
              <button
                type="button"
                onClick={() => setModalNovoWs(true)}
                class="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer"
                title="Adicionar projeto"
              >
                <FolderPlus size={14} />
              </button>
            </div>

            {/* Ação Adicionar Projeto */}
            <button
              type="button"
              onClick={() => setModalNovoWs(true)}
              class="w-full flex items-center justify-start text-left gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80 transition-all cursor-pointer"
            >
              <FolderPlus size={14} class="text-zinc-500 shrink-0" />
              <span>Adicionar projeto</span>
            </button>

            {/* Lista de Empresas Existentes */}
            <Show when={props.workspaces.length > 0}>
              <div class="pt-2 space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                <div class="px-2 pb-1 text-[10px] font-semibold tracking-wider uppercase text-zinc-500">
                  Empresas cadastradas
                </div>
                <For each={props.workspaces}>
                  {(w) => (
                    <button
                      type="button"
                      onClick={() => selecionarWorkspace(w.id)}
                      class="w-full flex items-center justify-start text-left gap-2 px-2.5 py-1.5 rounded-md text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900/90 transition-all cursor-pointer truncate group"
                    >
                      <div class="w-4 h-4 rounded bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-[9px] font-bold text-zinc-300 group-hover:border-zinc-500 shrink-0">
                        {w.id.slice(0, 1).toUpperCase()}
                      </div>
                      <span class="truncate flex-1 text-left">{w.id}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>

          {/* Navegação Inferior Desktop */}
          <div class="pt-4 border-t border-zinc-800/40 space-y-0.5">
            <button
              type="button"
              onClick={() => navigate("/config")}
              class="w-full flex items-center justify-start text-left gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80 transition-all cursor-pointer"
            >
              <Settings size={14} class="text-zinc-500 shrink-0" />
              <span>Configurações</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/docs")}
              class="w-full flex items-center justify-start text-left gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80 transition-all cursor-pointer"
            >
              <BookOpen size={14} class="text-zinc-500 shrink-0" />
              <span>Documentação</span>
            </button>
            <button
              type="button"
              onClick={() => setModalAjuda(true)}
              class="w-full flex items-center justify-start text-left gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80 transition-all cursor-pointer"
            >
              <HelpCircle size={14} class="text-zinc-500 shrink-0" />
              <span>Ajuda</span>
            </button>
          </div>
        </aside>

        {/* Painel Central / Principal: Busca e Estado Vazio */}
        <section class="flex-1 flex flex-col min-h-0 relative justify-between">
          {/* Campo de Busca Superior */}
          <div class="w-full max-w-xl mx-auto pt-0.5 pb-2 sm:pb-4 relative z-10 shrink-0">
            <div class="relative flex items-center bg-zinc-900/90 border border-zinc-800/80 rounded-lg px-3 py-1.5 sm:py-2 text-sm shadow-xs focus-within:border-zinc-600 focus-within:ring-1 focus-within:ring-zinc-600">
              <Search size={14} class="text-zinc-500 mr-2.5 shrink-0" />
              <input
                type="text"
                value={busca()}
                onInput={(e) => setBusca(e.currentTarget.value)}
                placeholder="Buscar sessões, tarefas ou documentação..."
                class="w-full bg-transparent text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
              />
              <Show when={busca()}>
                <button
                  type="button"
                  onClick={() => setBusca("")}
                  class="p-0.5 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </Show>
            </div>

            {/* Menu Popover com Resultados da Busca */}
            <Show when={resultadosBusca().length > 0}>
              <div class="absolute top-full left-0 right-0 mt-1.5 bg-zinc-900/95 border border-zinc-800 rounded-lg shadow-xl p-1.5 z-30 max-h-56 overflow-y-auto space-y-1">
                <For each={resultadosBusca()}>
                  {(item) => {
                    const Icone = item.icone;
                    return (
                      <div
                        onClick={() => {
                          if (item.wsId) {
                            selecionarWorkspace(item.wsId);
                          } else if (item.link) {
                            navigate(item.link);
                          }
                          setBusca("");
                        }}
                        class="flex items-center gap-2.5 px-3 py-1.5 rounded-md hover:bg-zinc-800/90 cursor-pointer transition-colors"
                      >
                        <Icone size={14} class="text-zinc-400 shrink-0" />
                        <div class="flex-1 min-w-0">
                          <div class="text-xs font-medium text-zinc-100 truncate">
                            {item.titulo}
                          </div>
                          <div class="text-[11px] text-zinc-500 truncate">
                            {item.subtitulo}
                          </div>
                        </div>
                        <ArrowRight size={12} class="text-zinc-600 shrink-0" />
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>

          {/* Área Central: "Nada por aqui ainda" (Cópia Fiel do OpenCode) */}
          <div class="flex-1 flex flex-col items-center justify-center text-center px-2 py-2 sm:py-4">
            <div class="space-y-1">
              <h2 class="text-sm sm:text-base font-semibold text-zinc-200 tracking-tight">
                Nada por aqui ainda
              </h2>
              <p class="text-xs text-zinc-500 max-w-sm px-2">
                Crie uma sessão para começar ou adicione uma empresa autônoma.
              </p>
            </div>

            <div class="mt-3">
              <button
                type="button"
                onClick={() => setModalNovoWs(true)}
                class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium border border-zinc-700/80 transition-all cursor-pointer shadow-xs active:scale-95"
              >
                <Plus size={13} />
                <span>Adicionar projeto / empresa</span>
              </button>
            </div>

            {/* Cartões de Acesso Rápido para OpenCorp */}
            <div class="mt-4 sm:mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5 max-w-2xl w-full text-left">
              {/* Card Documentação */}
              <div
                onClick={() => navigate("/docs")}
                class="p-2.5 sm:p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all cursor-pointer group flex flex-row sm:flex-col items-center sm:items-start justify-between gap-2.5"
              >
                <div class="flex items-center sm:block gap-2.5 min-w-0 flex-1">
                  <div class="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 sm:mb-2">
                    <BookOpen size={13} />
                  </div>
                  <div class="min-w-0 flex-1">
                    <h3 class="text-xs font-medium text-zinc-200 group-hover:text-zinc-100 truncate">
                      Documentação
                    </h3>
                    <p class="text-[10.5px] text-zinc-500 line-clamp-1 mt-0.5 leading-snug">
                      Arquitetura de SO, 18 agentes e blueprint.
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-1 text-[11px] text-blue-400 font-medium shrink-0 sm:mt-2">
                  <span class="hidden sm:inline text-[10px]">Ver guias</span>
                  <ArrowRight size={11} />
                </div>
              </div>

              {/* Card Configurações */}
              <div
                onClick={() => navigate("/config?tab=modelos")}
                class="p-2.5 sm:p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all cursor-pointer group flex flex-row sm:flex-col items-center sm:items-start justify-between gap-2.5"
              >
                <div class="flex items-center sm:block gap-2.5 min-w-0 flex-1">
                  <div class="w-6 h-6 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 sm:mb-2">
                    <Settings size={13} />
                  </div>
                  <div class="min-w-0 flex-1">
                    <h3 class="text-xs font-medium text-zinc-200 group-hover:text-zinc-100 truncate">
                      Configurações
                    </h3>
                    <p class="text-[10.5px] text-zinc-500 line-clamp-1 mt-0.5 leading-snug">
                      Chaves de API, modelos e rotação.
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-1 text-[11px] text-amber-400 font-medium shrink-0 sm:mt-2">
                  <span class="hidden sm:inline text-[10px]">Ajustar IA</span>
                  <ArrowRight size={11} />
                </div>
              </div>

              {/* Card Secretário Executivo */}
              <div
                onClick={() => navigate("/docs?doc=04-agentes")}
                class="p-2.5 sm:p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all cursor-pointer group flex flex-row sm:flex-col items-center sm:items-start justify-between gap-2.5"
              >
                <div class="flex items-center sm:block gap-2.5 min-w-0 flex-1">
                  <div class="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 sm:mb-2">
                    <Bot size={13} />
                  </div>
                  <div class="min-w-0 flex-1">
                    <h3 class="text-xs font-medium text-zinc-200 group-hover:text-zinc-100 truncate">
                      Secretário Executivo
                    </h3>
                    <p class="text-[10.5px] text-zinc-500 line-clamp-1 mt-0.5 leading-snug">
                      Orquestração central e governança.
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-1 text-[11px] text-emerald-400 font-medium shrink-0 sm:mt-2">
                  <span class="hidden sm:inline text-[10px]">Saiba mais</span>
                  <ArrowRight size={11} />
                </div>
              </div>
            </div>
          </div>

          {/* Navegação Inferior Mobile (< md) — Estilo HomeUtilityNav do OpenCode */}
          <nav class="flex md:hidden items-center justify-around pt-2.5 mt-3 border-t border-zinc-800/60 shrink-0">
            <button
              type="button"
              onClick={() => navigate("/config")}
              class="flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors cursor-pointer active:scale-95"
            >
              <Settings size={15} />
              <span class="text-[10px] font-medium">Configurações</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/docs")}
              class="flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors cursor-pointer active:scale-95"
            >
              <BookOpen size={15} />
              <span class="text-[10px] font-medium">Documentação</span>
            </button>
            <button
              type="button"
              onClick={() => setModalAjuda(true)}
              class="flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors cursor-pointer active:scale-95"
            >
              <HelpCircle size={15} />
              <span class="text-[10px] font-medium">Ajuda</span>
            </button>
          </nav>
        </section>
      </div>

      {/* Modal de Novo Workspace */}
      <NovoWorkspaceModal
        open={modalNovoWs()}
        onClose={() => setModalNovoWs(false)}
      />

      {/* Modal Rápido de Ajuda */}
      <Show when={modalAjuda()}>
        <div class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div class="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div class="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <Sparkles size={16} class="text-emerald-400" />
                <span>Primeiros Passos no OpenCorp</span>
              </div>
              <button
                type="button"
                onClick={() => setModalAjuda(false)}
                class="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            <div class="text-xs text-zinc-300 space-y-2.5 leading-relaxed">
              <p>
                <strong>1. Crie uma Empresa:</strong> Clique em "Adicionar projeto" para criar um workspace do zero ou importar um pacote <code>.corp</code>.
              </p>
              <p>
                <strong>2. Configure seus Modelos:</strong> Acesse <em>Configurações ➔ Modelos</em> para definir a ordem de rotação (priorizando modelos <code>:free</code>).
              </p>
              <p>
                <strong>3. Interaja com Agentes:</strong> Use o Secretário Executivo ou delegue tarefas no quadro Kanban e acompanhe a execução autônoma.
              </p>
            </div>
            <div class="flex justify-end pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setModalAjuda(false);
                  navigate("/docs");
                }}
                class="px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 font-medium cursor-pointer"
              >
                Abrir Documentação Completa
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
