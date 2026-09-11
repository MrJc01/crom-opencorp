import { type Component, createSignal, For, Show } from "solid-js";
import {
  GitCommitHorizontal,
  RotateCcw,
  Eye,
  ChevronDown,
  ChevronRight,
  History,
  RefreshCw,
  AlertTriangle,
  Check,
  GitBranch,
  FileText,
  FileCode,
} from "lucide-solid";
import { fetchApi, wsAtivo } from "../lib/context";
import { showToast } from "../ui/Toast";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";

interface CommitItem {
  hash: string;
  hashCurto: string;
  autor: string;
  email: string;
  data: string;
  mensagem: string;
}

interface StatusItem {
  caminho: string;
  status: "modificado" | "adicionado" | "deletado" | "renomeado" | "untracked";
  staged: boolean;
}

interface StatusResponse {
  limpo: boolean;
  branch: string;
  arquivos: StatusItem[];
}

export const GitVersionPanel: Component<{
  visible: boolean;
  onToggle: () => void;
}> = (props) => {
  const [commits, setCommits] = createSignal<CommitItem[]>([]);
  const [carregando, setCarregando] = createSignal(false);
  const [diffAberto, setDiffAberto] = createSignal<string | null>(null);
  const [diffConteudo, setDiffConteudo] = createSignal("");
  const [carregandoDiff, setCarregandoDiff] = createSignal(false);
  const [rollbackAlvo, setRollbackAlvo] = createSignal<string | null>(null);
  const [revertendo, setRevertendo] = createSignal(false);

  // Estados de Git Granular (Working Tree & Restauração Cirúrgica)
  const [statusWorkingTree, setStatusWorkingTree] = createSignal<StatusResponse | null>(null);
  const [diffArquivoAberto, setDiffArquivoAberto] = createSignal<string | null>(null);
  const [diffArquivoConteudo, setDiffArquivoConteudo] = createSignal("");
  const [carregandoDiffArquivo, setCarregandoDiffArquivo] = createSignal(false);
  const [arquivoEmAcao, setArquivoEmAcao] = createSignal<string | null>(null);
  const [checkpoints, setCheckpoints] = createSignal<Array<{ tag: string; execId: string; hash: string; data: string }>>([]);
  const [restaurarCommit, setRestaurarCommit] = createSignal<Record<string, string>>({});

  const carregar = async () => {
    setCarregando(true);
    try {
      const [logData, statusData, cpData] = await Promise.all([
        fetchApi<{ commits: CommitItem[] }>("/workspaces/git/log?limite=30").catch(() => ({ commits: [] })),
        fetchApi<StatusResponse>("/workspaces/git/status").catch(() => null),
        fetchApi<{ checkpoints: Array<{ tag: string; execId: string; hash: string; data: string }> }>("/workspaces/git/checkpoints").catch(() => ({ checkpoints: [] })),
      ]);
      setCommits(logData.commits || []);
      setStatusWorkingTree(statusData);
      setCheckpoints(cpData.checkpoints || []);
    } catch {
      setCommits([]);
      setStatusWorkingTree(null);
    } finally {
      setCarregando(false);
    }
  };

  const verDiff = async (hash: string) => {
    if (diffAberto() === hash) {
      setDiffAberto(null);
      return;
    }
    setDiffAberto(hash);
    setCarregandoDiff(true);
    try {
      const data = await fetchApi<{ diff: string }>(`/workspaces/git/diff?hash=${encodeURIComponent(hash)}`);
      setDiffConteudo(data.diff || "(sem diff)");
    } catch {
      setDiffConteudo("Erro ao carregar diff");
    } finally {
      setCarregandoDiff(false);
    }
  };

  const verDiffArquivo = async (caminho: string) => {
    if (diffArquivoAberto() === caminho) {
      setDiffArquivoAberto(null);
      return;
    }
    setDiffArquivoAberto(caminho);
    setCarregandoDiffArquivo(true);
    try {
      const data = await fetchApi<{ diff: string }>(`/workspaces/git/diff?arquivo=${encodeURIComponent(caminho)}`);
      setDiffArquivoConteudo(data.diff || "(sem diff)");
    } catch {
      setDiffArquivoConteudo("Erro ao carregar diff do arquivo");
    } finally {
      setCarregandoDiffArquivo(false);
    }
  };

  const restaurarArquivoCirurgico = async (caminho: string, commitHash?: string) => {
    setArquivoEmAcao(caminho);
    try {
      const data = await fetchApi<{ sucesso: boolean; mensagem: string }>("/workspaces/git/restore", {
        method: "POST",
        body: JSON.stringify({ arquivo: caminho, commit: commitHash }),
      });
      if (data.sucesso) {
        showToast(data.mensagem, "sucesso");
        await carregar();
      } else {
        showToast(data.mensagem || "Falha ao restaurar", "erro");
      }
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, "erro");
    } finally {
      setArquivoEmAcao(null);
    }
  };

  const confirmarRollback = async (hash: string) => {
    if (rollbackAlvo() === hash) {
      // Segunda confirmação: executar
      setRevertendo(true);
      try {
        const data = await fetchApi<{ sucesso: boolean; mensagem: string }>("/workspaces/git/rollback", {
          method: "POST",
          body: JSON.stringify({ alvo: hash }),
        });
        if (data.sucesso) {
          showToast(`Workspace revertido com sucesso para ${hash.slice(0, 7)}`, "sucesso");
          setRollbackAlvo(null);
          await carregar();
        } else {
          showToast(`Falha: ${data.mensagem}`, "erro");
        }
      } catch (err: any) {
        showToast(`Erro: ${err.message}`, "erro");
      } finally {
        setRevertendo(false);
      }
    } else {
      setRollbackAlvo(hash);
      setTimeout(() => {
        if (rollbackAlvo() === hash) setRollbackAlvo(null);
      }, 5000);
    }
  };

  const formatarData = (iso: string) => {
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
  };

  const renderDiffColorido = (diff: string) => {
    return diff.split("\n").map((line) => {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        return `<div class="text-emerald-400 bg-emerald-950/30 px-2">${escapeHtml(line)}</div>`;
      }
      if (line.startsWith("-") && !line.startsWith("---")) {
        return `<div class="text-red-400 bg-red-950/30 px-2">${escapeHtml(line)}</div>`;
      }
      if (line.startsWith("@@")) {
        return `<div class="text-cyan-400 bg-cyan-950/20 px-2 font-bold">${escapeHtml(line)}</div>`;
      }
      if (line.startsWith("diff ") || line.startsWith("index ")) {
        return `<div class="text-zinc-500 px-2">${escapeHtml(line)}</div>`;
      }
      return `<div class="text-zinc-400 px-2">${escapeHtml(line)}</div>`;
    }).join("");
  };

  return (
    <div class="border-t border-zinc-800/80">
      {/* Header colapsável */}
      <button
        onClick={() => {
          props.onToggle();
          if (!props.visible) void carregar();
        }}
        class="w-full h-9 px-3 flex items-center justify-between text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 transition-colors"
      >
        <div class="flex items-center gap-2">
          <History size={13} class="text-purple-400" />
          <span class="uppercase tracking-wider text-[10px]">Versões & Git</span>
          <Show when={commits().length > 0}>
            <span class="px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[9px] font-mono">
              {commits().length}
            </span>
          </Show>
        </div>
        <div class="flex items-center gap-1.5">
          <Show when={props.visible}>
            <IconButton
              size="xs"
              variant="ghost"
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                void carregar();
              }}
              title="Atualizar histórico"
            >
              <RefreshCw size={11} class={carregando() ? "animate-spin" : ""} />
            </IconButton>
          </Show>
          {props.visible ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
      </button>

      {/* Conteúdo */}
      {/* Conteúdo */}
      <Show when={props.visible}>
        <div class="max-h-[340px] overflow-y-auto scrollbar-thin bg-zinc-950/50">
          {/* Barra de Branch e Status Resumido */}
          <div class="px-3 py-1.5 bg-zinc-900/70 border-b border-zinc-800/70 flex items-center justify-between text-[10px]">
            <div class="flex items-center gap-1.5 text-zinc-400">
              <GitBranch size={11} class="text-emerald-400" />
              <span>branch:</span>
              <span class="font-mono text-zinc-200 font-bold">{statusWorkingTree()?.branch || "main"}</span>
            </div>
            <Show when={statusWorkingTree() && !statusWorkingTree()?.limpo}>
              <span class="px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-300 font-mono text-[9px] border border-amber-800/40">
                {statusWorkingTree()?.arquivos.length} pendente(s)
              </span>
            </Show>
          </div>

          {/* Seção de Modificações Atuais (Working Tree) */}
          <Show when={statusWorkingTree() && !statusWorkingTree()?.limpo}>
            <div class="border-b border-zinc-800/80 bg-zinc-900/20">
              <div class="px-3 py-1 text-[10px] font-bold text-amber-400/90 uppercase tracking-wider bg-amber-950/20 border-b border-amber-900/20 flex items-center justify-between">
                <span>Alterações Locais (Working Tree)</span>
                <span class="text-[9px] font-mono text-zinc-500 font-normal">não salvas</span>
              </div>
              <For each={statusWorkingTree()?.arquivos}>
                {(arq) => (
                  <div class="border-b border-zinc-800/30 last:border-0">
                    <div class="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-900/60 transition-colors text-[11px] group">
                      <span class={`px-1 rounded text-[9px] font-mono uppercase font-bold flex-shrink-0 ${
                        arq.status === "untracked"
                          ? "bg-cyan-950/60 text-cyan-400 border border-cyan-800/50"
                          : arq.status === "deletado"
                            ? "bg-red-950/60 text-red-400 border border-red-800/50"
                            : arq.status === "adicionado"
                              ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/50"
                              : "bg-amber-950/60 text-amber-400 border border-amber-800/50"
                      }`}>
                        {arq.status === "untracked" ? "novo" : arq.status.slice(0, 3)}
                      </span>
                      <span class="font-mono text-zinc-300 truncate flex-1 min-w-0" title={arq.caminho}>
                        {arq.caminho}
                      </span>
                      <div class="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => verDiffArquivo(arq.caminho)}
                          class={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition-colors ${
                            diffArquivoAberto() === arq.caminho
                              ? "bg-cyan-950/60 text-cyan-300 border-cyan-700/60"
                              : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800"
                          }`}
                          title="Ver diff deste arquivo"
                        >
                          diff
                        </button>
                        <button
                          onClick={() => restaurarArquivoCirurgico(arq.caminho)}
                          disabled={arquivoEmAcao() === arq.caminho}
                          class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-900 text-zinc-400 hover:text-amber-300 hover:bg-amber-950/40 border border-zinc-800 hover:border-amber-700/50 transition-colors"
                          title="Descartar alterações deste arquivo"
                        >
                          <RotateCcw size={9} class="inline mr-0.5" />
                          descartar
                        </button>
                        <Show when={commits().length > 0}>
                          <select
                            class="px-1 py-0.5 rounded text-[9px] font-mono bg-zinc-900 text-zinc-400 border border-zinc-800 max-w-[110px]"
                            title="Restaurar este arquivo para um commit específico"
                            value={restaurarCommit()[arq.caminho] || ""}
                            onChange={(e) => {
                              const h = e.currentTarget.value;
                              if (h) {
                                setRestaurarCommit((p) => ({ ...p, [arq.caminho]: "" }));
                                void restaurarArquivoCirurgico(arq.caminho, h);
                              }
                            }}
                          >
                            <option value="">⇄ commit…</option>
                            <For each={commits().slice(0, 10)}>
                              {(c) => <option value={c.hash}>{c.hashCurto} · {c.mensagem.slice(0, 24)}</option>}
                            </For>
                          </select>
                        </Show>
                      </div>
                    </div>
                    {/* Diff do arquivo específico */}
                    <Show when={diffArquivoAberto() === arq.caminho}>
                      <div class="bg-zinc-950 border-t border-zinc-800/40 max-h-[140px] overflow-auto scrollbar-thin">
                        <Show
                          when={!carregandoDiffArquivo()}
                          fallback={<div class="p-2 text-[10px] text-zinc-500 text-center">Carregando diff...</div>}
                        >
                          <pre class="text-[9px] font-mono leading-relaxed py-1" innerHTML={renderDiffColorido(diffArquivoConteudo())} />
                        </Show>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Seção de Checkpoints pre-execução */}
          <Show when={checkpoints().length > 0}>
            <div class="border-b border-zinc-800/80 bg-purple-950/10">
              <div class="px-3 py-1 text-[10px] font-bold text-purple-300/90 uppercase tracking-wider border-b border-purple-900/20">
                Checkpoints ({checkpoints().length})
              </div>
              <For each={checkpoints().slice(0, 8)}>
                {(cp) => (
                  <div class="flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono hover:bg-zinc-900/60">
                    <span class="text-purple-400 truncate flex-1" title={cp.tag}>{cp.tag}</span>
                    <span class="text-zinc-500">{cp.hash}</span>
                    <button
                      onClick={() => confirmarRollback(cp.tag)}
                      disabled={revertendo()}
                      class="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 hover:text-amber-300 border border-zinc-800"
                      title="Reverter para este checkpoint"
                    >
                      {rollbackAlvo() === cp.tag ? "Confirmar?" : "Reverter"}
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show
            when={commits().length > 0}
            fallback={
              <div class="p-4 text-center text-[11px] text-zinc-500">
                {carregando()
                  ? "Carregando histórico..."
                  : "Nenhum commit encontrado. Use 'oc workspace git init' para iniciar."}
              </div>
            }
          >
            <For each={commits()}>
              {(commit, idx) => (
                <div class="border-b border-zinc-800/40 last:border-0">
                  {/* Linha do commit */}
                  <div class="flex items-center gap-2 px-3 py-2 hover:bg-zinc-900/50 transition-colors group">
                    {/* Ícone de timeline */}
                    <div class="flex-shrink-0 relative">
                      <div class={`h-6 w-6 rounded-full border-2 flex items-center justify-center ${
                        idx() === 0
                          ? "border-emerald-500/60 bg-emerald-950/40 text-emerald-400"
                          : "border-zinc-700 bg-zinc-900 text-zinc-500"
                      }`}>
                        <GitCommitHorizontal size={11} />
                      </div>
                    </div>

                    {/* Info */}
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 text-[11px]">
                        <span class="font-mono font-bold text-amber-400">{commit.hashCurto}</span>
                        <span class="text-zinc-500">·</span>
                        <span class="font-semibold text-zinc-300 truncate max-w-[200px]">
                          {commit.mensagem}
                        </span>
                      </div>
                      <div class="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                        <span class="font-mono text-purple-400/70">@{commit.autor}</span>
                        <span>·</span>
                        <span>{formatarData(commit.data)}</span>
                      </div>
                    </div>

                    {/* Ações */}
                    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => verDiff(commit.hash)}
                        class={`px-2 py-1 rounded text-[10px] font-mono transition-colors border ${
                          diffAberto() === commit.hash
                            ? "bg-cyan-950/50 text-cyan-300 border-cyan-700/50"
                            : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800 hover:border-zinc-700"
                        }`}
                        title="Ver diff"
                      >
                        <Eye size={10} class="inline mr-0.5" />
                        diff
                      </button>
                      <button
                        onClick={() => confirmarRollback(commit.hash)}
                        disabled={revertendo()}
                        class={`px-2 py-1 rounded text-[10px] font-mono transition-colors border ${
                          rollbackAlvo() === commit.hash
                            ? "bg-red-950/50 text-red-300 border-red-700/50 animate-pulse"
                            : "bg-zinc-900 text-zinc-400 hover:text-amber-300 border-zinc-800 hover:border-amber-700/50"
                        }`}
                        title={rollbackAlvo() === commit.hash ? "Clique novamente para confirmar" : "Reverter para esta versão"}
                      >
                        <Show
                          when={rollbackAlvo() !== commit.hash}
                          fallback={
                            <>
                              <AlertTriangle size={10} class="inline mr-0.5" />
                              Confirmar?
                            </>
                          }
                        >
                          <RotateCcw size={10} class="inline mr-0.5" />
                          Reverter
                        </Show>
                      </button>
                    </div>
                  </div>

                  {/* Diff expandido */}
                  <Show when={diffAberto() === commit.hash}>
                    <div class="border-t border-zinc-800/40 bg-zinc-950 max-h-[200px] overflow-auto scrollbar-thin">
                      <Show
                        when={!carregandoDiff()}
                        fallback={
                          <div class="p-3 text-[11px] text-zinc-500 text-center">
                            Carregando diff...
                          </div>
                        }
                      >
                        <pre
                          class="text-[10px] font-mono leading-relaxed py-2"
                          innerHTML={renderDiffColorido(diffConteudo())}
                        />
                      </Show>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
