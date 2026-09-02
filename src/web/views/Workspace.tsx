import { type Component, createSignal, onMount, For, Show } from "solid-js";
import { Folder, FileText, Terminal, Save, Play, RefreshCw, ChevronRight, ChevronDown } from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export interface FileTreeNode {
  caminho: string;
  nome: string;
  tipo: "arquivo" | "pasta";
  filhos?: FileTreeNode[];
}

export const WorkspaceView: Component = () => {
  const [arvore, setArvore] = createSignal<FileTreeNode[]>([]);
  const [arquivoAtivo, setArquivoAtivo] = createSignal<string | null>(null);
  const [conteudo, setConteudo] = createSignal("");
  const [modo, setModo] = createSignal<"editor" | "preview">("editor");
  const [terminais, setTerminais] = createSignal<Array<{ id: string; titulo: string; output: string }>>([
    { id: "term-1", titulo: "Terminal 1", output: "opencorp shell v0.7.0 — digite um comando abaixo\n" },
  ]);
  const [terminalAtivo, setTerminalAtivo] = createSignal("term-1");
  const [terminalInput, setTerminalInput] = createSignal("");
  const [salvando, setSalvando] = createSignal(false);

  const carregarArvore = async () => {
    try {
      const data = await fetchApi<{ arvore: FileTreeNode[] }>("/files/tree");
      setArvore(data.arvore || []);
    } catch {
      setArvore([]);
    }
  };

  const abrirArquivo = async (caminho: string) => {
    setArquivoAtivo(caminho);
    try {
      const texto = await fetchApi<string>(`/files?path=${encodeURIComponent(caminho)}`);
      setConteudo(typeof texto === "string" ? texto : JSON.stringify(texto, null, 2));
      if (caminho.endsWith(".md")) {
        setModo("preview");
      } else {
        setModo("editor");
      }
    } catch {
      setConteudo("(falha ao carregar conteúdo do arquivo)");
    }
  };

  const salvarArquivo = async () => {
    const arq = arquivoAtivo();
    if (!arq) return;
    setSalvando(true);
    try {
      await fetchApi("/files", {
        method: "PUT",
        body: JSON.stringify({ path: arq, conteudo: conteudo() }),
      });
      showToast("Arquivo salvo com sucesso", "sucesso");
    } catch (err: any) {
      showToast("Erro ao salvar: " + err.message, "erro");
    } finally {
      setSalvando(false);
    }
  };

  const rodarTerminal = async () => {
    const cmd = terminalInput().trim();
    if (!cmd) return;
    setTerminalInput("");
    const tid = terminalAtivo();

    setTerminais((prev) =>
      prev.map((t) => (t.id === tid ? { ...t, output: t.output + `\n$ ${cmd}\n` } : t))
    );

    try {
      const res = await fetchApi<{ saida?: string; erro?: string }>("/terminal", {
        method: "POST",
        body: JSON.stringify({ comando: cmd }),
      });
      const saida = res.saida || res.erro || "(sem saída)";
      setTerminais((prev) =>
        prev.map((t) => (t.id === tid ? { ...t, output: t.output + saida + "\n" } : t))
      );
    } catch (err: any) {
      setTerminais((prev) =>
        prev.map((t) => (t.id === tid ? { ...t, output: t.output + `Erro: ${err.message}\n` } : t))
      );
    }
  };

  onMount(() => {
    void carregarArvore();
  });

  return (
    <div class="flex h-full w-full overflow-hidden bg-zinc-950 font-sans">
      {/* File Tree à esquerda */}
      <div class="w-64 border-r border-zinc-800/80 bg-zinc-950 flex flex-col flex-shrink-0">
        <div class="h-9 px-3 border-b border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400 select-none">
          <span class="font-semibold uppercase tracking-wider text-[10px]">Arquivos</span>
          <IconButton size="xs" variant="ghost" onClick={carregarArvore} title="Atualizar árvore">
            <RefreshCw size={12} />
          </IconButton>
        </div>

        <div class="flex-1 overflow-y-auto p-2 space-y-0.5 scrollbar-thin">
          <For
            each={arvore()}
            fallback={<div class="p-4 text-center text-xs text-zinc-500">Nenhum arquivo listado.</div>}
          >
            {(item) => (
              <div
                class={`flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer select-none truncate ${
                  arquivoAtivo() === item.caminho
                    ? "bg-zinc-800 text-zinc-100 font-medium"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
                onClick={() => abrirArquivo(item.caminho)}
              >
                <Show when={item.tipo === "pasta"} fallback={<FileText size={13} class="text-zinc-500 flex-shrink-0" />}>
                  <Folder size={13} class="text-amber-400 flex-shrink-0" />
                </Show>
                <span class="truncate">{item.nome}</span>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Área Central: Editor e Preview + Terminais */}
      <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar do Editor */}
        <div class="h-9 px-3 border-b border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between text-xs select-none">
          <div class="flex items-center gap-2 truncate">
            <FileText size={14} class="text-zinc-400" />
            <span class="font-medium text-zinc-200 truncate">
              {arquivoAtivo() || "Nenhum arquivo aberto"}
            </span>
          </div>

          <Show when={arquivoAtivo()}>
            <div class="flex items-center gap-1">
              <Show when={arquivoAtivo()?.endsWith(".md")}>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setModo((m) => (m === "editor" ? "preview" : "editor"))}
                >
                  {modo() === "editor" ? "Ver Preview" : "Ver Código"}
                </Button>
              </Show>
              <Button size="xs" variant="primary" loading={salvando()} onClick={salvarArquivo}>
                <Save size={12} class="mr-1" /> Salvar
              </Button>
            </div>
          </Show>
        </div>

        {/* Conteúdo: Editor ou Preview */}
        <div class="flex-1 overflow-hidden relative">
          <Show
            when={arquivoAtivo()}
            fallback={
              <div class="flex items-center justify-center h-full text-xs text-zinc-500">
                Selecione um arquivo na árvore à esquerda para editar ou visualizar.
              </div>
            }
          >
            <Show
              when={modo() === "editor"}
              fallback={
                <div class="p-6 overflow-y-auto h-full text-sm text-zinc-200 leading-relaxed font-sans whitespace-pre-wrap">
                  {conteudo()}
                </div>
              }
            >
              <textarea
                value={conteudo()}
                onInput={(e) => setConteudo(e.currentTarget.value)}
                class="w-full h-full bg-zinc-950 p-4 text-xs font-mono text-zinc-200 resize-none focus:outline-none scrollbar-thin"
              />
            </Show>
          </Show>
        </div>

        {/* Painel Inferior de Terminais em Abas */}
        <div class="h-44 border-t border-zinc-800/80 bg-zinc-950 flex flex-col flex-shrink-0">
          <div class="h-8 px-2 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between text-xs select-none">
            <div class="flex items-center gap-1">
              <For each={terminais()}>
                {(t) => (
                  <button
                    class={`px-2.5 py-1 rounded text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer ${
                      terminalAtivo() === t.id
                        ? "bg-zinc-800 text-zinc-100 font-semibold"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                    }`}
                    onClick={() => setTerminalAtivo(t.id)}
                  >
                    <Terminal size={12} /> {t.titulo}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-2 text-xs font-mono text-emerald-400 bg-zinc-950/90 whitespace-pre-wrap scrollbar-thin select-text">
            {terminais().find((t) => t.id === terminalAtivo())?.output}
          </div>

          <div class="p-1.5 border-t border-zinc-800/80 flex items-center gap-2 bg-zinc-900/40">
            <span class="text-xs font-mono text-zinc-500 pl-2">$</span>
            <input
              type="text"
              placeholder="digite um comando de terminal permitido..."
              value={terminalInput()}
              onInput={(e) => setTerminalInput(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && rodarTerminal()}
              class="flex-1 bg-transparent text-xs font-mono text-zinc-100 focus:outline-none"
            />
            <Button size="xs" variant="ghost" onClick={rodarTerminal}>
              <Play size={11} class="fill-current" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
