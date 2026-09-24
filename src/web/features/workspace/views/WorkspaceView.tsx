import React, { useState, useEffect, useCallback, type FC } from "react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { type WorkspaceResumo, type WorkspaceGitStatus } from "@opencorp/sdk";
import { showToast } from "../../../shared/ui/Toast.js";
import { FileTree } from "../components/FileTree.js";
import {
  FolderTree,
  GitBranch,
  Save,
  CheckCircle2,
  AlertCircle,
  FileCode,
  HardDrive,
  RefreshCw,
  X,
  FileText,
  Workflow,
  Sparkles,
} from "lucide-react";

export const WorkspaceView: FC = () => {
  const { client, workspaceId, definirWorkspaceId, tratarErro } = useOpenCorp();
  const [gitStatus, setGitStatus] = useState<WorkspaceGitStatus | null>(null);
  const [carregandoGit, setCarregandoGit] = useState(false);

  // Arquivo Ativo
  const [arquivoAtivo, setArquivoAtivo] = useState<string | null>(null);
  const [conteudoOriginal, setConteudoOriginal] = useState("");
  const [conteudoEditado, setConteudoEditado] = useState("");
  const [carregandoArquivo, setCarregandoArquivo] = useState(false);
  const [salvandoArquivo, setSalvandoArquivo] = useState(false);

  // Carregar status Git
  const carregarGit = useCallback(async () => {
    setCarregandoGit(true);
    try {
      const git = await client.workspaces.gitStatus().catch(() => null);
      setGitStatus(git);
    } catch {
      // Silencioso se git não estiver inicializado
    } finally {
      setCarregandoGit(false);
    }
  }, [client]);

  useEffect(() => {
    void carregarGit();
  }, [carregarGit]);

  // Carregar conteúdo do arquivo
  const carregarArquivo = useCallback(
    async (caminho: string) => {
      setCarregandoArquivo(true);
      try {
        const origin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:4100";
        const wsParam = workspaceId ? `&workspace=${encodeURIComponent(workspaceId)}` : "";
        const resp = await fetch(
          `${origin}/files?path=${encodeURIComponent(caminho)}${wsParam}`,
          {
            headers: workspaceId ? { "x-opencorp-workspace": workspaceId } : {},
          },
        );

        if (!resp.ok) {
          throw new Error(`Falha ao ler arquivo (HTTP ${resp.status})`);
        }

        const data = await resp.json();
        let texto = "";
        if (typeof data === "string") {
          texto = data;
        } else if (data && typeof data.conteudo === "string") {
          texto = data.conteudo;
        } else {
          texto = JSON.stringify(data, null, 2);
        }

        setArquivoAtivo(caminho);
        setConteudoOriginal(texto);
        setConteudoEditado(texto);
      } catch (err: unknown) {
        tratarErro(err, `Erro ao abrir ${caminho}`);
      } finally {
        setCarregandoArquivo(false);
      }
    },
    [workspaceId, tratarErro],
  );

  // Salvar arquivo editado
  const salvarArquivo = async () => {
    if (!arquivoAtivo) return;
    setSalvandoArquivo(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:4100";
      const wsParam = workspaceId ? `&workspace=${encodeURIComponent(workspaceId)}` : "";
      const resp = await fetch(
        `${origin}/files?path=${encodeURIComponent(arquivoAtivo)}${wsParam}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(workspaceId ? { "x-opencorp-workspace": workspaceId } : {}),
          },
          body: JSON.stringify({ conteudo: conteudoEditado }),
        },
      );

      if (!resp.ok) {
        throw new Error(`Falha ao salvar (HTTP ${resp.status})`);
      }

      setConteudoOriginal(conteudoEditado);
      showToast(`Arquivo "${arquivoAtivo.split("/").pop()}" salvo com sucesso!`, "sucesso");
      void carregarGit();
    } catch (err: unknown) {
      tratarErro(err, "Falha ao salvar arquivo");
    } finally {
      setSalvandoArquivo(false);
    }
  };

  // Atalho de teclado Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && arquivoAtivo) {
        e.preventDefault();
        void salvarArquivo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [arquivoAtivo, conteudoEditado]);

  const temAlteracoes = conteudoEditado !== conteudoOriginal;

  return (
    <div className="flex h-full w-full bg-zinc-950 overflow-hidden select-none">
      {/* Coluna Esquerda: Árvore de Arquivos (Explorer) */}
      <aside className="w-72 sm:w-80 h-full flex-shrink-0">
        <FileTree
          arquivoAtivo={arquivoAtivo}
          aoSelecionarArquivo={(caminho) => void carregarArquivo(caminho)}
        />
      </aside>

      {/* Coluna Direita: Editor ou Painel de Visão Geral */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-zinc-950 overflow-hidden">
        {/* Barra Superior do Workspace / Editor */}
        <header className="h-12 border-b border-zinc-850 px-4 flex items-center justify-between bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {arquivoAtivo ? (
              <div className="flex items-center gap-2 min-w-0 text-xs font-mono text-zinc-300">
                <FileCode size={14} className="text-emerald-400 shrink-0" />
                <span className="font-semibold text-zinc-100 truncate">
                  {arquivoAtivo.split("/").pop()}
                </span>
                <span className="text-zinc-600 truncate hidden sm:inline">
                  ({arquivoAtivo})
                </span>
                {temAlteracoes && (
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0" title="Alterações não salvas" />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                <FolderTree size={15} className="text-emerald-400" />
                <span>IDE Workspace: {workspaceId || "yt-factory-01"}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Badge Git */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-400">
              <GitBranch size={12} className="text-emerald-400" />
              <span>{gitStatus?.branch || "main"}</span>
              {gitStatus?.dirty && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Modificações no Git" />
              )}
            </div>

            {/* Ações do Arquivo */}
            {arquivoAtivo && (
              <>
                <button
                  type="button"
                  onClick={salvarArquivo}
                  disabled={salvandoArquivo || !temAlteracoes}
                  className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium shadow-xs transition-all cursor-pointer"
                  title="Salvar alterações (Ctrl+S)"
                >
                  <Save size={13} />
                  <span>{salvandoArquivo ? "Salvando..." : "Salvar"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setArquivoAtivo(null)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Fechar arquivo"
                >
                  <X size={15} />
                </button>
              </>
            )}
          </div>
        </header>

        {/* Área Central: Visualizador/Editor ou Welcome State */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          {carregandoArquivo ? (
            <div className="flex items-center justify-center h-full text-xs text-zinc-500">
              <RefreshCw size={16} className="animate-spin mr-2 text-emerald-400" />
              <span>Carregando arquivo...</span>
            </div>
          ) : arquivoAtivo ? (
            <div className="h-full w-full flex flex-col p-2">
              <textarea
                value={conteudoEditado}
                onChange={(e) => setConteudoEditado(e.target.value)}
                spellCheck={false}
                className="flex-1 w-full p-4 bg-zinc-950 font-mono text-xs text-zinc-200 resize-none focus:outline-none border-none leading-relaxed select-text"
                placeholder="Conteúdo vazio..."
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-emerald-950/60 border border-emerald-800/50 flex items-center justify-center text-emerald-400 shadow-lg">
                <FileCode size={22} />
              </div>

              <div className="max-w-md space-y-1">
                <h3 className="text-sm font-bold text-zinc-200">
                  Nenhum arquivo aberto
                </h3>
                <p className="text-xs text-zinc-400">
                  Selecione um arquivo na árvore à esquerda para inspecionar, editar e salvar diretamente no workspace.
                </p>
              </div>

              {/* Sugestões de Acesso Rápido */}
              <div className="pt-2 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void carregarArquivo(".opencorp/flows/yt-pautador.json")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 text-xs text-zinc-300 font-mono transition-colors cursor-pointer"
                >
                  <Workflow size={13} className="text-emerald-400" />
                  <span>yt-pautador.json</span>
                </button>

                <button
                  type="button"
                  onClick={() => void carregarArquivo(".opencorp/flows/yt-boletim-diario.json")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 text-xs text-zinc-300 font-mono transition-colors cursor-pointer"
                >
                  <Workflow size={13} className="text-blue-400" />
                  <span>yt-boletim-diario.json</span>
                </button>

                <button
                  type="button"
                  onClick={() => void carregarArquivo(".opencorp/config.json")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 text-xs text-zinc-300 font-mono transition-colors cursor-pointer"
                >
                  <FileText size={13} className="text-amber-400" />
                  <span>config.json</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
