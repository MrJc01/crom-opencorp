import { type Component, createSignal } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { ArrowLeft } from "lucide-solid";
import { NovoWorkspaceModal } from "./NovoWorkspaceModal";

export const GlobalTitlebar: Component = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [modalNovoWs, setModalNovoWs] = createSignal(false);

  const isHome = () => location.pathname === "/" || location.pathname === "/home";

  const getSubtitulo = () => {
    if (location.pathname.startsWith("/docs")) return "opencorp / documentação";
    if (location.pathname.startsWith("/config")) return "opencorp / configurações";
    return "opencorp · ambiente inicial";
  };

  return (
    <header class="h-9 px-3 flex items-center justify-between border-b border-zinc-900/80 bg-zinc-950 text-zinc-300 shrink-0 select-none z-30">
      {/* Botões Utilitários Top-Left estilo OpenCode (Grid + Plus) */}
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => navigate("/home")}
          class="h-7 w-7 rounded-md flex items-center justify-center text-zinc-300 bg-zinc-800/90 border border-zinc-700/60 hover:text-zinc-100 hover:bg-zinc-700/80 transition-colors cursor-pointer shadow-xs active:scale-95 shrink-0"
          title="OpenCorp - Início / Workspaces"
        >
          {/* Ícone Grid 2x2 Fiel ao OpenCode */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
            <rect width="7" height="7" x="3" y="3" rx="1.5" />
            <rect width="7" height="7" x="14" y="3" rx="1.5" />
            <rect width="7" height="7" x="14" y="14" rx="1.5" />
            <rect width="7" height="7" x="3" y="14" rx="1.5" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => setModalNovoWs(true)}
          class="h-7 w-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors cursor-pointer active:scale-95 shrink-0"
          title="Adicionar projeto / empresa"
        >
          {/* Ícone Plus Fiel ao OpenCode */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
        </button>

        {!isHome() && (
          <button
            type="button"
            onClick={() => navigate("/home")}
            class="ml-2 flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors cursor-pointer"
          >
            <ArrowLeft size={12} />
            <span>Início</span>
          </button>
        )}
      </div>

      {/* Rótulo Central / Direita */}
      <div class="flex items-center gap-2 sm:gap-3">
        <span class="hidden sm:inline text-[11px] font-mono text-zinc-500 truncate max-w-[200px]">
          {getSubtitulo()}
        </span>
        <span class="sm:hidden text-[11px] font-mono text-zinc-400 font-medium">
          opencorp
        </span>
        <span class="text-[9px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800/80 shrink-0">
          v0.7.0
        </span>
      </div>

      <NovoWorkspaceModal
        open={modalNovoWs()}
        onClose={() => setModalNovoWs(false)}
      />
    </header>
  );
};
