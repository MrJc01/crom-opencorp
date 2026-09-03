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
  FolderPlus,
  FilePlus,
  Copy,
  AlertTriangle,
} from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";
import { renderDocMarkdown } from "../lib/doc-renderer";

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

interface MenuContextoState {
  visivel: boolean;
  x: number;
  y: number;
  no: NoArvoreWeb | null;
}

interface ModalArquivoState {
  tipo: "novo_arquivo" | "nova_pasta" | "renomear" | "excluir";
  alvo: NoArvoreWeb | null;
  pastaBase: string;
  valor: string;
  aberto: boolean;
}

export const WorkspaceView: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Árvore e arquivos
  const [arvore, setArvore] = createSignal<NoArvoreWeb[]>([]);
  const [carregandoArvore, setCarregandoArvore] = createSignal(false);
  const [expandidos, setExpandidos] = createSignal<Set<string>>(new Set());

  // Menu de contexto e operações
  const [menuContexto, setMenuContexto] = createSignal<MenuContextoState>({
    visivel: false,
    x: 0,
    y: 0,
    no: null,
  });

  const [modalArquivo, setModalArquivo] = createSignal<ModalArquivoState>({
    tipo: "novo_arquivo",
    alvo: null,
    pastaBase: "",
    valor: "",
    aberto: false,
  });

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
  let modalInputRef: HTMLInputElement | undefined;

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
      prev.map((t) => (t.caminho === ativa ? { ...t, editado: valor } : t)),
    );
  };

  const alternarModoTab = (modo: "editor" | "preview" | "split") => {
    const ativa = tabAtiva();
    if (!ativa) return;
    setTabs((prev) =>
      prev.map((t) => (t.caminho === ativa ? { ...t, modo } : t)),
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
        prev.map((item) => (item.caminho === t.caminho ? { ...item, original: t.editado } : item)),
      );
      showToast(`Arquivo "${t.nome}" salvo!`, "sucesso");
    } catch (err: any) {
      showToast(`Erro ao salvar: ${err.message}`, "erro");
    } finally {
      setSalvando(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // MENU DE CONTEXTO E OPERAÇÕES DE ARQUIVO
  // ─────────────────────────────────────────────────────────────

  const abrirMenuContexto = (e: MouseEvent, no: NoArvoreWeb | null) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 240);
    setMenuContexto({ visivel: true, x, y, no });
  };

  const fecharMenuContexto = () => {
    if (menuContexto().visivel) {
      setMenuContexto((prev) => ({ ...prev, visivel: false }));
    }
  };

  const abrirModalNovoArquivo = (no?: NoArvoreWeb | null) => {
    fecharMenuContexto();
    let pastaBase = "";
    if (no) {
      pastaBase = no.tipo === "dir" ? no.caminho : no.caminho.split("/").slice(0, -1).join("/");
    }
    setModalArquivo({
      tipo: "novo_arquivo",
      alvo: no || null,
      pastaBase,
      valor: "",
      aberto: true,
    });
    setTimeout(() => modalInputRef?.focus(), 50);
  };

  const abrirModalNovaPasta = (no?: NoArvoreWeb | null) => {
    fecharMenuContexto();
    let pastaBase = "";
    if (no) {
      pastaBase = no.tipo === "dir" ? no.caminho : no.caminho.split("/").slice(0, -1).join("/");
    }
    setModalArquivo({
      tipo: "nova_pasta",
      alvo: no || null,
      pastaBase,
      valor: "",
      aberto: true,
    });
    setTimeout(() => modalInputRef?.focus(), 50);
  };

  const abrirModalRenomear = (no: NoArvoreWeb) => {
    fecharMenuContexto();
    setModalArquivo({
      tipo: "renomear",
      alvo: no,
      pastaBase: no.caminho.split("/").slice(0, -1).join("/"),
      valor: no.nome,
      aberto: true,
    });
    setTimeout(() => {
      if (modalInputRef) {
        modalInputRef.focus();
        modalInputRef.select();
      }
    }, 50);
  };

  const abrirModalExcluir = (no: NoArvoreWeb) => {
    fecharMenuContexto();
    setModalArquivo({
      tipo: "excluir",
      alvo: no,
      pastaBase: "",
      valor: no.nome,
      aberto: true,
    });
  };

  const copiarCaminho = (caminho: string) => {
    fecharMenuContexto();
    navigator.clipboard.writeText(caminho);
    showToast(`Caminho "${caminho}" copiado!`, "sucesso");
  };

  const confirmarAcaoArquivo = async () => {
    const estado = modalArquivo();
    const valor = estado.valor.trim();

    if (estado.tipo === "excluir") {
      const no = estado.alvo;
      if (!no) return;
      try {
        await fetchApi(`/files?path=${encodeURIComponent(no.caminho)}`, { method: "DELETE" });
        // Fecha tab se o arquivo ou subarquivos estiverem abertos
        setTabs((prev) =>
          prev.filter(
            (t) => t.caminho !== no.caminho && !t.caminho.startsWith(no.caminho + "/"),
          ),
        );
        if (tabAtiva() === no.caminho || tabAtiva()?.startsWith(no.caminho + "/")) {
          setTabAtiva(null);
          setSearchParams({ file: undefined });
        }
        showToast(`"${no.nome}" excluído com sucesso!`, "sucesso");
        setModalArquivo((prev) => ({ ...prev, aberto: false }));
        void carregarArvore();
      } catch (err: any) {
        showToast(`Erro ao excluir: ${err.message}`, "erro");
      }
      return;
    }

    if (!valor) {
      showToast("Informe um nome válido", "aviso");
      return;
    }

    if (estado.tipo === "novo_arquivo") {
      const caminhoCompleto = estado.pastaBase ? `${estado.pastaBase}/${valor}` : valor;
      try {
        await fetchApi("/files", {
          method: "POST",
          body: JSON.stringify({ path: caminhoCompleto, tipo: "arquivo", conteudo: "" }),
        });
        showToast(`Arquivo "${valor}" criado!`, "sucesso");
        setModalArquivo((prev) => ({ ...prev, aberto: false }));
        if (estado.pastaBase) {
          const s = new Set(expandidos());
          s.add(estado.pastaBase);
          setExpandidos(s);
        }
        await carregarArvore();
        await abrirArquivo(caminhoCompleto);
      } catch (err: any) {
        showToast(`Erro ao criar arquivo: ${err.message}`, "erro");
      }
    } else if (estado.tipo === "nova_pasta") {
      const caminhoCompleto = estado.pastaBase ? `${estado.pastaBase}/${valor}` : valor;
      try {
        await fetchApi("/files", {
          method: "POST",
          body: JSON.stringify({ path: caminhoCompleto, tipo: "dir" }),
        });
        showToast(`Pasta "${valor}" criada!`, "sucesso");
        setModalArquivo((prev) => ({ ...prev, aberto: false }));
        const s = new Set(expandidos());
        if (estado.pastaBase) s.add(estado.pastaBase);
        s.add(caminhoCompleto);
        setExpandidos(s);
        await carregarArvore();
      } catch (err: any) {
        showToast(`Erro ao criar pasta: ${err.message}`, "erro");
      }
    } else if (estado.tipo === "renomear") {
      const no = estado.alvo;
      if (!no) return;
      const novoCaminho = estado.pastaBase ? `${estado.pastaBase}/${valor}` : valor;
      if (novoCaminho === no.caminho) {
        setModalArquivo((prev) => ({ ...prev, aberto: false }));
        return;
      }
      try {
        await fetchApi("/files/rename", {
          method: "POST",
          body: JSON.stringify({ antigo: no.caminho, novo: novoCaminho }),
        });
        // Atualiza tabs abertas
        setTabs((prev) =>
          prev.map((t) => {
            if (t.caminho === no.caminho) {
              return { ...t, caminho: novoCaminho, nome: valor };
            }
            if (t.caminho.startsWith(no.caminho + "/")) {
              const sub = t.caminho.slice(no.caminho.length);
              return { ...t, caminho: novoCaminho + sub };
            }
            return t;
          }),
        );
        if (tabAtiva() === no.caminho) {
          setTabAtiva(novoCaminho);
          setSearchParams({ file: novoCaminho });
        }
        showToast(`Renomeado para "${valor}"!`, "sucesso");
        setModalArquivo((prev) => ({ ...prev, aberto: false }));
        await carregarArvore();
      } catch (err: any) {
        showToast(`Erro ao renomear: ${err.message}`, "erro");
      }
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
      prev.map((t) => (t.id === id ? { ...t, log: "" } : t)),
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
          : t,
      ),
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
            : t,
        ),
      );
    } catch (err: any) {
      setTerminais((prev) =>
        prev.map((t) => (t.id === tid ? { ...t, log: t.log + `erro: ${err.message}\n` } : t)),
      );
    } finally {
      setRodandoCmd(false);
      setTimeout(() => {
        if (termLogRef) termLogRef.scrollTop = termLogRef.scrollHeight;
      }, 50);
    }
  };

  // Teclas de atalho (Ctrl+S para salvar, Ctrl+P para buscar arquivos, Escape fecha menus)
  const onKeyDownGlobal = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void salvarTabAtiva();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
      e.preventDefault();
      setBuscaAberta(true);
    } else if (e.key === "Escape") {
      if (menuContexto().visivel) fecharMenuContexto();
      if (buscaAberta()) setBuscaAberta(false);
      if (modalArquivo().aberto) setModalArquivo((prev) => ({ ...prev, aberto: false }));
    }
  };

  onMount(() => {
    void carregarArvore();
    document.addEventListener("keydown", onKeyDownGlobal);
    document.addEventListener("click", fecharMenuContexto);

    const urlFile = searchParams.file as string | undefined;
    if (urlFile) {
      void abrirArquivo(urlFile);
    }
  });

  return (
    <div
      class="flex h-full w-full overflow-hidden bg-zinc-950 font-sans select-none relative"
      onClick={fecharMenuContexto}
    >
      {/* ─────────────────────────────────────────────────────────────
          ÁRVORE DE ARQUIVOS (Explorer lateral esquerdo estilo VS Code)
         ───────────────────────────────────────────────────────────── */}
      <div class="w-64 border-r border-zinc-800/80 bg-zinc-950 flex flex-col flex-shrink-0">
        <div class="h-10 px-3 border-b border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
          <span class="font-bold uppercase tracking-wider text-[11px] text-zinc-300">
            Explorador
          </span>
          <div class="flex items-center gap-0.5">
            <IconButton
              size="xs"
              variant="ghost"
              onClick={() => abrirModalNovoArquivo(null)}
              title="Novo Arquivo na raiz"
            >
              <FilePlus size={13} />
            </IconButton>
            <IconButton
              size="xs"
              variant="ghost"
              onClick={() => abrirModalNovaPasta(null)}
              title="Nova Pasta na raiz"
            >
              <FolderPlus size={13} />
            </IconButton>
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

        {/* Lista da Árvore Recursiva (com suporte a Botão Direito) */}
        <div
          class="flex-1 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin"
          onContextMenu={(e) => abrirMenuContexto(e, null)}
        >
          <For
            each={arvore()}
            fallback={
              <div class="p-4 text-center text-xs text-zinc-500">
                {carregandoArvore() ? "Indexando arquivos..." : "Nenhum arquivo no workspace."}
              </div>
            }
          >
            {(no) => (
              <RenderNoArvore
                no={no}
                nivel={0}
                onAbrir={abrirArquivo}
                onToggle={alternarDir}
                onContextMenu={abrirMenuContexto}
                expandidos={expandidos()}
              />
            )}
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
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50"
                  }`}
                >
                  <FileText size={12} class={ativa() ? "text-orange-400" : "text-zinc-500"} />
                  <span class="truncate max-w-[140px]">{t.nome}</span>
                  <Show when={suja()}>
                    <span class="h-2 w-2 rounded-full bg-orange-500 flex-shrink-0" title="Não salvo" />
                  </Show>
                  <button
                    onClick={(e) => fecharTab(t.caminho, e)}
                    class="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 ml-1"
                    title="Fechar tab"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            }}
          </For>
        </div>

        {/* Sub-header da Tab Ativa: Breadcrumb + Modo (Editor / Preview / Split) + Salvar */}
        <Show when={tabAtual()}>
          <div class="h-9 px-4 border-b border-zinc-800/60 bg-zinc-950/60 flex items-center justify-between text-xs">
            <div class="flex items-center gap-1.5 text-zinc-400 font-mono text-[11px] truncate">
              <span class="text-zinc-600">workspace /</span>
              <span class="text-zinc-300 font-semibold">{tabAtual()!.caminho}</span>
              <Show when={tabAtual()!.editado !== tabAtual()!.original}>
                <span class="text-[10px] text-orange-400 font-sans ml-2">(modificado)</span>
              </Show>
            </div>

            <div class="flex items-center gap-3">
              {/* Seletor de Modo se for Markdown */}
              <Show when={tabAtual()!.caminho.endsWith(".md")}>
                <div class="flex items-center bg-zinc-900 rounded p-0.5 border border-zinc-800 text-[10px] font-mono">
                  <button
                    onClick={() => alternarModoTab("editor")}
                    class={`px-2 py-0.5 rounded transition-colors ${
                      tabAtual()!.modo === "editor" ? "bg-zinc-800 text-zinc-100 font-bold" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Editor
                  </button>
                  <button
                    onClick={() => alternarModoTab("preview")}
                    class={`px-2 py-0.5 rounded transition-colors ${
                      tabAtual()!.modo === "preview" ? "bg-zinc-800 text-zinc-100 font-bold" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => alternarModoTab("split")}
                    class={`px-2 py-0.5 rounded transition-colors ${
                      tabAtual()!.modo === "split" ? "bg-zinc-800 text-zinc-100 font-bold" : "text-zinc-400 hover:text-zinc-200"
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
                <span class="text-[11px] text-zinc-600 font-mono">
                  Dica: clique com o botão direito na árvore para criar arquivos ou pastas, ou Ctrl+P para busca
                </span>
              </div>
            }
          >
            <Show
              when={tabAtual()!.modo === "split"}
              fallback={
                <Show
                  when={tabAtual()!.modo === "editor"}
                  fallback={
                    /* MODO PREVIEW COM FORMATAÇÃO MARKDOWN RICA */
                    <div
                      class="p-6 sm:p-8 overflow-y-auto h-full text-zinc-200 leading-relaxed font-sans select-text scrollbar-thin max-w-4xl mx-auto"
                      innerHTML={renderDocMarkdown(tabAtual()!.editado)}
                    />
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
              {/* Modo Split (Lado a Lado: Editor + Preview Rico) */}
              <div class="grid grid-cols-2 h-full w-full divide-x divide-zinc-800">
                <textarea
                  value={tabAtual()!.editado}
                  onInput={(e) => atualizarConteudo(e.currentTarget.value)}
                  class="w-full h-full bg-zinc-950 p-4 text-xs font-mono text-zinc-200 resize-none focus:outline-none scrollbar-thin leading-relaxed"
                  spellcheck={false}
                />
                <div
                  class="p-6 overflow-y-auto h-full text-zinc-200 leading-relaxed font-sans select-text scrollbar-thin bg-zinc-900/10"
                  innerHTML={renderDocMarkdown(tabAtual()!.editado)}
                />
              </div>
            </Show>
          </Show>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            PAINEL DE TERMINAIS VS CODE (Terminais em abas, máx 4)
           ───────────────────────────────────────────────────────────── */}
        <div class="h-44 border-t border-zinc-800/80 bg-zinc-950 flex flex-col flex-shrink-0">
          {/* Barra de Tabs dos Terminais */}
          <div class="h-8 px-3 border-b border-zinc-800/60 flex items-center justify-between text-xs bg-zinc-900/50">
            <div class="flex items-center gap-1">
              <Terminal size={13} class="text-emerald-400 mr-1.5" />
              <For each={terminais()}>
                {(term) => {
                  const ativo = () => terminalAtivo() === term.id;
                  return (
                    <button
                      onClick={() => setTerminalAtivo(term.id)}
                      class={`px-2.5 py-0.5 rounded text-[11px] font-mono transition-colors ${
                        ativo()
                          ? "bg-zinc-800 text-zinc-100 font-semibold border border-zinc-700/60"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {term.nome}
                    </button>
                  );
                }}
              </For>
              <IconButton
                size="xs"
                variant="ghost"
                onClick={criarTerminal}
                title="Novo Terminal"
              >
                <Plus size={12} />
              </IconButton>
            </div>

            <div class="flex items-center gap-1 text-zinc-500">
              <button
                onClick={limparTerminalAtivo}
                class="text-[10px] hover:text-zinc-300 font-mono px-1.5 py-0.5 rounded hover:bg-zinc-800"
                title="Limpar saída"
              >
                Limpar
              </button>
            </div>
          </div>

          {/* Saída de Log do Terminal Ativo */}
          <pre
            ref={termLogRef}
            class="flex-1 p-2.5 overflow-y-auto font-mono text-[11px] text-zinc-300 select-text whitespace-pre-wrap leading-relaxed scrollbar-thin"
          >
            {terminais().find((t) => t.id === terminalAtivo())?.log || ""}
          </pre>

          {/* Input de Comando do Terminal */}
          <div class="h-9 px-3 border-t border-zinc-800/60 flex items-center gap-2 bg-zinc-950">
            <span class="text-emerald-400 font-mono text-xs font-bold">ws$</span>
            <input
              type="text"
              placeholder="Digite um comando (ex: tasks list, doctor, flow list)..."
              value={terminalInput()}
              onInput={(e) => setTerminalInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !rodandoCmd()) {
                  e.preventDefault();
                  void rodarTerminal();
                }
              }}
              class="flex-1 bg-transparent text-xs font-mono text-zinc-200 focus:outline-none"
              disabled={rodandoCmd()}
            />
            <Show when={rodandoCmd()}>
              <span class="text-[10px] text-amber-400 font-mono animate-pulse">executando...</span>
            </Show>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MENU DE CONTEXTO SUSPENSO (BOTÃO DIREITO)
         ───────────────────────────────────────────────────────────── */}
      <Show when={menuContexto().visivel}>
        <div
          style={{
            position: "fixed",
            left: `${menuContexto().x}px`,
            top: `${menuContexto().y}px`,
          }}
          class="w-52 rounded-xl bg-zinc-900 border border-zinc-700/80 shadow-2xl p-1.5 z-50 text-xs font-medium space-y-0.5 animate-in fade-in duration-100 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Novo Arquivo */}
          <button
            type="button"
            onClick={() => abrirModalNovoArquivo(menuContexto().no)}
            class="w-full px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 flex items-center gap-2 text-left cursor-pointer transition-colors"
          >
            <FilePlus size={14} class="text-emerald-400" />
            <span>Novo Arquivo</span>
          </button>

          {/* Nova Pasta */}
          <button
            type="button"
            onClick={() => abrirModalNovaPasta(menuContexto().no)}
            class="w-full px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 flex items-center gap-2 text-left cursor-pointer transition-colors"
          >
            <FolderPlus size={14} class="text-amber-400" />
            <span>Nova Pasta</span>
          </button>

          {/* Ações quando clicado em um item específico */}
          <Show when={menuContexto().no}>
            {(no) => (
              <>
                <div class="my-1 border-t border-zinc-800" />

                {/* Renomear */}
                <button
                  type="button"
                  onClick={() => abrirModalRenomear(no())}
                  class="w-full px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 flex items-center gap-2 text-left cursor-pointer transition-colors"
                >
                  <Edit3 size={14} class="text-blue-400" />
                  <span>Renomear</span>
                </button>

                {/* Copiar Caminho */}
                <button
                  type="button"
                  onClick={() => copiarCaminho(no().caminho)}
                  class="w-full px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-zinc-200 flex items-center gap-2 text-left cursor-pointer transition-colors"
                >
                  <Copy size={14} class="text-zinc-400" />
                  <span>Copiar Caminho</span>
                </button>

                <div class="my-1 border-t border-zinc-800" />

                {/* Excluir */}
                <button
                  type="button"
                  onClick={() => abrirModalExcluir(no())}
                  class="w-full px-2.5 py-1.5 rounded-lg hover:bg-rose-950/50 text-rose-400 hover:text-rose-300 flex items-center gap-2 text-left cursor-pointer transition-colors"
                >
                  <Trash2 size={14} />
                  <span>Excluir</span>
                </button>
              </>
            )}
          </Show>
        </div>
      </Show>

      {/* ─────────────────────────────────────────────────────────────
          MODAL DE OPERAÇÕES DE ARQUIVO (Criar, Renomear, Excluir)
         ───────────────────────────────────────────────────────────── */}
      <Show when={modalArquivo().aberto}>
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-100">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div class="flex items-center gap-2 font-bold text-zinc-100 text-sm">
                <Show
                  when={modalArquivo().tipo === "novo_arquivo"}
                  fallback={
                    <Show
                      when={modalArquivo().tipo === "nova_pasta"}
                      fallback={
                        <Show
                          when={modalArquivo().tipo === "renomear"}
                          fallback={<Trash2 size={16} class="text-rose-400" />}
                        >
                          <Edit3 size={16} class="text-blue-400" />
                        </Show>
                      }
                    >
                      <FolderPlus size={16} class="text-amber-400" />
                    </Show>
                  }
                >
                  <FilePlus size={16} class="text-emerald-400" />
                </Show>
                <span>
                  {modalArquivo().tipo === "novo_arquivo" && "Novo Arquivo"}
                  {modalArquivo().tipo === "nova_pasta" && "Nova Pasta"}
                  {modalArquivo().tipo === "renomear" && "Renomear Item"}
                  {modalArquivo().tipo === "excluir" && "Confirmar Exclusão"}
                </span>
              </div>
              <IconButton
                size="xs"
                variant="ghost"
                onClick={() => setModalArquivo((prev) => ({ ...prev, aberto: false }))}
              >
                <X size={16} />
              </IconButton>
            </div>

            <Show
              when={modalArquivo().tipo !== "excluir"}
              fallback={
                <div class="space-y-3 text-xs text-zinc-300">
                  <div class="p-3 rounded-xl bg-rose-950/30 border border-rose-900/60 flex items-start gap-2.5">
                    <AlertTriangle size={16} class="text-rose-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p class="font-semibold text-rose-200">
                        Deseja realmente excluir "{modalArquivo().alvo?.nome}"?
                      </p>
                      <p class="text-[11px] text-zinc-400 mt-1">
                        Caminho: <span class="font-mono text-zinc-300">{modalArquivo().alvo?.caminho}</span>
                      </p>
                      <p class="text-[10px] text-zinc-500 mt-1">
                        Esta ação removerá o arquivo ou pasta permanentemente do workspace.
                      </p>
                    </div>
                  </div>
                </div>
              }
            >
              <div class="space-y-2 text-xs">
                <Show when={modalArquivo().pastaBase}>
                  <div class="text-[11px] text-zinc-500 font-mono">
                    Local: <span class="text-zinc-300">{modalArquivo().pastaBase}/</span>
                  </div>
                </Show>

                <div>
                  <label class="block text-zinc-400 mb-1 font-medium">
                    {modalArquivo().tipo === "novo_arquivo" && "Nome do arquivo com extensão:"}
                    {modalArquivo().tipo === "nova_pasta" && "Nome da pasta:"}
                    {modalArquivo().tipo === "renomear" && "Novo nome:"}
                  </label>
                  <input
                    ref={modalInputRef}
                    type="text"
                    placeholder={
                      modalArquivo().tipo === "novo_arquivo"
                        ? "ex: script.js, notas.md, config.json"
                        : "ex: src, docs, utils"
                    }
                    value={modalArquivo().valor}
                    onInput={(e) =>
                      setModalArquivo((prev) => ({ ...prev, valor: e.currentTarget.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void confirmarAcaoArquivo();
                      }
                    }}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono text-xs"
                  />
                </div>
              </div>
            </Show>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setModalArquivo((prev) => ({ ...prev, aberto: false }))}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                variant={modalArquivo().tipo === "excluir" ? "secondary" : "primary"}
                class={
                  modalArquivo().tipo === "excluir"
                    ? "bg-rose-600 hover:bg-rose-500 text-white font-bold"
                    : ""
                }
                onClick={confirmarAcaoArquivo}
              >
                {modalArquivo().tipo === "excluir" ? "Excluir Definitivamente" : "Confirmar"}
              </Button>
            </div>
          </div>
        </div>
      </Show>

      {/* ─────────────────────────────────────────────────────────────
          MODAL DE BUSCA RÁPIDA (Ctrl+P)
         ───────────────────────────────────────────────────────────── */}
      <Show when={buscaAberta()}>
        <div
          class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-start justify-center pt-20 p-4 z-50"
          onClick={() => setBuscaAberta(false)}
        >
          <div
            class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="p-3 border-b border-zinc-800 flex items-center gap-2">
              <Search size={16} class="text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar arquivo por nome ou caminho..."
                value={buscaTexto()}
                onInput={(e) => setBuscaTexto(e.currentTarget.value)}
                autofocus
                class="w-full bg-transparent text-xs font-mono text-zinc-200 focus:outline-none"
              />
              <IconButton size="xs" variant="ghost" onClick={() => setBuscaAberta(false)}>
                <X size={14} />
              </IconButton>
            </div>

            <div class="max-h-80 overflow-y-auto p-1 space-y-0.5 scrollbar-thin">
              <For
                each={arquivosFiltradosBusca()}
                fallback={
                  <div class="p-4 text-center text-xs text-zinc-500">
                    Nenhum arquivo encontrado.
                  </div>
                }
              >
                {(path) => (
                  <div
                    onClick={() => {
                      setBuscaAberta(false);
                      void abrirArquivo(path);
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
  onContextMenu: (e: MouseEvent, no: NoArvoreWeb) => void;
  expandidos: Set<string>;
}> = (props) => {
  const isDir = () => props.no.tipo === "dir";
  const aberto = () => props.expandidos.has(props.no.caminho);

  return (
    <div>
      <div
        style={{ "padding-left": `${props.nivel * 12 + 6}px` }}
        class="flex items-center gap-1.5 py-1 px-1.5 rounded text-xs cursor-pointer hover:bg-zinc-800/60 select-none text-zinc-300 transition-colors group"
        onClick={() => {
          if (isDir()) props.onToggle(props.no.caminho);
          else props.onAbrir(props.no.caminho);
        }}
        onContextMenu={(e) => props.onContextMenu(e, props.no)}
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
        <span class="truncate font-mono text-[11px] flex-1">{props.no.nome}</span>
      </div>

      <Show when={isDir() && aberto() && props.no.filhos}>
        <For each={props.no.filhos}>
          {(filho) => (
            <RenderNoArvore
              no={filho}
              nivel={props.nivel + 1}
              onAbrir={props.onAbrir}
              onToggle={props.onToggle}
              onContextMenu={props.onContextMenu}
              expandidos={props.expandidos}
            />
          )}
        </For>
      </Show>
    </div>
  );
};
