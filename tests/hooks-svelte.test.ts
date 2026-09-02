/**
 * Teste para migração Hooks → Svelte 5
 * Verifica estrutura do componente, integração com stores/api e helpers puros.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  ALVOS,
  TIPOS_ALVO,
  rotuloAlvo,
  camposForTipo,
  validarHookForm,
  montarAlvo,
  construirCurl,
  construirUrlHook,
  hooksStore,
  carregandoStore,
  erroStore,
  carregarHooks,
  criarHookStore,
  excluirHookStore,
  buscarHookDetalhe,
} from '../src/web/stores/hooks.svelte.js';

const RAIZ = join(dirname(new URL(import.meta.url).pathname), '..');
const SVELTE_PATH = join(RAIZ, 'src/web/views/Hooks.svelte');
const STORE_PATH = join(RAIZ, 'src/web/stores/hooks.svelte.ts');

function lerSvelte(): string {
  return readFileSync(SVELTE_PATH, 'utf8');
}
function lerStore(): string {
  return readFileSync(STORE_PATH, 'utf8');
}

describe('Hooks.svelte — arquivo existe e usa Svelte 5 runes + stores/api', () => {
  it('arquivos existem', () => {
    expect(existsSync(SVELTE_PATH), 'src/web/views/Hooks.svelte deve existir').toBe(true);
    expect(existsSync(STORE_PATH), 'src/web/stores/hooks.svelte.ts deve existir').toBe(true);
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

  it('usa stores (wsAtivo + hooksStore)', () => {
    const src = lerSvelte();
    expect(src).toContain('wsAtivo');
    expect(src).toContain("from '../stores/");
    expect(src).toContain('hooksStore');
    expect(src).toContain('carregarHooks');
    expect(src).toContain('criarHookStore');
    expect(src).toContain('excluirHookStore');
  });

  it('mantém Tailwind/DaisyUI classes', () => {
    const src = lerSvelte();
    expect(src).toContain('btn');
    expect(src).toContain('card');
    expect(src).toContain('badge');
    expect(src).toContain('page-header');
    expect(src).toContain('badge-ok');
    expect(src).toContain('badge-neutral');
  });

  it('renderiza header Hooks + ajuda hooks', () => {
    const src = lerSvelte();
    expect(src).toContain('Hooks');
    expect(src).toContain("ajuda('hooks')");
    expect(src).toContain("icone('hook')");
  });

  it('implementa 3 estados: carregando / erro / vazio', () => {
    const src = lerSvelte();
    expect(src).toContain('Carregando hooks');
    expect(src).toContain('Algo deu errado');
    expect(src).toContain('Nenhum hook configurado');
    expect(src).toContain('Tentar novamente');
    expect(src).toContain('hooks-lista');
    expect(src).toContain('estado-loading');
    expect(src).toContain('estado-erro');
  });

  it('implementa lista de hooks com badge ativo/inativo e ações', () => {
    const src = lerSvelte();
    expect(src).toContain('team-card');
    expect(src).toContain('rotuloAlvo');
    expect(src).toContain('POST /hooks/');
    expect(src).toContain('dedup');
    expect(src).toContain('copiarCurlHook');
    expect(src).toContain('excluirHook');
    expect(src).toContain("icone('copy')");
    expect(src).toContain("icone('trash')");
    expect(src).toContain('cURL');
  });

  it('implementa form Novo hook com campos dinâmicos', () => {
    const src = lerSvelte();
    expect(src).toContain('Novo hook');
    expect(src).toContain('hook-form');
    expect(src).toContain('hook-nome');
    expect(src).toContain('hook-alvo-tipo');
    expect(src).toContain('hook-respond');
    expect(src).toContain('hook-dedup');
    expect(src).toContain('hook-campos-alvo');
    expect(src).toContain('hook-alvo-campo');
    expect(src).toContain('abrirFormHook');
    expect(src).toContain('fecharFormHook');
    expect(src).toContain('criarHook');
    expect(src).toContain('imediato');
    expect(src).toContain('final');
    expect(src).toContain('Criar hook');
    expect(src).toContain('Cancelar');
  });

  it('usa ALVOS (4 tipos: task_create, agent_run, flow_run, webhook_out)', () => {
    const src = lerSvelte();
    expect(src).toContain('ALVOS');
    expect(src).toContain('task_create');
    expect(src).toContain('agent_run');
    expect(src).toContain('flow_run');
    expect(src).toContain('webhook_out');
    expect(src).toContain('camposForTipo');
  });

  it('chama api /hooks para CRUD', () => {
    const src = lerStore();
    expect(src).toContain("'/hooks'");
    expect(src).toContain("'/hooks/'");
    expect(src).toContain("method: 'POST'");
    expect(src).toContain("method: 'DELETE'");
    expect(src).toContain('carregarHooks');
    expect(src).toContain('criarHookStore');
    expect(src).toContain('excluirHookStore');
  });

  it('usa modalConfirm para criar/excluir e clipboard para cURL', () => {
    const src = lerSvelte();
    expect(src).toContain('modalConfirm');
    expect(src).toContain('clipboard');
    expect(src).toContain('construirCurl');
  });

  it('mantém compat com router wsAtivo e localStorage polling', () => {
    const src = lerSvelte();
    expect(src).toContain('wsAtual');
    expect(src).toContain('wsAtivo');
    expect(src).toContain('localStorage');
  });

  it('store exporta helpers e constantes', () => {
    const src = lerStore();
    expect(src).toContain('ALVOS');
    expect(src).toContain('TIPOS_ALVO');
    expect(src).toContain('rotuloAlvo');
    expect(src).toContain('camposForTipo');
    expect(src).toContain('validarHookForm');
    expect(src).toContain('montarAlvo');
    expect(src).toContain('construirCurl');
    expect(src).toContain('construirUrlHook');
  });
});

describe('hooks store — helpers puros', () => {
  it('ALVOS tem 4 tipos com rotulos e campos', () => {
    expect(ALVOS).toHaveLength(4);
    expect(TIPOS_ALVO).toEqual(['task_create', 'agent_run', 'flow_run', 'webhook_out']);
    const task = ALVOS.find((a) => a.tipo === 'task_create')!;
    expect(task.rotulo).toContain('criar task');
    expect(task.campos.some((c) => c.chave === 'titulo' && c.required)).toBe(true);
    const agent = ALVOS.find((a) => a.tipo === 'agent_run')!;
    expect(agent.campos.some((c) => c.chave === 'agente' && c.required)).toBe(true);
    const flow = ALVOS.find((a) => a.tipo === 'flow_run')!;
    expect(flow.campos.some((c) => c.chave === 'flow' && c.required)).toBe(true);
    const hook = ALVOS.find((a) => a.tipo === 'webhook_out')!;
    expect(hook.campos.some((c) => c.chave === 'url' && c.required)).toBe(true);
  });

  it('rotuloAlvo formata alvo + detalhe', () => {
    expect(rotuloAlvo({ tipo: 'task_create', titulo: 'Minha task' })).toBe('criar task · Minha task');
    expect(rotuloAlvo({ tipo: 'agent_run', agente: 'executor-padrao' })).toBe('rodar agente · executor-padrao');
    expect(rotuloAlvo({ tipo: 'flow_run', flow: 'meu-fluxo' })).toBe('rodar fluxo · meu-fluxo');
    expect(rotuloAlvo({ tipo: 'webhook_out', url: 'https://ex.com' })).toBe('webhook de saída · https://ex.com');
    expect(rotuloAlvo({ tipo: 'task_create' } as any)).toBe('criar task');
    expect(rotuloAlvo({} as any)).toContain('—');
  });

  it('camposForTipo retorna campos do tipo ou vazio', () => {
    expect(camposForTipo('task_create').map((c) => c.chave)).toEqual(['titulo', 'responsavel']);
    expect(camposForTipo('agent_run').map((c) => c.chave)).toEqual(['agente', 'ordem']);
    expect(camposForTipo('flow_run').map((c) => c.chave)).toEqual(['flow', 'entrada']);
    expect(camposForTipo('webhook_out').map((c) => c.chave)).toEqual(['url', 'metodo']);
    expect(camposForTipo('inexistente')).toEqual([]);
  });

  it('validarHookForm detecta erros', () => {
    expect(validarHookForm('', 'task_create', { titulo: 'x' })).toMatch(/Nome/);
    expect(validarHookForm('nome', 'tipo_invalido', {})).toMatch(/Tipo/);
    expect(validarHookForm('nome', 'task_create', { titulo: '' })).toMatch(/Campo obrigatório/);
    expect(validarHookForm('nome', 'agent_run', { agente: 'a' })).toMatch(/Campo obrigatório/);
    expect(validarHookForm('nome', 'webhook_out', { url: 'notaurl' })).toMatch(/URL inválida/);
    expect(validarHookForm('nome', 'webhook_out', { url: 'https://ok.com' })).toBeNull();
    expect(validarHookForm('nome', 'task_create', { titulo: 'ok' }, -1)).toMatch(/Dedup/);
    expect(validarHookForm('nome', 'task_create', { titulo: 'ok' }, 0)).toBeNull();
    expect(validarHookForm('nome', 'task_create', { titulo: ' ok ' })).toBeNull();
  });

  it('montarAlvo monta objeto alvo limpo', () => {
    expect(montarAlvo('task_create', { titulo: '  T  ', responsavel: '' })).toEqual({ tipo: 'task_create', titulo: 'T' });
    expect(montarAlvo('agent_run', { agente: ' a ', ordem: 'b ', extra: '  ' } as any)).toEqual({ tipo: 'agent_run', agente: 'a', ordem: 'b' });
  });

  it('construirCurl e construirUrlHook geram urls corretas', () => {
    expect(construirCurl('ws1', 'hook-123', 'tok123', 'https://app.com')).toBe(
      'curl -X POST https://app.com/hooks/ws1/hook-123 -H "x-opencorp-token: tok123" -H "content-type: application/json" -d \'{"exemplo":"valor"}\'',
    );
    expect(construirCurl('', 'hook-1', 'tok', 'https://app.com')).toContain('/hooks//hook-1');
    expect(construirUrlHook('ws1', 'hook-123', 'https://app.com')).toBe('https://app.com/hooks/ws1/hook-123');
    expect(construirUrlHook('', 'hook-123', 'https://app.com')).toBe('https://app.com/hooks/<workspace>/hook-123');
  });

  it('stores são writable', async () => {
    const { get } = await import('svelte/store');
    hooksStore.set([{ id: 'h1', nome: 'x', ativo: true, respond: 'imediato', dedup_seg: 0, metodos: ['POST'], alvo: { tipo: 'task_create', titulo: 't' } }]);
    expect(get(hooksStore)).toHaveLength(1);
    hooksStore.set([]);
    expect(get(hooksStore)).toEqual([]);
    carregandoStore.set(true);
    expect(get(carregandoStore)).toBe(true);
    carregandoStore.set(false);
    erroStore.set('erro teste');
    expect(get(erroStore)).toBe('erro teste');
    erroStore.set(null);
  });
});

describe('hooks store — carregarHooks integra api', () => {
  beforeEach(() => {
    hooksStore.set([]);
    erroStore.set(null);
    carregandoStore.set(false);
  });

  it('carregarHooks chama api("/hooks")', async () => {
    const origFetch = globalThis.fetch;
    const mockHooks = [{ id: 'hook-1', nome: 'h', ativo: true, respond: 'imediato', dedup_seg: 0, metodos: ['POST'], alvo: { tipo: 'task_create', titulo: 't' } }];
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/hooks')) {
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => mockHooks } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) } as any);
    }) as any;
    const lista = await carregarHooks();
    expect(lista.length).toBe(1);
    expect(lista[0].id).toBe('hook-1');
    globalThis.fetch = origFetch;
  });

  it('criarHookStore POST /hooks com payload correto', async () => {
    const origFetch = globalThis.fetch;
    let lastBody: string | null = null;
    let lastUrl = '';
    const mockCriado = { id: 'hook-2', nome: 'novo', ativo: true, respond: 'imediato', dedup_seg: 60, metodos: ['POST'], alvo: { tipo: 'task_create', titulo: 't' }, token: 'hk_abc' };
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      lastUrl = String(url);
      if (opts?.method === 'POST' && String(url).includes('/hooks')) {
        lastBody = opts.body;
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => mockCriado } as any);
      }
      if (String(url).includes('/hooks')) {
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => [] } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) } as any);
    }) as any;
    const criado = await criarHookStore({ nome: 'novo', alvo: { tipo: 'task_create', titulo: 't' }, respond: 'imediato', dedup_seg: 0 });
    expect(criado.id).toBe('hook-2');
    expect(lastUrl).toContain('/hooks');
    expect(lastBody).toContain('novo');
    globalThis.fetch = origFetch;
  });

  it('excluirHookStore DELETE /hooks/:id', async () => {
    const origFetch = globalThis.fetch;
    let lastUrl = '';
    let lastMethod = '';
    hooksStore.set([{ id: 'hook-x', nome: 'x', ativo: true, respond: 'imediato', dedup_seg: 0, metodos: ['POST'], alvo: { tipo: 'task_create', titulo: 't' } }]);
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      lastUrl = String(url);
      lastMethod = opts?.method || 'GET';
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) } as any);
    }) as any;
    await excluirHookStore('hook-x');
    expect(lastUrl).toContain('/hooks/hook-x');
    expect(lastMethod).toBe('DELETE');
    const { get } = await import('svelte/store');
    expect(get(hooksStore)).toEqual([]);
    globalThis.fetch = origFetch;
  });
});
