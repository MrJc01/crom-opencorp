import type { Settings } from "../../../../schemas/settings";

export type TabConfigId =
  | "motores"
  | "limites"
  | "modelos"
  | "orcamento"
  | "seguranca"
  | "scheduler"
  | "workspace"
  | "testes"
  | "reunioes"
  | "chaves"
  | "ferramentas"
  | "geral"
  | "doctor"
  | "runner";

export interface ProvedorAgenteItem {
  id: string;
  nome: string;
  tipo: "api_key" | "oauth_cli" | "token" | "local";
  descricao: string;
  loginUrl?: string;
  loginUrlLabel?: string;
  loginCmd?: string;
  envVar?: string;
  modelosSugeridos?: string[];
}

export interface MotorInfo {
  id: string;
  name: string;
  description: string;
  category?: string;
  maintainer?: string;
  installed: boolean;
  ativo?: boolean;
  isManaged?: boolean;
  path?: string;
  version?: string;
  contaAtiva?: string;
  authStatus?: {
    authenticated: boolean;
    method?: string;
    details?: string;
  };
  health?: {
    healthy: boolean;
    statusText?: string;
  };
}

export interface ContaMotor {
  id: string;
  motorId: string;
  nome?: string;
  label?: string;
  provider?: string;
  baseUrl?: string;
  modeloPadrao?: string;
  authType?: string;
  tokenOuChave?: string;
  previewChave?: string;
  ativa?: boolean;
  ativo?: boolean;
  email?: string;
  criada_em?: string;
  ultimo_uso?: string;
  expiraEm?: string;
  authMethod?: string;
  metadados?: Record<string, unknown>;
  limits?: {
    timeout_min?: number;
    max_turns?: number;
    rate_limit_rpm?: number;
    daily_cost_usd?: number;
    gasto_hoje_usd?: number;
    status_cota?: string;
  };
}

export interface SecretItem {
  nome: string;
  definido: boolean;
}

export interface KeyItem {
  provider: string;
  tipo?: string;
  preview?: string;
  origem?: string;
  escopo?: string;
}

export interface ToolItem {
  id: string;
  nome: string;
  descricao?: string;
  ativo: boolean;
  categoria?: string;
  escopo?: string;
  origem?: string;
}

export interface DoctorCheck {
  id: string;
  nome: string;
  status: "ok" | "aviso" | "erro";
  mensagem: string;
  reparo?: string;
}

export interface DoctorReport {
  ok: boolean;
  timestamp: string;
  checks: DoctorCheck[];
  versao?: string;
  nodeVersion?: string;
}

export interface RunnerSettings {
  engine?: string;
  binary_path?: string;
  timeout_min?: number;
  max_concurrency?: number;
  auto_restart?: boolean;
  port?: number;
}

export interface EntradaSettingsRow {
  chave: string;
  valor: unknown;
  origem: string;
}

export const PROVEDORES_POR_AGENTE: Record<string, ProvedorAgenteItem[]> = {
  opencode: [
    {
      id: "openrouter",
      nome: "OpenRouter (Universal & BYOK)",
      tipo: "api_key",
      descricao: "Roteador universal com suporte a BYOK Google AI Studio (custo $0), NVIDIA, MiniMax e centenas de modelos.",
      loginUrl: "https://openrouter.ai/keys",
      loginUrlLabel: "Chaves OpenRouter",
      envVar: "OPENROUTER_API_KEY",
      modelosSugeridos: ["google/gemini-3.8-flash", "nvidia/nemotron-3.5-lightning:free", "anthropic/claude-3.5-haiku"],
    },
    {
      id: "google",
      nome: "Google AI Studio Direto",
      tipo: "api_key",
      descricao: "Chave direta do Google AI Studio para Gemini 2.5/3.8 Flash e Gemini Pro (Tier Gratuito / Custo $0).",
      loginUrl: "https://aistudio.google.com/app/apikey",
      loginUrlLabel: "Google AI Studio",
      envVar: "GEMINI_API_KEY",
      modelosSugeridos: ["gemini-2.5-flash", "gemini-3.8-flash"],
    },
    {
      id: "anthropic",
      nome: "Anthropic API Direta",
      tipo: "api_key",
      descricao: "Acesso direto à API da Anthropic para modelos Claude 3.7 Sonnet, Claude 3.5 Sonnet e Haiku.",
      loginUrl: "https://console.anthropic.com/settings/keys",
      loginUrlLabel: "Console Anthropic",
      envVar: "ANTHROPIC_API_KEY",
      modelosSugeridos: ["claude-3-7-sonnet", "claude-3-5-haiku"],
    },
    {
      id: "openai",
      nome: "OpenAI API Direta",
      tipo: "api_key",
      descricao: "Acesso direto à API da OpenAI para GPT-4o, o3-mini e modelos de raciocínio.",
      loginUrl: "https://platform.openai.com/api-keys",
      loginUrlLabel: "OpenAI Keys",
      envVar: "OPENAI_API_KEY",
      modelosSugeridos: ["gpt-4o-mini", "o3-mini"],
    },
    {
      id: "opencode-go",
      nome: "OpenCode-Go Native",
      tipo: "api_key",
      descricao: "Backend oficial de inferência rápida e streaming de tokens do ecossistema OpenCode.",
      loginUrl: "https://opencode.ai",
      loginUrlLabel: "OpenCode AI",
      modelosSugeridos: ["glm-5.3-flash", "deepseek-v3"],
    },
    {
      id: "ollama",
      nome: "Ollama (Modelos Locais)",
      tipo: "local",
      descricao: "Servidor local Ollama rodando em http://localhost:11434 (privacidade total, 100% offline).",
      loginUrl: "https://ollama.com",
      loginUrlLabel: "Ollama Docs",
      modelosSugeridos: ["llama3.2:latest", "qwen2.5-coder:latest"],
    },
  ],
  "crom-agente": [
    {
      id: "openrouter",
      nome: "OpenRouter (Loop ReAct Nativo)",
      tipo: "api_key",
      descricao: "Provedor principal utilizado pelo runtime Go para execução de planos autônomos ReAct.",
      loginUrl: "https://openrouter.ai/keys",
      loginUrlLabel: "Chaves OpenRouter",
      envVar: "OPENROUTER_API_KEY",
      modelosSugeridos: ["google/gemini-3.8-flash", "anthropic/claude-3.5-haiku"],
    },
    {
      id: "openai",
      nome: "OpenAI API Direta",
      tipo: "api_key",
      descricao: "Suporte direto a Function Calling e Tool Use para o agente Go.",
      loginUrl: "https://platform.openai.com/api-keys",
      loginUrlLabel: "OpenAI Keys",
      envVar: "OPENAI_API_KEY",
      modelosSugeridos: ["gpt-4o-mini", "o3-mini"],
    },
    {
      id: "anthropic",
      nome: "Anthropic API Direta",
      tipo: "api_key",
      descricao: "Inferência direta Claude para raciocínio em tarefas de código.",
      loginUrl: "https://console.anthropic.com/settings/keys",
      loginUrlLabel: "Console Anthropic",
      envVar: "ANTHROPIC_API_KEY",
      modelosSugeridos: ["claude-3-7-sonnet"],
    },
  ],
};
