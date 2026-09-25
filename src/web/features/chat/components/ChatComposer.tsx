import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type FC,
} from "react";
import {
  Send,
  Square,
  Sparkles,
  Bot,
  FileText,
  CheckSquare,
  Terminal,
  Code2,
  Stethoscope,
  CornerDownLeft,
  HelpCircle,
  Cpu,
  ChevronDown,
  Paperclip,
  X,
  Calendar,
  Layers,
} from "lucide-react";

export interface AutocompleteItem {
  id: string;
  tipo: "slash" | "at" | "bang";
  gatilho: string;
  titulo: string;
  descricao: string;
  categoria: string;
  icone: React.ComponentType<{ size?: number; className?: string }>;
}

export interface ContextChip {
  id: string;
  tipo: "arquivo" | "task";
  rotulo: string;
  detalhe?: string;
}

export interface AnexoImagem {
  id: string;
  nome: string;
  mime: string;
  url: string; // Data URL Base64
}

export interface ModeloOpcao {
  id: string;
  nome: string;
  desc: string;
}

export const OPCOES_MODELO: ModeloOpcao[] = [
  {
    id: "gemini-2.5-flash",
    nome: "gemini-2.5-flash",
    desc: "Google · Ultra rápido (240ms)",
  },
  {
    id: "llama-3.3-70b",
    nome: "llama-3.3-70b",
    desc: "Meta · 70B Custo zero nativo",
  },
  {
    id: "claude-3-7-sonnet",
    nome: "claude-3-7-sonnet",
    desc: "Anthropic · Code & Architecture",
  },
  {
    id: "deepseek-r1",
    nome: "deepseek-r1",
    desc: "DeepSeek · Raciocínio matemático",
  },
  {
    id: "gpt-4o-mini",
    nome: "gpt-4o-mini",
    desc: "OpenAI · Equilibrado e rápido",
  },
];

export const SLASH_COMMANDS: AutocompleteItem[] = [
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
    id: "slash-task-run",
    tipo: "slash",
    gatilho: "/task run",
    titulo: "/task run",
    descricao: "Executa o próximo ciclo de processamento de tarefas pendentes",
    categoria: "Tasks",
    icone: CheckSquare,
  },
  {
    id: "slash-task-status",
    tipo: "slash",
    gatilho: "/task status",
    titulo: "/task status",
    descricao: "Consulta status e métricas de execução das tarefas ativas",
    categoria: "Tasks",
    icone: CheckSquare,
  },
  {
    id: "slash-schedules",
    tipo: "slash",
    gatilho: "/schedules",
    titulo: "/schedules",
    descricao: "Exibe a grade de rotinas agendadas e timers do supervisor",
    categoria: "Sistema",
    icone: Calendar,
  },
  {
    id: "slash-git-status",
    tipo: "slash",
    gatilho: "/git status",
    titulo: "/git status",
    descricao: "Consulta estado dos arquivos no repositório git",
    categoria: "Git",
    icone: Code2,
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
    id: "slash-git-restore",
    tipo: "slash",
    gatilho: "/git restore",
    titulo: "/git restore",
    descricao: "Reverte arquivos alterados para o último commit limpo",
    categoria: "Git",
    icone: CornerDownLeft,
  },
  {
    id: "slash-git-log",
    tipo: "slash",
    gatilho: "/git log",
    titulo: "/git log",
    descricao: "Exibe os commits recentes e checkpoints de integridade",
    categoria: "Git",
    icone: Layers,
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
];

