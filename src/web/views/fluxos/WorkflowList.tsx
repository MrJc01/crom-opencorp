import {
  type Component,
  createSignal,
  createMemo,
  For,
  Show,
  type Accessor,
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import {
  GitBranch,
  Play,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  Calendar,
  Check,
  Search,
  Download,
  Upload,
  Webhook,
  Copy,
} from "lucide-solid";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { type FluxoCompleto } from "./types";

export interface WorkflowListProps {
  fluxos: Accessor<FluxoCompleto[]>;
  jobsAgenda: Accessor<any[]>;
  statusFluxos: Accessor<Record<string, { status: string; execId: string }>>;
  copiadoId: Accessor<string | null>;
  onAbrirEditor: (id: string) => void;
  onCarregarFluxos: () => void;
  onExcluirFluxo: (id: string, nome?: string, e?: MouseEvent) => void;
  onCopiarJson: (f: any, e: MouseEvent) => void;
  onExportarJson: (f: any, e: MouseEvent) => void;
  onImportarArquivo: (e: Event) => void;
  onSalvarAlteracoes: (f: FluxoCompleto) => Promise<void>;
  onAbrirModalNovo: () => void;
}

export const WorkflowList: Component<WorkflowListProps> = (props) => {
  const navigate = useNavigate();
  let inputImportarRef: HTMLInputElement | undefined;

  const [buscaTexto, setBuscaTexto] = createSignal("");
  const [filtroTipo, setFiltroTipo] = createSignal<"todos" | "cron" | "webhook" | "manual">("todos");

  const fluxosFiltrados = createMemo(() => {
    const termo = buscaTexto().toLowerCase().trim();
    const tipo = filtroTipo();

    return props.fluxos().filter((f) => {
      const matchBusca =
        !termo ||
        f.id.toLowerCase().includes(termo) ||
        (f.nome && f.nome.toLowerCase().includes(termo)) ||
        (f.descricao && f.descricao.toLowerCase().includes(termo));

      if (!matchBusca) return false;

      if (tipo === "cron") {
        if (Array.isArray(f.gatilhos)) return f.gatilhos.some((g: any) => g.tipo === "cron");
        if (Array.isArray(f.nos)) return f.nos.some((n: any) => n.tipo === "cron");
        return f.gatilho === "cron";
      }

      if (tipo === "webhook") {
        if (Array.isArray(f.gatilhos)) return f.gatilhos.some((g: any) => g.tipo === "webhook");
        if (Array.isArray(f.nos)) return f.nos.some((n: any) => n.tipo === "webhook");
        return f.gatilho === "webhook";
      }

      if (tipo === "manual") {
        if (Array.isArray(f.gatilhos)) return f.gatilhos.some((g: any) => g.tipo === "manual");
        if (Array.isArray(f.nos)) return f.nos.some((n: any) => n.tipo === "manual");
        return !f.gatilho || f.gatilho === "manual";
      }

      return true;
    });
  });

  const fluxosAgendados = createMemo(() =>
    props.fluxos().filter((f) => {
      if (Array.isArray(f.gatilhos)) return f.gatilhos.some((g: any) => g.tipo === "cron");
      if (Array.isArray(f.nos)) return f.nos.some((n: any) => n.tipo === "cron");
      return f.gatilho === "cron";
    })
  );

  const cronResumo = (f: any): string => {
    if (Array.isArray(f.gatilhos)) {
      const g = f.gatilhos.find((x: any) => x.tipo === "cron");
      if (g?.detalhe) return g.detalhe;
    }
    if (Array.isArray(f.nos)) {
      const n = f.nos.find((x: any) => x.tipo === "cron");
      if (n?.config?.expressao_cron) return n.config.expressao_cron;
    }
    return "0 8 * * *";
  };

  return (
    <div class="flex flex-col h-full overflow-hidden p-6 space-y-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div class="space-y-1">
          <div class="flex items-center gap-2.5">
            <div class="h-9 w-9 rounded-xl bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
              <GitBranch size={18} />
            </div>
            <div>
              <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Fluxos</h1>
              <span class="text-xs text-zinc-400">
                Gerencie, orquestre e execute pipelines automatizados em grafo
              </span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <input
            ref={inputImportarRef}
            type="file"
            accept=".json,application/json"
            class="hidden"
            onChange={props.onImportarArquivo}
          />
          <Button size="sm" variant="ghost" onClick={props.onCarregarFluxos} title="Atualizar">
            <RefreshCw size={13} />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            class="border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 text-xs font-semibold cursor-pointer"
            onClick={() => inputImportarRef?.click()}
            title="Importar Fluxo de arquivo JSON"
          >
            <Upload size={14} class="mr-1.5 text-zinc-400" /> Importar JSON
          </Button>
          <Button
            size="sm"
            variant="primary"
            class="bg-orange-600 hover:bg-orange-500 text-white font-bold cursor-pointer"
            onClick={props.onAbrirModalNovo}
          >
            <Plus size={14} class="mr-1.5" /> Adicionar Fluxo
          </Button>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-2 flex-wrap">
          <div class="relative w-64 sm:w-72">
            <Search size={14} class="absolute left-3 top-2.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Pesquisar fluxos..."
              value={buscaTexto()}
              onInput={(e) => setBuscaTexto(e.currentTarget.value)}
              class="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-orange-500 font-sans"
            />
          </div>

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFiltroTipo("todos")}
              class={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                filtroTipo() === "todos"
                  ? "bg-zinc-700 text-white shadow-xs"
                  : "bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFiltroTipo("cron")}
              class={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                filtroTipo() === "cron"
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-xs"
                  : "bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              }`}
            >
              <Calendar size={12} class="text-sky-400" />
              Agendados (Cron)
            </button>
            <button
              type="button"
              onClick={() => setFiltroTipo("webhook")}
              class={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                filtroTipo() === "webhook"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs"
                  : "bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              }`}
            >
              <Webhook size={12} class="text-amber-400" />
              Webhooks
            </button>
            <button
              type="button"
              onClick={() => setFiltroTipo("manual")}
              class={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                filtroTipo() === "manual"
                  ? "bg-zinc-600/30 text-zinc-200 border border-zinc-600/40 shadow-xs"
                  : "bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              }`}
            >
              <Play size={12} class="text-zinc-400" />
              Manuais
            </button>
          </div>
        </div>

        <div class="text-xs text-zinc-500 font-mono">
          {fluxosFiltrados().length} de {props.fluxos().length} fluxo(s)
        </div>
      </div>

      <Show when={filtroTipo() === "cron"}>
        <section data-testid="lista-jobs" class="rounded-xl bg-zinc-900/70 border border-zinc-800/80 p-4 space-y-2">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-zinc-100">Jobs do scheduler</h2>
            <span class="text-[11px] font-mono text-zinc-500">{props.jobsAgenda().length} job(s)</span>
          </div>
          <Show
            when={props.jobsAgenda().length > 0}
            fallback={<p class="text-xs text-zinc-500">Nenhum job ativo no scheduler.</p>}
          >
            <ul class="space-y-1">
              <For each={props.jobsAgenda().slice(0, 20)}>
                {(j: any) => (
                  <li class="flex items-center justify-between gap-2 text-xs text-zinc-300 font-mono">
                    <span class="truncate">{j.nome || j.id}</span>
                    <span class="text-[10px] text-zinc-500 flex-shrink-0">
                      {j.agenda_tipo || j.agenda?.tipo || ""} {j.agenda_valor || j.agenda?.valor || ""}
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
        <div data-testid="secao-fluxos-agendados" class="flex items-center justify-between pt-1">
          <h2 class="text-sm font-bold text-zinc-100">Fluxos agendados</h2>
          <span class="text-[11px] font-mono text-zinc-500">{fluxosAgendados().length} fluxo(s) com gatilho cron</span>
        </div>
      </Show>

      <div class="flex-1 overflow-y-auto min-h-0 space-y-2.5 pr-1 scrollbar-thin">
        <For
          each={fluxosFiltrados()}
          fallback={
            <div class="py-16 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
              Nenhum fluxo encontrado.
            </div>
          }
        >
          {(f) => (
            <div
              class="group p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80 hover:border-orange-500/50 hover:bg-zinc-900 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer shadow-xs"
              onClick={() => props.onAbrirEditor(f.id)}
            >
              <div class="flex items-start gap-3.5 min-w-0">
                <div class="h-10 w-10 rounded-xl bg-zinc-950 border border-zinc-800 group-hover:border-orange-500/40 flex items-center justify-center text-orange-400 flex-shrink-0 transition-colors">
                  <GitBranch size={18} />
                </div>

                <div class="min-w-0 space-y-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h2 class="text-sm font-bold text-zinc-100 group-hover:text-orange-400 transition-colors truncate">
                      {f.nome || f.id}
                    </h2>
                    <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">
                      id: {f.id}
                    </span>
                    <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/50 text-emerald-400">
                      {f.nos ?? (Array.isArray(f.nos) ? f.nos.length : 0)} nodes
                    </span>
                    <Show when={props.statusFluxos()[f.id]}>
                      {(st) => (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/historico?run=${encodeURIComponent(st().execId)}`);
                          }}
                          title={`Última execução: ${st().status} — ver no Histórico`}
                          class={`text-[10px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-1 cursor-pointer ${
                            st().status === "executando"
                              ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 animate-pulse"
                              : st().status === "concluido"
                              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                              : st().status === "falhou"
                              ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
                              : "bg-zinc-800 text-zinc-400 border-zinc-700"
                          }`}
                        >
                          {st().status === "executando" ? "● executando" : st().status}
                        </button>
                      )}
                    </Show>
                  </div>

                  <p class="text-xs text-zinc-400 line-clamp-1">
                    {f.descricao || "Pipeline autônomo com nós de agentes, scripts do workspace e governança."}
                  </p>

                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                    <label class="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer" title="Desativado: remove o job do scheduler e bloqueia execução manual">
                      <input
                        type="checkbox"
                        data-testid={`toggle-ativo-${f.id}`}
                        checked={f.ativo ?? true}
                        onChange={(e) => {
                          const p = { ...f, ativo: e.currentTarget.checked };
                          if (typeof p.nos === "number") delete p.nos;
                          if (typeof p.arestas === "number") delete p.arestas;
                          void props.onSalvarAlteracoes(p);
                        }}
                        class="accent-emerald-500 h-3.5 w-3.5"
                      />
                      <span>Ativo</span>
                    </label>

                    <label class="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer" title="Cria job no scheduler se houver gatilho cron (PUT /flows/:id)">
                      <input
                        type="checkbox"
                        data-testid={`toggle-auto-${f.id}`}
                        checked={f.auto_agendar ?? false}
                        onChange={(e) => {
                          const p = { ...f, auto_agendar: e.currentTarget.checked };
                          if (typeof p.nos === "number") delete p.nos;
                          if (typeof p.arestas === "number") delete p.arestas;
                          void props.onSalvarAlteracoes(p);
                        }}
                        class="accent-orange-500 h-3.5 w-3.5"
                      />
                      <span>Auto-agendar</span>
                    </label>

                    <span class="text-[11px] text-zinc-500 font-mono">
                      cron: {cronResumo(f)}
                    </span>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="xs"
                  variant="secondary"
                  class="border-zinc-800 hover:border-zinc-700 text-zinc-300 text-[11px] cursor-pointer"
                  onClick={(e) => props.onCopiarJson(f, e)}
                  title="Copiar Fluxo JSON"
                >
                  <Show when={props.copiadoId() === f.id} fallback={<><Copy size={12} class="mr-1.5 text-zinc-400" /> Copiar JSON</>}>
                    <><Check size={12} class="mr-1.5 text-emerald-400" /> Copiado!</>
                  </Show>
                </Button>

                <Button
                  size="xs"
                  variant="secondary"
                  class="border-zinc-800 hover:border-zinc-700 text-zinc-300 text-[11px] cursor-pointer"
                  onClick={(e) => props.onExportarJson(f, e)}
                >
                  <Download size={12} class="mr-1.5 text-zinc-400" /> Exportar
                </Button>

                <Button
                  size="xs"
                  variant="primary"
                  data-testid={`abrir-editor-${f.id}`}
                  class="bg-orange-600 hover:bg-orange-500 text-white font-bold text-[11px] cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onAbrirEditor(f.id);
                  }}
                >
                  <Eye size={12} class="mr-1.5" /> Abrir Canvas
                </Button>

                <IconButton
                  size="xs"
                  variant="ghost"
                  class="text-zinc-500 hover:text-rose-400 cursor-pointer"
                  onClick={(e) => props.onExcluirFluxo(f.id, f.nome, e)}
                  title="Excluir fluxo"
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
