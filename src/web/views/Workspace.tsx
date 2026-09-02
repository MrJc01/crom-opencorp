import {
  type Component,
  createSignal,
  onMount,
  createEffect,
  For,
  Show,
  createMemo,
} from "solid-js";
import { useSearchParams } from "@solidjs/router";
import {
  Folder,
  FileText,
  Terminal,
  Save,
  Play,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  X,
  Plus,
  Trash2,
  Columns,
  Eye,
  Edit3,
  Search,
  Check,
} from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export interface NoArvoreWeb {
  nome: string;
  caminho: string;
  tipo: "dir" | "arquivo";
  tamanho?: number;
  filhos?: NoArvoreWeb[];
}

export interface TabArquivo {
  caminho: string;
  nome: string;
  original: string;
  editado: string;
  modo: "editor" | "preview" | "split";
}

export interface TabTerminal {
  id: string;
  nome: string;
  log: string;
  historico: string[];
  histIdx: number;
}

export const WorkspaceView: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Árvore e arquivos
  const [arvore, setArvore] = createSignal<NoArvoreWeb[]>([]);
  const [carregandoArvore, setCarregandoArvore] = createSignal(false);
  const [expandidos, setExpandidos] = createSignal<Set<string>>(new Set());

  // Tabs de Arquivos (estilo VS Code)
  const [tabs, setTabs] = createSignal<TabArquivo[]>([]);
  const [tabAtiva, setTabAtiva] = createSignal<string | null>(null);
  const [salvando, setSalvando] = createSignal(false);

  // Busca rápida (Ctrl+P)
  const [buscaAberta, setBuscaAberta] = createSignal(false);
  const [buscaTexto, setBuscaTexto] = createSignal("");

  // Terminais (máx 4)
  const [terminais, setTerminais] = createSignal<TabTerminal[]>([
    {
      id: "term-1",
      nome: "Terminal 1",
      log: "opencorp workspace shell v0.7.0 — digite comandos (ex: tasks list, doctor, flow list)\n",
      historico: [],
      histIdx: -1,
    },
  ]);
  const [terminalAtivo, setTerminalAtivo] = createSignal("term-1");
  const [terminalInput, setTerminalInput] = createSignal("");
  const [rodandoCmd, setRodandoCmd] = createSignal(false);

  let termLogRef: HTMLPreElement | undefined;

  const tabAtual = createMemo(() => tabs().find((t) => t.caminho === tabAtiva()) ?? null);

  const carregarArvore = async () => {
    setCarregandoArvore(true);
    try {
      const data = await fetchApi<{ arvore: NoArvoreWeb[] }>("/files/tree?profundidade=6");
      const list = data.arvore || [];
      setArvore(list);
    } catch {
      setArvore([]);
    } finally {
      setCarregandoArvore(false);
    }
  };

  const alternarDir = (caminho: string) => {
    const s = new Set(expandidos());
    if (s.has(caminho)) s.delete(caminho);
    else s.add(caminho);
    setExpandidos(s);
  };

  const abrirArquivo = async (caminho: string) => {
    if (!caminho) return;

    // Se já estiver aberto nas tabs, foca nela
    const jaAberta = tabs().find((t) => t.caminho === caminho);
    if (jaAberta) {
      setTabAtiva(caminho);
      setSearchParams({ file: caminho });
      return;
    }

    try {
      const resp = await fetchApi<any>(`/files?path=${encodeURIComponent(caminho)}`);
      let conteudoStr = "";
      if (typeof resp === "string") {
        conteudoStr = resp;
      } else if (resp && typeof resp.conteudo === "string") {
        conteudoStr = resp.conteudo;
      } else {
        conteudoStr = JSON.stringify(resp, null, 2);
      }
      const nome = caminho.split("/").pop() ?? caminho;
      const modoPadrao = caminho.endsWith(".md") ? "preview" : "editor";

      const novaTab: TabArquivo = {
        caminho,
        nome,
        original: conteudoStr,
        editado: conteudoStr,
        modo: modoPadrao,
      };

      setTabs((prev) => [...prev, novaTab]);
      setTabAtiva(caminho);
      setSearchParams({ file: caminho });
    } catch (err: any) {
      showToast(`Erro ao abrir ${caminho}: ${err.message}`, "erro");
    }
  };

  const fecharTab = (caminho: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    const t = tabs().find((x) => x.caminho === caminho);
    if (t && t.editado !== t.original) {
      if (!confirm(`O arquivo "${t.nome}" tem alterações não salvas. Fechar mesmo assim?`)) {
        return;
      }
    }

    const idx = tabs().findIndex((x) => x.caminho === caminho);
    const rest = tabs().filter((x) => x.caminho !== caminho);
    setTabs(rest);

    if (tabAtiva() === caminho) {
      const proxima = rest[Math.min(idx, rest.length - 1)]?.caminho ?? null;
      setTabAtiva(proxima);
      setSearchParams({ file: proxima || undefined });
    }
  };

  const atualizarConteudo = (valor: string) => {
    const ativa = tabAtiva();
    if (!ativa) return;
    setTabs((prev) =>
      prev.map((t) => (t.caminho === ativa ? { ...t, editado: valor } : t))
    );
  };

  const alternarModoTab = (modo: "editor" | "preview" | "split") => {
    const ativa = tabAtiva();
    if (!ativa) return;
    setTabs((prev) =>
      prev.map((t) => (t.caminho === ativa ? { ...t, modo } : t))
    );
  };

  const salvarTabAtiva = async () => {
    const t = tabAtual();
    if (!t) return;
    setSalvando(true);
    try {
      await fetchApi("/files", {
        method: "PUT",
        body: JSON.stringify({ path: t.caminho, conteudo: t.editado }),
      });
      setTabs((prev) =>
        prev.map((item) => (item.caminho === t.caminho ? { ...item, original: t.editado } : item))
      );
      showToast(`Arquivo "${t.nome}" salvo!`, "sucesso");
    } catch (err: any) {
      showToast(`Erro ao salvar: ${err.message}`, "erro");
    } finally {
      setSalvando(false);
    }
  };

  // Coleta recursiva de caminhos de arquivos para o Ctrl+P
  const todosArquivos = createMemo(() => {
    const list: string[] = [];
    const rec = (nos: NoArvoreWeb[]) => {
      for (const n of nos) {
        if (n.tipo === "arquivo") list.push(n.caminho);
        if (n.filhos && n.filhos.length) rec(n.filhos);
      }
    };
    rec(arvore());
    return list;
  });

  const arquivosFiltradosBusca = createMemo(() => {
    const q = buscaTexto().trim().toLowerCase();
    if (!q) return todosArquivos().slice(0, 15);
    return todosArquivos()
      .filter((p) => p.toLowerCase().includes(q))
      .slice(0, 15);
  });

  // Terminais
  const criarTerminal = () => {
    if (terminais().length >= 4) {
      showToast("Limite máximo de 4 terminais atingido", "aviso");
      return;
    }
    const id = `term-${Date.now().toString(36).slice(-3)}`;
    const nome = `Terminal ${terminais().length + 1}`;
    const novo: TabTerminal = {
      id,
      nome,
      log: `opencorp shell (${nome}) inicializado\n`,
      historico: [],
      histIdx: -1,
    };
    setTerminais((prev) => [...prev, novo]);
    setTerminalAtivo(id);
  };

  const limparTerminalAtivo = () => {
    const id = terminalAtivo();
    setTerminais((prev) =>
      prev.map((t) => (t.id === id ? { ...t, log: "" } : t))
    );
  };

  const rodarTerminal = async () => {
    const cmd = terminalInput().trim();
    if (!cmd) return;
    setTerminalInput("");
    setRodandoCmd(true);

    const tid = terminalAtivo();
    setTerminais((prev) =>
      prev.map((t) =>
        t.id === tid
          ? {
              ...t,
              log: t.log + `\nws$ ${cmd}\n`,
              historico: [...t.historico, cmd],
              histIdx: t.historico.length + 1,
            }
          : t
      )
    );

    try {
      const res = await fetchApi<{ saida?: string; erro?: string; codigo?: number }>("/terminal", {
        method: "POST",
        body: JSON.stringify({ comando: cmd }),
      });
      const saida = res.saida || res.erro || "(sem saída)";
      setTerminais((prev) =>
        prev.map((t) =>
          t.id === tid
            ? { ...t, log: t.log + saida + `\n[${res.codigo === 0 ? "ok" : "código " + res.codigo}]\n` }
            : t
        )
      );
    } catch (err: any) {
      setTerminais((prev) =>
        prev.map((t) => (t.id === tid ? { ...t, log: t.log + `erro: ${err.message}\n` } : t))
      );
    } finally {
      setRodandoCmd(false);
      setTimeout(() => {
        if (termLogRef) termLogRef.scrollTop = termLogRef.scrollHeight;
      }, 50);
    }
  };

  // Teclas de atalho (Ctrl+S para salvar, Ctrl+P para buscar arquivos)
  const onKeyDownGlobal = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void salvarTabAtiva();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
      e.preventDefault();
      setBuscaAberta(true);
    } else if (e.key === "Escape" && buscaAberta()) {
      setBuscaAberta(false);
    }
  };

  onMount(() => {
    void carregarArvore();
    document.addEventListener("keydown", onKeyDownGlobal);

    const urlFile = searchParams.file as string | undefined;
    if (urlFile) {
      void abrirArquivo(urlFile);
    }
  });

  return (
    <div class="flex h-full w-full overflow-hidden bg-zinc-950 font-sans select-none">
      {/* ─────────────────────────────────────────────────────────────
          ÁRVORE DE ARQUIVOS (Explorer lateral esquerdo estilo VS Code)
         ───────────────────────────────────────────────────────────── */}
      <div class="w-64 border-r border-zinc-800/80 bg-zinc-950 flex flex-col flex-shrink-0">
        <div class="h-10 px-3 border-b border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
          <span class="font-bold uppercase tracking-wider text-[11px] text-zinc-300">
            Explorador
          </span>
          <div class="flex items-center gap-1">
            <IconButton
              size="xs"
              variant="ghost"
              onClick={() => setBuscaAberta(true)}
              title="Buscar arquivo (Ctrl+P)"
            >
              <Search size={13} />
            </IconButton>
            <IconButton
              size="xs"
              variant="ghost"
              onClick={carregarArvore}
              title="Atualizar árvore"
            >
              <RefreshCw size={12} class={carregandoArvore() ? "animate-spin" : ""} />
            </IconButton>
          </div>
        </div>

        {/* Lista da Árvore Recursiva */}
        <div class="flex-1 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin">
          <For
            each={arvore()}
            fallback={
              <div class="p-4 text-center text-xs text-zinc-500">
                {carregandoArvore() ? "Indexando arquivos..." : "Nenhum arquivo no workspace."}
              </div>
            }
          >
            {(no) => <RenderNoArvore no={no} nivel={0} onAbrir={abrirArquivo} onToggle={alternarDir} expandidos={expandidos()} />}
          </For>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          ÁREA CENTRAL: TABS DE ARQUIVOS + EDITOR/PREVIEW + TERMINAIS
         ───────────────────────────────────────────────────────────── */}
      <div class="flex-1 flex flex-col min-w-0 overflow-hidden bg-zinc-900/30">
        {/* Barra de Tabs estilo VS Code */}
        <div class="h-10 border-b border-zinc-800/80 bg-zinc-950 flex items-center overflow-x-auto px-1 scrollbar-none">
          <For
            each={tabs()}
            fallback={
              <div class="px-3 text-xs text-zinc-500 italic">
                Nenhum arquivo aberto. Selecione um arquivo na árvore ou use Ctrl+P.
              </div>
            }
          >
            {(t) => {
              const ativa = () => tabAtiva() === t.caminho;
              const suja = () => t.editado !== t.original;

              return (
                <div
                  onClick={() => {
                    setTabAtiva(t.caminho);
                    setSearchParams({ file: t.caminho });
                  }}
                  class={`h-8 px-3 rounded-t flex items-center gap-2 text-xs font-mono cursor-pointer transition-all border-r border-zinc-800/60 flex-shrink-0 ${
                    ativa()
                      ? "bg-zinc-900 text-zinc-100 border-t-2 border-t-orange-500 font-semibold"
                      : "text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200"
                  }`}
                >
                  <FileText size={13} class="text-zinc-400 flex-shrink-0" />
                  <span class="truncate max-w-[140px]">
                    {suja() ? "● " : ""}
                    {t.nome}
                  </span>
                  <span
                    onClick={(e) => fecharTab(t.caminho, e)}
                    class="p-0.5 rounded hover:bg-zinc-800 hover:text-rose-400 text-zinc-500 ml-1"
                    title="Fechar aba"
                  >
                    <X size={12} />
                  </span>
                </div>
              );
            }}
          </For>
        </div>

        {/* Sub-header com Ações do Arquivo Ativo (Salvar, Modos Editor/Preview/Split) */}
        <Show when={tabAtual()}>
          <div class="h-9 px-3 border-b border-zinc-800/60 bg-zinc-900/40 flex items-center justify-between text-xs">
            <div class="flex items-center gap-2 text-zinc-400 font-mono text-[11px] truncate min-w-0">
              <Show when={tabAtual()!.editado !== tabAtual()!.original}>
                <span class="text-amber-400 font-bold" title="Alterações não salvas">● não salvo</span>
              </Show>
              <span class="truncate">{tabAtual()!.caminho}</span>
            </div>

            <div class="flex items-center gap-1.5 flex-shrink-0">
              <Show when={tabAtual()!.caminho.endsWith(".md")}>
                <div class="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-[11px]">
                  <button
                    onClick={() => alternarModoTab("editor")}
                    class={`px-2 py-0.5 rounded transition-colors ${
                      tabAtual()!.modo === "editor" ? "bg-zinc-800 text-zinc-100 font-bold" : "text-zinc-400"
                    }`}
                  >
                    Editor
                  </button>
                  <button
                    onClick={() => alternarModoTab("preview")}
                    class={`px-2 py-0.5 rounded transition-colors ${
                      tabAtual()!.modo === "preview" ? "bg-zinc-800 text-zinc-100 font-bold" : "text-zinc-400"
                    }`}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => alternarModoTab("split")}
                    class={`px-2 py-0.5 rounded transition-colors ${
                      tabAtual()!.modo === "split" ? "bg-zinc-800 text-zinc-100 font-bold" : "text-zinc-400"
                    }`}
                  >
                    Split
                  </button>
                </div>
              </Show>

              <Button
                size="xs"
                variant="primary"
                loading={salvando()}
                onClick={salvarTabAtiva}
                disabled={tabAtual()!.editado === tabAtual()!.original}
                class="text-[11px] bg-orange-600 hover:bg-orange-500 text-white font-bold"
              >
                <Save size={12} class="mr-1" /> Salvar (Ctrl+S)
              </Button>
            </div>
          </div>
        </Show>

        {/* Corpo do Arquivo (Editor / Preview / Split) */}
        <div class="flex-1 overflow-hidden relative bg-zinc-950">
          <Show
            when={tabAtual()}
            fallback={
              <div class="flex flex-col items-center justify-center h-full text-zinc-500 text-xs space-y-2">
                <FileText size={32} class="opacity-30" />
                <p>Nenhum arquivo em edição.</p>
                <span class="text-[11px] text-zinc-600 font-mono">Dica: pressione Ctrl+P para busca rápida de arquivos</span>
              </div>
            }
          >
            <Show
              when={tabAtual()!.modo === "split"}
              fallback={
                <Show
                  when={tabAtual()!.modo === "editor"}
                  fallback={
                    <div class="p-6 overflow-y-auto h-full text-sm text-zinc-200 leading-relaxed font-sans whitespace-pre-wrap select-text scrollbar-thin">
                      {tabAtual()!.editado}
                    </div>
                  }
                >
                  <textarea
                    value={tabAtual()!.editado}
                    onInput={(e) => atualizarConteudo(e.currentTarget.value)}
                    class="w-full h-full bg-zinc-950 p-4 text-xs font-mono text-zinc-200 resize-none focus:outline-none scrollbar-thin leading-relaxed"
                    spellcheck={false}
                  />
                </Show>
              }
            >
              {/* Modo Split (Lado a Lado) */}
              <div class="grid grid-cols-2 h-full w-full divide-x divide-zinc-800">
                <textarea
                  value={tabAtual()!.editado}
                  onInput={(e) => atualizarConteudo(e.currentTarget.value)}
                  class="w-full h-full bg-zinc-950 p-4 text-xs font-mono text-zinc-200 resize-none focus:outline-none scrollbar-thin leading-relaxed"
                  spellcheck={false}
                />
                <div class="p-6 overflow-y-auto h-full text-sm text-zinc-200 leading-relaxed font-sans whitespace-pre-wrap select-text scrollbar-thin bg-zinc-900/20">
                  {tabAtual()!.editado}
                </div>
              </div>
            </Show>
          </Show>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            PAINEL DE TERMINAIS VS CODE (Terminais em abas, máx 4)
           ───────────────────────────────────────────────────────────── */}
        <div class="h-52 border-t border-zinc-800/80 bg-zinc-950 flex flex-col flex-shrink-0">
          <div class="h-8 px-3 border-b border-zinc-800/80 bg-zinc-900/80 flex items-center justify-between text-xs">
            <div class="flex items-center gap-1">
              <span class="font-bold uppercase tracking-wider text-[10px] text-zinc-400 mr-2 flex items-center gap-1">
                <Terminal size={12} class="text-orange-400" /> Terminal
              </span>

              <For each={terminais()}>
                {(t) => (
                  <button
                    onClick={() => setTerminalAtivo(t.id)}
                    class={`px-2.5 py-0.5 rounded text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer ${
                      terminalAtivo() === t.id
                        ? "bg-zinc-800 text-zinc-100 font-bold border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {t.nome}
                  </button>
                )}
              </For>
            </div>

            <div class="flex items-center gap-1">
              <Button size="xs" variant="ghost" onClick={limparTerminalAtivo} title="Limpar log">
                Limpar
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={criarTerminal}
                disabled={terminais().length >= 4}
                title="Novo terminal (máx 4)"
              >
                <Plus size={12} class="mr-1" /> Terminal
              </Button>
            </div>
          </div>

          {/* Log do Terminal Ativo */}
          <pre
            ref={termLogRef}
            class="flex-1 overflow-y-auto p-3 text-xs font-mono text-emerald-400 bg-black/80 whitespace-pre-wrap scrollbar-thin select-text leading-relaxed"
          >
            {terminais().find((t) => t.id === terminalAtivo())?.log}
          </pre>

          {/* Linha de Prompt */}
          <div class="h-9 px-3 border-t border-zinc-800/80 flex items-center gap-2 bg-zinc-950">
            <span class="text-xs font-mono text-orange-400 font-bold">ws$</span>
            <input
              type="text"
              placeholder="digite um comando opencorp (ex: tasks list, doctor, flow run ceo-analise-board)..."
              value={terminalInput()}
              onInput={(e) => setTerminalInput(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && rodarTerminal()}
              class="flex-1 bg-transparent text-xs font-mono text-zinc-100 focus:outline-none"
            />
            <Button
              size="xs"
              variant="ghost"
              loading={rodandoCmd()}
              onClick={rodarTerminal}
              title="Executar comando"
            >
              <Play size={11} class="fill-current text-orange-400" />
            </Button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MODAL DE BUSCA RÁPIDA (Ctrl+P)
         ───────────────────────────────────────────────────────────── */}
      <Show when={buscaAberta()}>
        <div class="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-20 p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-3 shadow-2xl space-y-2">
            <div class="relative">
              <Search size={14} class="absolute left-3 top-2.5 text-zinc-500" />
              <input
                type="text"
                autofocus
                placeholder="Buscar arquivo no workspace... (Enter para abrir, Esc para fechar)"
                value={buscaTexto()}
                onInput={(e) => setBuscaTexto(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setBuscaAberta(false);
                  else if (e.key === "Enter" && arquivosFiltradosBusca().length > 0) {
                    void abrirArquivo(arquivosFiltradosBusca()[0]);
                    setBuscaAberta(false);
                    setBuscaTexto("");
                  }
                }}
                class="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div class="max-h-64 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
              <For
                each={arquivosFiltradosBusca()}
                fallback={
                  <div class="p-4 text-center text-xs text-zinc-500">
                    Nenhum arquivo encontrado para "{buscaTexto()}".
                  </div>
                }
              >
                {(path) => (
                  <div
                    onClick={() => {
                      void abrirArquivo(path);
                      setBuscaAberta(false);
                      setBuscaTexto("");
                    }}
                    class="px-3 py-2 rounded-lg hover:bg-zinc-800 flex items-center justify-between text-xs cursor-pointer font-mono text-zinc-300"
                  >
                    <div class="flex items-center gap-2 truncate">
                      <FileText size={13} class="text-zinc-500 flex-shrink-0" />
                      <span class="truncate">{path}</span>
                    </div>
                    <span class="text-[10px] text-zinc-500">abrir</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

// Componente recursivo para renderizar pastas e arquivos
const RenderNoArvore: Component<{
  no: NoArvoreWeb;
  nivel: number;
  onAbrir: (caminho: string) => void;
  onToggle: (caminho: string) => void;
  expandidos: Set<string>;
}> = (props) => {
  const isDir = () => props.no.tipo === "dir";
  const aberto = () => props.expandidos.has(props.no.caminho);

  return (
    <div>
      <div
        style={{ "padding-left": `${props.nivel * 12 + 6}px` }}
        class="flex items-center gap-1.5 py-1 px-1.5 rounded text-xs cursor-pointer hover:bg-zinc-800/60 select-none text-zinc-300 transition-colors"
        onClick={() => {
          if (isDir()) props.onToggle(props.no.caminho);
          else props.onAbrir(props.no.caminho);
        }}
      >
        <Show
          when={isDir()}
          fallback={<FileText size={13} class="text-zinc-500 flex-shrink-0" />}
        >
          <span class="text-zinc-500">
            {aberto() ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
          <Folder size={13} class="text-amber-400 flex-shrink-0" />
        </Show>
        <span class="truncate font-mono text-[11px]">{props.no.nome}</span>
      </div>

      <Show when={isDir() && aberto() && props.no.filhos}>
        <For each={props.no.filhos}>
          {(filho) => (
            <RenderNoArvore
              no={filho}
              nivel={props.nivel + 1}
              onAbrir={props.onAbrir}
              onToggle={props.onToggle}
              expandidos={props.expandidos}
            />
          )}
        </For>
      </Show>
    </div>
  );
};
