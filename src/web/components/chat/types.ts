export interface AcaoItem {
  ferramenta?: string;
  resumo?: string;
  sucesso?: boolean;
}

export type TurnoPasso =
  | { tipo: "pensamento"; texto: string }
  | { tipo: "acao"; ferramenta: string; resumo?: string; sucesso?: boolean }
  | { tipo: "texto"; texto: string };

export interface ChatMensagem {
  role: "user" | "assistant" | "system";
  content: string;
  passos?: TurnoPasso[];
  pensamento?: string;
  concluida?: boolean;
  acoes?: AcaoItem[];
  imagens?: string[];
  terminal?: string;
  iframeUrl?: string;
  hitl?: {
    id: string;
    agente: string;
    ordem: string;
    motivo_guard: string;
  };
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

  decorridoFmt?: string;
  placeholder?: string;
  sugestoesRapidas?: Array<{ rotulo: string; prompt: string }>;
}
