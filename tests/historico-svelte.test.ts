/**
 * Teste para a migração Histórico → Svelte 5
 * Verifica estrutura do componente, integração com stores/api e helpers puros.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  labelGatilho,
  corDoTipo,
  labelDoTipo,
  construirParamsHistorico,
  validarFiltrosHistorico,
  subtituloItem,
  TIPOS_HISTORICO,
  OPCOES_TIPO,
  LIMITES_HISTORICO,
  FILTROS_PADRAO,
  historicoItensStore,
  historicoCarregandoStore,
  historicoErroStore,
  historicoFiltrosStore,
  agentesStore,
  carregarHistorico,
  carregarAgentes,
} from '../src/web/stores/historico.svelte.js';

const RAIZ = join(dirname(new URL(import.meta.url).pathname), '..');
const SVELTE_PATH = join(RAIZ, 'src/web/views/Historico.svelte');
const STORE_PATH = join(RAIZ, 'src/web/stores/historico.svelte.ts');

function lerSvelte(): string {
  return readFileSync(SVELTE_PATH, 'utf8');
}
function lerStore(): string {
  return readFileSync(STORE_PATH, 'utf8');
}

describe('Historico.svelte — arquivo existe e usa Svelte 5 runes + stores/api', () => {
  it('arquivos existem', () => {
    expect(existsSync(SVELTE_PATH), 'src/web/views/Historico.svelte deve existir').toBe(true);
    expect(existsSync(STORE_PATH), 'src/web/stores/historico.svelte.ts deve existir').toBe(true);
  });

  it('usa Svelte 5 runes', () => {
    const src = lerSvelte();
    expect(src).toContain('$state');
    expect(src).toContain('$derived');
    expect(src).toContain('onMount');
  });

  it('importa api via src/web/api.ts e usa stores', () => {
    const src = lerSvelte();
    expect(src).toContain("from '../api.js'");
    expect(src).toContain('historicoItensStore');
    expect(src).toContain('carregarHistorico');
    expect(src).toContain("from '../stores/historico.svelte");
    expect(src).toContain('historicoFiltrosStore');
  });

  it('mantém Tailwind/DaisyUI classes', () => {
    const src = lerSvelte();
    expect(src).toContain('btn');
    expect(src).toContain('card');
    expect(src).toContain('badge');
    expect(src).toContain('page-header');
  });

  it('renderiza header Histórico + ajuda + ícone history', () => {
    const src = lerSvelte();
    expect(src).toContain('Histórico');
    expect(src).toContain("icone('history')");
    expect(src).toContain("ajuda('historico')");
    expect(src).toContain('Execuções · tasks · rotinas · conversas');
  });

  it('renderiza filtros: tipo Tudo/Execuções/Tasks/Rotinas/Conversas + agente + limite', () => {
    const src = lerSvelte();
    expect(src).toContain('OPCOES_TIPO');
    expect(src).toContain('historico-agente');
    expect(src).toContain('secretario');
    expect(src).toContain('secretario-exec');
    expect(src).toContain('LIMITES_HISTORICO');
    expect(src).toContain('50');
    expect(src).toContain('100');
    expect(src).toContain('200');
    expect(src).toContain('setFiltro');
    expect(src).toContain('setAgente');
    expect(src).toContain('setLimite');
  });

  it('implementa 3 estados: carregando / erro / vazio', () => {
    const src = lerSvelte();
    expect(src).toContain('Carregando…');
    expect(src).toContain('Algo deu errado');
    expect(src).toContain('Nada registrado ainda');
    expect(src).toContain('historico-lista');
    expect(src).toContain('Tentar novamente');
    expect(src).toContain('estado-loading');
    expect(src).toContain('estado-erro');
  });

  it('timeline acordeão: hist-acordeao, acc-item, acc-header, dot corDoTipo, titulo, sub labelDoTipo, quando formatarDataLocal', () => {
    const src = lerSvelte();
    expect(src).toContain('hist-acordeao');
    expect(src).toContain('acc-item');
    expect(src).toContain('acc-header');
    expect(src).toContain('acc-dot');
    expect(src).toContain('corDoTipo');
    expect(src).toContain('labelDoTipo');
    expect(src).toContain('labelGatilho');
    expect(src).toContain('formatarDataLocal');
    expect(src).toContain('acc-titulo');
    expect(src).toContain('acc-quando');
    expect(src).toContain('acc-body');
  });

  it('toggle acordeão com detalhes lazy (detalhesDoItem por tipo)', () => {
    const src = lerSvelte();
    expect(src).toContain('toggleItem');
    expect(src).toContain('abertoIdx');
    expect(src).toContain('detalhesCache');
    expect(src).toContain('detalhesDoItem');
    expect(src).toContain('carregando detalhes');
    // detalhes por tipo
    expect(src).toContain("e.tipo === 'execucao'");
    expect(src).toContain("e.tipo === 'task'");
    expect(src).toContain("e.tipo === 'rotina'");
    expect(src).toContain("e.tipo === 'conversa'");
    expect(src).toContain('/sessions/');
    expect(src).toContain('/tasks/');
    expect(src).toContain('/schedules/');
    expect(src).toContain('/secretario/sessoes/');
    expect(src).toContain('renderMarkdown');
  });

  it('usa escapeHtml e mantém gatilho - navegação tasks/secretario', () => {
    const src = lerSvelte();
    expect(src).toContain('escapeHtml');
    expect(src).toContain("navegar('tasks')");
    expect(src).toContain("navegar('secretario')");
    expect(src).toContain('abrir no board');
    expect(src).toContain('abrir no secretário');
  });

  it('store helpers expostos: TIPOS, construirParamsHistorico, validar, subtitulo', () => {
    const src = lerStore();
    expect(src).toContain('construirParamsHistorico');
    expect(src).toContain('carregarHistorico');
    expect(src).toContain('carregarAgentes');
    expect(src).toContain('historicoItensStore');
    expect(src).toContain('historicoErroStore');
    expect(src).toContain('validarFiltrosHistorico');
  });
});

describe('historico store — helpers puros', () => {
  it('TIPOS_HISTORICO e OPCOES_TIPO cobrem tudo', () => {
    expect([...TIPOS_HISTORICO]).toEqual(['tudo', 'execucao', 'task', 'rotina', 'conversa']);
    expect(OPCOES_TIPO.map(([v]) => v)).toEqual([...TIPOS_HISTORICO]);
    expect(OPCOES_TIPO.map(([, l]) => l)).toEqual(['Tudo', 'Execuções', 'Tasks', 'Rotinas', 'Conversas']);
  });

  it('LIMITES e FILTROS_PADRAO', () => {
    expect([...LIMITES_HISTORICO]).toEqual([50, 100, 200]);
    expect(FILTROS_PADRAO).toEqual({ tipo: 'tudo', agente: '', limite: 100 });
  });

  it('labelGatilho formata tipo:origem', () => {
    expect(labelGatilho(null)).toBe('');
    expect(labelGatilho(undefined)).toBe('');
    expect(labelGatilho({ tipo: 'cron', origem: '' })).toBe('cron');
    expect(labelGatilho({ tipo: 'manual', origem: 'api' })).toBe('manual:api');
    expect(labelGatilho({ tipo: 'webhook', origem: 'github' })).toBe('webhook:github');
  });

  it('labelDoTipo mapeia tipo → label', () => {
    expect(labelDoTipo('execucao')).toBe('Execução');
    expect(labelDoTipo('task')).toBe('Task');
    expect(labelDoTipo('rotina')).toBe('Rotina');
    expect(labelDoTipo('conversa')).toBe('Conversa');
  });

  it('corDoTipo retorna cores por tipo/status', () => {
    expect(corDoTipo('execucao')).toBe('var(--accent)');
    expect(corDoTipo('task', 'feito')).toBe('var(--ok)');
    expect(corDoTipo('task', 'fazendo')).toBe('var(--warn)');
    expect(corDoTipo('task')).toBe('var(--ok)');
    expect(corDoTipo('conversa')).toBe('var(--ok)');
    expect(corDoTipo('rotina')).toBe('var(--warn)');
  });

  it('construirParamsHistorico cria query correta', () => {
    expect(construirParamsHistorico({ tipo: 'tudo', agente: '', limite: 100 })).toBe('limite=100');
    expect(construirParamsHistorico({ tipo: 'task', agente: '', limite: 50 })).toBe('tipo=task&limite=50');
    expect(construirParamsHistorico({ tipo: 'conversa', agente: 'secretario', limite: 200 })).toBe('tipo=conversa&agente=secretario&limite=200');
    expect(construirParamsHistorico({ tipo: 'execucao', agente: 'secretario-exec', limite: 100 })).toContain('tipo=execucao');
    expect(construirParamsHistorico({ tipo: 'execucao', agente: 'secretario-exec', limite: 100 })).toContain('agente=secretario-exec');
  });

  it('validarFiltrosHistorico detecta inválidos', () => {
    expect(validarFiltrosHistorico({ tipo: 'tudo', agente: '', limite: 100 })).toBeNull();
    expect(validarFiltrosHistorico({ tipo: 'task', agente: 'x', limite: 50 })).toBeNull();
    expect(validarFiltrosHistorico({ tipo: 'invalido' as any, agente: '', limite: 100 })).toMatch(/Tipo/);
    expect(validarFiltrosHistorico({ tipo: 'tudo', agente: '', limite: 999 as any })).toMatch(/Limite/);
  });

  it('subtituloItem junta tipo · agente · status · gatilho', () => {
    expect(subtituloItem({ id: '1', tipo: 'task', titulo: 'x', agente: 'secretario', quando: null, status: 'feito' }))
      .toBe('Task · secretario · feito');
    expect(subtituloItem({ id: '1', tipo: 'execucao', titulo: 'x', agente: 'a', quando: null, status: 'ok', gatilho: { tipo: 'cron', origem: 'agenda' } }))
      .toBe('Execução · a · ok · gatilho: cron:agenda');
    expect(subtituloItem({ id: '1', tipo: 'rotina', titulo: 'x', agente: '', quando: null }))
      .toBe('Rotina');
    expect(subtituloItem({ id: '1', tipo: 'conversa', titulo: 'x', agente: 'secretario', quando: null }))
      .toBe('Conversa · secretario');
  });

  it('stores são writable e default', async () => {
    const { get } = await import('svelte/store');
    historicoFiltrosStore.set({ tipo: 'tudo', agente: '', limite: 100 });
    expect(get(historicoFiltrosStore)).toEqual({ tipo: 'tudo', agente: '', limite: 100 });
    historicoItensStore.set([]);
    expect(get(historicoItensStore)).toEqual([]);
    historicoCarregandoStore.set(false);
    expect(get(historicoCarregandoStore)).toBe(false);
    historicoErroStore.set(null);
    expect(get(historicoErroStore)).toBeNull();
    agentesStore.set([]);
    expect(get(agentesStore)).toEqual([]);
  });
});

describe('historico store — carregarHistorico integra api', () => {
  beforeEach(() => {
    historicoItensStore.set([]);
    historicoErroStore.set(null);
    historicoCarregandoStore.set(false);
    historicoFiltrosStore.set({ ...FILTROS_PADRAO });
  });

  it('carregarHistorico com filtros padrão chama q("/historico?limite=100")', async () => {
    const origFetch = globalThis.fetch;
    const mockItens = [{ id: '1', tipo: 'task', titulo: 'T1', agente: 'a', quando: '2026-09-02T10:00:00Z' }];
    let lastUrl = '';
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      lastUrl = String(url);
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => mockItens } as any);
    }) as any;
    const res = await carregarHistorico({ tipo: 'tudo', agente: '', limite: 100 });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('1');
    expect(lastUrl).toContain('/historico');
    expect(lastUrl).toContain('limite=100');
    globalThis.fetch = origFetch;
  });

  it('carregarHistorico com filtro tipo e agente monta params', async () => {
    const origFetch = globalThis.fetch;
    let lastUrl = '';
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      lastUrl = String(url);
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => [] } as any);
    }) as any;
    await carregarHistorico({ tipo: 'execucao', agente: 'secretario', limite: 50 });
    expect(lastUrl).toContain('tipo=execucao');
    expect(lastUrl).toContain('agente=secretario');
    expect(lastUrl).toContain('limite=50');
    globalThis.fetch = origFetch;
  });

  it('carregarAgentes chama q("/agents")', async () => {
    const origFetch = globalThis.fetch;
    const mockAgentes = [{ id: 'secretario' }, { id: 'editor' }];
    let lastUrl = '';
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      lastUrl = String(url);
      if (String(url).includes('/agents')) {
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => mockAgentes } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => [] } as any);
    }) as any;
    const res = await carregarAgentes();
    expect(res.length).toBe(2);
    expect(lastUrl).toContain('/agents');
    globalThis.fetch = origFetch;
  });
});