export const AT_MENTIONS: AutocompleteItem[] = [
  // ── Agentes ──
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
    id: "at-editor",
    tipo: "at",
    gatilho: "@agente:editor",
    titulo: "@agente:editor",
    descricao: "Redator e publicador de artigos e roteiros",
    categoria: "Agente",
    icone: Bot,
  },
  {
    id: "at-critico-site",
    tipo: "at",
    gatilho: "@agente:critico-site",
    titulo: "@agente:critico-site",
    descricao: "Auditor de qualidade visual, layout e rascunhos",
    categoria: "Agente",
    icone: Bot,
  },
  {
    id: "at-pesquisador-fontes",
    tipo: "at",
    gatilho: "@agente:pesquisador-fontes",
    titulo: "@agente:pesquisador-fontes",
    descricao: "Curador de notícias e tendências em tempo real",
    categoria: "Agente",
    icone: Bot,
  },
  {
    id: "at-corretor-site",
    tipo: "at",
    gatilho: "@agente:corretor-site",
    titulo: "@agente:corretor-site",
    descricao: "Saneador de rascunhos tóxicos e tags quebradas",
    categoria: "Agente",
    icone: Bot,
  },
  {
    id: "at-executor-padrao",
    tipo: "at",
    gatilho: "@agente:executor-padrao",
    titulo: "@agente:executor-padrao",
    descricao: "Executor técnico de código e infraestrutura",
    categoria: "Agente",
    icone: Bot,
  },
  // ── Arquivos ──
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
    id: "at-file-get-schedule",
    tipo: "at",
    gatilho: "@arquivo:scripts/get_schedule.py",
    titulo: "@arquivo:scripts/get_schedule.py",
    descricao: "Script de consulta da grade de agendamentos diários",
    categoria: "Arquivo",
    icone: FileText,
  },
  {
    id: "at-file-docs",
    tipo: "at",
    gatilho: "@arquivo:docs/ARQUITETURA.md",
    titulo: "@arquivo:docs/ARQUITETURA.md",
    descricao: "Documentação de arquitetura do sistema OpenCorp",
    categoria: "Arquivo",
    icone: FileText,
  },
  {
    id: "at-file-package",
    tipo: "at",
    gatilho: "@arquivo:package.json",
    titulo: "@arquivo:package.json",
    descricao: "Manifesto de dependências e scripts do projeto",
    categoria: "Arquivo",
    icone: FileText,
  },
  // ── Tasks ──
  {
    id: "at-task-boletim",
    tipo: "at",
    gatilho: "@task:boletim-diario-youtube",
    titulo: "@task:boletim-diario-youtube",
    descricao: "Tarefa de consolidação de dados dos 28 canais",
    categoria: "Task",
    icone: CheckSquare,
  },
  {
    id: "at-task-auditoria",
    tipo: "at",
    gatilho: "@task:auditoria-fluxos",
    titulo: "@task:auditoria-fluxos",
    descricao: "Rotina de auditoria dos fluxos n8n e gatilhos",
    categoria: "Task",
    icone: CheckSquare,
  },
  {
    id: "at-task-backup",
    tipo: "at",
    gatilho: "@task:backup-scheduler",
    titulo: "@task:backup-scheduler",
    descricao: "Backup automático dos bancos SQLite e checkpoints",
    categoria: "Task",
    icone: CheckSquare,
  },
];

export const BANG_COMMANDS: AutocompleteItem[] = [
  {
    id: "bang-oc-status",
    tipo: "bang",
    gatilho: "!status",
    titulo: "!status",
    descricao: "Executa diagnóstico completo no terminal",
    categoria: "Terminal",
    icone: Terminal,
  },
  {
    id: "bang-oc-doctor",
    tipo: "bang",
    gatilho: "!doctor",
    titulo: "!doctor",
    descricao: "Checagem profunda de portas e daemon do OpenCode",
    categoria: "Terminal",
    icone: Stethoscope,
  },
  {
    id: "bang-task",
    tipo: "bang",
    gatilho: "!task",
    titulo: "!task",
    descricao: "Consulta tarefas e status do Kanban",
    categoria: "Terminal",
    icone: CheckSquare,
  },
  {
    id: "bang-schedule",
    tipo: "bang",
    gatilho: "!schedule",
    titulo: "!schedule",
    descricao: "Lista agendamentos e rotinas ativas",
    categoria: "Terminal",
    icone: Calendar,
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
    id: "bang-git-diff",
    tipo: "bang",
    gatilho: "!git diff",
    titulo: "!git diff",
    descricao: "Exibe diff das alterações locais",
    categoria: "Git",
    icone: Code2,
  },
  {
    id: "bang-agent",
    tipo: "bang",
    gatilho: "!agent",
    titulo: "!agent",
    descricao: "Lista os agentes e status de execução",
    categoria: "Terminal",
    icone: Bot,
  },
];

