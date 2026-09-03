import { type Component, createSignal, onMount, For, Show, createMemo, createEffect } from "solid-js";
import {
  ArrowUp,
  Square,
  Paperclip,
  X,
  Sparkles,
  Terminal,
  AtSign,
  Bot,
  CheckSquare,
  FileText,
  Play,
  RotateCcw,
  HelpCircle,
  Stethoscope,
  Code2,
  CornerDownLeft,
  Search,
} from "lucide-solid";
import { IconButton } from "../../ui/IconButton";
import { showToast } from "../../ui/Toast";
import { fetchApi } from "../../lib/context";

export interface Anexo {
  nome: string;
  mime: string;
  url: string; // base64 data url
}

export interface AutocompleteItem {
  id: string;
  tipo: "slash" | "at" | "bang";
  gatilho: string; // ex: "/status" ou "@editor" ou "!oc status"
  titulo: string;
  descricao: string;
  categoria: string;
  icone: any;
}

export interface PromptInputProps {
  valor: string;
  onInput: (v: string) => void;
  onEnviar: () => void;
  onParar?: () => void;
  carregando: boolean;
  anexos: Anexo[];
  onAdicionarAnexo: (a: Anexo) => void;
  onRemoverAnexo: (index: number) => void;
  placeholder?: string;
  agenteSelecionado: "secretario" | "secretario-exec";
  onMudarAgente: (ag: "secretario" | "secretario-exec") => void;
  refTextarea?: (el: HTMLTextAreaElement) => void;
}

