import { writable, derived } from 'svelte/store';
import { wsAtivo } from './auth.svelte';

export interface WorkspaceInfo { id: string; path: string; ativo: boolean; existe: boolean; }

export const workspaces = writable<WorkspaceInfo[]>([]);
export const wsAtivoId = derived(wsAtivo, ($ws) => $ws);

export async function carregarWorkspaces() {
  const ws = localStorage.getItem('oc-ws') || '';
  // Use vanilla api for now to avoid circular dep
  const { q } = await import('../api.js');
  try {
    const lista = await q<WorkspaceInfo[]>('/workspaces');
    workspaces.set(Array.isArray(lista) ? lista : []);
  } catch {
    workspaces.set([]);
  }
}
