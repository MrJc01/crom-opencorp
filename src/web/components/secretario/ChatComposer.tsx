import { type Component, createSignal, Show, For, onMount, onCleanup, createMemo } from "solid-js";
import {
  ArrowUp,
  Plus,
  ChevronDown,
  Sparkles,
  Paperclip,
  GitBranch,
  FolderGit2,
  Cpu,
  Layers,
  Settings2,
  Terminal,
  Bot,
  FileText,
  CheckSquare,
  CornerDownLeft,
  X,
  Stethoscope,
  Code2,
  HelpCircle,
} from "lucide-solid";

export interface AutocompleteItem {
  id: string;
  tipo: "slash" | "at" | "bang";
  gatilho: string;
  titulo: string;
  descricao: string;
  categoria: string;
  icone: any;
}

export interface ChatComposerProps {
  value: string;
  onInput: (val: string) => void;
  onSubmit: (val: string) => void;
  selectedModel?: string;
  onSelectModel?: (m: string) => void;
  selectedContext?: string;
  onSelectContext?: (c: string) => void;
  variant?: "pure" | "executive" | "terminal" | "glass";
  placeholder?: string;
  onOpenConfig?: () => void;
}

const MODEL_OPTIONS = [
  { id: "openrouter/google/gemini-2.5-flash", name: "gemini-2.5-flash", desc: "Google · Ultra rápido (240ms)" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", name: "llama-3.3-70b", desc: "Meta · 70B Custo zero nativo" },
  { id: "anthropic/claude-3-7-sonnet", name: "claude-3-7-sonnet", desc: "Anthropic · Code & Architecture" },
  { id: "deepseek/deepseek-r1:free", name: "deepseek-r1", desc: "DeepSeek · Raciocínio matemático" },
  { id: "openai/gpt-4o-mini", name: "gpt-4o-mini", desc: "OpenAI · Equilibrado e rápido" },
  { id: "google/gemini-2.0-flash-exp:free", name: "gemini-2.0-flash-exp", desc: "Google · Raciocínio veloz" },
];

const CONTEXT_OPTIONS = [
  "Default (Workspace)",
  "Full Codebase",
  "Docs & Specs",
  "Git Diff Only",
  "yt-factory-01",
];

const AUTOCOMPLETE_CATALOG: AutocompleteItem[] = [
  // 1. Slash commands (/)
  {
    id: "slash-status",
    tipo: "slash",
    gatilho: "/status",
    titulo: "/status",
    descricao: "Verifica integridade dos workspaces, rotação de modelos e agentes",
    categoria: "Sistema",
    icone: Sparkles,
  },
  {
    id: "slash-doctor",
    tipo: "slash",
    gatilho: "/doctor",
    titulo: "/doctor",
    descricao: "Diagnóstico profundo de portas, daemon OpenCode e conexões",
    categoria: "Sistema",
    icone: Stethoscope,
  },
  {
    id: "slash-agents",
    tipo: "slash",
    gatilho: "/agents",
    titulo: "/agents",
    descricao: "Lista catálogo de agentes disponíveis e seus papéis",
    categoria: "Agentes",
    icone: Bot,
  },
  {
    id: "slash-tasks",
    tipo: "slash",
    gatilho: "/tasks",
    titulo: "/tasks",
    descricao: "Exibe quadro Kanban de tarefas da fábrica YouTube",
    categoria: "Tasks",
    icone: CheckSquare,
  },
  {
    id: "slash-git-diff",
    tipo: "slash",
    gatilho: "/git diff",
    titulo: "/git diff",
    descricao: "Exibe o diff unificado dos arquivos alterados no workspace",
    categoria: "Git",
    icone: Code2,
  },
  {
    id: "slash-clear",
    tipo: "slash",
    gatilho: "/clear",
    titulo: "/clear",
    descricao: "Limpa o histórico visível de mensagens desta sessão",
    categoria: "Sessão",
    icone: CornerDownLeft,
  },
  {
    id: "slash-help",
    tipo: "slash",
    gatilho: "/help",
    titulo: "/help",
    descricao: "Lista completa de atalhos e comandos disponíveis",
    categoria: "Ajuda",
    icone: HelpCircle,
  },

  // 2. Mentions (@)
  {
    id: "at-secretario-exec",
    tipo: "at",
    gatilho: "@agente:secretario-exec",
    titulo: "@agente:secretario-exec",
    descricao: "Orquestrador autônomo com permissão de executar ferramentas",
    categoria: "Agente",
    icone: Bot,
  },
  {
    id: "at-pautador-youtube",
    tipo: "at",
    gatilho: "@agente:pautador-youtube",
    titulo: "@agente:pautador-youtube",
    descricao: "Especialista em roteiros e auditoria de canais YouTube",
    categoria: "Agente",
    icone: Bot,
  },
  {
    id: "at-file-check-streams",
    tipo: "at",
    gatilho: "@arquivo:scripts/check_streams.py",
    titulo: "@arquivo:scripts/check_streams.py",
    descricao: "Script Python de auditoria de transmissões ao vivo",
    categoria: "Arquivo",
    icone: FileText,
  },
  {
    id: "at-file-schedule",
    tipo: "at",
    gatilho: "@arquivo:scripts/get_schedule.py",
    titulo: "@arquivo:scripts/get_schedule.py",
    descricao: "Script de consulta da grade de agendamentos diários",
    categoria: "Arquivo",
    icone: FileText,
  },
  {
    id: "at-task-boletim",
    tipo: "at",
    gatilho: "@task:boletim-diario-youtube",
    titulo: "@task:boletim-diario-youtube",
    descricao: "Tarefa de consolidação de dados dos 28 canais",
    categoria: "Task",
    icone: CheckSquare,
  },

  // 3. Bang Terminal Commands (!)
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
    id: "bang-git-status",
    tipo: "bang",
    gatilho: "!git status",
    titulo: "!git status",
    descricao: "Consulta estado dos arquivos no repositório git",
    categoria: "Git",
    icone: Code2,
  },
  {
    id: "bang-npm-test",
    tipo: "bang",
    gatilho: "!npm test",
    titulo: "!npm test",
    descricao: "Executa suíte de testes de integração do workspace",
    categoria: "Script",
    icone: Terminal,
  },
  {
    id: "bang-ls",
    tipo: "bang",
    gatilho: "!ls -la",
    titulo: "!ls -la",
    descricao: "Lista arquivos e diretórios da raiz do projeto",
    categoria: "Shell",
    icone: Terminal,
  },
];

