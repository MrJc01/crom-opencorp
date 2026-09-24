import React, { useState, useEffect, useCallback, type FC } from "react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import {
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  Video,
  Image as ImageIcon,
  Music,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Search,
} from "lucide-react";

export interface NoArvore {
  nome: string;
  caminho: string;
  tipo: "dir" | "arquivo";
  tamanho?: number;
  filhos?: NoArvore[];
}

export interface FileTreeProps {
  arquivoAtivo?: string | null;
  aoSelecionarArquivo: (caminho: string) => void;
}

function formatarBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function obterIconeArquivo(caminho: string) {
  const ext = caminho.split(".").pop()?.toLowerCase();
  if (["mp4", "webm", "mkv", "mov"].includes(ext || "")) {
    return <Video size={14} className="text-rose-400 shrink-0" />;
  }
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext || "")) {
    return <ImageIcon size={14} className="text-emerald-400 shrink-0" />;
  }
  if (["mp3", "wav", "ogg", "m4a"].includes(ext || "")) {
    return <Music size={14} className="text-purple-400 shrink-0" />;
  }
  if (["json", "js", "ts", "tsx", "jsx", "sh", "py"].includes(ext || "")) {
    return <FileCode size={14} className="text-amber-400 shrink-0" />;
  }
  return <FileText size={14} className="text-blue-400 shrink-0" />;
}

export const FileTree: FC<FileTreeProps> = ({
  arquivoAtivo,
  aoSelecionarArquivo,
}) => {
  const { workspaceId } = useOpenCorp();
  const [arvore, setArvore] = useState<NoArvore[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set([".opencorp", ".opencorp/flows"]));
  const [filtro, setFiltro] = useState("");

  const carregarArvore = useCallback(async () => {
    setCarregando(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:4100";
      const wsParam = workspaceId ? `&workspace=${encodeURIComponent(workspaceId)}` : "";
      const resp = await fetch(`${origin}/files/tree?profundidade=6${wsParam}`, {
        headers: workspaceId ? { "x-opencorp-workspace": workspaceId } : {},
      });
      if (resp.ok) {
        const data = (await resp.json()) as { tipo: string; arvore: NoArvore[] };
        const lista = Array.isArray(data.arvore) ? data.arvore : [];
        setArvore(lista);
      } else {
        setArvore([]);
      }
    } catch {
      setArvore([]);
    } finally {
      setCarregando(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void carregarArvore();
  }, [carregarArvore]);

  const alternarPasta = (caminho: string) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(caminho)) {
        next.delete(caminho);
      } else {
        next.add(caminho);
      }
      return next;
    });
  };

  const renderizarNo = (no: NoArvore, nivel = 0) => {
    const isDir = no.tipo === "dir";
    const expandido = expandidos.has(no.caminho);
    const selecionado = arquivoAtivo === no.caminho;

    // Filtro simples
    if (filtro && !isDir && !no.nome.toLowerCase().includes(filtro.toLowerCase())) {
      return null;
    }

    return (
      <div key={no.caminho} className="select-none text-xs">
        <div
          onClick={() => {
            if (isDir) {
              alternarPasta(no.caminho);
            } else {
              aoSelecionarArquivo(no.caminho);
            }
          }}
          style={{ paddingLeft: `${nivel * 12 + 6}px` }}
          className={`flex items-center gap-1.5 py-1 px-2 rounded-lg cursor-pointer transition-colors group ${
            selecionado
              ? "bg-emerald-950/60 text-emerald-200 font-semibold border-l-2 border-emerald-500"
              : "text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900/80"
          }`}
        >
          {isDir ? (
            <>
              <span className="text-zinc-500 group-hover:text-zinc-300">
                {expandido ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
              {expandido ? (
                <FolderOpen size={14} className="text-amber-400 shrink-0" />
              ) : (
                <Folder size={14} className="text-amber-500/80 shrink-0" />
              )}
              <span className="truncate font-medium">{no.nome}</span>
            </>
          ) : (
            <>
              <span className="w-3" />
              {obterIconeArquivo(no.caminho)}
              <span className="truncate flex-1">{no.nome}</span>
              {no.tamanho !== undefined && (
                <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                  {formatarBytes(no.tamanho)}
                </span>
              )}
            </>
          )}
        </div>

        {isDir && expandido && no.filhos && (
          <div className="flex flex-col">
            {no.filhos.map((filho) => renderizarNo(filho, nivel + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 border-r border-zinc-850 select-none overflow-hidden">
      {/* Topo do Explorer */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-850 bg-zinc-900/40">
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          Explorer / Arquivos
        </span>

        <button
          type="button"
          onClick={carregarArvore}
          title="Recarregar árvore"
          className="p-1 rounded-md text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Busca de arquivos */}
      <div className="p-2 border-b border-zinc-850/60">
        <div className="relative flex items-center bg-zinc-900/90 border border-zinc-800 rounded-lg px-2 py-1">
          <Search size={12} className="text-zinc-500 mr-1.5 shrink-0" />
          <input
            type="text"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar arquivos..."
            className="w-full bg-transparent text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Árvore de arquivos */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono">
        {carregando && arvore.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-500">Carregando árvore...</div>
        ) : arvore.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-500">Nenhum arquivo encontrado.</div>
        ) : (
          arvore.map((no) => renderizarNo(no, 0))
        )}
      </div>
    </div>
  );
};
