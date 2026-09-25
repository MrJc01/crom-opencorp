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

export interface EntradaSettingsRow {
  chave: string;
  valor: unknown;
  origem: string;
}

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
  definido?: boolean;
  tipo_app?: string | null;
  origem?: "global" | "workspace";
}

export interface KeyItem {
  provider: string;
  tipo?: string;
  preview?: string;
  origem?: string;
  escopo?: string;
}

export interface ToolItem {
  id?: string;
  name?: string;
  nome?: string;
  description?: string;
  descricao?: string;
  enabled?: boolean;
  ativo?: boolean;
  scope?: string;
  escopo?: string;
  requiresApproval?: boolean;
  parameters?: Record<string, unknown>;
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
