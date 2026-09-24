import { type Component, createSignal, onMount, onCleanup, For, Show, createMemo, createEffect } from "solid-js";
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
  Clock,
  FolderGit2,
  GitBranch,
  Plus,
  ChevronDown,
  Cpu,
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
  /** Subtipo da menção `@` (taxonomia F3-T01): agente | prompt | arquivo | task. */
  subtipo?: "agente" | "prompt" | "arquivo" | "task";
  gatilho: string; // ex: "/status" ou "@agente:secretario-exec" ou "!oc status"
  titulo: string;
  descricao: string;
  categoria: string;
  icone: any;
}

export interface PromptInputProps {
  valor?: string;
  onInput?: (v: string) => void;
  onEnviar?: () => void;
  onEnfileirar?: (texto: string, anexos?: Anexo[]) => void;
  onParar?: () => void;
  carregando?: boolean;
  anexos?: Anexo[];
  onAdicionarAnexo?: (a: Anexo) => void;
  onRemoverAnexo?: (index: number) => void;
  placeholder?: string;
  agenteSelecionado?: string;
  onMudarAgente?: (ag: any) => void;
  agentesLista?: Array<{ id: string; role?: string }>;
  modeloAtivo?: string;
  onMudarModelo?: (modelo: string) => void;
  branchAtiva?: string;
  workspaceId?: string;
  onAbrirConfig?: () => void;
  refTextarea?: (el: HTMLTextAreaElement) => void;
  /** Id do textarea (default `chat-input`; único por superfície montada). */
  id?: string;
}

