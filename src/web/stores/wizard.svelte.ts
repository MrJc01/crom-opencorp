/**
 * Store Wizard — Svelte 5 (writable) + helpers puros.
 * Mantém a API via src/web/api.ts e expõe helpers testáveis.
 * Espelha src/web/views/wizard.ts (modal fullscreen 4 passos).
 */
import { writable } from 'svelte/store';

export interface Perfil {
  empresa: string;
  id: string;
  idTocado?: boolean;
  nicho: string;
  publico: string;
  tom: string[];
  tomEvitar: string[];
  tipo: string;
  template: string;
  topicos: string[];
}

export interface TipoOpcao {
  id: string;
  label: string;
  desc: string;
  topicos: string[];
}

export function perfilVazio(): Perfil {
  return { empresa: '', id: '', idTocado: false, nicho: '', publico: '', tom: [], tomEvitar: [], tipo: 'portal', template: 'default', topicos: [] };
}

export const TONS_SUGERIDOS = ['direto', 'jornalístico', 'técnico', 'acessível'];
export const TONS_EVITAR_SUGERIDOS = ['clickbait', 'promessas exageradas', 'jargão sem explicação', 'linguagem robótica'];

export const TIPOS: TipoOpcao[] = [
  { id: 'portal', label: 'Portal / Blog', desc: 'conteúdo recorrente, SEO, fila editorial', topicos: ['tendências do setor', 'guias práticos para o público', 'análises e casos de uso'] },
  { id: 'servicos', label: 'Prestador de serviços', desc: 'página de venda, provas sociais, captação', topicos: ['serviços e escopos', 'perguntas frequentes', 'cases e depoimentos'] },
  { id: 'ecommerce', label: 'E-commerce', desc: 'catálogo, produto, conversão', topicos: ['lançamentos e coleções', 'dicas de uso dos produtos', 'promoções e kits'] },
  { id: 'generica', label: 'Empresa genérica', desc: 'presença digital completa, sem foco único', topicos: ['sobre a empresa', 'novidades e avisos', 'conteúdo do setor'] },
];

export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function validarId(id: string): string | null {
  if (!id.trim()) return 'ID é obrigatório';
  if (!ID_RE.test(id)) return 'ID inválido — use kebab-case (ex.: minha-empresa)';
  return null;
}

export function validarPasso1(perfil: Perfil): string | null {
  if (!perfil.empresa.trim()) return 'Dê um nome à empresa';
  const errId = validarId(perfil.id);
  if (errId) return errId;
  return null;
}

export function topicosSugeridosPorTipo(tipo: string): string[] {
  return TIPOS.find((t) => t.id === tipo)?.topicos ?? [];
}

export function topicosFromString(texto: string): string[] {
  return texto.split('\n').map((t) => t.trim()).filter(Boolean);
}

export function toggleValor(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function montarPayload(perfil: Perfil): { id: string; perfil: Record<string, unknown> } {
  return {
    id: perfil.id,
    perfil: {
      empresa: perfil.empresa,
      nicho: perfil.nicho,
      publico: perfil.publico,
      tom: perfil.tom.join(', '),
      tom_evitar: [...perfil.tomEvitar],
      topicos: [...perfil.topicos],
    },
  };
}

export function perfilParaRevisao(perfil: Perfil): Record<string, string> {
  const tipo = TIPOS.find((t) => t.id === perfil.tipo);
  return {
    empresa: perfil.empresa || '—',
    id: perfil.id || '—',
    nicho: perfil.nicho || '—',
    publico: perfil.publico || '—',
    tom: perfil.tom.join(', ') || '—',
    evitar: perfil.tomEvitar.join(', ') || '—',
    tipo: tipo?.label ?? perfil.tipo,
    template: perfil.template,
    topicos: perfil.topicos.join(' · ') || '—',
  };
}

// ── stores ─────────────────────────────────────────────────────────────────
export const wizardPassoStore = writable<number>(1);
export const wizardPerfilStore = writable<Perfil>(perfilVazio());
export const wizardAbertoStore = writable<boolean>(false);
export const wizardEnviandoStore = writable<boolean>(false);

// ── API ────────────────────────────────────────────────────────────────────
export async function criarWorkspace(perfil: Perfil): Promise<unknown> {
  const { api } = await import('../api.js');
  const payload = montarPayload(perfil);
  return api('/workspaces', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function criarWorkspaceStore(perfil: Perfil): Promise<unknown> {
  wizardEnviandoStore.set(true);
  try {
    const r = await criarWorkspace(perfil);
    return r;
  } finally {
    wizardEnviandoStore.set(false);
  }
}
