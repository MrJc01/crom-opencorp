/**
 * Teste para a migração Notificações → Svelte 5
 * Verifica estrutura do componente, integração com stores/api e helpers puros.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  CLASSE_TIPO,
  classeTipo,
  filtrarNotificacoes,
  contarNaoLidas,
  notificacoesStore,
  resumoStore,
  carregandoStore,
  erroStore,
  filtroNaoLidasStore,
  notificacoesVisiveisStore,
  carregarNotificacoes,
  marcarNotificacaoLidaStore,
  marcarTodasNotificacoesLidasStore,
  limparNotificacoesStore,
  alternarFiltroNotificacoesStore,
  pintarBadge,
  atualizarBadgeNotificacoes,
  incrementarBadgeNotificacoes,
} from '../src/web/stores/notificacoes.svelte.js';

const RAIZ = join(dirname(new URL(import.meta.url).pathname), '..');
const SVELTE_PATH = join(RAIZ, 'src/web/views/Notificacoes.svelte');
const STORE_PATH = join(RAIZ, 'src/web/stores/notificacoes.svelte.ts');

function lerSvelte(): string {
  return readFileSync(SVELTE_PATH, 'utf8');
}
function lerStore(): string {
  return readFileSync(STORE_PATH, 'utf8');
}

describe('Notificacoes.svelte — arquivo existe e usa Svelte 5 runes + stores/api', () => {
  it('arquivos existem', () => {
    expect(existsSync(SVELTE_PATH), 'src/web/views/Notificacoes.svelte deve existir').toBe(true);
    expect(existsSync(STORE_PATH), 'src/web/stores/notificacoes.svelte.ts deve existir').toBe(true);
  });

  it('usa Svelte 5 runes', () => {
    const src = lerSvelte();
    expect(src).toContain('$state');
    expect(src).toContain('$derived');
    expect(src).toContain('onMount');
  });

  it('importa api via src/web/api.ts', () => {
    const src = lerSvelte();
    expect(src).toContain("from '../api.js'");
    expect(src).toMatch(/api\s*[\(<]/);
    expect(src).toContain('toast');
  });

  it('usa stores (wsAtivo + notificacoes stores)', () => {
    const src = lerSvelte();
    expect(src).toContain('wsAtivo');
    expect(src).toContain("from '../stores/");
    expect(src).toContain('notificacoesStore');
    expect(src).toContain('carregarNotificacoes');
    expect(src).toContain('filtroNaoLidasStore');
  });

  it('mantém Tailwind/DaisyUI classes', () => {
    const src = lerSvelte();
    expect(src).toContain('btn');
    expect(src).toContain('badge');
    expect(src).toContain('card');
    expect(src).toContain('page-header');
    expect(src).toContain('space-y-3');
    expect(src).toContain('not-card');
    expect(src).toContain('flex');
  });

  it('renderiza header Notificações + ajuda + ações', () => {
    const src = lerSvelte();
    expect(src).toContain('Notificações');
    expect(src).toContain("icone('sino')");
    expect(src).toContain("ajuda('notificacoes')");
    expect(src).toContain('Marcar todas como lidas');
    expect(src).toContain('Limpar');
    expect(src).toContain("icone('check')");
    expect(src).toContain("icone('trash')");
  });

  it('renderiza filtros Todas / Não lidas com estado ativo', () => {
    const src = lerSvelte();
    expect(src).toContain('not-filtro-todas');
    expect(src).toContain('not-filtro-nao-lidas');
    expect(src).toContain('Todas');
    expect(src).toContain('Não lidas');
    expect(src).toContain('ativo');
    expect(src).toContain('handleAlternarFiltro');
    expect(src).toContain('filtroNaoLidas');
  });

  it('implementa 3 estados: carregando / erro / vazio', () => {
    const src = lerSvelte();
    expect(src).toContain('Carregando…');
    expect(src).toContain('Algo deu errado');
    expect(src).toContain('Nenhuma notificação');
    expect(src).toContain('Nenhuma não lida');
    expect(src).toContain('notificacoes-lista');
    expect(src).toContain('Tentar novamente');
    expect(src).toContain('estado-loading');
    expect(src).toContain('estado-erro');
  });

  it('lista notificações: badge tipo, formatarRelativa, origem, marcar lida, dot', () => {
    const src = lerSvelte();
    expect(src).toContain('badge');
    expect(src).toContain('classeTipo');
    expect(src).toContain('formatarRelativa');
    expect(src).toContain('not-corpo');
    expect(src).toContain('origem:');
    expect(src).toContain('not-dot');
    expect(src).toContain('lida');
    expect(src).toContain('nao-lida');
    expect(src).toContain('Marcar lida');
  });

  it('ações CRUD completas: marcar lida, marcar todas, limpar, alternar filtro', () => {
    const srcSvelte = lerSvelte();
    const srcStore = lerStore();
    expect(srcSvelte).toContain('handleMarcarLida');
    expect(srcSvelte).toContain('handleMarcarTodas');
    expect(srcSvelte).toContain('handleLimpar');
    expect(srcSvelte).toContain('marcarNotificacaoLidaStore');
    expect(srcSvelte).toContain('marcarTodasNotificacoesLidasStore');
    expect(srcSvelte).toContain('limparNotificacoesStore');
    // modalConfirm vive no store (limparNotificacoesStore) — mantém compat com legado
    expect(srcStore).toContain('modalConfirm');
    expect(srcSvelte).toContain('/notifications');
    // endpoints específicos
    expect(srcStore).toContain('/lida');
    expect(srcStore).toContain('/lidas');
  });

  it('usa icone sino e mantém badge no navbar helper', () => {
    const src = lerSvelte();
    expect(src).toContain("icone('sino')");
    expect(src).toContain('pintarBadge');
  });

  it('store exporta helpers e carregarNotificacoes com /notifications', () => {
    const src = lerStore();
    expect(src).toContain('CLASSE_TIPO');
    expect(src).toContain('classeTipo');
    expect(src).toContain('filtrarNotificacoes');
    expect(src).toContain('carregarNotificacoes');
    expect(src).toContain("'/notifications'");
    expect(src).toContain('notificacoesStore');
    expect(src).toContain('resumoStore');
    expect(src).toContain('pintarBadge');
    expect(src).toContain('atualizarBadgeNotificacoes');
    expect(src).toContain('incrementarBadgeNotificacoes');
  });
});

describe('notificacoes store — helpers puros', () => {
  it('CLASSE_TIPO mapeia tipo → classe', () => {
    expect(CLASSE_TIPO['resumo']).toBe('badge-ok');
    expect(CLASSE_TIPO['aviso']).toBe('badge-warn');
    expect(CLASSE_TIPO['erro']).toBe('badge-err');
    expect(CLASSE_TIPO['info']).toBe('badge-neutral');
  });

  it('classeTipo retorna badge correto com fallback', () => {
    expect(classeTipo('resumo')).toBe('badge-ok');
    expect(classeTipo('aviso')).toBe('badge-warn');
    expect(classeTipo('erro')).toBe('badge-err');
    expect(classeTipo('info')).toBe('badge-neutral');
    expect(classeTipo('desconhecido')).toBe('badge-neutral');
    expect(classeTipo('')).toBe('badge-neutral');
  });

  it('filtrarNotificacoes filtra só não lidas quando pedido', () => {
    const lista: any[] = [
      { id: '1', lida: false },
      { id: '2', lida: true },
      { id: '3', lida: false },
    ];
    expect(filtrarNotificacoes(lista, false).map((n) => n.id)).toEqual(['1', '2', '3']);
    expect(filtrarNotificacoes(lista, true).map((n) => n.id)).toEqual(['1', '3']);
    expect(filtrarNotificacoes([], true)).toEqual([]);
    expect(filtrarNotificacoes([], false)).toEqual([]);
  });

  it('contarNaoLidas conta corretamente', () => {
    expect(contarNaoLidas([{ lida: false } as any, { lida: true } as any, { lida: false } as any])).toBe(2);
    expect(contarNaoLidas([])).toBe(0);
    expect(contarNaoLidas([{ lida: true } as any])).toBe(0);
  });

  it('stores são writable e default', async () => {
    const { get } = await import('svelte/store');
    notificacoesStore.set([]);
    expect(get(notificacoesStore)).toEqual([]);
    resumoStore.set({ nao_lidas: 0, total: 0 });
    expect(get(resumoStore)).toEqual({ nao_lidas: 0, total: 0 });
    carregandoStore.set(false);
    expect(get(carregandoStore)).toBe(false);
    erroStore.set(null);
    expect(get(erroStore)).toBeNull();
    filtroNaoLidasStore.set(false);
    expect(get(filtroNaoLidasStore)).toBe(false);
    filtroNaoLidasStore.set(true);
    expect(get(filtroNaoLidasStore)).toBe(true);
    filtroNaoLidasStore.set(false);
  });

  it('alternarFiltroNotificacoesStore atualiza store', async () => {
    const { get } = await import('svelte/store');
    alternarFiltroNotificacoesStore(true);
    expect(get(filtroNaoLidasStore)).toBe(true);
    alternarFiltroNotificacoesStore(false);
    expect(get(filtroNaoLidasStore)).toBe(false);
  });

  it('notificacoesVisiveisStore deriva de filtro', async () => {
    const { get } = await import('svelte/store');
    notificacoesStore.set([{ id: '1', lida: false } as any, { id: '2', lida: true } as any]);
    filtroNaoLidasStore.set(false);
    expect(get(notificacoesVisiveisStore).length).toBe(2);
    filtroNaoLidasStore.set(true);
    expect(get(notificacoesVisiveisStore).length).toBe(1);
    expect(get(notificacoesVisiveisStore)[0].id).toBe('1');
    filtroNaoLidasStore.set(false);
    notificacoesStore.set([]);
  });
});

describe('notificacoes store — carregarNotificacoes integra api', () => {
  beforeEach(() => {
    notificacoesStore.set([]);
    resumoStore.set({ nao_lidas: 0, total: 0 });
    erroStore.set(null);
    carregandoStore.set(false);
    filtroNaoLidasStore.set(false);
  });

  it('carregarNotificacoes chama api("/notifications") e popula stores', async () => {
    const origFetch = globalThis.fetch;
    const mockRes = {
      notificacoes: [
        { id: 'not-1', titulo: 'T1', corpo: 'c1', tipo: 'info', origem: 'tool:notificar', lida: false, criado_em: new Date().toISOString() },
        { id: 'not-2', titulo: 'T2', corpo: 'c2', tipo: 'aviso', origem: 'painel', lida: true, criado_em: new Date().toISOString() },
      ],
      resumo: { nao_lidas: 1, total: 2 },
    };
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/notifications')) {
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => mockRes } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) } as any);
    }) as any;
    const r = await carregarNotificacoes();
    expect(r.notificacoes.length).toBe(2);
    expect(r.resumo.nao_lidas).toBe(1);
    const { get } = await import('svelte/store');
    expect(get(notificacoesStore).length).toBe(2);
    expect(get(resumoStore).nao_lidas).toBe(1);
    globalThis.fetch = origFetch;
  });

  it('carregarNotificacoes trata lista vazia', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ notificacoes: [], resumo: { nao_lidas: 0, total: 0 } }) } as any);
    }) as any;
    const r = await carregarNotificacoes();
    expect(r.notificacoes).toEqual([]);
    expect(r.resumo.total).toBe(0);
    globalThis.fetch = origFetch;
  });

  it('pintarBadge / incrementarBadge manipulam DOM (mock)', async () => {
    // mock minimal de document sem precisar de jsdom
    const classSet = new Set<string>(['hidden']);
    const badge: any = {
      id: 'nav-badge-notificacoes',
      textContent: '',
      classList: {
        add: (c: string) => classSet.add(c),
        remove: (c: string) => classSet.delete(c),
        toggle: (c: string, force?: boolean) => {
          if (force === undefined) {
            if (classSet.has(c)) classSet.delete(c);
            else classSet.add(c);
          } else if (force) classSet.add(c);
          else classSet.delete(c);
        },
        contains: (c: string) => classSet.has(c),
      },
    };
    const origDoc = (globalThis as any).document;
    (globalThis as any).document = {
      getElementById: (id: string) => (id === 'nav-badge-notificacoes' ? badge : null),
      createElement: origDoc?.createElement?.bind(origDoc) ?? (() => badge),
      body: { appendChild: () => {}, removeChild: () => {} },
    };

    pintarBadge(3);
    expect(badge.textContent).toBe('3');
    expect(badge.classList.contains('hidden')).toBe(false);

    pintarBadge(0);
    expect(badge.textContent).toBe('0');
    expect(badge.classList.contains('hidden')).toBe(true);

    pintarBadge(2);
    incrementarBadgeNotificacoes();
    expect(badge.textContent).toBe('3');

    (globalThis as any).document = origDoc;
  });

  it('store helpers de badge e API existem no arquivo', () => {
    const src = lerStore();
    expect(src).toContain('pintarBadge');
    expect(src).toContain('atualizarBadgeNotificacoes');
    expect(src).toContain('incrementarBadgeNotificacoes');
    expect(src).toContain("'/notifications/'");
    expect(src).toContain("'/notifications/lidas'");
    expect(src).toContain('DELETE');
    expect(src).toContain('modalConfirm');
  });
});
