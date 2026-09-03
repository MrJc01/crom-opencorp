import { type Component, createSignal, onMount, createEffect, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import {
  BookOpen,
  Search,
  FileText,
  ChevronRight,
  Copy,
  Check,
  Terminal,
  Bookmark,
  PanelLeft,
  PanelLeftClose,
} from "lucide-solid";
import { fetchApi } from "../lib/context";
import { Button } from "../ui/Button";
import { showToast } from "../ui/Toast";
import { renderDocMarkdown } from "../lib/doc-renderer";
import { processarDiagramasMermaid, garantirCopyGlobal } from "../md";

interface DocItem {
  slug: string;
  titulo: string;
  arquivo: string;
  categoria: string;
}

interface DocDetalhe {
  slug: string;
  titulo: string;
  categoria: string;
  arquivo: string;
  conteudo: string;
}

export const DocsView: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [docs, setDocs] = createSignal<DocItem[]>([]);
  const [docAtivo, setDocAtivo] = createSignal<DocDetalhe | null>(null);
  const [busca, setBusca] = createSignal("");
  const [carregando, setCarregando] = createSignal(false);
  const [copiado, setCopiado] = createSignal(false);
  const [sidebarAberta, setSidebarAberta] = createSignal(
    localStorage.getItem("oc-docs-sidebar") !== "0"
  );
  let articleRef: HTMLElement | undefined;

  createEffect(() => {
    const doc = docAtivo();
    if (doc) {
      setTimeout(() => {
        if (articleRef) void processarDiagramasMermaid(articleRef);
      }, 50);
    }
  });

  const toggleSidebar = () => {
    const nova = !sidebarAberta();
    setSidebarAberta(nova);
    localStorage.setItem("oc-docs-sidebar", nova ? "1" : "0");
  };

  const carregarDocumento = async (slug: string, atualizarUrl = true) => {
    if (!slug) return;
    try {
      setCarregando(true);
      const detalhe = await fetchApi<DocDetalhe>(`/docs/${encodeURIComponent(slug)}`);
      setDocAtivo(detalhe);
      if (atualizarUrl && searchParams.doc !== slug) {
        setSearchParams({ doc: slug }, { replace: true });
      }
    } catch (e: any) {
      showToast("Erro ao carregar documento: " + (e.message || e), "erro");
    } finally {
      setCarregando(false);
    }
  };

  onMount(async () => {
    garantirCopyGlobal();
    try {
      setCarregando(true);
      const lista = await fetchApi<DocItem[]>("/docs");
      setDocs(lista || []);
      const slugUrl = searchParams.doc as string | undefined;
      const slugAlvo = slugUrl || (lista && lista.length > 0 ? lista[0].slug : "estudo-padronizacao");
      await carregarDocumento(slugAlvo, !slugUrl);
    } catch (e: any) {
      showToast("Erro ao listar documentação: " + (e.message || e), "erro");
    } finally {
      setCarregando(false);
    }
  });

  const docsFiltrados = () => {
    const q = busca().toLowerCase().trim();
    if (!q) return docs();
    return docs().filter(
      (d) =>
        d.titulo.toLowerCase().includes(q) ||
        d.categoria.toLowerCase().includes(q) ||
        d.slug.toLowerCase().includes(q)
    );
  };

  const categorias = () => {
    const mapa = new Map<string, DocItem[]>();
    for (const d of docsFiltrados()) {
      const cat = d.categoria || "Geral";
      if (!mapa.has(cat)) mapa.set(cat, []);
      mapa.get(cat)!.push(d);
    }
    return Array.from(mapa.entries());
  };

  const copiarConteudo = () => {
    if (!docAtivo()) return;
    navigator.clipboard.writeText(docAtivo()!.conteudo);
    setCopiado(true);
    showToast("Conteúdo Markdown copiado!", "sucesso");
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div class="flex h-full w-full overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Sidebar de Documentação com controle de visibilidade */}
      <Show when={sidebarAberta()}>
        <aside class="w-72 border-r border-zinc-800/80 bg-zinc-950 flex flex-col flex-shrink-0 h-full select-none z-10">
          {/* Cabeçalho do Docs */}
          <div class="p-3.5 border-b border-zinc-800/80">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <div class="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <BookOpen size={15} />
                </div>
                <div>
                  <h2 class="text-xs font-bold text-zinc-100">Documentação</h2>
                  <span class="text-[10px] text-zinc-500 font-mono">Manual OpenCorp & oc</span>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                class="!bg-transparent hover:!bg-zinc-900 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer border border-transparent hover:border-zinc-800"
                title="Recolher menu da documentação"
              >
                <PanelLeftClose size={15} />
              </button>
            </div>

            {/* Campo de Busca */}
            <div class="relative">
              <Search size={13} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar na documentação..."
                value={busca()}
                onInput={(e) => setBusca(e.currentTarget.value)}
                class="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          {/* Lista de Categorias e Artigos */}
          <div class="flex-1 overflow-y-auto p-2 space-y-4 scrollbar-thin">
            <For each={categorias()}>
              {([categoria, itens]) => (
                <div class="space-y-1">
                  <div class="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-mono">
                    {categoria}
                  </div>
                  <div class="space-y-0.5">
                    <For each={itens}>
                      {(item) => {
                        const ativo = () => docAtivo()?.slug === item.slug;
                        return (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => carregarDocumento(item.slug)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                carregarDocumento(item.slug);
                              }
                            }}
                            class={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left select-none ${
                              ativo()
                                ? "!bg-emerald-950/60 text-emerald-300 border border-emerald-500/50 font-medium"
                                : "!bg-transparent text-zinc-400 hover:text-zinc-200 hover:!bg-zinc-900/80 border border-transparent"
                            }`}
                          >
                            <div class="flex items-center gap-2 min-w-0">
                              <FileText size={13} class={ativo() ? "text-emerald-400" : "text-zinc-500"} />
                              <span class="truncate">{item.titulo}</span>
                            </div>
                            <Show when={ativo()}>
                              <ChevronRight size={12} class="text-emerald-400 flex-shrink-0" />
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>

          {/* Rodapé de Dica CLI */}
          <div class="p-3 border-t border-zinc-800/80 bg-zinc-900/30 text-[11px] text-zinc-400">
            <div class="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400 font-bold mb-1">
              <Terminal size={12} />
              <span>Dica do Terminal CLI</span>
            </div>
            <p class="text-[10px] text-zinc-500 mb-1.5 leading-snug">
              Consulte tópicos diretamente no terminal ou em scripts:
            </p>
            <code class="block font-mono text-[10px] bg-zinc-950 px-2 py-1 rounded border border-zinc-800 text-zinc-300 select-all">
              ./bin/oc doc ajuda {docAtivo()?.slug || "estudo"}
            </code>
          </div>
        </aside>
      </Show>

      {/* Área Principal de Conteúdo */}
      <main class="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-zinc-950">
        <Show
          when={docAtivo()}
          fallback={
            <div class="flex-1 flex items-center justify-center text-zinc-500 text-xs">
              <Show when={carregando()} fallback={"Selecione um tópico para ler."}>
                Carregando documento...
              </Show>
            </div>
          }
        >
          {/* Barra Superior do Documento */}
          <header class="h-14 border-b border-zinc-800/80 px-4 sm:px-6 flex items-center justify-between gap-4 flex-shrink-0 bg-zinc-900/40 backdrop-blur-sm">
            <div class="flex items-center gap-3 min-w-0">
              {/* Botão de Toggle do Menu Lateral */}
              <button
                type="button"
                onClick={toggleSidebar}
                class="!bg-zinc-900 hover:!bg-zinc-800 p-2 rounded-lg text-zinc-400 hover:text-emerald-400 border border-zinc-800 transition-colors cursor-pointer flex items-center gap-1.5 text-xs flex-shrink-0 shadow-xs"
                title={sidebarAberta() ? "Recolher menu da documentação" : "Expandir menu da documentação"}
              >
                <Show when={sidebarAberta()} fallback={<><PanelLeft size={15} class="text-emerald-400" /><span class="hidden sm:inline text-zinc-300 font-medium text-[11px]">Tópicos</span></>}>
                  <PanelLeftClose size={15} />
                  <span class="hidden sm:inline text-zinc-400 font-medium text-[11px]">Recolher</span>
                </Show>
              </button>

              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 uppercase font-bold flex-shrink-0">
                {docAtivo()!.categoria}
              </span>
              <h1 class="text-sm font-bold text-zinc-100 truncate">{docAtivo()!.titulo}</h1>
              <span class="text-xs text-zinc-500 font-mono hidden md:inline">
                ({docAtivo()!.arquivo})
              </span>
            </div>

            <div class="flex items-center gap-2 flex-shrink-0">
              <Button
                size="xs"
                variant="secondary"
                class="border-zinc-800 text-zinc-300 text-xs"
                onClick={copiarConteudo}
                title="Copiar Markdown Bruto"
              >
                <Show when={copiado()} fallback={<Copy size={13} class="mr-1 text-zinc-400" />}>
                  <Check size={13} class="mr-1 text-emerald-400" />
                </Show>
                {copiado() ? "Copiado!" : "Copiar MD"}
              </Button>
            </div>
          </header>

          {/* Leitor de Markdown Formatado */}
          <div class="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-12 scrollbar-thin">
            <div class="max-w-4xl mx-auto space-y-6">
              <div class="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 text-xs text-zinc-400 flex items-center justify-between shadow-xs">
                <div class="flex items-center gap-2">
                  <Bookmark size={14} class="text-emerald-400" />
                  <span>Documento Oficial: <strong class="text-zinc-200 font-mono">{docAtivo()!.arquivo}</strong></span>
                </div>
                <span class="text-[10px] font-mono text-zinc-500 hidden sm:inline">
                  Fonte de verdade para IAs e Usuários
                </span>
              </div>

              {/* Renderização rica em HTML seguro do Markdown */}
              <article
                ref={articleRef}
                class="doc-content text-zinc-300 text-sm leading-relaxed"
                innerHTML={renderDocMarkdown(docAtivo()!.conteudo)}
              />
            </div>
          </div>
        </Show>
      </main>
    </div>
  );
};
