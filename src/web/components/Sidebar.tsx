import { type Component, createSignal, For, Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import {
  Home,
  MessageSquare,
  FolderCode,
  CheckSquare,
  Bot,
  Users,
  Calendar,
  GitBranch,
  Webhook,
  KeyRound,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  Building2,
  ChevronsUpDown,
  BookOpen,
  Plus,
} from "lucide-solid";
import { wsAtivo, setWsAtivo, workspaces } from "../lib/context";
import { NovoWorkspaceModal } from "./NovoWorkspaceModal";

interface NavItem {
  href: string;
  label: string;
  icone: any;
  badge?: () => number | undefined;
  badgeTag?: string;
}

interface NavGroup {
  titulo: string;
  itens: NavItem[];
}

export const Sidebar: Component = () => {
  const location = useLocation();
  const [colapsado, setColapsado] = createSignal(localStorage.getItem("oc-sidebar-colapsada") === "1");
  const [modalNovoWs, setModalNovoWs] = createSignal(false);

  const toggleColapso = () => {
    const novo = !colapsado();
    setColapsado(novo);
    localStorage.setItem("oc-sidebar-colapsada", novo ? "1" : "0");
  };

  const navGroups: NavGroup[] = [
    {
      titulo: "Operação",
      itens: [
        { href: "/home", label: "Início", icone: Home },
        { href: "/secretario", label: "Secretário", icone: MessageSquare },
        { href: "/workspace", label: "Workspace", icone: FolderCode },
        { href: "/tasks", label: "Tasks", icone: CheckSquare },
        { href: "/agentes", label: "Agentes", icone: Bot },
      ],
    },
    {
      titulo: "Automação",
      itens: [
        { href: "/agenda", label: "Agenda", icone: Calendar },
        { href: "/fluxos", label: "Fluxos", icone: GitBranch, badgeTag: "Alfa" },
        { href: "/hooks", label: "Hooks", icone: Webhook, badgeTag: "Alfa" },
      ],
    },
  ];

  // Itens fixos na base da sidebar (apenas ícones: Apps&Secrets, Histórico, Documentação, Configurações)
  const itensFixosInferiores = [
    { href: "/apps", label: "Apps & Secrets", icone: KeyRound },
    { href: "/historico", label: "Histórico", icone: History },
    { href: "/docs", label: "Documentação", icone: BookOpen },
    { href: "/config", label: "Configurações", icone: Settings },
  ];

  const isAtivo = (href: string) => {
    if (href === "/home") return location.pathname === "/" || location.pathname === "/home";
    return location.pathname.startsWith(href);
  };

  return (
    <aside
      class={`flex flex-col flex-shrink-0 bg-zinc-950 border-r border-zinc-800/80 transition-all duration-200 select-none z-20 h-full ${
        colapsado() ? "w-16" : "w-60"
      }`}
    >
      {/* Cabeçalho do App / Logo */}
      <div class="h-14 flex items-center justify-between px-3 border-b border-zinc-800/80">
        <div class="flex items-center gap-2.5 overflow-hidden">
          <div class="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0 font-mono font-bold text-xs shadow-xs">
            OC
          </div>
          <Show when={!colapsado()}>
            <div class="flex flex-col min-w-0">
              <span class="font-bold tracking-tight text-sm text-zinc-100 truncate">opencorp</span>
              <span class="text-[9px] text-zinc-500 font-mono">v0.7.0</span>
            </div>
          </Show>
        </div>
        <button
          type="button"
          onClick={toggleColapso}
          class="!bg-transparent hover:!bg-zinc-900/80 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 border border-transparent hover:border-zinc-800 transition-all cursor-pointer"
          title={colapsado() ? "Expandir menu" : "Recolher menu"}
        >
          <Show when={colapsado()} fallback={<ChevronLeft size={16} />}>
            <ChevronRight size={16} />
          </Show>
        </button>
      </div>

      {/* Workspace Ativo Selector */}
      <div class="px-3 py-2.5 border-b border-zinc-800/60">
        <Show
          when={!colapsado()}
          fallback={
            <div
              class="h-8 w-full rounded-md bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-center text-zinc-300"
              title={`Workspace: ${wsAtivo()}`}
            >
              <Building2 size={14} />
            </div>
          }
        >
          <div class="flex items-center gap-1.5">
            <div class="relative flex-1 flex items-center bg-zinc-900/80 border border-zinc-800 rounded-lg px-2.5 py-1.5 focus-within:border-zinc-700 min-w-0">
              <Building2 size={13} class="text-emerald-400 flex-shrink-0 mr-2" />
              <select
                class="w-full bg-transparent text-xs font-medium text-zinc-200 focus:outline-none cursor-pointer appearance-none truncate pr-4"
                value={wsAtivo()}
                onChange={(e) => setWsAtivo(e.currentTarget.value)}
              >
                <For each={workspaces()}>
                  {(w) => (
                    <option value={w.id} class="bg-zinc-900 text-zinc-200" selected={w.id === wsAtivo()}>
                      {w.id}
                    </option>
                  )}
                </For>
              </select>
              <ChevronsUpDown size={12} class="text-zinc-500 absolute right-2 pointer-events-none" />
            </div>
            <button
              type="button"
              onClick={() => setModalNovoWs(true)}
              class="!bg-zinc-900/80 hover:!bg-zinc-800 p-1.5 rounded-lg text-zinc-400 hover:text-emerald-400 border border-zinc-800 transition-all cursor-pointer flex-shrink-0"
              title="Novo Workspace ou Conectar Pasta"
            >
              <Plus size={14} />
            </button>
          </div>
        </Show>
      </div>

      <NovoWorkspaceModal open={modalNovoWs()} onClose={() => setModalNovoWs(false)} />

      {/* Lista de Navegação */}
      <nav class="flex-1 overflow-y-auto py-3 px-2.5 space-y-4 scrollbar-thin">
        <For each={navGroups}>
          {(grupo) => (
            <div class="space-y-1">
              <Show when={!colapsado()}>
                <div class="px-2 pb-1 text-[10px] font-semibold tracking-wider uppercase text-zinc-500">
                  {grupo.titulo}
                </div>
              </Show>

              <For each={grupo.itens}>
                {(item) => {
                  const Icone = item.icone;
                  const ativo = () => isAtivo(item.href);

                  return (
                    <A
                      href={item.href}
                      class={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ${
                        ativo()
                          ? "bg-zinc-900 text-zinc-100 font-semibold border border-zinc-800/90 shadow-xs"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
                      } ${colapsado() ? "justify-center px-0" : ""}`}
                      title={colapsado() ? (item.badgeTag ? `${item.label} (${item.badgeTag})` : item.label) : undefined}
                    >
                      <div class="relative flex items-center justify-center">
                        <Icone
                          size={16}
                          class={`flex-shrink-0 ${
                            ativo() ? "text-emerald-400" : "text-zinc-400"
                          }`}
                        />
                        <Show when={colapsado() && item.badgeTag}>
                          <span
                            class="absolute -top-1.5 -right-2 px-0.5 min-w-[11px] h-2.5 rounded-full text-[7px] font-bold font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center leading-none"
                            title={item.badgeTag}
                          >
                            α
                          </span>
                        </Show>
                      </div>

                      <Show when={!colapsado()}>
                        <span class="truncate flex-1">{item.label}</span>
                        <Show when={item.badgeTag}>
                          <span class="px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wider uppercase font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30 leading-none">
                            {item.badgeTag}
                          </span>
                        </Show>
                        <Show when={item.badge && item.badge()! > 0}>
                          <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            {item.badge!()}
                          </span>
                        </Show>
                      </Show>
                    </A>
                  );
                }}
              </For>
            </div>
          )}
        </For>
      </nav>

      {/* Dock Fixo Inferior — Apenas Ícones: Apps&Secrets, Histórico, Docs, Configurações */}
      <div class="border-t border-zinc-800/80 bg-zinc-950/95 p-2 flex-shrink-0">
        <div
          class={
            colapsado()
              ? "grid grid-cols-2 gap-1.5 justify-items-center"
              : "flex items-center justify-between px-1"
          }
        >
          <For each={itensFixosInferiores}>
            {(item) => {
              const Icone = item.icone;
              const ativo = () => isAtivo(item.href);

              return (
                <A
                  href={item.href}
                  class={`relative p-2 rounded-xl transition-all flex items-center justify-center group ${
                    ativo()
                      ? "bg-zinc-900 text-emerald-400 border border-zinc-750 shadow-xs"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/70 border border-transparent hover:border-zinc-800/80"
                  }`}
                  title={item.label}
                >
                  <Icone
                    size={17}
                    class={`transition-colors ${
                      ativo() ? "text-emerald-400" : "text-zinc-400 group-hover:text-zinc-200"
                    }`}
                  />

                  {/* Tooltip flutuante superior no hover */}
                  <div class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-zinc-900 border border-zinc-700/80 text-[11px] text-zinc-200 font-medium rounded-md shadow-2xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                    {item.label}
                  </div>
                </A>
              );
            }}
          </For>
        </div>
      </div>
    </aside>
  );
};
