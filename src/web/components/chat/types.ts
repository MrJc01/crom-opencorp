export interface AcaoItem {
  ferramenta?: string;
  resumo?: string;
  sucesso?: boolean;
}

export interface ItemPergunta {
  id?: string;
  header?: string;
  pergunta: string;
  opcoes: string[];
  multiplo?: boolean;
  permiteCustom?: boolean; // Permite digitação livre (Outro / Custom write-in) - padrão: true
  opcional?: boolean;      // Permite pular
}

export type TurnoPasso =
  | { tipo: "pensamento"; texto: string }
  | {
      tipo: "acao";
      ferramenta: string;
      resumo?: string;
      saida?: string;
      sucesso?: boolean;
      status?: string;
      pergunta?: string;
      opcoes?: string[];
      perguntas?: ItemPergunta[];
    }
  | { tipo: "pergunta"; pergunta: string; opcoes: string[]; perguntas?: ItemPergunta[] }
  | { tipo: "texto"; texto: string };

export interface ChatMensagem {
  id?: string;
  indice_global?: number;
  role: "user" | "assistant" | "system";
  content: string;
  passos?: TurnoPasso[];
  pensamento?: string;
  criado_em?: string;
  concluida?: boolean;
  acoes?: AcaoItem[];
  imagens?: string[];
  terminal?: string;
  iframeUrl?: string;
  pergunta?: string;
  opcoes?: string[];
  perguntas?: ItemPergunta[];
  hitl?: {
    id: string;
    agente: string;
    ordem: string;
    motivo_guard: string;
  };
}

export interface PaginacaoMensagens {
  total_mensagens: number;
  total_turnos: number;
  primeiro_indice: number;
  ultimo_indice: number;
  tem_mais: boolean;
}

export interface IframeEmbedConfig {
  habilitado?: boolean;
  url?: string;
  titulo?: string;
  aberto?: boolean;
  posicao?: "direita" | "esquerda";
  larguraPadrao?: string; // ex: "50%", "480px"
  onUrlChange?: (novaUrl: string) => void;
  onToggle?: (aberto: boolean) => void;
  onReload?: () => void;
}

export interface UniversalChatProps {
  mensagens: ChatMensagem[];
  carregando?: boolean;
  agente?: {
    id: string;
    nome: string;
    modelo?: string;
    status?: string;
    icone?: any;
  };

  // Controles de visibilidade e modo
  modo?: "interativo" | "leitura";
  podeEnviarPrompt?: boolean;
  mostrarPensamentoPadrao?: boolean;
  mostrarAcoesPadrao?: boolean;
  // Modo de exibição: "app" (só iframe), "chat" (só chat), "ambos" (lado a lado)
  modoVisualizacao?: "app" | "chat" | "ambos";

  // Iframe lateral integrado
  iframeConfig?: IframeEmbedConfig;

  // Callbacks
  onEnviarPrompt?: (texto: string, anexos?: any[]) => Promise<void>;
  onEditarPrompt?: (indice: number) => void;
  onAprovarHitl?: (id: string) => void;
  onRejeitarHitl?: (id: string, motivo: string) => void;
  onLimparChat?: () => void;
  onNovaSessao?: () => void;
  onAbrirHistorico?: () => void;
  onAbrirConfiguracoes?: () => void;
  onParar?: () => void;
  onSelecionarOpcao?: (opcao: string) => void;

  decorridoFmt?: string;
  placeholder?: string;
  sugestoesRapidas?: Array<{ rotulo: string; prompt: string }>;
  valorPrompt?: string;
  onValorPromptChange?: (v: string) => void;
  refTextarea?: (el: HTMLTextAreaElement) => void;

  // Infinite Scroll para cima (histórico paginado)
  temMaisMensagensAnteriores?: boolean;
  carregandoAnteriores?: boolean;
  onCarregarAnteriores?: () => Promise<void> | void;
  totalMensagens?: number;

  // Fila de Prompts (Followups / Prompts em espera)
  filaPrompts?: PromptFilaItem[];
  onAdicionarFila?: (texto: string, anexos?: any[]) => void;
  onRemoverFila?: (id: string) => void;
  onEditarFila?: (id: string) => void;
  onAdiantarFila?: (id: string) => void;
}

export interface PromptFilaItem {
  id: string;
  texto: string;
  anexos?: any[];
  criadoEm?: number;
}