export const ChatComposer: Component<ChatComposerProps> = (props) => {
  let textareaRef: HTMLTextAreaElement | undefined;
  const [modelDropdownOpen, setModelDropdownOpen] = createSignal(false);
  const [contextDropdownOpen, setContextDropdownOpen] = createSignal(false);
  const [attachments, setAttachments] = createSignal<string[]>([]);

  // Estado do Autocomplete (/ @ !)
  const [modoMenu, setModoMenu] = createSignal<"slash" | "at" | "bang" | null>(null);
  const [queryMenu, setQueryMenu] = createSignal("");
  const [indiceAtivo, setIndiceAtivo] = createSignal(0);

  const currentModel = () => props.selectedModel || "openrouter/google/gemini-2.5-flash";
  const currentContext = () => props.selectedContext || "Default (Workspace)";

  const containerStyle = () => {
    switch (props.variant) {
      case "glass":
        return "bg-zinc-900/70 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/60 rounded-2xl";
      case "executive":
        return "bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg";
      case "terminal":
        return "bg-zinc-950 border border-zinc-700/80 rounded-lg shadow-md font-mono";
      case "pure":
      default:
        return "bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl shadow-black/40";
    }
  };

  // Fecha dropdowns ao clicar fora
  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-model-picker]") && !target.closest("[data-context-picker]") && !target.closest("[data-autocomplete-popover]")) {
        setModelDropdownOpen(false);
        setContextDropdownOpen(false);
        setModoMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    onCleanup(() => document.removeEventListener("mousedown", handleClickOutside));
  });

  const verificarGatilhos = (texto: string) => {
    // 1. Slash command no início: /query
    const slashMatch = texto.match(/^\/([a-zA-Z0-9_-]*)$/);
    if (slashMatch) {
      setModoMenu("slash");
      setQueryMenu(slashMatch[1]?.toLowerCase() || "");
      setIndiceAtivo(0);
      return;
    }

    // 2. Bang shell command no início: !query
    const bangMatch = texto.match(/^!([a-zA-Z0-9_\s-]*)$/);
    if (bangMatch) {
      setModoMenu("bang");
      setQueryMenu(bangMatch[1]?.toLowerCase() || "");
      setIndiceAtivo(0);
      return;
    }

    // 3. Mention anywhere: @query
    const atMatch = texto.match(/(?:^|\s)@([a-zA-Z0-9_.:/-]*)$/);
    if (atMatch) {
      setModoMenu("at");
      setQueryMenu(atMatch[1]?.toLowerCase() || "");
      setIndiceAtivo(0);
      return;
    }

    setModoMenu(null);
  };

  const itensFiltrados = createMemo(() => {
    const modo = modoMenu();
    if (!modo) return [];
    const q = queryMenu().trim().toLowerCase();
    const itens = AUTOCOMPLETE_CATALOG.filter((i) => i.tipo === modo);
    if (!q) return itens;
    return itens.filter(
      (i) =>
        i.gatilho.toLowerCase().includes(q) ||
        i.titulo.toLowerCase().includes(q) ||
        i.descricao.toLowerCase().includes(q)
    );
  });

  const selecionarItem = (item: AutocompleteItem) => {
    let novoTexto = props.value;
    if (item.tipo === "slash") {
      novoTexto = `${item.gatilho} `;
    } else if (item.tipo === "bang") {
      novoTexto = `${item.gatilho} `;
    } else if (item.tipo === "at") {
      novoTexto = novoTexto.replace(/(?:^|\s)@([a-zA-Z0-9_.:/-]*)$/, ` ${item.gatilho} `).trimStart();
    }
    props.onInput(novoTexto);
    setModoMenu(null);
    textareaRef?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (modoMenu() && itensFiltrados().length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndiceAtivo((prev) => (prev + 1) % itensFiltrados().length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndiceAtivo((prev) => (prev - 1 + itensFiltrados().length) % itensFiltrados().length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const sel = itensFiltrados()[indiceAtivo()];
        if (sel) {
          selecionarItem(sel);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setModoMenu(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      props.onSubmit(props.value);
    }
  };

  const triggerGatilhoRapido = (char: "/" | "@" | "!") => {
    props.onInput(char);
    verificarGatilhos(char);
    textareaRef?.focus();
  };

  const addSampleAttachment = () => {
    setAttachments((prev) => [...prev, `dados_workspace_${prev.length + 1}.json`]);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div class="w-full max-w-3xl mx-auto px-2 sm:px-4 pb-2 sm:pb-4 relative">
      {/* Popover de Autocomplete Flutuante */}
      <Show when={modoMenu() && itensFiltrados().length > 0}>
        <div
          data-autocomplete-popover
          class="absolute bottom-full mb-3 inset-x-2 sm:inset-x-4 rounded-2xl bg-zinc-950/98 border border-zinc-700 shadow-2xl backdrop-blur-xl p-2 z-50 text-xs max-h-72 overflow-y-auto scrollbar-thin animate-in fade-in slide-in-from-bottom-2 duration-150 text-zinc-100"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div class="px-2.5 py-1 mb-1 border-b border-zinc-800/80 flex items-center justify-between text-[11px] font-mono">
            <div class="flex items-center gap-1.5 font-bold">
              <Show when={modoMenu() === "slash"}>
                <span class="text-purple-400">/ Comandos Rápidos</span>
              </Show>
              <Show when={modoMenu() === "at"}>
                <span class="text-emerald-400">@ Menções (Agente · Arquivo · Task)</span>
              </Show>
              <Show when={modoMenu() === "bang"}>
                <span class="text-amber-400">! Comandos de Terminal (Shell)</span>
              </Show>
            </div>
            <span class="text-zinc-500 text-[10px]">
              ↑↓ navega · Tab/↵ escolhe · Esc fecha
            </span>
          </div>

          <div class="space-y-0.5">
            <For each={itensFiltrados()}>
              {(item, idx) => {
                const Icone = item.icone;
                const ativo = () => indiceAtivo() === idx();
                return (
                  <button
                    type="button"
                    onClick={() => selecionarItem(item)}
                    onMouseEnter={() => setIndiceAtivo(idx())}
                    class={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                      ativo()
                        ? "bg-zinc-800 text-zinc-100 shadow-sm"
                        : "hover:bg-zinc-900/70 text-zinc-300"
                    }`}
                  >
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div
                        class={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${
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
                        <div class="font-mono text-xs font-bold text-zinc-100 truncate">{item.titulo}</div>
                        <div class="text-[11px] text-zinc-400 truncate leading-snug">{item.descricao}</div>
                      </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
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

      {/* Caixa do Composer */}
      <div class={`p-2.5 sm:p-3 transition-all duration-200 ${containerStyle()}`}>
        {/* Anexos Ativos */}
        <Show when={attachments().length > 0}>
          <div class="flex flex-wrap gap-1.5 pb-2 mb-1.5 border-b border-zinc-800/60">
            <For each={attachments()}>
              {(att, i) => (
                <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-800 text-[11px] text-zinc-200 border border-zinc-700">
                  <Paperclip size={11} class="text-zinc-400" />
                  <span class="font-mono truncate max-w-[140px]">{att}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i())}
                    class="text-zinc-400 hover:text-rose-400 ml-1 cursor-pointer"
                  >
                    <X size={11} />
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Textarea principal */}
        <textarea
          ref={textareaRef}
          rows={2}
          value={props.value}
          onInput={(e) => {
            const val = e.currentTarget.value;
            props.onInput(val);
            verificarGatilhos(val);
          }}
          onKeyDown={handleKeyDown}
          placeholder={props.placeholder || "Pergunte ao Secretário Executivo… (/ comandos, @ contexto, ! terminal)"}
          class="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none scrollbar-none leading-relaxed"
        />

        {/* Barra interna de rodapé do Composer */}
        <div class="flex items-center justify-between pt-2 mt-1 border-t border-zinc-800/60 text-xs gap-1.5">
          <div class="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-1 overflow-x-auto scrollbar-none py-0.5">
            {/* Botão de Anexo (+) */}
            <button
              type="button"
              onClick={addSampleAttachment}
              class="h-7 w-7 shrink-0 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer border border-zinc-700/50"
              title="Adicionar arquivo anexado"
            >
              <Plus size={14} />
            </button>

            {/* Dropdown de Modelo Interativo */}
            <div class="relative shrink-0" data-model-picker>
              <button
                type="button"
                onClick={() => {
                  setModelDropdownOpen(!modelDropdownOpen());
                  setContextDropdownOpen(false);
                }}
                class="h-7 px-2 sm:px-2.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-750 text-zinc-300 flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer border border-zinc-700/60 font-mono text-[10px] sm:text-[11px]"
                title="Alterar modelo ativo"
              >
                <Cpu size={12} class="text-emerald-400 shrink-0" />
                <span class="truncate max-w-[80px] sm:max-w-[130px]">{currentModel().split("/").slice(-1)[0]}</span>
                <ChevronDown size={10} class={`text-zinc-500 ml-0.5 shrink-0 transition-transform ${modelDropdownOpen() ? "rotate-180" : ""}`} />
              </button>

              <Show when={modelDropdownOpen()}>
                <div class="absolute bottom-full left-0 mb-2 w-64 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div class="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800/80 mb-1">
                    Selecionar Modelo em Execução
                  </div>
                  <For each={MODEL_OPTIONS}>
                    {(m) => (
                      <button
                        type="button"
                        onClick={() => {
                          props.onSelectModel?.(m.id);
                          setModelDropdownOpen(false);
                        }}
                        class={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex flex-col transition-colors cursor-pointer ${
                          currentModel() === m.id
                            ? "bg-emerald-950/40 text-emerald-300 font-medium border border-emerald-800/40"
                            : "hover:bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        <span class="font-mono font-semibold">{m.name}</span>
                        <span class="text-[10px] text-zinc-500">{m.desc}</span>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            {/* Dropdown de Contexto Interativo */}
            <div class="relative shrink-0" data-context-picker>
              <button
                type="button"
                onClick={() => {
                  setContextDropdownOpen(!contextDropdownOpen());
                  setModelDropdownOpen(false);
                }}
                class="h-7 px-2 sm:px-2.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-750 text-zinc-300 flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer border border-zinc-700/60 text-[10px] sm:text-[11px]"
                title="Alterar escopo de contexto"
              >
                <Layers size={12} class="text-sky-400 shrink-0" />
                <span class="truncate max-w-[60px] sm:max-w-[90px]">{currentContext()}</span>
                <ChevronDown size={10} class={`text-zinc-500 ml-0.5 shrink-0 transition-transform ${contextDropdownOpen() ? "rotate-180" : ""}`} />
              </button>

              <Show when={contextDropdownOpen()}>
                <div class="absolute bottom-full left-0 mb-2 w-48 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div class="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800/80 mb-1">
                    Contexto do Workspace
                  </div>
                  <For each={CONTEXT_OPTIONS}>
                    {(c) => (
                      <button
                        type="button"
                        onClick={() => {
                          props.onSelectContext?.(c);
                          setContextDropdownOpen(false);
                        }}
                        class={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          currentContext() === c
                            ? "bg-sky-950/40 text-sky-300 font-medium border border-sky-800/40"
                            : "hover:bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        {c}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            {/* Pílulas Rápidas Clicáveis: [/] [@] [!] */}
            <div class="hidden sm:flex items-center gap-1 ml-1 text-[10px] font-mono">
              <button
                type="button"
                onClick={() => triggerGatilhoRapido("/")}
                class="px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-purple-950/40 hover:text-purple-300 text-zinc-400 border border-zinc-700/60 cursor-pointer transition-colors"
                title="Inserir / para comandos"
              >
                /
              </button>
              <button
                type="button"
                onClick={() => triggerGatilhoRapido("@")}
                class="px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-emerald-950/40 hover:text-emerald-300 text-zinc-400 border border-zinc-700/60 cursor-pointer transition-colors"
                title="Inserir @ para agentes e arquivos"
              >
                @
              </button>
              <button
                type="button"
                onClick={() => triggerGatilhoRapido("!")}
                class="px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-amber-950/40 hover:text-amber-300 text-zinc-400 border border-zinc-700/60 cursor-pointer transition-colors"
                title="Inserir ! para comandos shell"
              >
                !
              </button>
            </div>

            {/* Botão de Configuração do Secretário */}
            <Show when={props.onOpenConfig}>
              <button
                type="button"
                onClick={props.onOpenConfig}
                class="h-7 px-2 rounded-lg bg-zinc-800/70 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors cursor-pointer border border-zinc-700/50 text-[10px] shrink-0"
                title="Abrir Menu de Configuração Lateral do Secretário"
              >
                <Settings2 size={12} class="text-zinc-400" />
                <span class="hidden md:inline">Config</span>
              </button>
            </Show>
          </div>

          {/* Botão de Envio (↑) */}
          <button
            type="button"
            onClick={() => props.onSubmit(props.value)}
            disabled={!props.value.trim()}
            class={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center transition-all cursor-pointer ${
              props.value.trim()
                ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400 shadow-md shadow-emerald-500/20 active:scale-95"
                : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
            }`}
            title="Enviar mensagem (Enter)"
          >
            <ArrowUp size={14} stroke-width={2.5} />
          </button>
        </div>
      </div>

      {/* Identificação da branch e atalhos rápidos no rodapé */}
      <div class="flex items-center justify-between px-2 pt-1.5 text-[10px] text-zinc-500 font-mono select-none">
        <div class="flex items-center gap-1.5 hover:text-zinc-400 transition-colors cursor-pointer truncate max-w-[240px] sm:max-w-none">
          <FolderGit2 size={11} class="text-zinc-500 shrink-0" />
          <span class="truncate">opencorp</span>
          <span class="text-zinc-600">/</span>
          <GitBranch size={10} class="text-emerald-500/80 shrink-0" />
          <span class="text-zinc-400 truncate">feat/ecossistema</span>
        </div>

        <div class="hidden sm:flex items-center gap-3 shrink-0">
          <span><kbd class="px-1 py-0.2 rounded bg-zinc-800/80 border border-zinc-700/60 text-zinc-400">Enter</kbd> enviar</span>
          <span><kbd class="px-1 py-0.2 rounded bg-zinc-800/80 border border-zinc-700/60 text-zinc-400">Shift+Enter</kbd> quebra</span>
        </div>
      </div>
    </div>
  );
};
export const SharedComposer = ChatComposer;
export default ChatComposer;
