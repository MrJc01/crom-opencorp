import { type Component, For } from "solid-js";
import { useLocation } from "@solidjs/router";
import { Building2, Radio } from "lucide-solid";
import { wsAtivo, setWsAtivo, workspaces, sseConnected } from "../lib/context";

export const Topbar: Component = () => {
  const location = useLocation();

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
    };
    return mapa[p] || p;
  };

  return (
    <header class="h-14 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md px-6 flex items-center justify-between flex-shrink-0 z-10 select-none">
      {/* Breadcrumb */}
      <div class="flex items-center gap-2 text-xs">
        <span class="text-zinc-500 font-medium">opencorp</span>
        <span class="text-zinc-600">/</span>
        <span class="text-zinc-200 font-semibold">{getBreadcrumb()}</span>
      </div>

      {/* Ações e Controles à Direita */}
      <div class="flex items-center gap-3">
        {/* Seletor de Workspace */}
        <div class="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5">
          <Building2 size={13} class="text-emerald-400" />
          <select
            class="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
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
        </div>

        {/* Indicador de Conexão SSE */}
        <div
          class="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60"
          title={sseConnected() ? "Servidor SSE conectado em tempo real" : "Desconectado do stream SSE"}
        >
          <Radio
            size={12}
            class={sseConnected() ? "text-emerald-400 animate-pulse" : "text-zinc-500"}
          />
          <span class={sseConnected() ? "text-zinc-300 font-medium" : "text-zinc-500"}>
            {sseConnected() ? "ao vivo" : "offline"}
          </span>
        </div>
      </div>
    </header>
  );
};
