export interface FilhaHistorico {
  id: string;
  no?: string;
  volta?: number;
  agente?: string;
  status?: string;
  quando?: string | null;
}

export interface ItemHistorico {
  id: string;
  tipo: "execucao" | "task" | "rotina" | "conversa" | "fluxo";
  titulo?: string;
  ordem?: string;
  agente?: string;
  quando?: string | null;
  inicio?: string | null;
  status?: string;
  gatilho?: { tipo: string; origem: string };
  duracao_ms?: number | null;
  custo_usd?: number | null;
  modelo?: string;
  flow?: string;
  nos_total?: number;
  nos_ok?: number;
  contexto_final?: string;
  entrada?: string;
  reuniao?: string;
  filhas?: FilhaHistorico[];
  [key: string]: any;
}

export interface AcaoAgente {
  id: string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string | null;
  sessao_id: string;
  agente: string;
  modelo: string;
  workspace: string;
  tipo_acao: "tool" | "pensamento" | "resposta" | "erro";
  ferramenta?: string | null;
  comando_resumo?: string | null;
  input_json?: string | null;
  output_json?: string | null;
  status: "sucesso" | "falhou" | "timeout" | "abortado";
  duracao_ms?: number;
  tokens_prompt?: number;
  tokens_saida?: number;
  custo_usd?: number;
  erro?: string | null;
  criado_em: string;
  [key: string]: any;
}

export interface ResumoTelemetria {
  total_acoes: number;
  total_falhas: number;
  custo_usd_total?: number;
  ferramentas: Array<{
    ferramenta: string;
    total: number;
    falhas: number;
    media_ms: number;
    custo_usd: number;
  }>;
  agentes: Array<{
    agente: string;
    total: number;
    falhas: number;
    media_ms: number;
    custo_usd: number;
  }>;
}

export interface ArquivoDiff {
  caminho: string;
  adicionadas: string | number;
  removidas: string | number;
}
