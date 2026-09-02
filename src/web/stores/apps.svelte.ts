/**
 * Store Apps — Svelte 5 (writable) + helpers puros.
 * Mantém API via src/web/api.ts e expõe helpers testáveis.
 * Espelha contratos de src/web/views/apps.ts (loadAppsList, renderWidget, abrirApp, enviarForm).
 */
import { writable, derived } from 'svelte/store';

// ── tipos ────────────────────────────────────────────────────────────────────
export interface AppInfo {
  id: string;
  titulo: string;
  widgets: number;
}

export interface WidgetSpec {
  id: string;
  titulo: string;
  tipo: string;
  fonte?: { rota?: string; rotulo_campo?: string; campo_valor?: string };
  acao?: { tipo?: string; campos?: Array<{ nome: string; rotulo?: string }> };
  texto?: string;
  paginas?: unknown[];
}

export interface AppSpec {
  id: string;
  titulo: string;
  paginas: Array<{
    titulo?: string;
    widgets: WidgetSpec[];
  }>;
}

export interface SecretInfoLista {
  nome: string;
  definido: boolean;
  tipo_app?: string | null;
}

export interface CampoPerfil {
  nome: string;
  rotulo: string;
  obrigatorio?: boolean;
  segredo?: boolean;
  numero?: boolean;
  textarea?: boolean;
  opcoes?: string[];
  dica?: string;
}

// ── constantes (espelho de src/schemas/app-perfil.ts) ───────────────────────
export const APP_PERFIL_NOME_REGEX = /^app:(vps|wordpress|mercadopago|cartao|custom):[a-z0-9][a-z0-9-]{0,40}$/;

export const BANNER_CARTAO =
  '⚠ Atenção: recurso NÃO testado corretamente ainda — armazene apenas referência (bandeira/últimos 4), nunca número completo nem CVV. O servidor rejeita esses campos.';

export const CAMPOS_APP: Record<string, CampoPerfil[]> = {
  vps: [
    { nome: 'rotulo', rotulo: 'Rótulo', obrigatorio: true },
    { nome: 'host', rotulo: 'Host / IP', obrigatorio: true },
    { nome: 'porta', rotulo: 'Porta', numero: true, dica: 'opcional — ex.: 22' },
    { nome: 'usuario', rotulo: 'Usuário', obrigatorio: true },
    { nome: 'senha', rotulo: 'Senha', segredo: true },
    { nome: 'chave_ssh', rotulo: 'Chave SSH', segredo: true },
    { nome: 'notas', rotulo: 'Notas' },
  ],
  wordpress: [
    { nome: 'rotulo', rotulo: 'Rótulo', obrigatorio: true },
    { nome: 'url', rotulo: 'URL do site', obrigatorio: true, dica: 'ex.: https://meusite.com' },
    { nome: 'usuario', rotulo: 'Usuário', obrigatorio: true },
    { nome: 'senha_app', rotulo: 'Senha de aplicação', segredo: true, obrigatorio: true },
    { nome: 'onde_roda', rotulo: 'Onde roda', dica: 'ex.: VPS app:vps:servidor-1' },
    { nome: 'notas', rotulo: 'Notas' },
  ],
  mercadopago: [
    { nome: 'rotulo', rotulo: 'Rótulo', obrigatorio: true },
    { nome: 'public_key', rotulo: 'Public key', obrigatorio: true },
    { nome: 'access_token', rotulo: 'Access token', segredo: true, obrigatorio: true },
    { nome: 'ambiente', rotulo: 'Ambiente', obrigatorio: true, opcoes: ['test', 'prod'] },
    { nome: 'notas', rotulo: 'Notas' },
  ],
  cartao: [
    { nome: 'rotulo', rotulo: 'Rótulo', obrigatorio: true },
    { nome: 'bandeira', rotulo: 'Bandeira', obrigatorio: true },
    { nome: 'ultimos4', rotulo: 'Últimos 4 dígitos', obrigatorio: true, dica: 'ex.: 4242 — nunca o número completo' },
    { nome: 'validade', rotulo: 'Validade', obrigatorio: true, dica: 'MM/AA' },
    { nome: 'notas', rotulo: 'Notas' },
  ],
  custom: [
    { nome: 'rotulo', rotulo: 'Rótulo', obrigatorio: true },
    { nome: 'conteudo', rotulo: 'Conteúdo', obrigatorio: true, textarea: true, dica: 'informação livre para o agente (chaves de API, configurações…)' },
    { nome: 'notas', rotulo: 'Notas' },
  ],
};

