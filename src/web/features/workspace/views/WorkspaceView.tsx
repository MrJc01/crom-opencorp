import React, { useState, useEffect, useCallback, type FC } from "react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { type WorkspaceResumo, type WorkspaceGitStatus } from "@opencorp/sdk";
import { showToast } from "../../../shared/ui/Toast.js";
import {
  FolderTree,
  GitBranch,
  FolderPlus,
  CheckCircle2,
  AlertCircle,
  FileCode,
  HardDrive,
  RefreshCw,
  X,
} from "lucide-react";

export const WorkspaceView: FC = () => {
  const { client, workspaceId, tratarErro } = useOpenCorp();
  const [workspaces, setWorkspaces] = useState<WorkspaceResumo[]>([]);
  const [gitStatus, setGitStatus] = useState<WorkspaceGitStatus | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [modalNovoWs, setModalNovoWs] = useState(false);
  const [novoId, setNovoId] = useState("");
  const [novoNome, setNovoNome] = useState("");

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const [wsList, git] = await Promise.all([
        client.workspaces.listar(),
        client.workspaces.gitStatus().catch(() => null),
      ]);
      setWorkspaces(wsList || []);
      setGitStatus(git);
    } catch (err) {
      tratarErro(err, "Falha ao consultar dados do workspace");
    } finally {
      setCarregando(false);
    }
  }, [client, tratarErro]);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  const criarWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoId.trim()) return;

    try {
      const criado = await client.workspaces.criar({
        id: novoId.trim(),
      });
      setWorkspaces((prev) => [...prev, criado]);
      showToast(`Workspace "${criado.id}" criado com sucesso`, "sucesso");
      setNovoId("");
      setNovoNome("");
      setModalNovoWs(false);
    } catch (err) {
      tratarErro(err, "Falha ao criar workspace");
    }
  };

  return (
    <div className="flex flex-col h-full w-full p-6 md:p-8 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <FolderTree className="text-emerald-400" size={20} />
            Gestão de Workspaces & Governança Git
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Ambientes isolados de execução, checkpoints e integridade de versionamento.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={carregarDados}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={() => setModalNovoWs(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
          >
            <FolderPlus size={14} />
            <span>Novo Workspace</span>
          </button>
        </div>
      </div>

      {/* Painel Git do Workspace Ativo */}
      <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-850 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
              <GitBranch size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Status do Repositório Git</h3>
              <span className="text-[11px] font-mono text-zinc-500">
                Workspace Ativo: {workspaceId}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-emerald-300">
              <GitBranch size={12} />
              {gitStatus?.branch || "main"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-850 space-y-1">
            <span className="text-zinc-500 text-[10px] uppercase font-mono block">Status da Árvore</span>
            <span className="text-zinc-200 font-semibold flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-400" />
              {!gitStatus?.dirty ? "Working Tree Limpa" : "Modificações Pendentes"}
            </span>
          </div>

          <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-850 space-y-1">
            <span className="text-zinc-500 text-[10px] uppercase font-mono block">Branch / Head</span>
            <span className="text-zinc-200 font-mono text-xs truncate block">
              {gitStatus?.branch || "main"}
            </span>
          </div>

          <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-850 space-y-1">
            <span className="text-zinc-500 text-[10px] uppercase font-mono block">Arquivos Alterados</span>
            <span className="text-zinc-200 font-semibold">
              {gitStatus?.files?.length ?? 0} arquivos
            </span>
          </div>
        </div>
      </div>

      {/* Grid de Workspaces Disponíveis */}
      <div>
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
          Workspaces Registrados ({workspaces.length})
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {workspaces.map((ws) => {
            const ativo = ws.id === workspaceId;

            return (
              <div
                key={ws.id}
                className={`p-4 rounded-2xl border transition-all space-y-3 ${
                  ativo
                    ? "bg-emerald-950/30 border-emerald-700/60 shadow-md"
                    : "bg-zinc-900/40 border-zinc-850 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive size={16} className={ativo ? "text-emerald-400" : "text-zinc-500"} />
                    <h3 className="text-xs font-bold text-zinc-100">{(ws as Record<string, any>).name || ws.id}</h3>
                  </div>

                  {ativo && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400">
                      Atual
                    </span>
                  )}
                </div>

                <div className="text-[11px] font-mono text-zinc-500 truncate">
                  ID: {ws.id}
                </div>

                {!ativo && (
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.setItem("oc-ws", ws.id);
                      window.location.reload();
                    }}
                    className="w-full py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Alternar para este Workspace
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal de Criação */}
      {modalNovoWs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <FolderPlus size={16} className="text-emerald-400" />
                Criar Novo Workspace
              </h3>
              <button
                type="button"
                onClick={() => setModalNovoWs(false)}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={criarWorkspace} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-zinc-300 font-medium mb-1">Identificador (slug) *</label>
                <input
                  type="text"
                  required
                  value={novoId}
                  onChange={(e) => setNovoId(e.target.value)}
                  placeholder="ex: app-financeiro"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Nome de Exibição *</label>
                <input
                  type="text"
                  required
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="ex: Módulo Financeiro"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setModalNovoWs(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md"
                >
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
