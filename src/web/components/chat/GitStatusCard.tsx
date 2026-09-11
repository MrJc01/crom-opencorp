import { type Component, createSignal, For, Show } from "solid-js";
import {
  FolderGit2,
  FileCode,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  Trash2,
  ExternalLink,
} from "lucide-solid";
import { showToast } from "../../ui/Toast";
import { fetchApi, wsAtivo } from "../../lib/context";
import type { GitStatusPayload, GitArquivoCard, GitDiffPayload } from "./types";

export interface GitStatusCardProps {
  status: GitStatusPayload;
  onAtualizarStatus?: () => void;
}

export const GitStatusCard: Component<GitStatusCardProps> = (props) => {
  const [arquivos, setArquivos] = createSignal<GitArquivoCard[]>(props.status.arquivos || []);
  const [arquivoDiffAberto, setArquivoDiffAberto] = createSignal<string | null>(null);
  const [diffConteudo, setDiffConteudo] = createSignal<string>("");
  const [carregandoDiff, setCarregandoDiff] = createSignal(false);
  const [processandoArquivo, setProcessandoArquivo] = createSignal<string | null>(null);
  const [confirmandoDescarte, setConfirmandoDescarte] = createSignal<string | null>(null);

  const carregarDiff = async (caminho: string) => {
    if (arquivoDiffAberto() === caminho) {
      setArquivoDiffAberto(null);
      return;
    }
    setArquivoDiffAberto(caminho);
    setCarregandoDiff(true);
    setDiffConteudo("");
    try {
      const ws = props.status.workspace || wsAtivo();
      const res = await fetchApi<{ ok?: boolean; diff?: string }>(
        `/workspaces/git/diff?workspace=${encodeURIComponent(ws)}&arquivo=${encodeURIComponent(caminho)}`
      );
      setDiffConteudo(res?.diff || "(Nenhuma alteração detectada)");
    } catch (err: any) {
      setDiffConteudo(`Erro ao carregar diff: ${err.message || String(err)}`);
    } finally {
      setCarregandoDiff(false);
    }
  };

  const descartarArquivo = async (caminho: string) => {
    setProcessandoArquivo(caminho);
    try {
      const ws = props.status.workspace || wsAtivo();
      const res = await fetchApi<{ ok?: boolean; erro?: string; mensagem?: string }>(
        `/workspaces/git/restore?workspace=${encodeURIComponent(ws)}`,
        {
          method: "POST",
          body: JSON.stringify({ arquivo: caminho }),
        }
      );

      if (res && res.ok === false) {
        showToast(res.erro || "Falha ao descartar arquivo", "erro");
        return;
      }

      showToast(`Alterações de "${caminho}" descartadas com sucesso`, "sucesso");
      setArquivos((prev) => prev.filter((a) => a.arquivo !== caminho));
      if (arquivoDiffAberto() === caminho) {
        setArquivoDiffAberto(null);
      }
      setConfirmandoDescarte(null);
      props.onAtualizarStatus?.();
    } catch (err: any) {
      showToast(`Erro ao descartar: ${err.message || String(err)}`, "erro");
    } finally {
      setProcessandoArquivo(null);
    }
  };

  const descartarTodos = async () => {
    if (!confirm("Tem certeza que deseja descartar TODAS as alterações não comitadas neste workspace?")) return;
    setProcessandoArquivo("TODOS");
    try {
      const ws = props.status.workspace || wsAtivo();
      const res = await fetchApi<{ ok?: boolean; erro?: string }>(
        `/workspaces/git/restore?workspace=${encodeURIComponent(ws)}`,
        {
          method: "POST",
          body: JSON.stringify({ descartarTudo: true }),
        }
      );

      if (res && res.ok === false) {
        showToast(res.erro || "Falha ao descartar todas as alterações", "erro");
        return;
      }

      showToast("Todas as alterações não comitadas foram descartadas", "sucesso");
      setArquivos([]);
      setArquivoDiffAberto(null);
      props.onAtualizarStatus?.();
    } catch (err: any) {
      showToast(`Erro ao descartar: ${err.message || String(err)}`, "erro");
    } finally {
      setProcessandoArquivo(null);
    }
  };

  const badgeStatus = (st: string) => {
    const s = st.trim().toUpperCase();
    if (s === "M") {
      return { rotulo: "M", cor: "bg-amber-950/60 text-amber-300 border-amber-800/60", desc: "Modificado" };
    }
    if (s === "?" || s === "A") {
      return { rotulo: s === "?" ? "?" : "A", cor: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60", desc: "Novo" };
    }
    if (s === "D") {
      return { rotulo: "D", cor: "bg-rose-950/60 text-rose-300 border-rose-800/60", desc: "Removido" };
    }
    return { rotulo: s || "M", cor: "bg-zinc-800 text-zinc-300 border-zinc-700", desc: "Alterado" };
  };

  return (
    <div class="my-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/90 shadow-md overflow-hidden text-xs">
      {/* Cabeçalho do Card */}
      <div class="flex items-center justify-between px-3.5 py-2.5 bg-zinc-900 border-b border-zinc-800/70 select-none">
        <div class="flex items-center gap-2">
          <div class="p-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <FolderGit2 size={14} />
          </div>
          <span class="font-semibold text-zinc-200">Git Status</span>
          <span class="text-zinc-500 font-mono text-[11px]">
            ({props.status.workspace || wsAtivo()})
          </span>
        </div>

        <div class="flex items-center gap-2">
          <Show
            when={arquivos().length > 0}
            fallback={
              <span class="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                <CheckCircle2 size={13} />
                Limpo (0 pendências)
              </span>
            }
          >
            <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono">
              {arquivos().length} arquivo(s)
            </span>
            <button
              type="button"
              onClick={descartarTodos}
              disabled={processandoArquivo() === "TODOS"}
              class="text-[11px] text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-1 font-medium"
              title="Descartar todas as alterações não comitadas"
            >
              <Trash2 size={12} />
              <span>Descartar Tudo</span>
            </button>
          </Show>
        </div>
      </div>

      {/* Lista de Arquivos */}
      <div class="p-2.5 space-y-1.5">
        <Show
          when={arquivos().length > 0}
          fallback={
            <div class="p-4 text-center text-zinc-400 flex flex-col items-center gap-2">
              <CheckCircle2 size={24} class="text-emerald-400/80" />
              <p class="text-xs font-medium text-zinc-300">Working tree 100% limpo!</p>
              <p class="text-[11px] text-zinc-500">Nenhuma modificação local pendente de commit ou descarte.</p>
            </div>
          }
        >
          <For each={arquivos()}>
            {(item) => {
              const b = badgeStatus(item.status);
              const estaAberto = () => arquivoDiffAberto() === item.arquivo;
              const estaProcessando = () => processandoArquivo() === item.arquivo;
              const estaConfirmando = () => confirmandoDescarte() === item.arquivo;

              return (
                <div class="rounded-lg border border-zinc-800/60 bg-zinc-950/40 overflow-hidden transition-all">
                  {/* Linha do Arquivo */}
                  <div class="flex items-center justify-between p-2 gap-2">
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        class={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${b.cor}`}
                        title={b.desc}
                      >
                        {b.rotulo}
                      </span>
                      <span class="font-mono text-zinc-200 text-xs truncate" title={item.arquivo}>
                        {item.arquivo}
                      </span>
                    </div>

                    {/* Botões de Ação */}
                    <div class="flex items-center gap-1.5 shrink-0">
                      {/* Botão Ver Diff */}
                      <button
                        type="button"
                        onClick={() => carregarDiff(item.arquivo)}
                        class={`px-2 py-1 rounded text-[11px] font-medium border flex items-center gap-1 cursor-pointer transition-all ${
                          estaAberto()
                            ? "bg-sky-950/50 border-sky-600 text-sky-300"
                            : "bg-zinc-850 hover:bg-zinc-800 border-zinc-700/80 text-zinc-300 hover:text-zinc-100"
                        }`}
                        title="Ver diff pontual do arquivo"
                      >
                        <Eye size={12} />
                        <span>Diff</span>
                        {estaAberto() ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      </button>

                      {/* Botão Descartar / Confirmar */}
                      <Show
                        when={estaConfirmando()}
                        fallback={
                          <button
                            type="button"
                            onClick={() => setConfirmandoDescarte(item.arquivo)}
                            disabled={estaProcessando()}
                            class="px-2 py-1 rounded text-[11px] font-medium border bg-zinc-850 hover:bg-rose-950/50 hover:border-rose-800/80 hover:text-rose-300 border-zinc-700/80 text-zinc-400 cursor-pointer transition-all flex items-center gap-1"
                            title="Descartar alterações deste arquivo"
                          >
                            <RotateCcw size={11} />
                            <span>Descartar</span>
                          </button>
                        }
                      >
                        <div class="flex items-center gap-1 bg-rose-950/60 border border-rose-800/80 rounded px-1.5 py-0.5">
                          <span class="text-[10px] text-rose-300 font-semibold">Certeza?</span>
                          <button
                            type="button"
                            onClick={() => descartarArquivo(item.arquivo)}
                            disabled={estaProcessando()}
                            class="text-[10px] bg-rose-700 hover:bg-rose-600 text-white font-bold px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            Sim
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmandoDescarte(null)}
                            class="text-[10px] text-zinc-400 hover:text-zinc-200 px-1 cursor-pointer"
                          >
                            Não
                          </button>
                        </div>
                      </Show>
                    </div>
                  </div>

                  {/* Painel Expansível de Diff */}
                  <Show when={estaAberto()}>
                    <div class="border-t border-zinc-800/80 bg-zinc-950 p-2.5 font-mono text-[11px] max-h-60 overflow-y-auto scrollbar-thin">
                      <Show
                        when={!carregandoDiff()}
                        fallback={
                          <div class="p-3 text-center text-zinc-400 animate-pulse">
                            Carregando diff do Git...
                          </div>
                        }
                      >
                        <For each={diffConteudo().split("\n")}>
                          {(linha) => {
                            const isHeader = linha.startsWith("diff --git") || linha.startsWith("index ") || linha.startsWith("---") || linha.startsWith("+++");
                            const isChunk = linha.startsWith("@@");
                            const isAdd = linha.startsWith("+") && !linha.startsWith("+++");
                            const isDel = linha.startsWith("-") && !linha.startsWith("---");

                            return (
                              <div
                                class={`px-1.5 py-0.5 leading-snug break-all ${
                                  isHeader
                                    ? "text-zinc-500 font-bold"
                                    : isChunk
                                    ? "text-sky-400 bg-sky-950/20 my-0.5 rounded"
                                    : isAdd
                                    ? "text-emerald-300 bg-emerald-950/30"
                                    : isDel
                                    ? "text-rose-300 bg-rose-950/30"
                                    : "text-zinc-400"
                                }`}
                              >
                                {linha || " "}
                              </div>
                            );
                          }}
                        </For>
                      </Show>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </Show>
      </div>
    </div>
  );
};

export const GitDiffViewCard: Component<{ diff: string; arquivo?: string }> = (props) => {
  return (
    <div class="my-2.5 rounded-xl border border-zinc-800/80 bg-zinc-950 overflow-hidden text-xs">
      <div class="flex items-center justify-between px-3.5 py-2 bg-zinc-900 border-b border-zinc-800/70 select-none">
        <div class="flex items-center gap-2">
          <FileCode size={14} class="text-sky-400" />
          <span class="font-semibold text-zinc-200">
            {props.arquivo ? `Git Diff: ${props.arquivo}` : "Git Diff Unificado"}
          </span>
        </div>
      </div>
      <div class="p-3 font-mono text-[11px] max-h-72 overflow-y-auto scrollbar-thin space-y-0.5">
        <For each={props.diff.split("\n")}>
          {(linha) => {
            const isHeader = linha.startsWith("diff --git") || linha.startsWith("index ") || linha.startsWith("---") || linha.startsWith("+++");
            const isChunk = linha.startsWith("@@");
            const isAdd = linha.startsWith("+") && !linha.startsWith("+++");
            const isDel = linha.startsWith("-") && !linha.startsWith("---");

            return (
              <div
                class={`px-1.5 py-0.5 leading-snug break-all ${
                  isHeader
                    ? "text-zinc-500 font-bold"
                    : isChunk
                    ? "text-sky-400 bg-sky-950/20 my-0.5 rounded"
                    : isAdd
                    ? "text-emerald-300 bg-emerald-950/30"
                    : isDel
                    ? "text-rose-300 bg-rose-950/30"
                    : "text-zinc-400"
                }`}
              >
                {linha || " "}
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
};
