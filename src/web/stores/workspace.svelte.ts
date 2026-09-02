/**
 * Store / helpers puros do Workspace (Svelte 5)
 * Mantém compatibilidade com src/web/api.ts e src/web/menu-contexto.ts
 * Extraído de src/web/views/workspace.ts (1031 linhas).
 */

export interface NoArvoreWeb {
  nome: string;
  caminho: string;
  tipo: 'dir' | 'arquivo';
  tamanho?: number;
  filhos?: NoArvoreWeb[];
}

export type ModoVer = 'editor' | 'preview' | 'split';

export interface TabArquivo {
  caminho: string;
  nome: string;
  original: string;
  editado: string;
  modo: ModoVer;
}

export interface TabTerminal {
  nome: string;
  log: string;
  historico: string[];
  histIdx: number;
}

export interface TabsSalvas {
  tabs: Array<string | { p: string; m?: ModoVer }>;
  ativa: string | null;
}

export const CHAVE_TERM = 'oc-terminal-tabs';
export const MAX_TERMINAIS = 4;
export const MAX_CONTEUDO = 1024 * 1024;
export const MAX_RASCUNHO_BYTES = 280 * 1024;
export const MAX_TABS_RESTAURADAS = 20;
export const MAX_RESULTADOS_BUSCA = 12;
export const MAX_NOS_INDICE = 4000;
export const MAX_DIRS_INDICE = 600;

export const DIRS_IGNORADOS = new Set(['node_modules', '.git', 'dist', 'web-dist', '__pycache__']);

/** .md → Preview por padrão; demais → Editor. */
export function esMarkdown(nome: string): boolean {
  return nome.toLowerCase().endsWith('.md');
}

export function modoPadrao(nome: string): ModoVer {
  return esMarkdown(nome) ? 'preview' : 'editor';
}

export function modoValido(m: unknown): m is ModoVer {
  return m === 'editor' || m === 'preview' || m === 'split';
}

export function nomeProximoTerminal(terminais: TabTerminal[] | string[]): string {
  const usados = new Set(
    (terminais as Array<string | TabTerminal>).map((t) => (typeof t === 'string' ? t : (t as TabTerminal).nome)),
  );
  let i = 1;
  while (usados.has('term-' + i)) i++;
  return 'term-' + i;
}

export function ignorarNo(nome: string, pai: string): boolean {
  if (DIRS_IGNORADOS.has(nome)) return true;
  if (nome === 'logs' && pai === '.opencorp') return true;
  return false;
}

export function ordenarNos(nos: NoArvoreWeb[]): NoArvoreWeb[] {
  return [...nos].sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'dir' ? -1 : 1;
    return a.nome.localeCompare(b.nome);
  });
}

export function soOpencorp(nos: NoArvoreWeb[]): boolean {
  return nos.length === 0 || nos.every((n) => n.caminho === '.opencorp' || n.caminho.startsWith('.opencorp/'));
}

/** Filtra caminhos por substring (case-insensitive), ordena por tamanho e limita */
export function filtrarCaminhos(
  caminhos: Iterable<string>,
  filtro: string,
  max = MAX_RESULTADOS_BUSCA,
): string[] {
  const f = filtro.trim().toLowerCase();
  if (f.length < 2) return [];
  return [...caminhos]
    .filter((p) => p.toLowerCase().includes(f))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, max);
}

/** Rotulo da tab (● se sujo) — puro para teste */
export function rotuloTab(tab: TabArquivo): string {
  return (tab.editado !== tab.original ? '● ' : '') + tab.nome;
}

export function tabsSujas(tabs: TabArquivo[]): TabArquivo[] {
  return tabs.filter((t) => t.editado !== t.original);
}

export function excedeLimiteConteudo(texto: string, limite = MAX_CONTEUDO): boolean {
  try {
    return new TextEncoder().encode(texto).length > limite;
  } catch {
    return texto.length > limite;
  }
}

/** Construir índice BFS helpers puros para teste */
export function deveIgnorarDir(nome: string, pai: string): boolean {
  return ignorarNo(nome, pai);
}

/** Helper para persistência — gera chaves por workspace */
export function chaveTabs(ws: string | null): string {
  return 'oc-ws-tabs:' + (ws || '');
}
export function chaveRascunhos(ws: string | null): string {
  return 'oc-ws-drafts:' + (ws || '');
}

/** Semear índice: extrai caminhos de arquivos da árvore */
export function coletarCaminhos(nos: NoArvoreWeb[]): string[] {
  const out: string[] = [];
  function rec(arr: NoArvoreWeb[]) {
    for (const n of arr) {
      if (n.tipo === 'arquivo') out.push(n.caminho);
      if (n.filhos?.length) rec(n.filhos);
    }
  }
  rec(nos);
  return out;
}

/** Buscar nó por caminho (DFS) */
export function buscarNo(nos: NoArvoreWeb[], caminho: string): NoArvoreWeb | null {
  for (const n of nos) {
    if (n.caminho === caminho) return n;
    if (n.filhos?.length) {
      const achou = buscarNo(n.filhos, caminho);
      if (achou) return achou;
    }
  }
  return null;
}

// ── Compatibilidade: re-export abrirArquivo/enviarComoContexto para menu-contexto
// O componente Svelte monta e gerencia o estado; estas funções delegam para a
// instância montada via callback registrado. Se ainda não houver instância, caem
// no fallback que importa o módulo legado (workspace.ts) para não quebrar.

type AbrirFn = (caminho: string) => Promise<void>;
let abrirRegistrado: AbrirFn | null = null;

export function registrarAbrirArquivo(fn: AbrirFn | null): void {
  abrirRegistrado = fn;
}

export async function abrirArquivo(caminho: string): Promise<void> {
  if (abrirRegistrado) return abrirRegistrado(caminho);
  // fallback legado (compatível com menu-contexto antes da montagem Svelte)
  try {
    const mod = await import('../views/workspace.js');
    if ((mod as unknown as { abrirArquivo?: AbrirFn }).abrirArquivo) {
      return (mod as unknown as { abrirArquivo: AbrirFn }).abrirArquivo(caminho);
    }
  } catch { /* sem legado — ignora */ }
}

export function enviarComoContexto(caminho: string): void {
  // delega direto ao rascunho + drawer (sem depender de instância montada)
  void import('../rascunho.js').then(({ setRascunho, getRascunho }) => {
    setRascunho('@' + caminho);
    void import('../chat-lateral.js').then(({ abrirChatLateral }) => {
      abrirChatLateral();
      const ta = document.getElementById('lat-input') as HTMLTextAreaElement | null;
      if (ta) ta.value = getRascunho();
    });
  });
}
