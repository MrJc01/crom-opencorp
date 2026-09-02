import { writable } from 'svelte/store';
import { token } from './auth.svelte';

export const sseConectado = writable(false);
let es: EventSource | null = null;

export function conectarSSE() {
  if (es) es.close();
  const t = localStorage.getItem('oc-token') || '';
  es = t ? new EventSource('/events?token=' + encodeURIComponent(t)) : new EventSource('/events');
  es.onopen = () => sseConectado.set(true);
  es.onerror = () => sseConectado.set(false);
  es.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data);
      // Forward to vanilla handler for incremental migration
      import('../main.js').then(m => (m as any).processarEventoSSE?.(ev));
    } catch {}
  };
  return es;
}
export function fecharSSE() {
  if (es) { try { es.close(); } catch {} es = null; }
  sseConectado.set(false);
}
