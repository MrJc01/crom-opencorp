import {
  Calendar,
  Webhook,
  Play,
  Bot,
  Workflow,
  HelpCircle,
  RefreshCw,
  Clock,
  Globe,
  Terminal,
  Code2,
  Layers,
  Users,
  FileText,
} from "lucide-solid";

export interface NoGrafo {
  id: string;
  tipo: string;
  config?: any;
  pos?: { x: number; y: number };
}

export interface ArestaGrafo {
  de: string;
  para: string;
}

export interface FluxoCompleto {
  id: string;
  nome: string;
  descricao?: string;
  ativo?: boolean;
  nos: NoGrafo[];
  arestas: ArestaGrafo[];
}

export interface TipoNodeItem {
  tipo: string;
  rotulo: string;
  categoria: "gatilhos" | "agentes" | "logica" | "integracoes" | "governanca";
  icone: any;
  cor: string;
  bg: string;
  desc: string;
}

export interface MenuContextoState {
  aberto: boolean;
  x: number;
  y: number;
  noId?: string;
}

export const TIPOS_NODE_CATALOGO: TipoNodeItem[] = [
  // Gatilhos
  { tipo: "cron", rotulo: "Gatilho Cron / Agenda", categoria: "gatilhos", icone: Calendar, cor: "text-sky-400", bg: "bg-sky-500/10", desc: "Dispara periodicamente via expressão cron ou intervalo" },
  { tipo: "webhook", rotulo: "Gatilho Webhook", categoria: "gatilhos", icone: Webhook, cor: "text-amber-400", bg: "bg-amber-500/10", desc: "Dispara ao receber requisições HTTP externas no endpoint" },
  { tipo: "manual", rotulo: "Gatilho Manual / Test", categoria: "gatilhos", icone: Play, cor: "text-zinc-300", bg: "bg-zinc-500/10", desc: "Disparo sob demanda direto pelo studio ou botão de teste" },

  // Agentes & Inteligência
  { tipo: "agente", rotulo: "Agente Executor", categoria: "agentes", icone: Bot, cor: "text-emerald-400", bg: "bg-emerald-500/10", desc: "Executa instruções e tarefas com LLMs especializadas" },

  // Lógica & Controle (Estilo n8n)
  { tipo: "subflow", rotulo: "Executar Sub-Fluxo", categoria: "logica", icone: Workflow, cor: "text-purple-400", bg: "bg-purple-500/10", desc: "Invoca e executa outro fluxo modular deste workspace" },
  { tipo: "decisao", rotulo: "Decisão / Branching", categoria: "logica", icone: HelpCircle, cor: "text-amber-400", bg: "bg-amber-500/10", desc: "Bifurcação e roteamento condicional com base em critérios" },
  { tipo: "loop", rotulo: "Loop / HLE", categoria: "logica", icone: RefreshCw, cor: "text-orange-400", bg: "bg-orange-500/10", desc: "Controle de repetição, feedback e parada para HLE (Loop Engineering)" },
  { tipo: "delay", rotulo: "Aguardar / Delay", categoria: "logica", icone: Clock, cor: "text-yellow-400", bg: "bg-yellow-500/10", desc: "Pausa a execução por um intervalo de segundos (ex: 30s)" },

  // Integrações & Execução
  { tipo: "http_request", rotulo: "Requisição HTTP / API", categoria: "integracoes", icone: Globe, cor: "text-blue-400", bg: "bg-blue-500/10", desc: "Chama APIs REST externas (GET, POST, Webhooks de saída)" },
  { tipo: "script", rotulo: "Script do Workspace", categoria: "integracoes", icone: Terminal, cor: "text-cyan-400", bg: "bg-cyan-500/10", desc: "Executa scripts locais (.js, .py, .sh) ou comandos bash" },
  { tipo: "componente", rotulo: "Componente Modular", categoria: "integracoes", icone: Code2, cor: "text-teal-400", bg: "bg-teal-500/10", desc: "Componente customizado reutilizável com entrada e saída" },

  // Governança & Persistência
  { tipo: "task_create", rotulo: "Criar Tarefa", categoria: "governanca", icone: Layers, cor: "text-blue-400", bg: "bg-blue-500/10", desc: "Cria um card no Kanban com título, coluna e prioridade" },
  { tipo: "reuniao", rotulo: "Reunião de Agentes", categoria: "governanca", icone: Users, cor: "text-indigo-400", bg: "bg-indigo-500/10", desc: "Convoca mesa de deliberação coletiva entre múltiplos agentes" },
  { tipo: "registro", rotulo: "Registro / Documento", categoria: "governanca", icone: FileText, cor: "text-purple-400", bg: "bg-purple-500/10", desc: "Grava ata, parecer ou relatório nos registries da empresa" },
];