export const ROTULO_TIPO: Record<string, string> = {
  vps: 'VPS / servidor',
  wordpress: 'WordPress',
  mercadopago: 'MercadoPago',
  cartao: 'Cartão (só referência)',
  custom: 'Customizado',
};

export const TIPOS = Object.keys(CAMPOS_APP);

// ── stores ───────────────────────────────────────────────────────────────────
export const appsStore = writable<AppInfo[]>([]);
export const appSpecStore = writable<AppSpec | null>(null);
export const perfisStore = writable<SecretInfoLista[]>([]);
export const carregandoStore = writable<boolean>(false);
export const erroStore = writable<string | null>(null);
export const perfisCarregandoStore = writable<boolean>(false);
export const perfisErroStore = writable<string | null>(null);

// derived
export const temApps = derived(appsStore, ($a) => $a.length > 0);
export const appsOrdenados = derived(appsStore, ($a) => [...$a].sort((x, y) => x.id.localeCompare(y.id)));

// ── helpers puros ────────────────────────────────────────────────────────────

/** Valida id de perfil (parte após app:<tipo>:) — [a-z0-9][a-z0-9-]{0,40} */
export function validarIdPerfil(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,40}$/.test(id);
}

/** Extrai tipo de nome app:<tipo>:<id> ou null */
export function tipoDeNomeApp(nome: string): string | null {
  const m = APP_PERFIL_NOME_REGEX.exec(nome);
  return m ? (m[1] as string) : null;
}

/** Filtra secrets mantendo apenas perfis app: válidos e mapeia para {nome,tipo,id} */
export function filtrarPerfis(secrets: SecretInfoLista[]): Array<{ nome: string; tipo: string; id: string }> {
  return secrets
    .filter((s) => typeof s.nome === 'string' && APP_PERFIL_NOME_REGEX.test(s.nome))
    .map((s) => {
      const partes = s.nome.split(':');
      return { nome: s.nome, tipo: partes[1] ?? '', id: partes.slice(2).join(':') };
    })
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.id.localeCompare(b.id));
}

/** Agrupa perfis por tipo ordenado */
export function agruparPerfis(
  perfis: Array<{ nome: string; tipo: string; id: string }>,
): Map<string, Array<{ nome: string; tipo: string; id: string }>> {
  const grupos = new Map<string, Array<{ nome: string; tipo: string; id: string }>>();
  for (const p of perfis) {
    const lista = grupos.get(p.tipo) ?? [];
    lista.push(p);
    grupos.set(p.tipo, lista);
  }
  return grupos;
}

/** Ordena perfis por tipo+id (alias para filtrarPerfis já ordenar; útil para teste) */
export function ordenarPerfis(
  perfis: Array<{ nome: string; tipo: string; id: string }>,
): Array<{ nome: string; tipo: string; id: string }> {
  return [...perfis].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.id.localeCompare(b.id));
}

/** Valida campos do perfil antes de enviar — retorna mensagem de erro ou null */
export function validarPerfilCampos(
  tipo: string,
  id: string,
  valores: Record<string, string>,
): string | null {
  if (!validarIdPerfil(id)) {
    return 'ID inválido — use letras minúsculas, números e hífen (começando por letra ou número)';
  }
  const campos = CAMPOS_APP[tipo] ?? [];
  for (const c of campos) {
    const v = (valores[c.nome] ?? '').trim();
    if (c.numero) {
      if (!v) continue;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 65535) return 'Porta inválida (1–65535)';
      continue;
    }
    if (!v && c.obrigatorio) return `Campo obrigatório: ${c.rotulo}`;
  }
  if (tipo === 'cartao' && !/^\d{4}$/.test(String(valores.ultimos4 ?? '').trim())) {
    return 'Últimos 4 deve ter exatamente 4 dígitos';
  }
  return null;
}

