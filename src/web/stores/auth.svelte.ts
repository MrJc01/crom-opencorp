import { writable } from 'svelte/store';

function getInitialToken(): string {
  return localStorage.getItem('oc-token') || '';
}
function getInitialWs(): string {
  return localStorage.getItem('oc-ws') || '';
}

export const token = writable<string>(getInitialToken());
export const wsAtivo = writable<string>(getInitialWs());
export const sseConectado = writable<boolean>(false);

token.subscribe((v) => {
  if (v) localStorage.setItem('oc-token', v);
  else localStorage.removeItem('oc-token');
});
wsAtivo.subscribe((v) => {
  if (v) localStorage.setItem('oc-ws', v);
  else localStorage.removeItem('oc-ws');
});

export function setToken(v: string) { token.set(v); }
export function setWsAtivo(v: string) { wsAtivo.set(v); }
export function clearAuth() {
  token.set('');
  wsAtivo.set('');
  localStorage.removeItem('oc-token');
  localStorage.removeItem('oc-ws');
}
