/**
 * Store Tasks — Svelte 5 (writable) + helpers puros do Kanban.
 * Mantém a API via src/web/api.ts e expõe helpers testáveis.
 */
import { writable, derived, get } from 'svelte/store';

export interface Task {
  id: string;
  titulo: string;
  coluna: string;
  pos?: number;
  responsavel?: string;
  prioridade?: string;
  labels?: string[];
  bloqueado_por?: string[];
  bloqueada?: boolean;
  descricao?: string;
  due?: string | null;
  [k: string]: unknown;
}

export const COLUNAS_PADRAO = ['backlog', 'fazendo', 'bloqueado', 'feito'] as const;

export const AJUDA_COLUNA: Record<string, string> = {
  backlog: 'Tasks na fila — ninguém pegou ainda.',
  fazendo: 'Em execução por um agente neste momento.',
  bloqueado: 'Paradas: falta algo (dependência, aprovação HITL, erro).',
  feito: 'Concluídas. Histórico fica em Histórico.',
};

export const tasksStore = writable<Task[]>([]);
export const carregandoStore = writable<boolean>(false);
export const erroStore = writable<string | null>(null);

// derived helpers
export const todasColunas = derived(tasksStore, ($tasks) => colunasDe($tasks));
export const kanbanAgrupado = derived(tasksStore, ($tasks) => agruparPorColunas($tasks));

/** Retorna colunas ordenadas: padrão primeiro + extras na ordem de aparição */
export function colunasDe(tasks: Task[]): string[] {
  const extras = [...new Set(tasks.map((t) => String(t.coluna)))].filter(
    (c) => !(COLUNAS_PADRAO as readonly string[]).includes(c),
  );
  return [...COLUNAS_PADRAO, ...extras];
}

/** Agrupa tasks por coluna já ordenadas por pos */
export function agruparPorColunas(tasks: Task[]): Record<string, Task[]> {
  const cols = colunasDe(tasks);
  const mapa: Record<string, Task[]> = {};
  for (const c of cols) mapa[c] = [];
  for (const c of cols) {
    mapa[c] = tasks
      .filter((t) => String(t.coluna) === c)
      .sort((a, b) => Number(a.pos ?? 0) - Number(b.pos ?? 0));
  }
  return mapa;
}

export function tarefasPorColuna(tasks: Task[], coluna: string): Task[] {
  return tasks
    .filter((t) => String(t.coluna) === coluna)
    .sort((a, b) => Number((a.pos ?? 0) as number) - Number((b.pos ?? 0) as number));
}

/** Carrega tasks via API e atualiza stores */
export async function carregarTasks(): Promise<Task[]> {
  const { api } = await import('../api.js');
  carregandoStore.set(true);
  erroStore.set(null);
  try {
    const data = await api<Task[]>('/tasks');
    const lista = Array.isArray(data) ? data : [];
    tasksStore.set(lista);
    return lista;
  } catch (e) {
    const msg = (e as Error)?.message ?? 'Não foi possível carregar o task board.';
    erroStore.set(msg);
    throw e;
  } finally {
    carregandoStore.set(false);
  }
}

export async function criarTaskStore(titulo: string): Promise<void> {
  const { api } = await import('../api.js');
  const t = titulo.trim();
  if (!t) return;
  await api('/tasks', { method: 'POST', body: JSON.stringify({ titulo: t }) });
  await carregarTasks();
}

export async function moverTaskColunaStore(id: string, coluna: string): Promise<void> {
  const { api } = await import('../api.js');
  await api('/tasks/' + encodeURIComponent(id), {
    method: 'PATCH',
    body: JSON.stringify({ coluna }),
  });
  // otimista: atualiza local
  tasksStore.update((list) => list.map((t) => (t.id === id ? { ...t, coluna } : t)));
  // reconcilia com servidor em background
  carregarTasks().catch(() => {});
}

/** Patch genérico de campos da task */
export async function patchTaskStore(id: string, patch: Record<string, unknown>): Promise<void> {
  const { api } = await import('../api.js');
  await api('/tasks/' + encodeURIComponent(id), {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  await carregarTasks();
}

export async function excluirTaskStore(id: string): Promise<void> {
  const { api } = await import('../api.js');
  await api('/tasks/' + encodeURIComponent(id), { method: 'DELETE' });
  tasksStore.update((list) => list.filter((t) => t.id !== id));
}