/** Monta payload JSON para PUT /secrets/app:<tipo>:<id> */
export function montarPayloadPerfil(
  tipo: string,
  valores: Record<string, string>,
): Record<string, string | number> {
  const dados: Record<string, string | number> = {};
  for (const c of CAMPOS_APP[tipo] ?? []) {
    const v = (valores[c.nome] ?? '').trim();
    if (c.numero) {
      if (!v) continue;
      const n = Number(v);
      dados[c.nome] = n;
      continue;
    }
    dados[c.nome] = v;
  }
  return dados;
}

/** Helpers de widget — puros para teste */
export function contarMetrica(dados: unknown): number {
  if (Array.isArray(dados)) return dados.length;
  if (dados && typeof dados === 'object') return Object.keys(dados as object).length;
  return 0;
}

export function contagemGrafico(
  linhas: Array<Record<string, unknown>>,
  campoValor: string,
): Record<string, number> {
  const contagem: Record<string, number> = {};
  linhas.forEach((d) => {
    const k = String(d[campoValor] ?? '?');
    contagem[k] = (contagem[k] || 0) + 1;
  });
  return contagem;
}

export function agruparKanban(
  linhas: Array<Record<string, unknown>>,
): Record<string, Array<Record<string, unknown>>> {
  const colunas: Record<string, Array<Record<string, unknown>>> = {};
  linhas.forEach((t) => {
    const col = String((t as Record<string, unknown>).coluna || 'backlog');
    (colunas[col] = colunas[col] || []).push(t as Record<string, unknown>);
  });
  return colunas;
}

export function badgeTipoApp(tipo: string): string {
  switch (tipo) {
    case 'vps':
      return 'badge-info';
    case 'wordpress':
      return 'badge-success';
    case 'mercadopago':
      return 'badge-warning';
    case 'cartao':
      return 'badge-error';
    case 'custom':
      return 'badge-neutral';
    default:
      return 'badge-neutral';
  }
}

// ── API wrappers ─────────────────────────────────────────────────────────────

export async function carregarApps(): Promise<AppInfo[]> {
  const { api } = await import('../api.js');
  carregandoStore.set(true);
  erroStore.set(null);
  try {
    const data = await api<AppInfo[]>('/apps');
    const lista = Array.isArray(data) ? data : [];
    appsStore.set(lista);
    return lista;
  } catch (e) {
    const msg = (e as Error)?.message ?? 'Não foi possível carregar os apps.';
    erroStore.set(msg);
    throw e;
  } finally {
    carregandoStore.set(false);
  }
}

export async function carregarAppSpec(id: string): Promise<AppSpec> {
  const { api } = await import('../api.js');
  const spec = await api<AppSpec>('/apps/' + encodeURIComponent(id) + '/spec');
  appSpecStore.set(spec);
  return spec;
}

export async function carregarPerfis(): Promise<SecretInfoLista[]> {
  const { api } = await import('../api.js');
  perfisCarregandoStore.set(true);
  perfisErroStore.set(null);
  try {
    const data = await api<SecretInfoLista[]>('/secrets');
    const lista = Array.isArray(data) ? data : [];
    perfisStore.set(lista);
    return lista;
  } catch (e) {
    const msg = (e as Error)?.message ?? 'Não foi possível carregar os perfis.';
    perfisErroStore.set(msg);
    throw e;
  } finally {
    perfisCarregandoStore.set(false);
  }
}

export async function salvarPerfil(
  tipo: string,
  id: string,
  valores: Record<string, string>,
): Promise<void> {
  const { api } = await import('../api.js');
  const dados = montarPayloadPerfil(tipo, valores);
  const nome = `app:${tipo}:${id}`;
  await api('/secrets/' + encodeURIComponent(nome), {
    method: 'PUT',
    body: JSON.stringify({ valor: JSON.stringify(dados) }),
  });
  await carregarPerfis();
}

export async function excluirPerfil(nome: string): Promise<void> {
  const { api } = await import('../api.js');
  await api('/secrets/' + encodeURIComponent(nome), { method: 'DELETE' });
  await carregarPerfis();
}

export async function buscarDadosWidget(rota: string | undefined): Promise<unknown> {
  if (!rota) return null;
  try {
    const { api } = await import('../api.js');
    const d = await api(rota);
    return d;
  } catch {
    return null;
  }
}

export async function enviarFormWidget(
  rota: string,
  corpo: Record<string, string>,
): Promise<void> {
  const { api } = await import('../api.js');
  await api(rota || '/tasks', { method: 'POST', body: JSON.stringify(corpo) });
}