export const PromptInput: Component<PromptInputProps> = (props) => {
  let textareaRef!: HTMLTextAreaElement;
  let fileInputRef!: HTMLInputElement;

  // Estado do Autocomplete (/ @ !)
  const [modoMenu, setModoMenu] = createSignal<"slash" | "at" | "bang" | null>(null);
  const [queryMenu, setQueryMenu] = createSignal("");
  const [indiceAtivo, setIndiceAtivo] = createSignal(0);

  // Itens dinâmicos para @ (agentes e tasks do workspace)
  const [listaTasks, setListaTasks] = createSignal<any[]>([]);
  const [listaAgentes, setListaAgentes] = createSignal<any[]>([]);

  const autoResize = () => {
    if (!textareaRef) return;
    textareaRef.style.height = "auto";
    textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 180)}px`;
  };

  // Monitora limpeza do valor para colapsar o textarea de volta à altura padrão
  createEffect(() => {
    const val = props.valor;
    if (!val || val.trim() === "") {
      if (textareaRef) {
        textareaRef.style.height = "auto";
      }
    } else {
      setTimeout(autoResize, 10);
    }
  });

  onMount(async () => {
    if (props.refTextarea) {
      props.refTextarea(textareaRef);
    }

    try {
      const [tRes, aRes] = await Promise.allSettled([
        fetchApi<any[]>("/tasks"),
        fetchApi<any[]>("/agents"),
      ]);
      if (tRes.status === "fulfilled" && Array.isArray(tRes.value)) {
        setListaTasks(tRes.value);
      }
      if (aRes.status === "fulfilled" && Array.isArray(aRes.value)) {
        setListaAgentes(aRes.value);
      }
    } catch {}
  });

  // Base de Itens do Autocomplete
  const todosItens = createMemo<AutocompleteItem[]>(() => {
    const modo = modoMenu();
    if (!modo) return [];

    if (modo === "slash") {
      return [
        {
          id: "slash-status",
          tipo: "slash",
          gatilho: "/status",
          titulo: "/status",
          descricao: "Exibe diagnóstico rápido de serviços, scheduler e tasks em andamento",
          categoria: "Comando",
          icone: Stethoscope,
        },
        {
          id: "slash-task-run",
          tipo: "slash",
          gatilho: "/task run",
          titulo: "/task run <id>",
          descricao: "Despacha e executa uma task imediatamente com o agente responsável",
          categoria: "Task",
          icone: Play,
        },
        {
          id: "slash-task-status",
          tipo: "slash",
          gatilho: "/task status",
          titulo: "/task status <id>",
          descricao: "Consulta o status operacional detalhado e últimas mensagens da task",
          categoria: "Task",
          icone: CheckSquare,
        },
        {
          id: "slash-task-list",
          tipo: "slash",
          gatilho: "/task list",
          titulo: "/task list",
          descricao: "Lista o quadro Kanban de tarefas pendentes e em andamento",
          categoria: "Task",
          icone: CheckSquare,
        },
        {
          id: "slash-agents",
          tipo: "slash",
          gatilho: "/agents",
          titulo: "/agents",
          descricao: "Lista o catálogo completo de agentes especialistas do workspace",
          categoria: "Agentes",
          icone: Bot,
        },
        {
          id: "slash-schedules",
          tipo: "slash",
          gatilho: "/schedules",
          titulo: "/schedules",
          descricao: "Exibe todas as rotinas programadas do scheduler de 24h",
          categoria: "Rotinas",
          icone: Sparkles,
        },
        {
          id: "slash-doctor",
          tipo: "slash",
          gatilho: "/doctor",
          titulo: "/doctor",
          descricao: "Verifica integridade do OpenCode, API, daemon e portas",
          categoria: "Sistema",
          icone: Stethoscope,
        },
        {
          id: "slash-clear",
          tipo: "slash",
          gatilho: "/clear",
          titulo: "/clear",
          descricao: "Limpa as mensagens visíveis da conversa atual",
          categoria: "Sessão",
          icone: RotateCcw,
        },
        {
          id: "slash-help",
          tipo: "slash",
          gatilho: "/help",
          titulo: "/help",
          descricao: "Exibe lista de comandos, atalhos e sintaxes do Secretário",
          categoria: "Ajuda",
          icone: HelpCircle,
        },
      ];
    }

    if (modo === "bang") {
      return [
        {
          id: "bang-oc-status",
          tipo: "bang",
          gatilho: "!oc status",
          titulo: "!oc status",
          descricao: "Executa diagnóstico completo no terminal",
          categoria: "Terminal",
          icone: Terminal,
        },
        {
          id: "bang-oc-task-list",
          tipo: "bang",
          gatilho: "!oc task list",
          titulo: "!oc task list",
          descricao: "Lista tarefas do workspace no terminal",
          categoria: "Terminal",
          icone: Terminal,
        },
        {
          id: "bang-git-status",
          tipo: "bang",
          gatilho: "!git status",
          titulo: "!git status",
          descricao: "Consulta o estado dos arquivos no repositório git",
          categoria: "Git",
          icone: Code2,
        },
        {
          id: "bang-git-log",
          tipo: "bang",
          gatilho: "!git log -n 5 --oneline",
          titulo: "!git log",
          descricao: "Exibe os últimos 5 commits do workspace",
          categoria: "Git",
          icone: Code2,
        },
        {
          id: "bang-npm-test",
          tipo: "bang",
          gatilho: "!npm test",
          titulo: "!npm test",
          descricao: "Executa a suíte de testes automatizados",
          categoria: "Script",
          icone: Terminal,
        },
        {
          id: "bang-ls",
          tipo: "bang",
          gatilho: "!ls -la",
          titulo: "!ls -la",
          descricao: "Lista todos os arquivos e pastas da raiz",
          categoria: "Shell",
          icone: Terminal,
        },
      ];
    }

    if (modo === "at") {
      const itens: AutocompleteItem[] = [
        {
          id: "at-sec-exec",
          tipo: "at",
          gatilho: "@secretario-exec",
          titulo: "@secretario-exec",
          descricao: "Orquestrador autônomo com permissão de executar ferramentas",
          categoria: "Agente",
          icone: Bot,
        },
        {
          id: "at-sec",
          tipo: "at",
          gatilho: "@secretario",
          titulo: "@secretario",
          descricao: "Consultor executivo e analista estratégico",
          categoria: "Agente",
          icone: Bot,
        },
        {
          id: "at-editor",
          tipo: "at",
          gatilho: "@editor",
          titulo: "@editor",
          descricao: "Redator e publicador de artigos no WordPress",
          categoria: "Agente",
          icone: Bot,
        },
        {
          id: "at-critico",
          tipo: "at",
          gatilho: "@critico-site",
          titulo: "@critico-site",
          descricao: "Auditor de qualidade visual, layout e rascunhos",
          categoria: "Agente",
          icone: Bot,
        },
        {
          id: "at-pesquisador",
          tipo: "at",
          gatilho: "@pesquisador-fontes",
          titulo: "@pesquisador-fontes",
          descricao: "Curador de notícias e tendências em tempo real",
          categoria: "Agente",
          icone: Bot,
        },
        {
          id: "at-corretor",
          tipo: "at",
          gatilho: "@corretor-site",
          titulo: "@corretor-site",
          descricao: "Saneador de rascunhos tóxicos e tags quebradas",
          categoria: "Agente",
          icone: Bot,
        },
        {
          id: "at-executor",
          tipo: "at",
          gatilho: "@executor-padrao",
          titulo: "@executor-padrao",
          descricao: "Executor técnico de código e infraestrutura",
          categoria: "Agente",
          icone: Bot,
        },
      ];

      // Tasks ativas carregadas do workspace
      for (const t of listaTasks().slice(0, 8)) {
        itens.push({
          id: `at-task-${t.id}`,
          tipo: "at",
          gatilho: `@${t.id}`,
          titulo: `@${t.id}`,
          descricao: `${t.titulo} (${t.coluna})`,
          categoria: "Task",
          icone: CheckSquare,
        });
      }

      // Arquivos e pastas úteis
      itens.push(
        {
          id: "at-file-scripts-wp",
          tipo: "at",
          gatilho: "@scripts/wp.cjs",
          titulo: "@scripts/wp.cjs",
          descricao: "Script utilitário de integração com WordPress",
          categoria: "Arquivo",
          icone: FileText,
        },
        {
          id: "at-file-docs",
          tipo: "at",
          gatilho: "@docs/",
          titulo: "@docs/",
          descricao: "Documentação do projeto e manuais técnicos",
          categoria: "Pasta",
          icone: FileText,
        },
      );

      return itens;
    }

    return [];
  });

  // Itens filtrados pela busca
  const itensFiltrados = createMemo(() => {
    const q = queryMenu().trim().toLowerCase();
    const itens = todosItens();
    if (!q) return itens.slice(0, 10);
    return itens
      .filter(
        (i) =>
          i.gatilho.toLowerCase().includes(q) ||
          i.titulo.toLowerCase().includes(q) ||
          i.descricao.toLowerCase().includes(q),
      )
      .slice(0, 10);
  });

  const verificarGatilhos = (texto: string) => {
    // 1. Slash command no início: /query
    const slashMatch = texto.match(/^\/([a-zA-Z0-9_-]*)$/);
    if (slashMatch) {
      setModoMenu("slash");
      setQueryMenu(slashMatch[1].toLowerCase());
      setIndiceAtivo(0);
      return;
    }

    // 2. Bang shell command no início: !query
    const bangMatch = texto.match(/^!([a-zA-Z0-9_\s-]*)$/);
    if (bangMatch) {
      setModoMenu("bang");
      setQueryMenu(bangMatch[1].toLowerCase());
      setIndiceAtivo(0);
      return;
    }

    // 3. Mention anywhere: @query no final da digitação
    const atMatch = texto.match(/(?:^|\s)@([a-zA-Z0-9_/-]*)$/);
    if (atMatch) {
      setModoMenu("at");
      setQueryMenu(atMatch[1].toLowerCase());
      setIndiceAtivo(0);
      return;
    }

    setModoMenu(null);
  };

  const selecionarItem = (item?: AutocompleteItem) => {
    if (!item) return;
    const atual = props.valor;

    if (item.tipo === "slash") {
      props.onInput(`${item.gatilho} `);
    } else if (item.tipo === "bang") {
      props.onInput(`${item.gatilho} `);
    } else if (item.tipo === "at") {
      // Substitui o @query final pela menção selecionada
      const novo = atual.replace(/@([a-zA-Z0-9_/-]*)$/, `${item.gatilho} `);
      props.onInput(novo);
    }

    setModoMenu(null);
    if (textareaRef) {
      textareaRef.focus();
      setTimeout(autoResize, 20);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Navegação no Popover de Autocomplete
    if (modoMenu()) {
      const itens = itensFiltrados();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndiceAtivo((prev) => (prev + 1) % Math.max(1, itens.length));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndiceAtivo((prev) => (prev - 1 + itens.length) % Math.max(1, itens.length));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && itens.length > 0)) {
        e.preventDefault();
        selecionarItem(itens[indiceAtivo()]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setModoMenu(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      dispararEnvio();
    }
  };

  const dispararEnvio = () => {
    if (!props.carregando && (props.valor.trim() || props.anexos.length > 0)) {
      props.onEnviar();
      if (textareaRef) {
        textareaRef.style.height = "auto";
      }
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            props.onAdicionarAnexo({
              nome: `imagem-colada-${Date.now()}.png`,
              mime: file.type,
              url: reader.result as string,
            });
            showToast("Imagem colada da área de transferência", "sucesso");
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleFileChange = (e: Event) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        props.onAdicionarAnexo({
          nome: file.name,
          mime: file.type,
          url: reader.result as string,
        });
        showToast(`Anexo ${file.name} adicionado`, "sucesso");
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div class="relative flex flex-col w-full max-w-3xl mx-auto rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl p-2.5 transition-all focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-700/50">
      {/* ─────────────────────────────────────────────────────────────
          POPOVER DE AUTOCOMPLETE FLUTUANTE (/ @ !)
         ───────────────────────────────────────────────────────────── */}
      <Show when={modoMenu() && itensFiltrados().length > 0}>
        <div
          class="absolute bottom-full mb-2 inset-x-0 rounded-2xl bg-zinc-950/95 border border-zinc-700/90 shadow-2xl backdrop-blur-xl p-2 z-50 text-xs max-h-72 overflow-y-auto scrollbar-thin animate-in fade-in slide-in-from-bottom-2 duration-100"
          onMouseDown={(e) => e.preventDefault()}
        >
          {/* Cabeçalho do Popover */}
          <div class="px-2.5 py-1 mb-1 border-b border-zinc-800/80 flex items-center justify-between text-[11px] font-mono">
            <div class="flex items-center gap-1.5 font-bold">
              <Show when={modoMenu() === "slash"}>
                <span class="text-purple-400">/ Comandos Rápidos</span>
              </Show>
              <Show when={modoMenu() === "at"}>
                <span class="text-emerald-400">@ Menções (Agentes, Tasks, Contexto)</span>
              </Show>
              <Show when={modoMenu() === "bang"}>
                <span class="text-amber-400">! Comandos de Terminal (Shell)</span>
              </Show>
            </div>
            <span class="text-zinc-500 text-[10px]">
              ↑↓ navega · Tab/↵ escolhe · Esc fecha
            </span>
          </div>

          {/* Lista de Sugestões */}
          <div class="space-y-0.5">
            <For each={itensFiltrados()}>
              {(item, idx) => {
                const Icone = item.icone || Sparkles;
                const ativo = () => indiceAtivo() === idx();

                return (
                  <button
                    type="button"
                    onClick={() => selecionarItem(item)}
                    onMouseEnter={() => setIndiceAtivo(idx())}
                    class={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                      ativo()
                        ? "bg-zinc-800 text-zinc-100 shadow-xs"
                        : "hover:bg-zinc-900/60 text-zinc-300"
                    }`}
                  >
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div
                        class={`h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                          item.tipo === "slash"
                            ? "bg-purple-950/60 text-purple-400 border border-purple-800/60"
                            : item.tipo === "at"
                            ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60"
                            : "bg-amber-950/60 text-amber-400 border border-amber-800/60"
                        }`}
                      >
                        <Icone size={13} />
                      </div>
                      <div class="min-w-0">
                        <div class="font-mono text-xs font-bold text-zinc-100 truncate">
                          {item.titulo}
                        </div>
                        <div class="text-[11px] text-zinc-400 truncate leading-snug">
                          {item.descricao}
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-1.5 flex-shrink-0">
                      <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-500 border border-zinc-800">
                        {item.categoria}
                      </span>
                      <Show when={ativo()}>
                        <CornerDownLeft size={12} class="text-zinc-400" />
                      </Show>
                    </div>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* Visualização de Anexos Pendentes */}
      <Show when={props.anexos.length > 0}>
        <div class="flex flex-wrap gap-2 px-1 pb-2 border-b border-zinc-800/80 mb-2">
          <For each={props.anexos}>
            {(anexo, idx) => (
              <div class="relative group flex items-center gap-1.5 px-2 py-1 bg-zinc-800 rounded-md border border-zinc-700 text-xs text-zinc-200">
                <Show when={anexo.mime.startsWith("image/")} fallback={<Paperclip size={12} class="text-zinc-400" />}>
                  <img src={anexo.url} alt={anexo.nome} class="h-6 w-6 rounded object-cover" />
                </Show>
                <span class="max-w-[120px] truncate text-[11px] font-medium">{anexo.nome}</span>
                <button
                  onClick={() => props.onRemoverAnexo(idx())}
                  class="text-zinc-400 hover:text-rose-400 p-0.5 rounded transition-colors cursor-pointer"
                  title="Remover anexo"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Input de Texto */}
      <textarea
        ref={textareaRef}
        rows={1}
        value={props.valor}
        onInput={(e) => {
          const val = e.currentTarget.value;
          props.onInput(val);
          verificarGatilhos(val);
          autoResize();
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={props.placeholder || "Pergunte ao Secretário Executivo… (/ comandos, @ contexto, ! terminal)"}
        class="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none px-2 py-1 leading-relaxed max-h-[180px] scrollbar-thin"
      />

      {/* Barra de Ações Inferior */}
      <div class="flex items-center justify-between pt-2 px-1 text-xs select-none">
        <div class="flex items-center gap-2 text-zinc-400">
          {/* Seletor de Agente Secretário / Secretário Executivo */}
          <select
            class="bg-zinc-800 border border-zinc-700/80 rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none cursor-pointer hover:bg-zinc-700/80 transition-colors"
            value={props.agenteSelecionado}
            onChange={(e) => props.onMudarAgente(e.currentTarget.value as any)}
          >
            <option value="secretario-exec">secretário-exec (ações)</option>
            <option value="secretario">secretário (consulta)</option>
          </select>

          {/* Botão de Anexo */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            class="hidden"
            onChange={handleFileChange}
          />
          <IconButton
            size="sm"
            variant="ghost"
            onClick={() => fileInputRef.click()}
            title="Anexar arquivo ou imagem"
            aria-label="Anexar arquivo ou imagem"
            class="text-zinc-400 hover:text-zinc-200"
          >
            <Paperclip size={15} />
          </IconButton>

          {/* Atalhos Rápidos Clicáveis para Acionar / @ ! */}
          <div class="hidden sm:flex items-center gap-1 font-mono text-[10px]">
            <button
              type="button"
              onClick={() => {
                props.onInput("/");
                setModoMenu("slash");
                setQueryMenu("");
                setIndiceAtivo(0);
                textareaRef?.focus();
              }}
              class="px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-750 text-purple-400 hover:text-purple-300 border border-zinc-700/60 cursor-pointer transition-colors"
              title="Inserir comando /"
            >
              / comandos
            </button>
            <button
              type="button"
              onClick={() => {
                props.onInput("@");
                setModoMenu("at");
                setQueryMenu("");
                setIndiceAtivo(0);
                textareaRef?.focus();
              }}
              class="px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-750 text-emerald-400 hover:text-emerald-300 border border-zinc-700/60 cursor-pointer transition-colors"
              title="Inserir menção @"
            >
              @ contexto
            </button>
            <button
              type="button"
              onClick={() => {
                props.onInput("!");
                setModoMenu("bang");
                setQueryMenu("");
                setIndiceAtivo(0);
                textareaRef?.focus();
              }}
              class="px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-750 text-amber-400 hover:text-amber-300 border border-zinc-700/60 cursor-pointer transition-colors"
              title="Inserir terminal !"
            >
              ! shell
            </button>
          </div>
        </div>

        {/* Botão de Envio ou Parar */}
        <div>
          <Show
            when={props.carregando}
            fallback={
              <button
                onClick={dispararEnvio}
                disabled={!props.valor.trim() && props.anexos.length === 0}
                class="flex items-center justify-center h-8 w-8 rounded-full bg-zinc-100 text-zinc-950 font-bold transition-all disabled:opacity-30 disabled:pointer-events-none hover:bg-white active:scale-95 shadow-md cursor-pointer"
                title="Enviar mensagem (Enter)"
                aria-label="Enviar mensagem"
              >
                <ArrowUp size={16} stroke-width={2.5} />
              </button>
            }
          >
            <button
              onClick={props.onParar}
              class="flex items-center justify-center h-8 w-8 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all active:scale-95 shadow-md cursor-pointer animate-pulse"
              title="Interromper geração"
              aria-label="Interromper geração"
            >
              <Square size={13} fill="currentColor" />
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
};