export interface ChatComposerProps {
  onEnviar: (params: {
    texto: string;
    agente?: string;
    modelo?: string;
    imagens?: AnexoImagem[];
    chipsContexto?: ContextChip[];
  }) => void | Promise<void>;
  onLimparHistorico?: () => void;
  modeloAtivo?: string;
  onTrocarModelo?: (modelo: string) => void;
  isProcessando?: boolean;
  onCancelar?: () => void;
  agenteAtivo?: string | null;
  onDefinirAgente?: (agente: string | null) => void;
  chipsContexto?: ContextChip[];
  onAdicionarChip?: (chip: ContextChip) => void;
  onRemoverChip?: (id: string) => void;
  anexosImagens?: AnexoImagem[];
  onAdicionarImagem?: (img: AnexoImagem) => void;
  onRemoverImagem?: (id: string) => void;
  placeholder?: string;
}

export const ChatComposer: FC<ChatComposerProps> = ({
  onEnviar,
  onLimparHistorico,
  modeloAtivo = "gemini-2.5-flash",
  onTrocarModelo,
  isProcessando = false,
  onCancelar,
  agenteAtivo: agenteProp,
  onDefinirAgente,
  chipsContexto: chipsProp,
  onAdicionarChip,
  onRemoverChip,
  anexosImagens: imagensProp,
  onAdicionarImagem,
  onRemoverImagem,
  placeholder = "Converse com o Secretário ou ordene uma tarefa... (Shift+Enter para quebra de linha)",
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const escPressionadoRef = useRef(false);

  // Estados locais sincronizados caso não venham via props externas
  const [texto, setTexto] = useState("");
  const [modoMenu, setModoMenu] = useState<"slash" | "at" | "bang" | null>(null);
  const [queryMenu, setQueryMenu] = useState("");
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  // Fallbacks de estado caso pai não gerencie
  const [localAgente, setLocalAgente] = useState<string | null>(null);
  const [localChips, setLocalChips] = useState<ContextChip[]>([]);
  const [localImagens, setLocalImagens] = useState<AnexoImagem[]>([]);

  const destinatarioAgente = agenteProp !== undefined ? agenteProp : localAgente;
  const definirDestinatarioAgente = onDefinirAgente ?? setLocalAgente;

  const listaChips = chipsProp !== undefined ? chipsProp : localChips;
  const adicionarChip = onAdicionarChip ?? ((c) => setLocalChips((p) => [...p, c]));
  const removerChip =
    onRemoverChip ?? ((id) => setLocalChips((p) => p.filter((item) => item.id !== id)));

  const listaImagens = imagensProp !== undefined ? imagensProp : localImagens;
  const adicionarImagem =
    onAdicionarImagem ?? ((img) => setLocalImagens((p) => [...p, img]));
  const removerImagem =
    onRemoverImagem ?? ((id) => setLocalImagens((p) => p.filter((img) => img.id !== id)));

  // Fecha popovers ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest("[data-autocomplete-popover]")) {
        setModoMenu(null);
      }
      if (!target.closest("[data-model-dropdown]")) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Parser em tempo real do texto e posição do cursor
  const verificarGatilhos = useCallback((valor: string, cursorPos: number) => {
    const textoAteCursor = valor.slice(0, cursorPos);
    const linhaAtual = textoAteCursor.split("\n").pop() || "";

    // 1. Slash command no início da linha: /query
    const slashMatch = linhaAtual.match(/^\/([a-zA-Z0-9_\-\s]*)$/);
    if (slashMatch) {
      setModoMenu("slash");
      setQueryMenu(slashMatch[1]?.toLowerCase() || "");
      setIndiceAtivo(0);
      return;
    }

    // 2. Bang shell command no início da linha: !query
    const bangMatch = linhaAtual.match(/^!([a-zA-Z0-9_\-\s]*)$/);
    if (bangMatch) {
      setModoMenu("bang");
      setQueryMenu(bangMatch[1]?.toLowerCase() || "");
      setIndiceAtivo(0);
      return;
    }

    // 3. Menção anywhere (início ou após espaço): @query
    const atMatch = linhaAtual.match(/(?:^|\s)@([a-zA-Z0-9_\-.:/]*)$/);
    if (atMatch) {
      setModoMenu("at");
      setQueryMenu(atMatch[1]?.toLowerCase() || "");
      setIndiceAtivo(0);
      return;
    }

    setModoMenu(null);
  }, []);

  // Catálogo de sugestões filtradas
  const itensFiltrados = useMemo(() => {
    if (!modoMenu) return [];
    const q = queryMenu.trim().toLowerCase();

    let catalogo: AutocompleteItem[] = [];
    if (modoMenu === "slash") catalogo = SLASH_COMMANDS;
    else if (modoMenu === "bang") catalogo = BANG_COMMANDS;
    else if (modoMenu === "at") catalogo = AT_MENTIONS;

    if (!q) return catalogo;
    return catalogo.filter(
      (item) =>
        item.gatilho.toLowerCase().includes(q) ||
        item.titulo.toLowerCase().includes(q) ||
        item.descricao.toLowerCase().includes(q),
    );
  }, [modoMenu, queryMenu]);

  // Aplica seleção de item do autocomplete
  const selecionarItem = (item: AutocompleteItem) => {
    const el = textareaRef.current;
    const valorAtual = el?.value ?? texto;
    const cursorPos = el?.selectionStart ?? valorAtual.length;

    let novoTexto = valorAtual;

    if (item.tipo === "slash" || item.tipo === "bang") {
      // Substitui o gatilho inicial por comando completo com espaço
      novoTexto = `${item.gatilho} `;
      setTexto(novoTexto);
      if (el) {
        el.value = novoTexto;
        el.focus();
        el.setSelectionRange(novoTexto.length, novoTexto.length);
      }
    } else if (item.tipo === "at") {
      // Trata resolução de menções conforme especificação
      if (item.gatilho.startsWith("@agente:")) {
        const idAgente = item.gatilho.replace("@agente:", "");
        definirDestinatarioAgente(idAgente);
        // Remove a query de menção do texto
        novoTexto = valorAtual.replace(/(?:^|\s)@([a-zA-Z0-9_\-.:/]*)$/, " ").trimStart();
      } else if (item.gatilho.startsWith("@arquivo:")) {
        const caminho = item.gatilho.replace("@arquivo:", "");
        adicionarChip({
          id: `chip_arq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          tipo: "arquivo",
          rotulo: caminho,
        });
        novoTexto = valorAtual.replace(/(?:^|\s)@([a-zA-Z0-9_\-.:/]*)$/, " ").trimStart();
      } else if (item.gatilho.startsWith("@task:")) {
        const idTask = item.gatilho.replace("@task:", "");
        adicionarChip({
          id: `chip_task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          tipo: "task",
          rotulo: `Task ${idTask}`,
        });
        novoTexto = valorAtual.replace(/(?:^|\s)@([a-zA-Z0-9_\-.:/]*)$/, " ").trimStart();
      } else {
        novoTexto = valorAtual
          .replace(/(?:^|\s)@([a-zA-Z0-9_\-.:/]*)$/, ` ${item.gatilho} `)
          .trimStart();
      }

      setTexto(novoTexto);
      if (el) {
        el.value = novoTexto;
        el.focus();
        el.setSelectionRange(novoTexto.length, novoTexto.length);
      }
    }

    setModoMenu(null);
  };

  // Submissão do composer
  const dispararEnvio = () => {
    const valorReal = textareaRef.current?.value ?? texto;
    const valorLimpo = valorReal.trim();

    if (!valorLimpo && listaImagens.length === 0) return;

    // Se for /clear, limpa histórico imediatamente
    if (valorLimpo.toLowerCase() === "/clear") {
      onLimparHistorico?.();
      setTexto("");
      if (textareaRef.current) textareaRef.current.value = "";
      setModoMenu(null);
      return;
    }

    onEnviar({
      texto: valorReal,
      agente: destinatarioAgente ?? undefined,
      modelo: modeloAtivo,
      imagens: listaImagens,
      chipsContexto: listaChips,
    });

    // Limpa estado local após submissão
    setTexto("");
    if (textareaRef.current) textareaRef.current.value = "";
    setModoMenu(null);
  };

  // Listener de teclado no textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Se o menu estiver aberto com opções
    if (modoMenu && itensFiltrados.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndiceAtivo((prev) => (prev + 1) % itensFiltrados.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndiceAtivo((prev) => (prev - 1 + itensFiltrados.length) % itensFiltrados.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const sel = itensFiltrados[indiceAtivo];
        if (sel) {
          selecionarItem(sel);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        escPressionadoRef.current = true;
        setModoMenu(null);
        return;
      }
    }

    // Envio com Enter (sem Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      dispararEnvio();
    }
  };

  // Paste de imagens (Ctrl+V)
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            adicionarImagem({
              id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              nome: file.name || `imagem-colada-${Date.now()}.png`,
              mime: file.type || "image/png",
              url: reader.result as string,
            });
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  // Upload manual via input de arquivo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;

      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => {
          adicionarImagem({
            id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            nome: file.name,
            mime: file.type,
            url: reader.result as string,
          });
        };
        reader.readAsDataURL(file);
      } else {
        adicionarChip({
          id: `chip_arq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          tipo: "arquivo",
          rotulo: file.name,
        });
      }
    }

    e.target.value = "";
  };

  // Botões de atalho rápido [/], [@], [!]
  const inserirGatilhoRapido = (char: "/" | "@" | "!") => {
    const el = textareaRef.current;
    const valorAtual = el?.value ?? texto;
    let novoTexto = valorAtual;

    if (char === "/" || char === "!") {
      novoTexto = char;
    } else {
      novoTexto = valorAtual ? `${valorAtual} @` : "@";
    }

    setTexto(novoTexto);
    if (el) {
      el.value = novoTexto;
      el.focus();
      const pos = novoTexto.length;
      el.setSelectionRange(pos, pos);
      verificarGatilhos(novoTexto, pos);
    }
  };

  return (
    <div className="relative flex flex-col p-2.5 bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl focus-within:border-emerald-500/60 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all">
      {/* ─────────────────────────────────────────────────────────────
          POPOVER DE AUTOCOMPLETE FLUTUANTE (/, @, !)
         ───────────────────────────────────────────────────────────── */}
      {modoMenu && itensFiltrados.length > 0 && (
        <div
          data-autocomplete-popover
          className="absolute bottom-full mb-3 inset-x-0 rounded-2xl bg-zinc-950/98 border border-zinc-700 shadow-2xl backdrop-blur-xl p-2 z-50 text-xs max-h-72 overflow-y-auto scrollbar-thin animate-in fade-in slide-in-from-bottom-2 duration-150 text-zinc-100"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="px-2.5 py-1 mb-1 border-b border-zinc-800/80 flex items-center justify-between text-[11px] font-mono">
            <div className="flex items-center gap-1.5 font-bold">
              {modoMenu === "slash" && (
                <span className="text-purple-400 flex items-center gap-1">
                  <Sparkles size={12} /> / Comandos Rápidos
                </span>
              )}
              {modoMenu === "at" && (
                <span className="text-emerald-400 flex items-center gap-1">
                  <Bot size={12} /> @ Menções (Agente · Arquivo · Task)
                </span>
              )}
              {modoMenu === "bang" && (
                <span className="text-amber-400 flex items-center gap-1">
                  <Terminal size={12} /> ! Execução Shell Direta (Terminal)
                </span>
              )}
            </div>
            <span className="text-zinc-500 text-[10px]">
              ↑↓ navega · Tab/↵ escolhe · Esc fecha
            </span>
          </div>

          <div className="space-y-0.5">
            {itensFiltrados.map((item, idx) => {
              const Icone = item.icone;
              const ativo = indiceAtivo === idx;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selecionarItem(item)}
                  onMouseEnter={() => setIndiceAtivo(idx)}
                  className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                    ativo
                      ? "bg-zinc-800 text-zinc-100 shadow-xs"
                      : "hover:bg-zinc-900/60 text-zinc-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`h-6 w-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        ativo
                          ? "bg-zinc-700 text-emerald-300"
                          : "bg-zinc-900 text-zinc-400"
                      }`}
                    >
                      <Icone size={13} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-zinc-200 truncate flex items-center gap-1.5 font-mono text-[11px]">
                        <span>{item.titulo}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-sans">
                          {item.categoria}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">
                        {item.descricao}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PÍLULAS, CHIPS E MINIATURAS ACIMA DO INPUT
         ───────────────────────────────────────────────────────────── */}
      {(destinatarioAgente || listaChips.length > 0 || listaImagens.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 pb-2 mb-1 border-b border-zinc-800/50">
          {/* Pílula de Destinatário */}
          {destinatarioAgente && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-950/60 border border-purple-800/40 text-purple-300 text-xs font-mono shadow-xs animate-in fade-in">
              <Bot size={12} className="text-purple-400" />
              <span>para @{destinatarioAgente}</span>
              <button
                type="button"
                onClick={() => definirDestinatarioAgente(null)}
                className="ml-1 text-purple-400 hover:text-purple-200 cursor-pointer p-0.5 rounded hover:bg-purple-900/50"
                title="Remover destinatário (voltar ao Secretário padrão)"
              >
                <X size={11} />
              </button>
            </div>
          )}

          {/* Chips de Contexto (@arquivo / @task) */}
          {listaChips.map((chip) => (
            <div
              key={chip.id}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800/80 border border-zinc-700 text-zinc-300 text-xs font-mono shadow-xs animate-in fade-in"
            >
              {chip.tipo === "arquivo" ? (
                <FileText size={11} className="text-blue-400" />
              ) : (
                <CheckSquare size={11} className="text-emerald-400" />
              )}
              <span className="max-w-[200px] truncate">{chip.rotulo}</span>
              <button
                type="button"
                onClick={() => removerChip(chip.id)}
                className="ml-0.5 text-zinc-400 hover:text-zinc-200 cursor-pointer p-0.5 rounded hover:bg-zinc-700"
                title="Remover chip de contexto"
              >
                <X size={11} />
              </button>
            </div>
          ))}

          {/* Miniaturas de Imagens Coladas ou Anexadas */}
          {listaImagens.map((img) => (
            <div
              key={img.id}
              className="relative group rounded-lg overflow-hidden border border-zinc-700 bg-zinc-950 h-12 w-12 shadow-md flex-shrink-0 animate-in fade-in"
            >
              <img
                src={img.url}
                alt={img.nome}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removerImagem(img.id)}
                className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/80 hover:bg-rose-600 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title="Remover anexo"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TEXTAREA PRINCIPAL DO COMPOSER
         ───────────────────────────────────────────────────────────── */}
      <textarea
        ref={textareaRef}
        id="chat-input"
        autoFocus
        rows={1}
        placeholder={placeholder}
        value={texto}
        onChange={(e) => {
          escPressionadoRef.current = false;
          setTexto(e.target.value);
          verificarGatilhos(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onInput={(e) => {
          escPressionadoRef.current = false;
          const el = e.currentTarget;
          setTexto(el.value);
          verificarGatilhos(el.value, el.selectionStart ?? el.value.length);
        }}
        onKeyUp={(e) => {
          if (escPressionadoRef.current) {
            escPressionadoRef.current = false;
            return;
          }
          if (["Escape", "ArrowUp", "ArrowDown", "Enter", "Tab"].includes(e.key)) {
            return;
          }
          verificarGatilhos(
            e.currentTarget.value,
            e.currentTarget.selectionStart ?? e.currentTarget.value.length,
          );
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none resize-none min-h-[44px] max-h-36 px-2 py-1 font-sans"
      />

      {/* Input de arquivo invisível */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.txt,.md,.json,.py,.ts,.js,.cjs,.mjs"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* ─────────────────────────────────────────────────────────────
          BARRA DE FERRAMENTAS INFERIOR DO COMPOSER
         ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2 px-1 text-[11px] text-zinc-500 border-t border-zinc-800/40 mt-1">
        {/* Pílulas rápidas de atalho e botão de anexo */}
        <div className="flex items-center gap-1.5 font-mono">
          <button
            type="button"
            onClick={() => inserirGatilhoRapido("/")}
            title="Comandos rápidos (/)"
            className="px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-purple-400 hover:text-purple-300 font-bold text-[10px] transition-colors cursor-pointer border border-zinc-700/60"
          >
            [/]
          </button>
          <button
            type="button"
            onClick={() => inserirGatilhoRapido("@")}
            title="Mencionar agente, arquivo ou task (@)"
            className="px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-emerald-400 hover:text-emerald-300 font-bold text-[10px] transition-colors cursor-pointer border border-zinc-700/60"
          >
            [@]
          </button>
          <button
            type="button"
            onClick={() => inserirGatilhoRapido("!")}
            title="Execução shell direta (!)"
            className="px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-amber-400 hover:text-amber-300 font-bold text-[10px] transition-colors cursor-pointer border border-zinc-700/60"
          >
            [!]
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Anexar arquivo ou imagem"
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer ml-1"
          >
            <Paperclip size={13} />
          </button>
        </div>

        {/* Lado Direito: Seletor de Modelo In-Place e Botão de Envio */}
        <div className="flex items-center gap-2">
          {/* Dropdown de Modelo In-Place */}
          <div className="relative" data-model-dropdown>
            <button
              type="button"
              onClick={() => setModelDropdownOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-800/70 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-700/60 transition-colors cursor-pointer text-[11px] font-mono"
              title="Alternar modelo de IA"
            >
              <Cpu size={12} className="text-emerald-400" />
              <span>{modeloAtivo}</span>
              <ChevronDown size={11} className="text-zinc-500" />
            </button>

            {modelDropdownOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-64 rounded-xl bg-zinc-950 border border-zinc-800 p-1.5 shadow-2xl z-40 text-xs animate-in fade-in slide-in-from-bottom-1 duration-100">
                <div className="px-2 py-1 mb-1 text-[10px] text-zinc-500 font-semibold border-b border-zinc-800">
                  SELECIONE O MODELO
                </div>
                <div className="space-y-0.5">
                  {OPCOES_MODELO.map((mod) => {
                    const ativo = mod.id === modeloAtivo;
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => {
                          onTrocarModelo?.(mod.id);
                          setModelDropdownOpen(false);
                        }}
                        className={`w-full px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer flex flex-col ${
                          ativo
                            ? "bg-zinc-800 text-emerald-400"
                            : "text-zinc-300 hover:bg-zinc-900"
                        }`}
                      >
                        <span className="font-mono font-medium text-[11px]">
                          {mod.nome}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {mod.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Botão Cancelar (quando ativo) */}
          {isProcessando && (
            <button
              type="button"
              onClick={onCancelar}
              className="flex items-center justify-center h-8 w-8 rounded-xl bg-rose-600/80 hover:bg-rose-500 active:scale-95 text-white transition-all cursor-pointer shadow-md shadow-rose-950/50"
              title="Interromper processamento"
            >
              <Square size={13} />
            </button>
          )}

          {/* Botão de Enviar */}
          <button
            id="btn-enviar"
            type="button"
            onClick={dispararEnvio}
            className="flex items-center justify-center h-8 w-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white transition-all cursor-pointer shadow-md shadow-emerald-950/50"
            title="Enviar (Enter)"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
