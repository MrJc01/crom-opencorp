/**
 * seletor-agentes — componente transversal "lista de agentes com check" (PLANO-WEB-CRUD E1).
 * Usado em: convocar reunião, (futuro) passos de team/nós de fluxo, chamar agente.
 * Renderiza checkboxes a partir de GET /agents; leitura via agentesMarcados(containerId).
 */

import { api, escapeHtml } from "./api.js";

interface AgenteCheck {
  id: string;
  role?: string;
  category?: string;
}

/** HTML do seletor (checkbox list). `marcados` = ids que nascem marcados. */
export async function htmlSeletorAgentes(containerId: string, marcados: string[] = []): Promise<string> {
  let agentes: AgenteCheck[] = [];
  try {
    agentes = await api<AgenteCheck[]>('/agents');
  } catch {
    agentes = [];
  }

  if (!agentes.length) {
    return `<div id="${escapeHtml(containerId)}" class="text-xs text-zinc-500">Nenhum agente no workspace — crie na aba <strong>Agentes</strong>.</div>`;
  }

  const set = new Set(marcados);
  return `
    <div id="${escapeHtml(containerId)}" class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 border border-zinc-800 rounded p-3 max-h-56 overflow-y-auto scrollbar-thin">
      ${agentes.map(a => `
        <label class="flex items-center gap-2 text-sm cursor-pointer rounded px-1.5 py-1 hover:bg-zinc-800/60">
          <input type="checkbox" class="ag-check checkbox checkbox-sm checkbox-primary" data-id="${escapeHtml(a.id)}" ${set.has(a.id) ? 'checked' : ''} />
          <span class="font-mono text-xs">${escapeHtml(a.id)}</span>
          ${a.role ? `<span class="text-xs text-zinc-500 truncate">${escapeHtml(a.role)}</span>` : ''}
        </label>
      `).join('')}
    </div>
  `;
}

/** Lê os ids marcados no seletor */
export function agentesMarcados(containerId: string): string[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`#${containerId} .ag-check:checked`))
    .map(c => c.dataset.id ?? '')
    .filter(Boolean);
}
