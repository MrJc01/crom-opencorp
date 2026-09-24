import React, { useState, useEffect, useRef, useMemo, type FC } from "react";
import {
  Search,
  X,
  FileText,
  FileCode,
  Video,
  Image as ImageIcon,
  Music,
  Folder,
} from "lucide-react";

export interface QuickFileSearchModalProps {
  aberto: boolean;
  aoFechar: () => void;
  arquivos: string[];
  aoSelecionarArquivo: (caminho: string) => void;
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

export const QuickFileSearchModal: FC<QuickFileSearchModalProps> = ({
  aberto,
  aoFechar,
  arquivos,
  aoSelecionarArquivo,
}) => {
  const [termo, setTermo] = useState("");
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listaRef = useRef<HTMLDivElement | null>(null);

  // Foco automático e reset ao abrir
  useEffect(() => {
    if (aberto) {
      setTermo("");
      setIndiceAtivo(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [aberto]);

  // Filtragem inteligente: prioriza matches no nome do arquivo e depois no caminho
  const resultados = useMemo(() => {
    const q = termo.trim().toLowerCase();
    if (!q) {
      return arquivos.slice(0, 20);
    }

    const matchesNome: string[] = [];
    const matchesCaminho: string[] = [];

    for (const caminho of arquivos) {
      const nome = caminho.split("/").pop()?.toLowerCase() || "";
      const pathLower = caminho.toLowerCase();

      if (nome.includes(q)) {
        matchesNome.push(caminho);
      } else if (pathLower.includes(q)) {
        matchesCaminho.push(caminho);
      }
    }

    return [...matchesNome, ...matchesCaminho].slice(0, 25);
  }, [termo, arquivos]);

  // Reset do índice ativo ao mudar termo
  useEffect(() => {
    setIndiceAtivo(0);
  }, [termo]);

  // Scroll automático do item ativo
  useEffect(() => {
    if (listaRef.current && listaRef.current.children[indiceAtivo]) {
      const itemEl = listaRef.current.children[indiceAtivo] as HTMLElement;
      itemEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [indiceAtivo]);

  // Teclas de navegação e atalhos
  const tratarTeclas = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndiceAtivo((prev) => (prev < resultados.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceAtivo((prev) => (prev > 0 ? prev - 1 : resultados.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (resultados[indiceAtivo]) {
        aoSelecionarArquivo(resultados[indiceAtivo]);
        aoFechar();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      aoFechar();
    }
  };

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-start justify-center pt-16 sm:pt-20 p-4 z-50 select-none animate-in fade-in duration-100"
      onClick={aoFechar}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-100 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de Busca com Foco Automático */}
        <div className="p-3 border-b border-zinc-800 flex items-center gap-2.5 bg-zinc-950/60">
          <Search size={16} className="text-zinc-400 shrink-0 ml-1" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar arquivo por nome ou caminho (ex: router, .json, page.tsx)..."
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={tratarTeclas}
            className="w-full bg-transparent text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-500 border border-zinc-800 shrink-0">
            ESC para fechar
          </span>
          <button
            type="button"
            onClick={aoFechar}
            className="p-1 rounded text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer shrink-0"
            title="Fechar busca"
          >
            <X size={15} />
          </button>
        </div>

        {/* Lista de Resultados Filtrados */}
        <div
          ref={listaRef}
          className="max-h-80 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin font-mono text-xs"
        >
          {resultados.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500 space-y-1">
              <p className="font-semibold text-zinc-400">Nenhum arquivo encontrado</p>
              <p className="text-[11px] text-zinc-600">
                Nenhum arquivo corresponde ao termo "{termo}" no workspace ativo.
              </p>
            </div>
          ) : (
            resultados.map((caminho, idx) => {
              const ativo = idx === indiceAtivo;
              const partes = caminho.split("/");
              const nome = partes.pop() || caminho;
              const pasta = partes.join("/");

              return (
                <div
                  key={caminho}
                  onClick={() => {
                    aoSelecionarArquivo(caminho);
                    aoFechar();
                  }}
                  onMouseEnter={() => setIndiceAtivo(idx)}
                  className={`px-3 py-2 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-all ${
                    ativo
                      ? "bg-zinc-800/90 text-zinc-100 border border-zinc-700/60 shadow-xs"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850/50 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {obterIconeArquivo(caminho)}
                    <span className="font-semibold text-zinc-200 truncate">{nome}</span>
                    {pasta && (
                      <span className="text-[10px] text-zinc-500 truncate hidden sm:inline">
                        — {pasta}/
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                    {ativo ? "Enter ↵" : "abrir"}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé Informativo */}
        <div className="px-3 py-1.5 border-t border-zinc-850/80 bg-zinc-950/80 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
          <span>{resultados.length} resultado(s) exibido(s)</span>
          <div className="flex items-center gap-2">
            <span>↑↓ navegar</span>
            <span>·</span>
            <span>↵ selecionar</span>
          </div>
        </div>
      </div>
    </div>
  );
};