export const PromptInput: Component<PromptInputProps> = (props) => {
  let textareaRef!: HTMLTextAreaElement;
  let fileInputRef!: HTMLInputElement;
  /** Prefixo dos ids dos botões derivado do id do textarea (evita duplicados com 2 superfícies). */
  const prefixoBotoes = () =>
    props.id && props.id !== "chat-input" ? `${props.id.replace(/-input$/, "")}-` : "";

  // Estado do Autocomplete (/ @ !)
  const [modoMenu, setModoMenu] = createSignal<"slash" | "at" | "bang" | null>(null);
  const [queryMenu, setQueryMenu] = createSignal("");
  const [indiceAtivo, setIndiceAtivo] = createSignal(0);

  // Estado do Seletor de Modelo embutido
  const [modelDropdownOpen, setModelDropdownOpen] = createSignal(false);
  const MODEL_OPTIONS = [
    { id: "openrouter/google/gemini-2.5-flash", name: "gemini-2.5-flash", desc: "Google · Ultra rápido" },
    { id: "meta-llama/llama-3.3-70b-instruct:free", name: "llama-3.3-70b", desc: "Meta · 70B Custo zero nativo" },
    { id: "anthropic/claude-3-7-sonnet", name: "claude-3-7-sonnet", desc: "Anthropic · Code & Architecture" },
    { id: "deepseek/deepseek-r1:free", name: "deepseek-r1", desc: "DeepSeek · Raciocínio matemático" },
    { id: "openai/gpt-4o-mini", name: "gpt-4o-mini", desc: "OpenAI · Equilibrado e rápido" },
  ];

  onMount(() => {
    const handleClickFora = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-model-picker]")) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("click", handleClickFora);
    onCleanup(() => document.removeEventListener("click", handleClickFora));
  });

  // Itens dinâmicos para @ (agentes e tasks do workspace)
  const [listaTasks, setListaTasks] = createSignal<any[]>([]);
  const [listaAgentes, setListaAgentes] = createSignal<any[]>([]);

  // F3-T01: estado dos 3 visuais de menção.
  //  - @agente   → pill de destinatário (não vira texto)
  //  - @contexto → chip resolvido (arquivo/task)
  //  - @prompt   → texto editável (Esc desfaz a expansão)
  const [agenteMencio, setAgenteMencio] = createSignal<string | null>(null);
  const [valorAntesPrompt, setValorAntesPrompt] = createSignal<string | null>(null);

  const valorTexto = () => props.valor || "";
  const listaAnexos = () => props.anexos || [];

  const ALTURA_MINIMA = 38;
  const ALTURA_MAXIMA = 220;
  const [emFoco, setEmFoco] = createSignal(false);

  const autoResize = () => {
    if (!textareaRef) return;
    const val = textareaRef.value ?? valorTexto() ?? "";
    const isFocado = emFoco() || (typeof document !== "undefined" && document.activeElement === textareaRef);

    // Se estiver vazio, volta imediatamente à altura mínima padrão (1 linha)
    if (!val.trim()) {
      textareaRef.style.height = `${ALTURA_MINIMA}px`;
      textareaRef.style.overflowY = "hidden";
      return;
    }

    // Se o foco estiver fora do input, diminui para a altura compacta inicial
    if (!isFocado) {
      textareaRef.style.height = `${ALTURA_MINIMA}px`;
      textareaRef.style.overflowY = "hidden";
      return;
    }

    // Em foco: adapta dinamicamente às linhas puladas respeitando o limite máximo
    textareaRef.style.height = "0px";
    const scrollH = textareaRef.scrollHeight;
    const novaAltura = Math.max(ALTURA_MINIMA, Math.min(scrollH, ALTURA_MAXIMA));
    textareaRef.style.height = `${novaAltura}px`;
    textareaRef.style.overflowY = scrollH > ALTURA_MAXIMA ? "auto" : "hidden";
  };

  // Monitora alterações no valor para auto-redimensionar e sincronizar o DOM
  createEffect(() => {
    const val = valorTexto();
    if (textareaRef && textareaRef.value !== val) {
      textareaRef.value = val;
    }
    setTimeout(autoResize, 10);
  });

  onMount(async () => {
    if (textareaRef) {
      textareaRef.addEventListener("focus", () => {
        setEmFoco(true);
        autoResize();
      });
      textareaRef.addEventListener("blur", () => {
        setEmFoco(false);
        autoResize();
      });
    }

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
          id: "slash-git-status",
          tipo: "slash",
          gatilho: "/git status",
          titulo: "/git status",
          descricao: "Lista arquivos modificados no workspace com cards interativos de diff e descarte",
          categoria: "Git",
          icone: FolderGit2,
        },
        {
          id: "slash-git-diff",
          tipo: "slash",
          gatilho: "/git diff",
          titulo: "/git diff [arquivo]",
          descricao: "Exibe diff unificado colorido do repositório ou de um arquivo específico",
          categoria: "Git",
          icone: Code2,
        },
        {
          id: "slash-git-restore",
          tipo: "slash",
          gatilho: "/git restore",
          titulo: "/git restore <arquivo>",
          descricao: "Descarta modificações locais cirurgicamente em um único arquivo",
          categoria: "Git",
          icone: RotateCcw,
        },
        {
          id: "slash-restore",
          tipo: "slash",
          gatilho: "/restore",
          titulo: "/restore <arquivo>",
          descricao: "Atalho rápido para descartar alterações de um arquivo",
          categoria: "Git",
          icone: RotateCcw,
        },
        {
          id: "slash-git-log",
          tipo: "slash",
          gatilho: "/git log",
          titulo: "/git log",
          descricao: "Exibe os últimos commits semânticos dos agentes no workspace",
          categoria: "Git",
          icone: GitBranch,
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
      const itens: AutocompleteItem[] = [];

      // ── Agentes (dinâmicos do workspace; fallback aos predefinidos) ──
      const agentesFallback = [
        { id: "secretario-exec", role: "Orquestrador autônomo com permissão de executar ferramentas" },
        { id: "secretario", role: "Consultor executivo e analista estratégico" },
        { id: "editor", role: "Redator e publicador de artigos no WordPress" },
        { id: "critico-site", role: "Auditor de qualidade visual, layout e rascunhos" },
        { id: "pesquisador-fontes", role: "Curador de notícias e tendências em tempo real" },
        { id: "corretor-site", role: "Saneador de rascunhos tóxicos e tags quebradas" },
        { id: "executor-padrao", role: "Executor técnico de código e infraestrutura" },
      ];
      const agentesVisiveis = listaAgentes().length > 0 ? listaAgentes() : agentesFallback;
      for (const a of agentesVisiveis.slice(0, 12)) {
        itens.push({
          id: `at-agente-${a.id}`,
          tipo: "at",
          subtipo: "agente",
          gatilho: `@agente:${a.id}`,
          titulo: `@agente:${a.id}`,
          descricao: a.role || "Agente do workspace",
          categoria: "Agente",
          icone: Bot,
        });
      }

      // ── Prompt (F3-T02: sem endpoint HTTP ainda — TODO ligar ao PromptStore) ──
      const chavePrompt = /^prompt:([A-Za-z0-9._-]+)$/i.exec(queryMenu().trim());
      if (chavePrompt) {
        itens.push({
          id: "at-prompt-digitado",
          tipo: "at",
          subtipo: "prompt",
          gatilho: `@prompt:${chavePrompt[1]!}`,
          titulo: `@prompt:${chavePrompt[1]!}`,
          descricao: "Expande o prompt salvo para texto editável",
          categoria: "Prompt",
          icone: FileText,
        });
      } else {
        itens.push({
          id: "at-prompt-exemplo",
          tipo: "at",
          subtipo: "prompt",
          gatilho: "@prompt:saudacao-inicial",
          titulo: "@prompt:saudacao-inicial",
          descricao: "Digite @prompt:<chave> para expandir um prompt salvo (PromptStore)",
          categoria: "Prompt",
          icone: FileText,
        });
      }

      // ── Arquivo ──
      itens.push(
        {
          id: "at-file-scripts-wp",
          tipo: "at",
          subtipo: "arquivo",
          gatilho: "@arquivo:scripts/wp.cjs",
          titulo: "@arquivo:scripts/wp.cjs",
          descricao: "Script utilitário de integração com WordPress",
          categoria: "Arquivo",
          icone: FileText,
        },
        {
          id: "at-file-docs",
          tipo: "at",
          subtipo: "arquivo",
          gatilho: "@arquivo:docs/",
          titulo: "@arquivo:docs/",
          descricao: "Documentação do projeto e manuais técnicos",
          categoria: "Arquivo",
          icone: FileText,
        },
      );

      // ── Tasks ativas carregadas do workspace ──
      for (const t of listaTasks().slice(0, 8)) {
        itens.push({
          id: `at-task-${t.id}`,
          tipo: "at",
          subtipo: "task",
          gatilho: `@task:${t.id}`,
          titulo: `@task:${t.id}`,
          descricao: `${t.titulo} (${t.coluna})`,
          categoria: "Task",
          icone: CheckSquare,
        });
      }

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

  // F3-T01: seções do menu `@` na ordem Agente | Prompt | Arquivo | Task.
  const secoesAt = createMemo(() => {
    if (modoMenu() !== "at") return null;
    const ordem = ["Agente", "Prompt", "Arquivo", "Task"];
    const grupos = new Map<string, AutocompleteItem[]>();
    for (const i of itensFiltrados()) {
      const secao = i.subtipo
        ? ordem.find((o) => o === i.categoria) ?? i.categoria
        : i.categoria;
      const chave = secao || "Outros";
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave)!.push(i);
    }
    return ordem.filter((s) => grupos.has(s)).map((s) => ({ secao: s, itens: grupos.get(s)! }));
  });

  // F3-T01: extrai menções de contexto (@arquivo / @task) do texto para chips resolvidos.
  const chipsContexto = createMemo(() => {
    const texto = valorTexto();
    const chips: Array<{ tipo: string; valor: string; label: string }> = [];
    for (const m of texto.matchAll(/@(arquivo|task):([^\s@]+)/g)) {
      chips.push({ tipo: m[1]!, valor: m[2]!, label: `${m[1]}:${m[2]}` });
    }
    return chips;
  });

  const removerMençãoDoTexto = (label: string) => {
    const alvo = `@${label}`;
    const novo = valorTexto().replace(new RegExp(`@${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`), "").replace(/\s+/g, " ").trim();
    props.onInput(novo);
  };

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

    // 3. Mention anywhere: @query no final da digitação (suporta @tipo:valor)
    const atMatch = texto.match(/(?:^|\s)@([a-zA-Z0-9_.:/-]*)$/);
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
      const subtipo = item.subtipo ?? "agente";

      if (subtipo === "agente") {
        // Pill de destinatário: NÃO vira texto — troca o campo `agente` do envio.
        const id = item.gatilho.replace(/^@agente:/, "");
        const novo = atual.replace(/@([a-zA-Z0-9_.:/-]*)$/, "").replace(/\s+$/, "");
        props.onInput(novo);
        setAgenteMencio(id);
        props.onMudarAgente?.(id);
      } else if (subtipo === "prompt") {
        // Texto editável: injeta @prompt:<chave>; Esc desfaz a expansão.
        setValorAntesPrompt(atual);
        const novo = atual.replace(/@([a-zA-Z0-9_.:/-]*)$/, `${item.gatilho} `);
        props.onInput(novo);
      } else {
        // @arquivo / @task → chip resolvido (o token fica no texto; o servidor hidrata).
        const novo = atual.replace(/@([a-zA-Z0-9_.:/-]*)$/, `${item.gatilho} `);
        props.onInput(novo);
      }
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

    // Esc desfaz a expansão de @prompt (texto editável volta ao valor anterior).
    if (e.key === "Escape" && valorAntesPrompt() !== null) {
      e.preventDefault();
      props.onInput(valorAntesPrompt() ?? "");
      setValorAntesPrompt(null);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      dispararEnvio();
    }
  };

  const dispararEnvio = () => {
    const txt = valorTexto().trim();
    const att = listaAnexos();
    if (!txt && att.length === 0) return;

    if (props.carregando) {
      if (props.onEnfileirar) {
        props.onEnfileirar(txt, att);
      } else {
        props.onEnviar?.();
      }
    } else {
      props.onEnviar?.();
    }

    if (textareaRef) {
      textareaRef.value = "";
      textareaRef.style.height = `${ALTURA_MINIMA}px`;
      textareaRef.style.overflowY = "hidden";
    }
    props.onInput?.("");
    setAgenteMencio(null);
    setValorAntesPrompt(null);
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
            props.onAdicionarAnexo?.({
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
        props.onAdicionarAnexo?.({
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
    <div class="w-full max-w-3xl mx-auto flex flex-col">
      <div class="relative flex flex-col w-full rounded-2xl bg-[#14151a] border border-zinc-800/90 shadow-2xl p-2.5 transition-all focus-within:border-zinc-700/80 focus-within:ring-1 focus-within:ring-zinc-700/40">
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
                  <span class="text-emerald-400">@ Menções (Agente · Prompt · Arquivo · Task)</span>
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
              <Show when={secoesAt() !== null} fallback={
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
                            <div class="font-mono text-xs font-bold text-zinc-100 truncate">{item.titulo}</div>
                            <div class="text-[11px] text-zinc-400 truncate leading-snug">{item.descricao}</div>
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
              }>
                <For each={secoesAt()!}>
                  {(secao) => (
                    <div>
                      <div class="px-2.5 pt-1 pb-0.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                        {secao.secao}
                      </div>
                      <For each={secao.itens}>
                        {(item) => {
                          const Icone = item.icone || Sparkles;
                          return (
                            <button
                              type="button"
                              onClick={() => selecionarItem(item)}
                              onMouseEnter={() => {
                                const idx = itensFiltrados().indexOf(item);
                                if (idx >= 0) setIndiceAtivo(idx);
                              }}
                              class="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-3 text-left transition-colors cursor-pointer hover:bg-zinc-900/60 text-zinc-300"
                            >
                              <div class="flex items-center gap-2.5 min-w-0">
                                <div class="h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                                  <Icone size={13} />
                                </div>
                                <div class="min-w-0">
                                  <div class="font-mono text-xs font-bold text-zinc-100 truncate">{item.titulo}</div>
                                  <div class="text-[11px] text-zinc-400 truncate leading-snug">{item.descricao}</div>
                                </div>
                              </div>
                              <div class="flex items-center gap-1.5 flex-shrink-0">
                                <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-500 border border-zinc-800">
                                  {item.categoria}
                                </span>
                              </div>
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </div>
        </Show>

        {/* Anexos Ativos */}
        <Show when={listaAnexos().length > 0}>
          <div class="flex flex-wrap gap-2 px-1 pb-2 border-b border-zinc-800/80 mb-2">
            <For each={listaAnexos()}>
              {(anexo, idx) => (
                <div class="relative group flex items-center gap-1.5 px-2 py-1 bg-zinc-800 rounded-md border border-zinc-700 text-xs text-zinc-200">
                  <Show when={anexo.mime.startsWith("image/")} fallback={<Paperclip size={12} class="text-zinc-400" />}>
                    <img src={anexo.url} alt={anexo.nome} class="h-6 w-6 rounded object-cover" />
                  </Show>
                  <span class="max-w-[120px] truncate text-[11px] font-medium">{anexo.nome}</span>
                  <button
                    onClick={() => props.onRemoverAnexo?.(idx())}
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

        {/* F3-T01: pill de destinatário (@agente) + chips de contexto (@arquivo/@task) */}
        <Show when={agenteMencio() !== null || chipsContexto().length > 0}>
          <div class="flex flex-wrap gap-2 px-1 pb-2 border-b border-zinc-800/80 mb-2">
            <Show when={agenteMencio() !== null}>
              <div
                data-testid="mention-agente-pill"
                class="flex items-center gap-1.5 px-2 py-1 bg-emerald-950/50 rounded-md border border-emerald-800/60 text-xs text-emerald-200"
              >
                <AtSign size={12} class="text-emerald-400" />
                <span class="text-[11px] font-medium">para @{agenteMencio()}</span>
                <button
                  onClick={() => setAgenteMencio(null)}
                  class="text-emerald-300 hover:text-rose-400 p-0.5 rounded transition-colors cursor-pointer"
                  title="Remover destinatário"
                >
                  <X size={12} />
                </button>
              </div>
            </Show>
            <For each={chipsContexto()}>
              {(chip) => (
                <div
                  data-testid={`mention-chip-${chip.tipo}`}
                  class="flex items-center gap-1.5 px-2 py-1 bg-zinc-800 rounded-md border border-zinc-700 text-xs text-zinc-200"
                >
                  <FileText size={12} class="text-zinc-400" />
                  <span class="max-w-[180px] truncate text-[11px] font-medium">{chip.label}</span>
                  <button
                    onClick={() => removerMençãoDoTexto(chip.label)}
                    class="text-zinc-400 hover:text-rose-400 p-0.5 rounded transition-colors cursor-pointer"
                    title="Remover contexto"
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
          id={props.id || "chat-input"}
          data-testid={props.id || "chat-input"}
          ref={(el) => {
            textareaRef = el;
            props.refTextarea?.(el);
          }}
          rows={1}
          prop:value={valorTexto()}
          value={valorTexto()}
          onFocusIn={() => {
            setEmFoco(true);
            autoResize();
          }}
          onFocusOut={() => {
            setEmFoco(false);
            autoResize();
          }}
          onInput={(e) => {
            const val = e.currentTarget.value;
            setEmFoco(true);
            props.onInput?.(val);
            verificarGatilhos(val);
            autoResize();
          }}
          onKeyDown={handleKeyDown}
          onPaste={(e) => {
            handlePaste(e);
            setTimeout(autoResize, 15);
          }}
          placeholder={props.placeholder || "Pergunte qualquer coisa, / para comandos, @ para contexto..."}
          class="w-full flex-none bg-transparent text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none px-2 py-1 leading-relaxed scrollbar-thin"
          style={{
            "min-height": `${ALTURA_MINIMA}px`,
            "max-height": `${ALTURA_MAXIMA}px`,
          }}
        />

        {/* Barra de Ações Inferior Embutida */}
        <div class="flex items-center justify-between pt-2 px-1 text-xs select-none gap-2 border-t border-zinc-800/60 mt-1">
          <div class="flex items-center gap-1.5 text-zinc-400 min-w-0 flex-1 overflow-x-auto scrollbar-none py-0.5">
            {/* Input oculto para arquivos */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              class="hidden"
              onChange={handleFileChange}
            />

            {/* Botão de Anexo (+) */}
            <button
              type="button"
              onClick={() => fileInputRef.click()}
              class="h-8 w-8 shrink-0 rounded-lg bg-zinc-800/90 hover:bg-zinc-750 text-zinc-300 hover:text-zinc-100 flex items-center justify-center transition-colors cursor-pointer border border-zinc-700/60"
              title="Anexar arquivo ou imagem"
              aria-label="Anexar arquivo ou imagem"
            >
              <Plus size={16} strokeWidth={2} />
            </button>

            {/* Dropdown Compacto de Modelo (OpenCode Style) */}
            <div class="relative shrink-0" data-model-picker>
              <button
                type="button"
                onClick={() => setModelDropdownOpen(!modelDropdownOpen())}
                class="h-8 px-2.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-750 text-zinc-300 flex items-center gap-1.5 transition-colors cursor-pointer border border-zinc-700/60 font-mono text-xs"
                title="Alterar modelo ativo"
              >
                <Cpu size={14} class="text-emerald-400 shrink-0" />
                <span class="truncate max-w-[90px] sm:max-w-[140px]">
                  {(props.modeloAtivo || "gemini-2.5-flash").split("/").slice(-1)[0]}
                </span>
                <ChevronDown
                  size={11}
                  class={`text-zinc-400 ml-0.5 shrink-0 transition-transform ${
                    modelDropdownOpen() ? "rotate-180" : ""
                  }`}
                />
              </button>

              <Show when={modelDropdownOpen()}>
                <div class="absolute bottom-full left-0 mb-2 w-64 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div class="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800/80 mb-1">
                    Modelo Ativo
                  </div>
                  <For each={MODEL_OPTIONS}>
                    {(m) => (
                      <button
                        type="button"
                        onClick={() => {
                          props.onMudarModelo?.(m.id);
                          setModelDropdownOpen(false);
                        }}
                        class={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex flex-col transition-colors cursor-pointer ${
                          props.modeloAtivo === m.id
                            ? "bg-emerald-950/40 text-emerald-300 font-medium border border-emerald-800/40"
                            : "hover:bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        <span class="font-mono font-semibold">{m.name}</span>
                        <span class="text-[10px] text-zinc-500">{m.desc}</span>
                      </button>
                    )}
                  </For>
                  <Show when={props.onAbrirConfig}>
                    <button
                      type="button"
                      onClick={() => {
                        setModelDropdownOpen(false);
                        props.onAbrirConfig?.();
                      }}
                      class="w-full mt-1 pt-1.5 border-t border-zinc-800 text-left px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-zinc-100 flex items-center justify-between cursor-pointer"
                    >
                      <span>Gerenciar modelos & rotação</span>
                      <span class="text-zinc-500">⚙</span>
                    </button>
                  </Show>
                </div>
              </Show>
            </div>

            {/* Seletor de Agente Compacto */}
            <select
              class="h-8 bg-zinc-800/90 border border-zinc-700/60 rounded-lg px-2 text-xs font-mono text-zinc-300 focus:outline-none cursor-pointer hover:bg-zinc-750 transition-colors max-w-[130px] sm:max-w-[160px] truncate shrink-0"
              value={props.agenteSelecionado || "secretario-exec"}
              onChange={(e) => props.onMudarAgente?.(e.currentTarget.value)}
              title="Destinatário da ordem"
            >
              <For
                each={
                  props.agentesLista && props.agentesLista.length > 0
                    ? props.agentesLista
                    : [
                        { id: "secretario-exec", role: "secretário-exec" },
                        { id: "secretario", role: "secretário" },
                      ]
                }
              >
                {(ag) => (
                  <option value={ag.id}>
                    @{ag.id}
                  </option>
                )}
              </For>
            </select>

            {/* Pílulas Rápidas Clicáveis para [/] [@] [!] */}
            <div class="hidden md:flex items-center gap-1 font-mono text-xs shrink-0">
              <button
                type="button"
                onClick={() => {
                  props.onInput?.("/");
                  setModoMenu("slash");
                  setQueryMenu("");
                  setIndiceAtivo(0);
                  textareaRef?.focus();
                }}
                class="h-6 px-2 rounded-md bg-zinc-800/80 hover:bg-purple-950/40 hover:text-purple-300 text-zinc-400 border border-zinc-700/60 cursor-pointer transition-colors font-semibold"
                title="Inserir comando /"
              >
                /
              </button>
              <button
                type="button"
                onClick={() => {
                  props.onInput?.("@");
                  setModoMenu("at");
                  setQueryMenu("");
                  setIndiceAtivo(0);
                  textareaRef?.focus();
                }}
                class="h-6 px-2 rounded-md bg-zinc-800/80 hover:bg-emerald-950/40 hover:text-emerald-300 text-zinc-400 border border-zinc-700/60 cursor-pointer transition-colors font-semibold"
                title="Inserir menção @"
              >
                @
              </button>
              <button
                type="button"
                onClick={() => {
                  props.onInput?.("!");
                  setModoMenu("bang");
                  setQueryMenu("");
                  setIndiceAtivo(0);
                  textareaRef?.focus();
                }}
                class="h-6 px-2 rounded-md bg-zinc-800/80 hover:bg-amber-950/40 hover:text-amber-300 text-zinc-400 border border-zinc-700/60 cursor-pointer transition-colors font-semibold"
                title="Inserir terminal !"
              >
                !
              </button>
            </div>
          </div>

          {/* Botão de Envio Circular, Parar ou Enfileirar */}
          <div class="flex items-center gap-1.5 shrink-0">
            <Show when={props.carregando}>
              <button
                type="button"
                onClick={props.onParar}
                class="flex items-center justify-center h-8 w-8 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all active:scale-95 shadow-md cursor-pointer animate-pulse"
                title="Interromper geração atual"
                aria-label="Interromper geração atual"
              >
                <Square size={13} fill="currentColor" />
              </button>
            </Show>

            <Show
              when={props.carregando && (valorTexto().trim() || listaAnexos().length > 0)}
            >
              <button
                type="button"
                id={`${prefixoBotoes()}btn-enfileirar`}
                data-testid={`${prefixoBotoes()}btn-enfileirar`}
                onClick={dispararEnvio}
                class="flex items-center gap-1.5 px-3 h-8 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all active:scale-95 shadow-md cursor-pointer text-xs"
                title="Adicionar prompt à fila de espera (Enter)"
                aria-label="Adicionar à fila de espera"
              >
                <Clock size={13} />
                <span>+ Fila</span>
              </button>
            </Show>

            <Show when={!props.carregando}>
              <button
                id={`${prefixoBotoes()}btn-enviar`}
                data-testid={`${prefixoBotoes()}btn-enviar`}
                onClick={dispararEnvio}
                disabled={!valorTexto().trim() && listaAnexos().length === 0}
                class={`flex items-center justify-center h-8 w-8 rounded-full transition-all cursor-pointer ${
                  valorTexto().trim() || listaAnexos().length > 0
                    ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400 active:scale-95 shadow-md shadow-emerald-500/20"
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                }`}
                title="Enviar mensagem (Enter)"
                aria-label="Enviar mensagem"
              >
                <ArrowUp size={16} strokeWidth={2.5} />
              </button>
            </Show>
          </div>
        </div>
      </div>

      {/* Identificação da branch e atalhos rápidos no rodapé estilo OpenCode */}
      <div class="flex items-center justify-between px-2 pt-1.5 text-[10px] text-zinc-500 font-mono select-none">
        <div class="flex items-center gap-1.5 hover:text-zinc-400 transition-colors cursor-pointer truncate max-w-[240px] sm:max-w-none">
          <FolderGit2 size={11} class="text-zinc-500 shrink-0" />
          <span class="truncate">{props.workspaceId || "opencorp"}</span>
          <span class="text-zinc-600">/</span>
          <GitBranch size={10} class="text-emerald-500/80 shrink-0" />
          <span class="text-zinc-400 truncate">{props.branchAtiva || "feat/ecossistema"}</span>
        </div>

        <div class="hidden sm:flex items-center gap-3 shrink-0">
          <span><kbd class="px-1 py-0.2 rounded bg-zinc-850 border border-zinc-700/60 text-zinc-400">Enter</kbd> enviar</span>
          <span><kbd class="px-1 py-0.2 rounded bg-zinc-850 border border-zinc-700/60 text-zinc-400">Shift+Enter</kbd> quebra</span>
        </div>
      </div>
    </div>
  );
};
