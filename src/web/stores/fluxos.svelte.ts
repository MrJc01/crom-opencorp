/**
 * Store Fluxos — Svelte 5 (writable) + helpers puros.
 * Mantém API via src/web/api.ts e expõe helpers testáveis.
 */
import { writable, derived } from 'svelte/store';

export type TemplateFlow = 'pipeline' | 'fanout' | 'review' | 'debate';

export interface FlowInfo {
  id: string;
  nome?: string;
}

export interface TeamLegado {
  id: string;
  titulo: string;
  padrao: string;
  passos: number;
}

export interface NoFlowBruto {
  id: string;
  tipo: string;
  config: Record<string, unknown>;
}

export interface FlowBruto {
  nome?: string;
  nos: NoFlowBruto[];
  arestas: Array<{ de: string; para: string }>;
}

export interface NoFlowUi {
  tipo: 'agente' | 'task_create' | 'registro' | 'saida';
  agente: string;
  ordem: string;
  titulo: string;
  categoria: string;
}

export const TIPOS_EDITAVEIS = new Set(['manual', 'agente', 'task_create', 'registro', 'saida']);

export const fluxosStore = writable<FlowInfo[]>([]);
export const teamsStore = writable<TeamLegado[]>([]);
export const carregandoStore = writable<boolean>(false);
export const erroStore = writable<string | null>(null);
export const agentesCacheStore = writable<Array<{ id: string }>>([]);

/** Verifica se fluxo é editável no editor linear */
export function isFluxoEditavel(nos: Array<{ tipo: string }>): boolean {
  return nos.every((n) => TIPOS_EDITAVEIS.has(String(n.tipo)));
}

/** Reconstrói sequência linear a partir de nos+arestas (ordem gatilho→passo1→...) */
export function sequenciaDeFlow(nos: NoFlowBruto[], arestas: Array<{ de: string; para: string }>): NoFlowBruto[] {
  const porId = new Map(nos.map((n) => [String(n.id), n]));
  const seq: NoFlowBruto[] = [];
  let atual = arestas.find((a) => a.de === 'gatilho');
  const vistos = new Set<string>();
  while (atual && !vistos.has(atual.para)) {
    vistos.add(atual.para);
    const no = porId.get(atual.para);
    if (!no) break;
    seq.push(no);
    atual = arestas.find((a) => a.de === atual!.para);
  }
  return seq;
}

/** Converte NoFlowBruto → NoFlowUi (para preencher form de edição) */
export function brutoParaUi(no: NoFlowBruto): NoFlowUi {
  const cfg = (no.config ?? {}) as Record<string, string>;
  return {
    tipo: (no.tipo as NoFlowUi['tipo']) ?? 'agente',
    agente: cfg.agente ?? '',
    ordem: cfg.ordem ?? '',
    titulo: cfg.titulo ?? '',
    categoria: (cfg.categoria ?? cfg.registro ?? '') as string,
  };
}

/** Valida id kebab-case */
export function validarIdFlow(id: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id);
}

/** Monta grafo pipeline a partir de passos UI — retorna null se inválido */
export function montarGrafoPipeline(passos: NoFlowUi[]): { nos: Array<{ id: string; tipo: string; config: Record<string, string> }>; arestas: Array<{ de: string; para: string }> } | null {
  const nos: Array<{ id: string; tipo: string; config: Record<string, string> }> = [
    { id: 'gatilho', tipo: 'manual', config: {} },
  ];
  const arestas: Array<{ de: string; para: string }> = [];
  for (let i = 0; i < passos.length; i++) {
    const p = passos[i]!;
    const noId = `passo-${i + 1}`;
    const config: Record<string, string> = {};
    if (p.tipo === 'agente') {
      if (!p.agente.trim() || !p.ordem.trim()) return null;
      config.agente = p.agente.trim();
      config.ordem = p.ordem.trim();
    } else if (p.tipo === 'task_create') {
      if (!p.titulo.trim()) return null;
      config.titulo = p.titulo.trim();
    } else {
      if (!p.categoria.trim()) return null;
      if (p.tipo === 'saida') config.registro = p.categoria.includes('/') ? p.categoria.trim() : `documentos/${p.categoria.trim()}`;
      else config.categoria = p.categoria.trim();
    }
    nos.push({ id: noId, tipo: p.tipo, config });
    arestas.push({ de: i === 0 ? 'gatilho' : `passo-${i}`, para: noId });
  }
  return { nos, arestas };
}

/** Carrega fluxos via API e atualiza store */
export async function carregarFluxos(): Promise<FlowInfo[]> {
  const { api } = await import('../api.js');
  carregandoStore.set(true);
  erroStore.set(null);
  try {
    const data = await api<FlowInfo[]>('/flows');
    const lista = Array.isArray(data) ? data : [];
    fluxosStore.set(lista);
    return lista;
  } catch (e) {
    const msg = (e as Error)?.message ?? 'Não foi possível carregar os fluxos.';
    erroStore.set(msg);
    throw e;
  } finally {
    carregandoStore.set(false);
  }
}

export async function carregarTeams(): Promise<TeamLegado[]> {
  const { api } = await import('../api.js');
  try {
    const data = await api<TeamLegado[]>('/teams');
    const lista = Array.isArray(data) ? data : [];
    teamsStore.set(lista);
    return lista;
  } catch {
    teamsStore.set([]);
    return [];
  }
}

export async function carregarAgentes(): Promise<Array<{ id: string }>> {
  const { api } = await import('../api.js');
  try {
    const data = await api<Array<{ id: string }>>('/agents');
    const lista = Array.isArray(data) ? data : [];
    agentesCacheStore.set(lista);
    return lista;
  } catch {
    agentesCacheStore.set([]);
    return [];
  }
}
