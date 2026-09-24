import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

export interface NoGrafo {
  id: string;
  tipo: string;
  config?: Record<string, any>;
  pos?: { x: number; y: number };
  join?: "all" | "any";
  [key: string]: any;
}

export interface ArestaGrafo {
  de: string;
  para: string;
  rotulo?: string;
  condicao?: string;
  saida?: string; // ex: 'entao' | 'senao' para bifurcações
  [key: string]: any;
}

export interface FluxoCompleto {
  id: string;
  nome: string;
  descricao?: string;
  ativo?: boolean;
  nos: NoGrafo[];
  arestas: ArestaGrafo[];
  gatilhos?: any[];
  criado_em?: string;
  atualizado_em?: string;
  [key: string]: any;
}

export interface TipoNodeItem {
  tipo: string;
  rotulo: string;
  categoria: "gatilhos" | "agentes" | "logica" | "integracoes" | "governanca";
  icone: LucideIcon;
  cor: string;
  bg: string;
  borderCor: string;
  desc: string;
}

export interface FlowRunLog {
  id?: string;
  execId?: string;
  status: "executando" | "concluido" | "falhou" | "cancelado";
  inicio?: string;
  fim?: string;
  duracao_ms?: number;
  erro?: string;
  nos_executados?: Array<{
    no_id: string;
    tipo?: string;
    status: string;
    duracao_ms?: number;
    entrada?: any;
    saida?: any;
    erro?: string;
  }>;
  contexto_final?: any;
  [key: string]: any;
}
