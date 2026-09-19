import {
  type Component,
  Show,
  type Accessor,
} from "solid-js";
import {
  GitBranch,
  Play,
  Trash2,
  Plus,
  ArrowLeft,
  Download,
  History,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Bot,
  Sliders,
} from "lucide-solid";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import { type FluxoCompleto } from "./types";

export interface WorkflowHeaderProps {
  fluxo: Accessor<FluxoCompleto | null>;
  zoom: Accessor<number>;
  setZoom: (fn: (z: number) => number) => void;
  onResetView: () => void;
  modoExibicao: Accessor<"canvas" | "split" | "chat">;
  setModoExibicao: (modo: "canvas" | "split" | "chat") => void;
  logsCount: Accessor<number>;
  onToggleLogs: () => void;
  onVoltar: () => void;
  onAdicionarNode: () => void;
  onSalvarAlteracoes: (f: FluxoCompleto) => Promise<void>;
  onExportar: () => void;
  onAbrirExecutar: () => void;
  onExcluir: (e: MouseEvent) => void;
}

export const WorkflowHeader: Component<WorkflowHeaderProps> = (props) => {
  return (
    <div class="min-h-14 h-auto py-1 border-b border-zinc-800 bg-zinc-900/90 px-3 sm:px-4 flex flex-wrap items-center justify-between gap-2 sm:gap-4 z-20 shrink-0">
      <div class="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          id="btn-voltar-fluxos"
          class="flex items-center gap-1.5 text-xs text-zinc-200 hover:text-white cursor-pointer px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors shrink-0 shadow-xs"
          onClick={props.onVoltar}
          title="Voltar para lista de Fluxos"
        >
          <ArrowLeft size={14} class="text-orange-400" />
          <span class="font-medium">Voltar para Fluxos</span>
        </button>

        <div class="h-4 w-px bg-zinc-800 shrink-0" />

        <div class="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <div class="h-7 w-7 rounded-lg bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-400 shrink-0">
            <GitBranch size={15} />
          </div>
          <button
            type="button"
            onClick={props.onVoltar}
            class="font-bold text-xs text-zinc-100 hover:text-orange-400 transition-colors truncate max-w-[120px] sm:max-w-[200px] md:max-w-[320px] text-left cursor-pointer"
            title="Clique para voltar aos Fluxos"
          >
            {props.fluxo()?.nome || props.fluxo()?.id}
          </button>
        </div>
      </div>

      <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <Button
          size="sm"
          variant="secondary"
          class="border-zinc-800 hover:border-orange-500/50 text-zinc-200 text-xs font-semibold px-2 sm:px-3 cursor-pointer"
          onClick={props.onAdicionarNode}
        >
          <Plus size={14} class="text-orange-400" />
          <span class="hidden sm:inline ml-1">Adicionar Node</span>
          <span class="sm:hidden ml-1">Node</span>
        </Button>

        <label
          class="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 cursor-pointer"
          title="Interruptor mestre: desativado remove o job e bloqueia execução"
        >
          <input
            type="checkbox"
            data-testid="toggle-ativo-detalhe"
            checked={props.fluxo()?.ativo ?? true}
            onChange={(e) => {
              const f = props.fluxo();
              if (!f) return;
              void props.onSalvarAlteracoes({ ...f, ativo: e.currentTarget.checked });
            }}
            class="accent-emerald-500 h-3.5 w-3.5"
          />
          <span>Ativo</span>
        </label>

        <div class="hidden xl:flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-xs text-zinc-400">
          <IconButton size="xs" variant="ghost" onClick={() => props.setZoom((z) => Math.max(z - 0.15, 0.4))} title="Zoom Out">
            <ZoomOut size={13} />
          </IconButton>
          <span class="px-2 font-mono text-[11px] text-zinc-300">
            {Math.round(props.zoom() * 100)}%
          </span>
          <IconButton size="xs" variant="ghost" onClick={() => props.setZoom((z) => Math.min(z + 0.15, 2))} title="Zoom In">
            <ZoomIn size={13} />
          </IconButton>
          <IconButton size="xs" variant="ghost" onClick={props.onResetView} title="Resetar Visualização">
            <Maximize2 size={12} />
          </IconButton>
        </div>

        <Button
          size="sm"
          variant="secondary"
          id="btn-header-logs"
          class="border-zinc-800 text-zinc-300 text-xs px-2 sm:px-3 cursor-pointer"
          onClick={props.onToggleLogs}
          title="Histórico de Execuções e Dados I/O"
        >
          <History size={13} class="text-zinc-400" />
          <span class="hidden md:inline ml-1.5">Logs & I/O</span>
          <Show when={props.logsCount() > 0}>
            <span class="ml-1 px-1.5 py-0.5 rounded-full bg-orange-600/30 text-orange-300 text-[9px] font-bold">
              {props.logsCount()}
            </span>
          </Show>
        </Button>

        <div class="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-xs">
          <button
            type="button"
            class={`px-2 sm:px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer ${
              props.modoExibicao() === "chat" ? "bg-zinc-800 text-orange-400 font-bold" : "text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => props.setModoExibicao("chat")}
            title="Foco no Chat do Secretário"
          >
            <Bot size={13} />
            <span class="hidden md:inline">Chat</span>
          </button>
          <button
            type="button"
            class={`px-2 sm:px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer ${
              props.modoExibicao() === "split" ? "bg-zinc-800 text-orange-400 font-bold" : "text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => props.setModoExibicao("split")}
            title="Chat e Canvas Lado a Lado"
          >
            <Sliders size={13} />
            <span class="hidden md:inline">Lado a Lado</span>
          </button>
          <button
            type="button"
            class={`px-2 sm:px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer ${
              props.modoExibicao() === "canvas" ? "bg-zinc-800 text-orange-400 font-bold" : "text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => props.setModoExibicao("canvas")}
            title="Foco no Canvas de Nós"
          >
            <Maximize2 size={13} />
            <span class="hidden md:inline">Canvas</span>
          </button>
        </div>

        <Button
          size="sm"
          variant="secondary"
          class="border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs px-2 sm:px-2.5 cursor-pointer"
          onClick={props.onExportar}
        >
          <Download size={13} class="text-zinc-400" />
          <span class="hidden lg:inline ml-1.5">Exportar</span>
        </Button>

        <Button
          size="sm"
          variant="primary"
          class="bg-orange-600 hover:bg-orange-500 text-white font-bold px-2 sm:px-3 cursor-pointer"
          onClick={props.onAbrirExecutar}
        >
          <Play size={13} class="fill-current" />
          <span class="hidden sm:inline ml-1.5">Executar</span>
        </Button>

        <IconButton
          size="sm"
          variant="ghost"
          class="text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 shrink-0 cursor-pointer"
          onClick={props.onExcluir}
          title="Excluir este fluxo"
        >
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  );
};
