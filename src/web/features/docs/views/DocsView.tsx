import React, { useState, useEffect, useCallback, type FC } from "react";
import { useSearchParams } from "react-router";
import {
  BookOpen,
  Search,
  FileText,
  ChevronRight,
  Copy,
  Check,
  RefreshCw,
  FolderGit2,
  FileCode,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { showToast } from "../../../shared/ui/Toast.js";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { renderDocMarkdown } from "../../../lib/doc-renderer.js";

export interface DocumentoItem {
  slug: string;
  titulo: string;
  categoria?: string;
  origem?: "sistema" | "workspace";
  arquivo?: string;
}

export interface DocumentoDetalhe {
  slug: string;
  titulo: string;
  categoria?: string;
  origem?: "sistema" | "workspace";
  conteudo: string;
  caminho?: string;
}

export const DocsView: FC = () => {
  const { client, workspaceId, tratarErro } = useOpenCorp();
  const [searchParams, setSearchParams] = useSearchParams();

  const slugParam = searchParams.get("doc") || "";
  const [docs, setDocs] = useState<DocumentoItem[]>([]);
  const [docAtivo, setDocAtivo] = useState<DocumentoDetalhe | null>(null);
  const [busca, setBusca] = useState("");
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [carregandoDoc, setCarregandoDoc] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const wsEfetivo = workspaceId || undefined;

  // Carregar documento individual
  const carregarDocumento = useCallback(
    async (slug: string, atualizarUrl = true) => {
      if (!slug) return;
      setCarregandoDoc(true);
      try {
        const detalhe = await client.http.get<DocumentoDetalhe>(
          `/docs/${encodeURIComponent(slug)}`,
          {
            headers: wsEfetivo ? { "x-opencorp-workspace": wsEfetivo } : undefined,
          }
        );
        setDocAtivo(detalhe);
        if (atualizarUrl) {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("doc", slug);
            return next;
          });
        }
      } catch (err: unknown) {
        tratarErro(err, `Falha ao carregar documento "${slug}"`);
      } finally {
        setCarregandoDoc(false);
      }
    },
    [client, wsEfetivo, setSearchParams, tratarErro]
  );

  // Carregar catálogo de documentações
  const carregarDocs = useCallback(async () => {
    setCarregandoLista(true);
    try {
      const lista = await client.http.get<DocumentoItem[]>("/docs", {
        headers: wsEfetivo ? { "x-opencorp-workspace": wsEfetivo } : undefined,
      });

      const docsArray = Array.isArray(lista) ? lista : [];
      setDocs(docsArray);

      // Se há um slug na URL, abre-o; caso contrário, abre o primeiro documento da lista
      if (slugParam && docsArray.some((d) => d.slug === slugParam)) {
        void carregarDocumento(slugParam, false);
      } else if (docsArray.length > 0) {
        void carregarDocumento(docsArray[0].slug, !slugParam);
      } else {
        setDocAtivo(null);
      }
    } catch (err: unknown) {
      tratarErro(err, "Falha ao carregar catálogo de documentação");
      setDocs([]);
    } finally {
      setCarregandoLista(false);
    }
  }, [client, wsEfetivo, slugParam, carregarDocumento, tratarErro]);

  useEffect(() => {
    void carregarDocs();
  }, [carregarDocs]);

  const copiarConteudo = () => {
    if (!docAtivo?.conteudo) return;
    navigator.clipboard.writeText(docAtivo.conteudo);
    setCopiado(true);
    showToast("Conteúdo Markdown copiado com sucesso!", "sucesso");
    setTimeout(() => setCopiado(false), 2000);
  };

  const docsFiltrados = docs.filter(
    (d) =>
      d.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      d.slug.toLowerCase().includes(busca.toLowerCase()) ||
      (d.categoria && d.categoria.toLowerCase().includes(busca.toLowerCase()))
  );

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-zinc-950 overflow-hidden select-text">
      {/* Navegação de Tópicos e Arquivos */}
      <aside className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-zinc-850 p-4 space-y-4 flex-shrink-0 bg-zinc-950/80 flex flex-col min-h-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5 uppercase tracking-wider">
              <BookOpen size={14} className="text-emerald-400" />
              Documentação do Sistema
            </h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Guias técnicos e arquivos de <code className="text-zinc-400 font-mono">docs/</code>
            </p>
          </div>

          <button
            type="button"
            disabled={carregandoLista}
            onClick={carregarDocs}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-850 transition-colors cursor-pointer"
            title="Recarregar catálogo"
          >
            <RefreshCw size={12} className={carregandoLista ? "animate-spin text-emerald-400" : ""} />
          </button>
        </div>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título, slug ou categoria..."
            className="w-full pl-8 pr-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        <div className="space-y-1 overflow-y-auto flex-1 pr-1 scrollbar-thin">
          {carregandoLista && docs.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 space-y-1">
              <RefreshCw size={16} className="animate-spin text-emerald-400 mx-auto opacity-70" />
              <p>Carregando catálogo...</p>
            </div>
          ) : docsFiltrados.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              Nenhum documento encontrado.
            </div>
          ) : (
            docsFiltrados.map((doc) => {
              const ativo = docAtivo?.slug === doc.slug;
              return (
                <button
                  key={doc.slug}
                  type="button"
                  onClick={() => carregarDocumento(doc.slug)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-colors cursor-pointer group ${
                    ativo
                      ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 font-semibold"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate min-w-0">
                    {doc.origem === "workspace" ? (
                      <FolderGit2 size={13} className={ativo ? "text-emerald-400" : "text-amber-400/80"} />
                    ) : (
                      <FileText size={13} className={ativo ? "text-emerald-400" : "text-zinc-500"} />
                    )}
                    <span className="truncate">{doc.titulo}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {doc.categoria && (
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-850 text-zinc-500 group-hover:text-zinc-400">
                        {doc.categoria}
                      </span>
                    )}
                    <ChevronRight size={12} className="opacity-40" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Conteúdo do Documento */}
      <section className="flex-1 p-6 lg:p-8 overflow-y-auto space-y-6 flex flex-col min-h-0">
        {carregandoDoc ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 space-y-2">
            <RefreshCw size={24} className="animate-spin text-emerald-400 opacity-60" />
            <p className="text-xs font-mono">Carregando conteúdo Markdown...</p>
          </div>
        ) : docAtivo ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-850 gap-3 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-850 text-zinc-400 uppercase tracking-wider">
                    {docAtivo.categoria || "Geral"}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Origem: {docAtivo.origem === "workspace" ? "Workspace Ativo" : "Sistema Base"}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 mt-1.5 tracking-tight">
                  {docAtivo.titulo}
                </h1>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={copiarConteudo}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-xs text-zinc-300 transition-colors cursor-pointer"
                  title="Copiar Markdown bruto"
                >
                  {copiado ? <Check size={14} className="text-emerald-400" /> : <Copy size={13} />}
                  <span>{copiado ? "Copiado!" : "Copiar Markdown"}</span>
                </button>
              </div>
            </div>

            {/* Renderização Rica do Markdown */}
            <div
              className="prose prose-invert max-w-4xl text-xs sm:text-sm text-zinc-200 leading-relaxed font-sans"
              dangerouslySetInnerHTML={{ __html: renderDocMarkdown(docAtivo.conteudo) }}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 space-y-3 p-12 text-center">
            <AlertCircle size={32} className="opacity-40" />
            <p className="text-xs">Selecione um documento na barra lateral para leitura.</p>
          </div>
        )}
      </section>
    </div>
  );
};
