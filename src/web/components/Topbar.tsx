import { type Component, createSignal, onMount, Show, For } from "solid-js";
import { useLocation, A } from "@solidjs/router";
import {
  Radio,
  Server,
  FolderGit2,
  Cpu,
  Clock,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Activity,
  Layers,
  Sparkles,
} from "lucide-solid";
import { sseConnected, wsAtivo, workspaces, fetchApi } from "../lib/context";

interface StatusInfo {
  scheduler?: boolean;
  secretario?: boolean;
  versao?: string;
}

export const Topbar: Component = () => {
  const location = useLocation();
  const [hoverCard, setHoverCard] = createSignal(false);
  const [statusInfo, setStatusInfo] = createSignal<StatusInfo>({ versao: "0.7.0" });
  let timerHover: number | undefined;

  const getBreadcrumb = () => {
    const p = location.pathname.replace(/^\//, "") || "home";
    const mapa: Record<string, string> = {
      home: "Início",
      secretario: "Secretário Executivo",
      workspace: "Workspace & Código",
      tasks: "Quadro de Tarefas (Kanban)",
      agentes: "Catálogo de Agentes",
      reunioes: "Reuniões Multi-Agente",
      agenda: "Rotinas & Agendamentos",
      fluxos: "Fluxos de Trabalho",
      hooks: "Webhooks & Gatilhos",
      apps: "Apps & Segredos",
      historico: "Linha do Tempo de Execuções",
      notificacoes: "Central de Notificações",
      config: "Configurações do Sistema",
      docs: "Documentação",
    };
    return mapa[p] || p;
  };

  const carregarStatus = async () => {
    try {
      const [st, hl] = await Promise.all([
        fetchApi<{ scheduler: boolean; secretario: boolean }>("/status").catch(() => null),
        fetchApi<{ ok: boolean; versao: string }>("/health").catch(() => null),
      ]);
      setStatusInfo({
        scheduler: st?.scheduler,
        secretario: st?.secretario,
        versao: hl?.versao || "0.7.0",
      });
    } catch {}
  };

  const onMouseEnterBadge = () => {
    clearTimeout(timerHover);
    setHoverCard(true);
    void carregarStatus();
  };

  const onMouseLeaveBadge = () => {
    timerHover = window.setTimeout(() => {
      setHoverCard(false);
    }, 250);
  };

  const workspaceAtual = () => {
    const id = wsAtivo();
    const ws = workspaces().find((w) => w.id === id);
    return ws || { id: id || "padrão", path: "Pasta atual do servidor" };
  };

  return (
    <header class="h-14 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md px-6 flex items-center justify-between flex-shrink-0 z-30 select-none">
      {/* Breadcrumb */}
      <div class="flex items-center gap-2 text-xs">
        <span class="text-zinc-500 font-medium">opencorp</span>
        <span class="text-zinc-600">/</span>
        <span class="text-zinc-200 font-semibold">{getBreadcrumb()}</span>
      </div>

      {/* Ações e Controles à Direita */}
      <div class="flex items-center gap-3">
        {/* Indicador de Conexão SSE com Card Popover no Hover */}
        <div
          class="relative"
          onMouseEnter={onMouseEnterBadge}
          onMouseLeave={onMouseLeaveBadge}
        >
          <div
            class={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
              sseConnected()
                ? "bg-emerald-950/30 border-emerald-800/50 text-emerald-300 hover:border-emerald-600/80"
                : "bg-zinc-900/60 border-zinc-800/60 text-zinc-400 hover:border-zinc-700"
            }`}
          >
            <Radio
              size={12}
              class={sseConnected() ? "text-emerald-400 animate-pulse" : "text-zinc-500"}
            />
            <span class="font-medium font-mono">
              {sseConnected() ? "ao vivo" : "offline"}
            </span>
          </div>

          {/* CARD POPOVER INFORMATIVO */}
          <Show when={hoverCard()}>
            <div
              class="absolute right-0 top-full mt-2 w-84 p-4 rounded-xl bg-zinc-950 border border-zinc-800/90 shadow-2xl backdrop-blur-xl z-50 text-xs space-y-3.5 animate-in fade-in duration-150"
              onMouseEnter={() => clearTimeout(timerHover)}
              onMouseLeave={onMouseLeaveBadge}
            >
              {/* Topo do Card */}
              <div class="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
                <div class="flex items-center gap-2">
                  <div class="h-6 w-6 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Activity size={13} />
                  </div>
                  <div>
                    <h3 class="font-bold text-zinc-100 text-xs">OpenCorp Core</h3>
                    <span class="text-[10px] text-zinc-500 font-mono">Daemon & Runtime</span>
                  </div>
                </div>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-emerald-400 border border-zinc-800 font-bold">
                  v{statusInfo().versao || "0.7.0"}
                </span>
              </div>

              {/* Informações do Workspace Ativo */}
              <div class="p-2.5 rounded-lg bg-zinc-900/50 border border-zinc-800/70 space-y-1.5">
                <div class="flex items-center justify-between text-[11px]">
                  <div class="flex items-center gap-1.5 font-semibold text-zinc-300">
                    <FolderGit2 size={13} class="text-purple-400" />
                    <span>Workspace Ativo</span>
                  </div>
                  <span class="text-[10px] font-mono text-zinc-500">
                    {workspaces().length} cadastrado{workspaces().length === 1 ? "" : "s"}
                  </span>
                </div>
                <div class="text-xs font-bold text-zinc-100 font-mono truncate">
                  {workspaceAtual().id}
                </div>
                <div
                  class="text-[10px] text-zinc-400 font-mono truncate bg-zinc-950 px-2 py-1 rounded border border-zinc-850 select-all"
                  title={workspaceAtual().path}
                >
                  {workspaceAtual().path}
                </div>
              </div>

              {/* Status dos Serviços do Sistema */}
              <div class="space-y-1.5">
                <div class="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">
                  Serviços & Conexão
                </div>

                <div class="grid grid-cols-2 gap-2 text-[11px]">
                  {/* SSE Stream */}
                  <div class="p-2 rounded-lg bg-zinc-900/40 border border-zinc-800/60 flex items-center justify-between">
                    <span class="text-zinc-400">Stream SSE</span>
                    <Show
                      when={sseConnected()}
                      fallback={<span class="text-rose-400 font-medium font-mono text-[10px]">offline</span>}
                    >
                      <span class="text-emerald-400 font-medium font-mono text-[10px] flex items-center gap-1">
                        <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> conectado
                      </span>
                    </Show>
                  </div>

                  {/* Servidor API */}
                  <div class="p-2 rounded-lg bg-zinc-900/40 border border-zinc-800/60 flex items-center justify-between">
                    <span class="text-zinc-400">API Server</span>
                    <span class="text-emerald-400 font-medium font-mono text-[10px]">online</span>
                  </div>

                  {/* Scheduler 24h */}
                  <div class="p-2 rounded-lg bg-zinc-900/40 border border-zinc-800/60 flex items-center justify-between">
                    <span class="text-zinc-400">Scheduler</span>
                    <Show
                      when={statusInfo().scheduler !== false}
                      fallback={<span class="text-amber-400 font-medium font-mono text-[10px]">inativo</span>}
                    >
                      <span class="text-emerald-400 font-medium font-mono text-[10px]">ativo</span>
                    </Show>
                  </div>

                  {/* Secretário / OpenCode */}
                  <div class="p-2 rounded-lg bg-zinc-900/40 border border-zinc-800/60 flex items-center justify-between">
                    <span class="text-zinc-400">OpenCode</span>
                    <span class="text-emerald-400 font-medium font-mono text-[10px]">pronto</span>
                  </div>
                </div>
              </div>

              {/* Rodapé com Atalhos Rápidos */}
              <div class="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px]">
                <A
                  href="/config"
                  class="text-zinc-400 hover:text-emerald-400 transition-colors flex items-center gap-1"
                >
                  <Cpu size={12} />
                  <span>Configurações</span>
                </A>
                <A
                  href="/docs"
                  class="text-zinc-400 hover:text-emerald-400 transition-colors flex items-center gap-1"
                >
                  <ExternalLink size={12} />
                  <span>Manual & Docs</span>
                </A>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </header>
  );
};
