import React, { useState, useEffect, useCallback, useMemo, type FC } from "react";
import {
  GitBranch,
  GitCommitHorizontal,
  History,
  RotateCcw,
  Eye,
  RefreshCw,
  AlertTriangle,
  FileText,
  Bookmark,
  X,
  Check,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { showToast } from "../../../shared/ui/Toast.js";

export interface CommitItem {
  hash: string;
  hashCurto: string;
  autor: string;
  email: string;
  data: string;
  mensagem: string;
}

export interface StatusItem {
  caminho: string;
  status: "modificado" | "adicionado" | "deletado" | "renomeado" | "untracked";
  staged: boolean;
}

export interface StatusResponse {
  limpo: boolean;
  branch: string;
  arquivos: StatusItem[];
}

export interface CheckpointItem {
  tag: string;
  execId: string;
  hash: string;
  data: string;
}

export interface GitVersionPanelProps {
  workspaceId: string;
  aoAbrirArquivo?: (caminho: string) => void;
  aoDescartarArquivo?: (caminho: string) => void;
  aoReverterWorkspace?: () => void;
  onStatusChange?: (status: StatusResponse | null) => void;
}

interface ModalRollbackState {
  aberto: boolean;
  alvo: string;
  descricao: string;
  tipo: "commit" | "checkpoint";
  processando: boolean;
  erro: string | null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export const GitVersionPanel: FC<GitVersionPanelProps> = ({
  workspaceId,
  aoAbrirArquivo,
  aoDescartarArquivo,
  aoReverterWorkspace,
  onStatusChange,
}) => {
  // Aba ativa interna do painel: alterações, histórico ou checkpoints
  const [subAba, setSubAba] = useState<"alteracoes" | "historico" | "checkpoints">("alteracoes");

  // Dados de Git
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Visualização de Diff Inline
  const [diffAtivo, setDiffAtivo] = useState<{
    tipo: "arquivo" | "commit";
    identificador: string;
    conteudo: string;
  } | null>(null);
  const [carregandoDiff, setCarregandoDiff] = useState(false);

  // Ações de arquivo em andamento
  const [arquivoEmAcao, setArquivoEmAcao] = useState<string | null>(null);
  const [restaurarCommitSelecionado, setRestaurarCommitSelecionado] = useState<Record<string, string>>({});

  // Modal de Rollback em 2 Etapas
  const [modalRollback, setModalRollback] = useState<ModalRollbackState>({
    aberto: false,
    alvo: "",
    descricao: "",
    tipo: "commit",
    processando: false,
    erro: null,
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:4100";

  // Carregar dados de Git
  const carregarDados = useCallback(async () => {
    if (!workspaceId) {
      setStatus(null);
      setCommits([]);
      setCheckpoints([]);
      setErro(null);
      return;
    }

    setCarregando(true);
    setErro(null);

    const wsParam = `?workspace=${encodeURIComponent(workspaceId)}`;
    const headers = {
      "x-opencorp-workspace": workspaceId,
      "x-workspace-id": workspaceId,
    };

    try {
      const [resStatus, resLog, resCp] = await Promise.all([
        fetch(`${origin}/workspaces/git/status${wsParam}`, { headers }),
        fetch(`${origin}/workspaces/git/log${wsParam}&limite=30`, { headers }),
        fetch(`${origin}/workspaces/git/checkpoints${wsParam}`, { headers }),
      ]);

      if (!resStatus.ok && resStatus.status !== 404) {
        throw new Error(`Falha ao obter status Git (HTTP ${resStatus.status})`);
      }

      const statusData = resStatus.ok ? ((await resStatus.json()) as StatusResponse) : null;
      const logData = resLog.ok
        ? ((await resLog.json()) as { commits?: CommitItem[] })
        : { commits: [] };
      const cpData = resCp.ok
        ? ((await resCp.json()) as { checkpoints?: CheckpointItem[] })
        : { checkpoints: [] };

      setStatus(statusData);
      setCommits(logData.commits || []);
      setCheckpoints(cpData.checkpoints || []);
      onStatusChange?.(statusData);
      setErro(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao carregar informações de Git";
      setErro(msg);
      showToast(msg, "erro");
    } finally {
      setCarregando(false);
    }
  }, [workspaceId, origin, onStatusChange]);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  // Carregar Diff de Arquivo
  const verDiffArquivo = async (caminho: string) => {
    if (diffAtivo?.tipo === "arquivo" && diffAtivo.identificador === caminho) {
      setDiffAtivo(null);
      return;
    }

    setCarregandoDiff(true);
    try {
      const wsParam = `?arquivo=${encodeURIComponent(caminho)}&workspace=${encodeURIComponent(workspaceId)}`;
      const resp = await fetch(`${origin}/workspaces/git/diff${wsParam}`, {
        headers: {
          "x-opencorp-workspace": workspaceId,
          "x-workspace-id": workspaceId,
        },
      });

      if (!resp.ok) {
        throw new Error(`Falha ao carregar diff (HTTP ${resp.status})`);
      }

      const data = (await resp.json()) as { diff?: string };
      setDiffAtivo({
        tipo: "arquivo",
        identificador: caminho,
        conteudo: data.diff || "(sem alterações no diff)",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar diff";
      showToast(msg, "erro");
    } finally {
      setCarregandoDiff(false);
    }
  };

  // Carregar Diff de Commit
  const verDiffCommit = async (hash: string) => {
    if (diffAtivo?.tipo === "commit" && diffAtivo.identificador === hash) {
      setDiffAtivo(null);
      return;
    }

    setCarregandoDiff(true);
    try {
      const wsParam = `?hash=${encodeURIComponent(hash)}&workspace=${encodeURIComponent(workspaceId)}`;
      const resp = await fetch(`${origin}/workspaces/git/diff${wsParam}`, {
        headers: {
          "x-opencorp-workspace": workspaceId,
          "x-workspace-id": workspaceId,
        },
      });

      if (!resp.ok) {
        throw new Error(`Falha ao carregar diff do commit (HTTP ${resp.status})`);
      }

      const data = (await resp.json()) as { diff?: string };
      setDiffAtivo({
        tipo: "commit",
        identificador: hash,
        conteudo: data.diff || "(sem alterações neste commit)",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar diff";
      showToast(msg, "erro");
    } finally {
      setCarregandoDiff(false);
    }
  };

  // Restaurar arquivo cirurgicamente
  const restaurarArquivoCirurgico = async (caminho: string, commitHash?: string) => {
    setArquivoEmAcao(caminho);
    try {
      const resp = await fetch(
        `${origin}/workspaces/git/restore?workspace=${encodeURIComponent(workspaceId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-opencorp-workspace": workspaceId,
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            arquivo: caminho,
            commit: commitHash,
            workspace: workspaceId,
          }),
        }
      );

      const data = (await resp.json().catch(() => ({}))) as {
        sucesso?: boolean;
        mensagem?: string;
        erro?: string;
      };

      if (resp.ok && data.sucesso !== false) {
        showToast(data.mensagem || `Arquivo "${caminho}" restaurado com sucesso!`, "sucesso");
        aoDescartarArquivo?.(caminho);
        if (diffAtivo?.identificador === caminho) {
          setDiffAtivo(null);
        }
        await carregarDados();
      } else {
        throw new Error(data.erro || data.mensagem || "Falha ao restaurar arquivo");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Erro ao restaurar: ${msg}`, "erro");
    } finally {
      setArquivoEmAcao(null);
    }
  };

  // Abrir modal de confirmação de Rollback em 2 etapas
  const iniciarRollback = (alvo: string, descricao: string, tipo: "commit" | "checkpoint") => {
    setModalRollback({
      aberto: true,
      alvo,
      descricao,
      tipo,
      processando: false,
      erro: null,
    });
  };

  // Executar rollback confirmado via POST /workspaces/git/rollback
  const executarRollbackConfirmado = async () => {
    setModalRollback((prev) => ({ ...prev, processando: true, erro: null }));
    try {
      const resp = await fetch(
        `${origin}/workspaces/git/rollback?workspace=${encodeURIComponent(workspaceId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-opencorp-workspace": workspaceId,
            "x-workspace-id": workspaceId,
          },
          body: JSON.stringify({
            alvo: modalRollback.alvo,
            workspace: workspaceId,
          }),
        }
      );

      const data = (await resp.json().catch(() => ({}))) as {
        sucesso?: boolean;
        mensagem?: string;
        erro?: string;
      };

      if (resp.ok && data.sucesso !== false) {
        showToast(
          data.mensagem || `Workspace revertido com sucesso para ${modalRollback.alvo.slice(0, 7)}!`,
          "sucesso"
        );
        setModalRollback((prev) => ({ ...prev, aberto: false }));
        setDiffAtivo(null);
        aoReverterWorkspace?.();
        await carregarDados();
      } else {
        throw new Error(data.erro || data.mensagem || "Falha ao executar rollback");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setModalRollback((prev) => ({ ...prev, erro: msg, processando: false }));
      showToast(`Erro no rollback: ${msg}`, "erro");
    }
  };

  // Renderizador de Diff colorido linha a linha
  const renderizarDiffLinhas = (diff: string) => {
    const linhas = diff.split("\n");
    return (
      <div className="font-mono text-[10px] leading-relaxed select-text overflow-x-auto">
        {linhas.map((linha, idx) => {
          let estilo = "text-zinc-400 px-2.5 py-0.5 hover:bg-zinc-900/50";
          if (linha.startsWith("+") && !linha.startsWith("+++")) {
            estilo = "text-emerald-300 bg-emerald-950/40 px-2.5 py-0.5 font-medium";
          } else if (linha.startsWith("-") && !linha.startsWith("---")) {
            estilo = "text-rose-300 bg-rose-950/40 px-2.5 py-0.5 font-medium";
          } else if (linha.startsWith("@@")) {
            estilo = "text-cyan-300 bg-cyan-950/40 px-2.5 py-0.5 font-bold border-y border-cyan-800/30";
          } else if (linha.startsWith("diff ") || linha.startsWith("index ")) {
            estilo = "text-zinc-500 px-2.5 py-0.5 font-bold";
          }
          return (
            <div key={idx} className={estilo}>
              {linha || " "}
            </div>
          );
        })}
      </div>
    );
  };

  const pendentesCount = status?.arquivos.length || 0;

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 border-r border-zinc-850 select-none overflow-hidden relative">
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER DO PAINEL GIT & STATUS DO BRANCH
         ───────────────────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-zinc-850 bg-zinc-900/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <GitBranch size={14} className="text-purple-400 shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0 text-xs">
            <span className="font-bold text-zinc-300">Git</span>
            <span className="text-zinc-500 font-mono text-[11px] truncate">
              ({status?.branch || "main"})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void carregarDados()}
            title="Atualizar Git"
            disabled={!workspaceId || carregando}
            className="p-1 rounded text-zinc-400 hover:text-purple-400 hover:bg-zinc-800 disabled:opacity-30 transition-colors cursor-pointer"
          >
            <RefreshCw size={12} className={carregando ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. NAVEGAÇÃO INTERNA EM 3 ABAS (ALTERAÇÕES, HISTÓRICO, CHECKPOINTS)
         ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center border-b border-zinc-850 bg-zinc-900/20 px-2 py-1 gap-1 shrink-0 text-xs font-medium">
        <button
          type="button"
          onClick={() => {
            setSubAba("alteracoes");
            setDiffAtivo(null);
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
            subAba === "alteracoes"
              ? "bg-zinc-800 text-zinc-100 font-semibold shadow-xs"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <span>Alterações</span>
          {pendentesCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {pendentesCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setSubAba("historico");
            setDiffAtivo(null);
          }}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
            subAba === "historico"
              ? "bg-zinc-800 text-zinc-100 font-semibold shadow-xs"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <History size={11} className={subAba === "historico" ? "text-amber-400" : "text-zinc-500"} />
          <span>Commits</span>
          {commits.length > 0 && (
            <span className="text-[10px] font-mono text-zinc-500">
              ({commits.length})
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setSubAba("checkpoints");
            setDiffAtivo(null);
          }}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
            subAba === "checkpoints"
              ? "bg-zinc-800 text-zinc-100 font-semibold shadow-xs"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Bookmark size={11} className={subAba === "checkpoints" ? "text-purple-400" : "text-zinc-500"} />
          <span>Pontos</span>
          {checkpoints.length > 0 && (
            <span className="text-[10px] font-mono text-zinc-500">
              ({checkpoints.length})
            </span>
          )}
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. VISUALIZADOR INLINE DE DIFF (SE ABERTO)
         ───────────────────────────────────────────────────────────── */}
      {diffAtivo && (
        <div className="border-b border-zinc-800 bg-zinc-950 flex flex-col shrink-0 max-h-[45vh] shadow-xl animate-in slide-in-from-top-2 duration-100">
          <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 min-w-0 font-mono text-[11px]">
              <span className="text-zinc-500">diff:</span>
              <span className="text-zinc-200 font-semibold truncate max-w-[170px]" title={diffAtivo.identificador}>
                {diffAtivo.identificador}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDiffAtivo(null)}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Fechar visualizador de diff"
            >
              <X size={13} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin max-h-[38vh] bg-zinc-950/90 py-1">
            {carregandoDiff ? (
              <div className="p-4 text-center text-xs text-zinc-500 animate-pulse">
                Carregando diff...
              </div>
            ) : (
              renderizarDiffLinhas(diffAtivo.conteudo)
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. CONTEÚDO PRINCIPAL: ALTERAÇÕES / HISTÓRICO / CHECKPOINTS
         ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1 font-mono scrollbar-thin">
        {!workspaceId ? (
          <div className="p-6 text-center text-xs text-zinc-500 space-y-2">
            <GitBranch size={28} className="mx-auto opacity-30 text-zinc-400" />
            <p className="font-semibold text-zinc-300">Nenhum workspace selecionado</p>
            <p className="text-[11px] text-zinc-500">
              Selecione um workspace para inspecionar controle de versão e diffs.
            </p>
          </div>
        ) : erro ? (
          <div className="p-4 text-center text-xs space-y-2">
            <div className="text-rose-400 flex items-center justify-center gap-1.5">
              <AlertTriangle size={14} />
              <span>Falha no Git</span>
            </div>
            <p className="text-[11px] text-zinc-400">{erro}</p>
            <button
              type="button"
              onClick={() => void carregarDados()}
              className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-zinc-200 text-xs transition-colors cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        ) : carregando && !status ? (
          <div className="p-4 text-center text-xs text-zinc-500 animate-pulse">
            Inspecionando repositório Git...
          </div>
        ) : (
          <>
            {/* ── ABA 1: ALTERAÇÕES PENDENTES (WORKING TREE) ── */}
            {subAba === "alteracoes" && (
              <div className="space-y-1">
                {pendentesCount === 0 ? (
                  <div className="p-6 text-center text-xs text-zinc-500 space-y-1">
                    <Check size={20} className="mx-auto text-emerald-500/80 mb-2" />
                    <p className="font-semibold text-zinc-300">Working Tree Limpo</p>
                    <p className="text-[11px] text-zinc-500">
                      Nenhuma alteração pendente de commit ou arquivos modificados.
                    </p>
                  </div>
                ) : (
                  status?.arquivos.map((arq) => {
                    const statusTag =
                      arq.status === "untracked"
                        ? "novo"
                        : arq.status === "deletado"
                        ? "del"
                        : arq.status === "adicionado"
                        ? "add"
                        : "mod";

                    const corTag =
                      arq.status === "untracked"
                        ? "bg-cyan-950/60 text-cyan-400 border-cyan-800/50"
                        : arq.status === "deletado"
                        ? "bg-rose-950/60 text-rose-400 border-rose-800/50"
                        : arq.status === "adicionado"
                        ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/50"
                        : "bg-amber-950/60 text-amber-400 border-amber-800/50";

                    const diffAbertoAqui =
                      diffAtivo?.tipo === "arquivo" && diffAtivo.identificador === arq.caminho;

                    return (
                      <div
                        key={arq.caminho}
                        className="p-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 transition-colors text-[11px] space-y-1.5"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`px-1 rounded text-[9px] font-mono uppercase font-bold border shrink-0 ${corTag}`}
                          >
                            {statusTag}
                          </span>
                          <span
                            onClick={() => aoAbrirArquivo?.(arq.caminho)}
                            className="font-mono text-zinc-300 hover:text-zinc-100 truncate flex-1 cursor-pointer"
                            title={arq.caminho}
                          >
                            {arq.caminho}
                          </span>
                        </div>

                        {/* Botões de Ação do Arquivo */}
                        <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40 text-[10px]">
                          <button
                            type="button"
                            onClick={() => void verDiffArquivo(arq.caminho)}
                            className={`px-1.5 py-0.5 rounded border transition-colors flex items-center gap-1 cursor-pointer ${
                              diffAbertoAqui
                                ? "bg-cyan-950/80 text-cyan-300 border-cyan-700"
                                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800"
                            }`}
                            title="Ver alterações linha a linha deste arquivo"
                          >
                            <Eye size={10} />
                            <span>{diffAbertoAqui ? "ocultar diff" : "diff"}</span>
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void restaurarArquivoCirurgico(arq.caminho)}
                              disabled={arquivoEmAcao === arq.caminho}
                              className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 hover:text-rose-300 hover:bg-rose-950/30 border border-zinc-800 hover:border-rose-800 transition-colors cursor-pointer flex items-center gap-1"
                              title="Descartar alterações locais deste arquivo"
                            >
                              <RotateCcw size={9} />
                              <span>{arquivoEmAcao === arq.caminho ? "revertendo..." : "descartar"}</span>
                            </button>

                            {commits.length > 0 && (
                              <select
                                className="px-1 py-0.5 rounded text-[9px] font-mono bg-zinc-900 text-zinc-400 border border-zinc-800 max-w-[85px] cursor-pointer"
                                title="Restaurar este arquivo para a versão de um commit específico"
                                value={restaurarCommitSelecionado[arq.caminho] || ""}
                                onChange={(e) => {
                                  const cHash = e.target.value;
                                  if (cHash) {
                                    setRestaurarCommitSelecionado((prev) => ({
                                      ...prev,
                                      [arq.caminho]: "",
                                    }));
                                    void restaurarArquivoCirurgico(arq.caminho, cHash);
                                  }
                                }}
                              >
                                <option value="">⇄ commit...</option>
                                {commits.slice(0, 8).map((c) => (
                                  <option key={c.hash} value={c.hash}>
                                    {c.hashCurto} · {c.mensagem.slice(0, 18)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── ABA 2: HISTÓRICO DE COMMITS ── */}
            {subAba === "historico" && (
              <div className="space-y-1">
                {commits.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-500">
                    Nenhum commit encontrado no repositório.
                  </div>
                ) : (
                  commits.map((c, idx) => {
                    const diffAbertoAqui =
                      diffAtivo?.tipo === "commit" && diffAtivo.identificador === c.hash;

                    return (
                      <div
                        key={c.hash}
                        className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 transition-colors space-y-1.5"
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                              idx === 0
                                ? "border-emerald-500/60 bg-emerald-950/40 text-emerald-400"
                                : "border-zinc-700 bg-zinc-900 text-zinc-500"
                            }`}
                          >
                            <GitCommitHorizontal size={11} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="font-bold text-amber-400">{c.hashCurto}</span>
                              <span className="text-zinc-600">·</span>
                              <span className="text-zinc-300 font-medium truncate" title={c.mensagem}>
                                {c.mensagem}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                              <span className="text-purple-400/80 font-mono">@{c.autor}</span>
                              <span>·</span>
                              <span>{formatarData(c.data)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Botões de Ação do Commit */}
                        <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40 text-[10px]">
                          <button
                            type="button"
                            onClick={() => void verDiffCommit(c.hash)}
                            className={`px-1.5 py-0.5 rounded border transition-colors flex items-center gap-1 cursor-pointer ${
                              diffAbertoAqui
                                ? "bg-cyan-950/80 text-cyan-300 border-cyan-700"
                                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800"
                            }`}
                            title="Ver alterações deste commit"
                          >
                            <Eye size={10} />
                            <span>{diffAbertoAqui ? "ocultar diff" : "diff"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              iniciarRollback(
                                c.hash,
                                `Reverter workspace para o commit ${c.hashCurto} ("${c.mensagem}")`,
                                "commit"
                              )
                            }
                            className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 hover:text-amber-300 hover:bg-amber-950/30 border border-zinc-800 hover:border-amber-800 transition-colors cursor-pointer flex items-center gap-1"
                            title="Reverter workspace para este ponto no tempo"
                          >
                            <RotateCcw size={9} />
                            <span>Reverter</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── ABA 3: CHECKPOINTS PRÉ-EXECUÇÃO ── */}
            {subAba === "checkpoints" && (
              <div className="space-y-1">
                {checkpoints.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-500">
                    Nenhum checkpoint registrado no workspace.
                  </div>
                ) : (
                  checkpoints.map((cp) => (
                    <div
                      key={cp.tag}
                      className="p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-1.5 text-[11px]">
                        <span className="text-purple-400 font-bold truncate flex-1" title={cp.tag}>
                          {cp.tag}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                          {cp.hash.slice(0, 7)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40 text-[10px]">
                        <span className="text-zinc-500 text-[9px]">{formatarData(cp.data)}</span>
                        <button
                          type="button"
                          onClick={() =>
                            iniciarRollback(
                              cp.tag,
                              `Reverter workspace para o checkpoint "${cp.tag}"`,
                              "checkpoint"
                            )
                          }
                          className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 hover:text-amber-300 hover:bg-amber-950/30 border border-zinc-800 hover:border-amber-800 transition-colors cursor-pointer flex items-center gap-1"
                          title="Restaurar o estado exato deste checkpoint"
                        >
                          <RotateCcw size={9} />
                          <span>Reverter</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          5. MODAL DE CONFIRMAÇÃO DE ROLLBACK EM 2 ETAPAS
         ───────────────────────────────────────────────────────────── */}
      {modalRollback.aberto && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none animate-in fade-in duration-100"
          onClick={() => {
            if (!modalRollback.processando) {
              setModalRollback((prev) => ({ ...prev, aberto: false }));
            }
          }}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
                <AlertTriangle size={18} className="text-amber-400" />
                <span>Confirmar Rollback de Versão</span>
              </div>
              <button
                type="button"
                onClick={() => setModalRollback((prev) => ({ ...prev, aberto: false }))}
                disabled={modalRollback.processando}
                className="p-1 rounded text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Erro Inline */}
            {modalRollback.erro && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0 text-rose-400" />
                <span>{modalRollback.erro}</span>
              </div>
            )}

            {/* Aviso */}
            <div className="space-y-3 text-xs text-zinc-300">
              <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-900/60 space-y-2">
                <p className="font-semibold text-amber-200 leading-snug">
                  {modalRollback.descricao}
                </p>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Alvo: <span className="font-mono text-zinc-200 font-bold">{modalRollback.alvo}</span>
                </p>
                <p className="text-[10px] text-zinc-400 leading-relaxed pt-1 border-t border-amber-900/40">
                  Esta ação reverterá o estado do código do workspace diretamente em disco.
                  Arquivos não commitados serão descartados.
                </p>
              </div>
            </div>

            {/* Ações */}
            <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalRollback((prev) => ({ ...prev, aberto: false }))}
                disabled={modalRollback.processando}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void executarRollbackConfirmado()}
                disabled={modalRollback.processando}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                {modalRollback.processando ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    <span>Revertendo...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw size={12} />
                    <span>Confirmar Rollback</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
