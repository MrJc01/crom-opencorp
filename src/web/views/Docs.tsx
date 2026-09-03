import { type Component, createSignal, onMount, createEffect, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import {
  BookOpen,
  Search,
  FileText,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Terminal,
  Bookmark,
  Layers,
  ArrowUpRight,
} from "lucide-solid";
import { fetchApi } from "../lib/context";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";

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

  const slugSelecionado = () => (searchParams.doc as string) || "estudo-padronizacao";

  const carregarLista = async () => {
    try {
      setCarregando(true);
      const lista = await fetchApi<DocItem[]>("/docs");
      setDocs(lista || []);
      const slug = slugSelecionado();
      if (slug) {
        await carregarConteudo(slug);
      } else if (lista && lista.length > 0) {
        await carregarConteudo(lista[0].slug);
      }
    } catch (e: any) {
      showToast("Erro ao carregar documentação: " + e.message, "erro");
    } finally {
      setCarregando(false);
    }
  };

  const carregarConteudo = async (slug: string) => {
    try {
      setCarregando(true);
      const detalhe = await fetchApi<DocDetalhe>(`/docs/${encodeURIComponent(slug)}`);
      setDocAtivo(detalhe);
      setSearchParams({ doc: slug });
    } catch (e: any) {
      showToast("Erro ao carregar documento: " + e.message, "erro");
    } finally {
      setCarregando(false);
    }
  };

  createEffect(() => {
    const slug = searchParams.doc as string;
    if (slug && (!docAtivo() || docAtivo()!.slug !== slug)) {
      void carregarConteudo(slug);
    }
  });

  onMount(() => {
    void carregarLista();
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
      {/* Sidebar de Documentação (Estilo Docs do OpenCode) */}
      <div class="w-72 border-r border-zinc-800/80 bg-zinc-950/60 flex flex-col flex-shrink-0">
        {/* Cabeçalho do Docs */}
        <div class="p-3.5 border-b border-zinc-800/80">
          <div class="flex items-center gap-2 mb-3">
            <div class="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <BookOpen size={15} />
            </div>
            <div>
              <h2 class="text-xs font-bold text-zinc-100">Documentação</h2>
              <span class="text-[10px] text-zinc-500 font-mono">Manual OpenCorp & oc</span>
            </div>
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
                        <button
                          type="button"
                          onClick={() => carregarConteudo(item.slug)}
                          class={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            ativo()
                              ? "bg-emerald-950/50 text-emerald-300 border border-emerald-500/40 font-medium"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent"
                          }`}
                        >
                          <div class="flex items-center gap-2 min-w-0">
                            <FileText size={13} class={ativo() ? "text-emerald-400" : "text-zinc-500"} />
                            <span class="truncate">{item.titulo}</span>
                          </div>
                          <Show when={ativo()}>
                            <ChevronRight size={12} class="text-emerald-400 flex-shrink-0" />
                          </Show>
                        </button>
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
            <Terminal size={12} /> DICA DE TERMINAL
          </div>
          <p class="text-[10px] text-zinc-400 leading-relaxed">
            Consulte qualquer manual via CLI:
            <code class="block bg-zinc-950 border border-zinc-800 px-2 py-1 rounded text-zinc-200 mt-1 font-mono text-[10px]">
              oc doc ajuda [slug]
            </code>
          </p>
        </div>
      </div>

      {/* Área Principal de Conteúdo */}
      <div class="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-zinc-950">
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
          <div class="h-14 border-b border-zinc-800/80 px-6 flex items-center justify-between gap-4 flex-shrink-0 bg-zinc-900/40">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 uppercase font-bold">
                {docAtivo()!.categoria}
              </span>
              <h1 class="text-sm font-bold text-zinc-100 truncate">{docAtivo()!.titulo}</h1>
              <span class="text-xs text-zinc-500 font-mono hidden sm:inline">
                ({docAtivo()!.arquivo})
              </span>
            </div>

            <div class="flex items-center gap-2">
              <Button
                size="xs"
                variant="secondary"
                class="border-zinc-800 text-zinc-300 text-xs"
                onClick={copiarConteudo}
                title="Copiar Markdown"
              >
                <Show when={copiado()} fallback={<Copy size={13} class="mr-1 text-zinc-400" />}>
                  <Check size={13} class="mr-1 text-emerald-400" />
                </Show>
                {copiado() ? "Copiado!" : "Copiar"}
              </Button>
            </div>
          </div>

          {/* Leitor de Markdown Formatado */}
          <div class="flex-1 overflow-y-auto p-6 lg:p-10 scrollbar-thin">
            <div class="max-w-4xl mx-auto space-y-6">
              {/* Renderização Pré-Formatada Limpa com Destaques */}
              <article class="prose prose-invert max-w-none text-zinc-300 text-sm leading-relaxed space-y-4">
                <div class="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 text-xs text-zinc-400 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <Bookmark size={14} class="text-emerald-400" />
                    <span>Documento Oficial: <strong>{docAtivo()!.arquivo}</strong></span>
                  </div>
                  <span class="text-[10px] font-mono text-zinc-500">
                    Fonte de verdade para IAs e Usuários
                  </span>
                </div>

                <pre class="p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 text-zinc-200 whitespace-pre-wrap font-mono text-xs leading-relaxed overflow-x-auto selection:bg-emerald-900 selection:text-white">
                  {docAtivo()!.conteudo}
                </pre>
              </article>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};
