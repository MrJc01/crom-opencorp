/**
 * Teste para migração Agentes → Svelte 5
 * Verifica estrutura do componente, integração com stores/api e helpers puros.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  badgeCategoria,
  rotuloPermissao,
  isSistema,
  validarIdAgente,
  filtrarAtivos,
  filtrarDesativados,
  montarPayloadAgenteSalvar,
  agentesStore,
  carregandoStore,
  erroStore,
  carregarAgentes,
  toggleAgenteAtivoStore,
  semearCatalogoStore,
  chamarAgenteStore,
  criarAgenteStore,
  excluirAgenteStore,
} from '../src/web/stores/agentes.svelte.js';

const RAIZ = join(dirname(new URL(import.meta.url).pathname), '..');
const SVELTE_PATH = join(RAIZ, 'src/web/views/Agentes.svelte');
const STORE_PATH = join(RAIZ, 'src/web/stores/agentes.svelte.ts');

function lerSvelte(): string {
  return readFileSync(SVELTE_PATH, 'utf8');
}
function lerStore(): string {
  return readFileSync(STORE_PATH, 'utf8');
}

describe('Agentes.svelte — arquivo existe e usa Svelte 5 runes + stores/api', () => {
  it('arquivos existem', () => {
    expect(existsSync(SVELTE_PATH), 'src/web/views/Agentes.svelte deve existir').toBe(true);
    expect(existsSync(STORE_PATH), 'src/web/stores/agentes.svelte.ts deve existir').toBe(true);
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
    expect(src).toContain('api(');
    expect(src).toContain('toast');
  });

  it('usa stores (wsAtivo + agentes stores)', () => {
    const src = lerSvelte();
    expect(src).toContain('wsAtivo');
    expect(src).toContain("from '../stores/");
    expect(src).toContain('agentesStore');
    expect(src).toContain('carregarAgentes');
    expect(src).toContain('badgeCategoria');
    expect(src).toContain('rotuloPermissao');
  });

  it('mantém Tailwind/DaisyUI classes', () => {
    const src = lerSvelte();
    expect(src).toContain('btn');
    expect(src).toContain('card');
    expect(src).toContain('badge');
    expect(src).toContain('page-header');
    expect(src).toContain('grid-cols-1');
    expect(src).toContain('toggle');
  });

  it('renderiza header Agentes + ajuda agentes', () => {
    const src = lerSvelte();
    expect(src).toContain('Agentes');
    expect(src).toContain("ajuda('agentes')");
    expect(src).toContain("icone('teams')");
  });

  it('renderiza ações: Semear catálogo + Novo agente', () => {
    const src = lerSvelte();
    const store = lerStore();
    expect(src).toContain('Semear catálogo');
    expect(src).toContain('btn-semear-catalogo');
    expect(src).toContain('Novo agente');
    expect(src).toContain('handleSemear');
    expect(src).toContain('abrirForm');
    expect(store).toContain('/agents/semear-catalogo');
    expect(src).toContain('Semeando');
  });

  it('implementa seções Ativos × Catálogo (desativados) com grid', () => {
    const src = lerSvelte();
    expect(src).toContain('Ativos');
    expect(src).toContain('Catálogo');
    expect(src).toContain('agentes-ativos');
    expect(src).toContain('agentes-catalogo');
    expect(src).toContain('filtrarAtivos');
    expect(src).toContain('filtrarDesativados');
    expect(src).toContain('grid-cols-1');
    expect(src).toContain('Nenhum agente nesta empresa');
    expect(src).toContain('Catálogo vazio');
  });

  it('renderiza card com toggle por agente + sistema + orçamento', () => {
    const src = lerSvelte();
    expect(src).toContain('data-agente-card');
    expect(src).toContain('data-toggle-agente');
    expect(src).toContain('toggleAgenteAtivo');
    expect(src).toContain('handleToggle');
    expect(src).toContain('isSistema');
    expect(src).toContain('secretario');
    expect(src).toContain('orçamento');
    expect(src).toContain('badgeCategoria');
    expect(src).toContain('rotuloPermissao');
  });

  it('implementa ações por card: Chamar + Editar + Excluir', () => {
    const src = lerSvelte();
    const store = lerStore();
    expect(src).toContain('Chamar');
    expect(src).toContain('handleChamar');
    expect(store).toContain('/run');
    expect(src).toContain('modalPrompt');
    expect(src).toContain('Editar config');
    expect(src).toContain('handleEditar');
    expect(src).toContain('handleExcluir');
    expect(src).toContain('modalConfirm');
    expect(src).toContain("icone('run')");
    expect(src).toContain("icone('gear')");
    expect(src).toContain("icone('trash')");
  });

  it('implementa form de criação (clone de base) com id/from/model', () => {
    const src = lerSvelte();
    expect(src).toContain('Novo agente (clone de base)');
    expect(src).toContain('novo-agente-id');
    expect(src).toContain('novo-agente-from');
    expect(src).toContain('novo-agente-model');
    expect(src).toContain('executor-padrao');
    expect(src).toContain('handleCriar');
    expect(src).toContain('criarAgenteStore');
    expect(src).toContain('validarIdAgente');
    expect(src).toContain('Criar agente');
    expect(src).toContain('Cancelar');
  });

  it('implementa drawer de edição com campos model/permissions/tools/budget', () => {
    const src = lerSvelte();
    expect(src).toContain('drawerOpen');
    expect(src).toContain('agenteEditId');
    expect(src).toContain('ag-role');
    expect(src).toContain('ag-model');
    expect(src).toContain('ag-permissions');
    expect(src).toContain('ag-tools');
    expect(src).toContain('ag-budget');
    expect(src).toContain('ag-turns');
    expect(src).toContain('handleSalvarAgente');
    expect(src).toContain('salvarAgenteStore');
    expect(src).toContain('montarPayloadAgenteSalvar');
    expect(src).toContain('Salvar');
    expect(src).toContain('opencorp agent edit');
  });

  it('implementa estados carregando / erro / vazio', () => {
    const src = lerSvelte();
    expect(src).toContain('Carregando agentes');
    expect(src).toContain('Algo deu errado');
    expect(src).toContain('Tentar novamente');
    expect(src).toContain('Nenhum agente ativo');
    expect(src).toContain('Todo o catálogo está ativo');
  });

  it('usa icone() para teams, plus, run, gear, trash, check, history', () => {
    const src = lerSvelte();
    expect(src).toContain("icone('teams')");
    expect(src).toContain("icone('plus')");
    expect(src).toContain("icone('run')");
    expect(src).toContain("icone('gear')");
    expect(src).toContain("icone('trash')");
  });

  it('store exporta helpers e constantes', () => {
    const src = lerStore();
    expect(src).toContain('badgeCategoria');
    expect(src).toContain('rotuloPermissao');
    expect(src).toContain('isSistema');
    expect(src).toContain('validarIdAgente');
    expect(src).toContain('filtrarAtivos');
    expect(src).toContain('carregarAgentes');
    expect(src).toContain('toggleAgenteAtivoStore');
    expect(src).toContain('semearCatalogoStore');
    expect(src).toContain("'/agents'");
    expect(src).toContain("'/agents/semear-catalogo'");
  });
});

describe('agentes store — helpers puros', () => {
  it('badgeCategoria mapeia categoria → classe', () => {
    expect(badgeCategoria('ceo')).toBe('badge-review');
    expect(badgeCategoria('secretario')).toBe('badge-fanout');
    expect(badgeCategoria('operario')).toBe('badge-pipeline');
    expect(badgeCategoria('custom')).toBe('badge-neutral');
    expect(badgeCategoria('outro')).toBe('badge-neutral');
    expect(badgeCategoria('')).toBe('badge-neutral');
  });

  it('rotuloPermissao mapeia permissões', () => {
    expect(rotuloPermissao('level-1')).toBe('só leitura');
    expect(rotuloPermissao('level-2')).toBe('bash local');
    expect(rotuloPermissao('level-3')).toBe('rede + HITL');
    expect(rotuloPermissao('outro')).toBe('rede + HITL');
  });

  it('isSistema detecta agentes de sistema', () => {
    expect(isSistema('secretario')).toBe(true);
    expect(isSistema('secretario-exec')).toBe(true);
    expect(isSistema('executor-padrao')).toBe(false);
    expect(isSistema('agente-vendas')).toBe(false);
    expect(isSistema('')).toBe(false);
  });

  it('validarIdAgente aceita kebab-case', () => {
    expect(validarIdAgente('editor-noturno')).toBe(true);
    expect(validarIdAgente('a')).toBe(true);
    expect(validarIdAgente('agente-vendas')).toBe(true);
    expect(validarIdAgente('Agente-Vendas')).toBe(false);
    expect(validarIdAgente('')).toBe(false);
    expect(validarIdAgente('-invalido')).toBe(false);
    expect(validarIdAgente('com_underscore')).toBe(false);
    expect(validarIdAgente('com espaço')).toBe(false);
  });

  it('filtrarAtivos / filtrarDesativados separam por ativo', () => {
    const lista: any[] = [
      { id: 'a', ativo: true },
      { id: 'b', ativo: false },
      { id: 'c' }, // sem campo = ativo por padrão
      { id: 'd', ativo: false },
    ];
    expect(filtrarAtivos(lista).map((a) => a.id)).toEqual(['a', 'c']);
    expect(filtrarDesativados(lista).map((a) => a.id)).toEqual(['b', 'd']);
    expect(filtrarAtivos([])).toEqual([]);
    expect(filtrarDesativados([])).toEqual([]);
  });

  it('montarPayloadAgenteSalvar monta patch correto', () => {
    const patch = montarPayloadAgenteSalvar('Editor', 'opencode/model', 'level-2', 'read, bash', 1.5, 20);
    expect(patch.role).toBe('Editor');
    expect(patch.model).toBe('opencode/model');
    expect(patch.permissions).toBe('level-2');
    expect(patch.tools).toEqual(['read', 'bash']);
    expect(patch.budget_daily_usd).toBe(1.5);
    expect(patch.budget_max_turns).toBe(20);
    const vazio = montarPayloadAgenteSalvar('', '', 'level-1', '', 0, 20);
    expect(vazio.tools).toEqual([]);
  });

  it('stores são writable', async () => {
    const { get } = await import('svelte/store');
    agentesStore.set([{ id: 'a', role: 'R', category: 'operario', model: 'm', permissions: 'level-1', budget_daily_usd: 1 }]);
    expect(get(agentesStore)).toHaveLength(1);
    agentesStore.set([]);
    expect(get(agentesStore)).toEqual([]);
    carregandoStore.set(true);
    expect(get(carregandoStore)).toBe(true);
    carregandoStore.set(false);
    erroStore.set('erro teste');
    expect(get(erroStore)).toBe('erro teste');
    erroStore.set(null);
  });
});

describe('agentes store — carregarAgentes integra api', () => {
  beforeEach(() => {
    agentesStore.set([]);
    erroStore.set(null);
    carregandoStore.set(false);
  });

  it('carregarAgentes chama api("/agents")', async () => {
    const origFetch = globalThis.fetch;
    const mockAgentes = [
      { id: 'executor-padrao', role: 'Executor', category: 'operario', model: 'opencode-go/glm-5.3-flash', permissions: 'level-2', budget_daily_usd: 1, ativo: true },
      { id: 'agente-vendas', role: 'Vendas', category: 'custom', model: 'opencode-go/glm-5.3-flash', permissions: 'level-1', budget_daily_usd: 1, ativo: false },
    ];
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/agents')) {
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => mockAgentes } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => [] } as any);
    }) as any;
    const lista = await carregarAgentes();
    expect(lista.length).toBe(2);
    expect(lista[0].id).toBe('executor-padrao');
    expect(filtrarAtivos(lista).length).toBe(1);
    expect(filtrarDesativados(lista).length).toBe(1);
    globalThis.fetch = origFetch;
  });

  it('toggleAgenteAtivoStore chama PUT /agents/:id', async () => {
    const origFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: any; method: string }> = [];
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      let body = null;
      try { body = opts?.body ? JSON.parse(opts.body) : null; } catch { body = opts?.body; }
      calls.push({ url: String(url), body, method: opts?.method || 'GET' });
      if (String(url).includes('/agents/agente-vendas') && opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => [] } as any);
    }) as any;
    await toggleAgenteAtivoStore('agente-vendas', true);
    const putCall = calls.find((c) => c.url.includes('/agents/agente-vendas') && c.method === 'PUT');
    expect(putCall).toBeDefined();
    expect(putCall!.body).toEqual({ ativo: true });
    globalThis.fetch = origFetch;
  });

  it('semearCatalogoStore chama POST /agents/semear-catalogo', async () => {
    const origFetch = globalThis.fetch;
    const calls: Array<{ url: string; method: string }> = [];
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      calls.push({ url: String(url), method: opts?.method || 'GET' });
      if (String(url).includes('/agents/semear-catalogo')) {
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ criados: ['agente-vendas'], existentes: [] }) } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => [] } as any);
    }) as any;
    const r = await semearCatalogoStore();
    const postCall = calls.find((c) => c.url.includes('/agents/semear-catalogo') && c.method === 'POST');
    expect(postCall).toBeDefined();
    expect(r.criados).toEqual(['agente-vendas']);
    globalThis.fetch = origFetch;
  });
});
