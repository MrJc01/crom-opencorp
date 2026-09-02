/**
 * Teste para migração Wizard → Svelte 5
 * Verifica estrutura do componente, integração com stores/api e helpers puros.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  perfilVazio,
  slugify,
  validarId,
  validarPasso1,
  topicosSugeridosPorTipo,
  topicosFromString,
  toggleValor,
  montarPayload,
  perfilParaRevisao,
  TONS_SUGERIDOS,
  TONS_EVITAR_SUGERIDOS,
  TIPOS,
  ID_RE,
  wizardPassoStore,
  wizardPerfilStore,
  wizardAbertoStore,
  wizardEnviandoStore,
  criarWorkspace,
} from '../src/web/stores/wizard.svelte.js';

const RAIZ = join(dirname(new URL(import.meta.url).pathname), '..');
const SVELTE_PATH = join(RAIZ, 'src/web/views/Wizard.svelte');
const STORE_PATH = join(RAIZ, 'src/web/stores/wizard.svelte.ts');

function lerSvelte(): string {
  return readFileSync(SVELTE_PATH, 'utf8');
}
function lerStore(): string {
  return readFileSync(STORE_PATH, 'utf8');
}

describe('Wizard.svelte — arquivo existe e usa Svelte 5 runes + stores/api', () => {
  it('arquivos existem', () => {
    expect(existsSync(SVELTE_PATH), 'src/web/views/Wizard.svelte deve existir').toBe(true);
    expect(existsSync(STORE_PATH), 'src/web/stores/wizard.svelte.ts deve existir').toBe(true);
  });

  it('usa Svelte 5 runes', () => {
    const src = lerSvelte();
    expect(src).toContain('$state');
    expect(src).toContain('$derived');
    expect(src).toContain('onMount');
  });

  it('importa api via src/web/api.ts e usa toast', () => {
    const src = lerSvelte();
    expect(src).toContain("from '../api.js'");
    expect(src).toContain('api(');
    expect(src).toContain('toast');
  });

  it('usa stores (wsAtivo + wizard store)', () => {
    const src = lerSvelte();
    expect(src).toContain('wsAtivo');
    expect(src).toContain("from '../stores/");
    expect(src).toContain('wizard.svelte');
    expect(src).toContain('perfilVazio');
    expect(src).toContain('slugify');
  });

  it('mantém Tailwind/DaisyUI classes', () => {
    const src = lerSvelte();
    expect(src).toContain('btn');
    expect(src).toContain('wizard-overlay');
    expect(src).toContain('wizard-box');
    expect(src).toContain('flex');
    expect(src).toContain('grid');
    expect(src).toContain('rounded');
  });

  it('renderiza estrutura wizard: overlay, topo, progresso, passos, corpo, acoes', () => {
    const src = lerSvelte();
    expect(src).toContain('wizard-overlay');
    expect(src).toContain('wizard-box');
    expect(src).toContain('wizard-topo');
    expect(src).toContain('wizard-titulo');
    expect(src).toContain('wizard-progresso');
    expect(src).toContain('wizard-progresso-barra');
    expect(src).toContain('wizard-passos');
    expect(src).toContain('wizard-corpo');
    expect(src).toContain('wizard-acoes');
    expect(src).toContain('role="dialog"');
    expect(src).toContain('Nova empresa');
    expect(src).toContain("ajuda('wizard-workspace')");
    expect(src).toContain("icone('spark')");
    expect(src).toContain('Fechar wizard');
  });

  it('implementa passo 1: identidade com nome, id kebab, nicho, publico, chips tom', () => {
    const src = lerSvelte();
    expect(src).toContain('wiz-nome');
    expect(src).toContain('wiz-id');
    expect(src).toContain('wiz-erro-id');
    expect(src).toContain('wiz-nicho');
    expect(src).toContain('wiz-publico');
    expect(src).toContain('wiz-chips');
    expect(src).toContain('chip');
    expect(src).toContain('chip-ativo');
    expect(src).toContain('TONS_SUGERIDOS');
    expect(src).toContain('TONS_EVITAR_SUGERIDOS');
    expect(src).toContain('toggleTom');
    expect(src).toContain('toggleEvitar');
  });

  it('implementa passo 2: tipos cards radio Portal/Serviços/E-commerce/Genérica', () => {
    const src = lerSvelte();
    expect(src).toContain('wiz-tipos');
    expect(src).toContain('wiz-tipo');
    expect(src).toContain('ativo');
    expect(src).toContain('TIPOS');
    expect(src).toContain('handleTipo');
    expect(src).toContain('Portal / Blog');
  });

  it('implementa passo 3: template + topicos editoriais sugeridos por tipo', () => {
    const src = lerSvelte();
    expect(src).toContain('wiz-template');
    expect(src).toContain('wiz-topicos');
    expect(src).toContain('wiz-dica');
    expect(src).toContain('topicosSugeridos');
    expect(src).toContain('handleTopicos');
    expect(src).toContain('default');
  });

  it('implementa passo 4: revisao + POST /workspaces', () => {
    const src = lerSvelte();
    expect(src).toContain('wiz-revisao');
    expect(src).toContain('wiz-criar');
    expect(src).toContain('Criar empresa');
    expect(src).toContain('/workspaces');
    expect(src).toContain('POST');
    expect(src).toContain('setWsAtivo');
    expect(src).toContain("goto('tasks')");
    expect(src).toContain('Criando');
  });

  it('implementa navegação: avançar com validação, voltar preserva estado', () => {
    const src = lerSvelte();
    expect(src).toContain('avancar');
    expect(src).toContain('voltar');
    expect(src).toContain('validarPasso1');
    expect(src).toContain('ID_RE');
    expect(src).toContain('Continuar');
    expect(src).toContain('Revisar');
    expect(src).toContain('Voltar');
  });

  it('slugify automático e ID editável (idTocado)', () => {
    const src = lerSvelte();
    expect(src).toContain('slugify');
    expect(src).toContain('idTocado');
    expect(src).toContain('handleNome');
    expect(src).toContain('handleId');
  });

  it('usa icone e ajuda, e mantém compatibilidade global abrirWizard', () => {
    const src = lerSvelte();
    expect(src).toContain("icone('spark')");
    expect(src).toContain("icone('run')");
    expect(src).toContain("ajuda('wizard-workspace')");
    expect(src).toContain('abrirWizard');
    expect(src).toContain('fecharWizard');
    expect(src).toContain('window');
  });

  it('store exporta helpers e constantes', () => {
    const src = lerStore();
    expect(src).toContain('perfilVazio');
    expect(src).toContain('slugify');
    expect(src).toContain('TONS_SUGERIDOS');
    expect(src).toContain('TIPOS');
    expect(src).toContain('ID_RE');
    expect(src).toContain('validarId');
    expect(src).toContain('montarPayload');
    expect(src).toContain('criarWorkspace');
    expect(src).toContain('wizardPassoStore');
    expect(src).toContain('writable');
  });
});

describe('wizard store — helpers puros', () => {
  it('perfilVazio retorna defaults', () => {
    const p = perfilVazio();
    expect(p.empresa).toBe('');
    expect(p.id).toBe('');
    expect(p.tipo).toBe('portal');
    expect(p.template).toBe('default');
    expect(p.tom).toEqual([]);
    expect(p.topicos).toEqual([]);
    expect(p.idTocado).toBe(false);
  });

  it('slugify normaliza NFD e troca para kebab-case', () => {
    expect(slugify('Empório Aurora')).toBe('emporio-aurora');
    expect(slugify('  Minha Empresa X! ')).toBe('minha-empresa-x');
    expect(slugify('Olá Mundo')).toBe('ola-mundo');
    expect(slugify('café---queijo')).toBe('cafe-queijo');
    expect(slugify('')).toBe('');
  });

  it('ID_RE valida kebab-case', () => {
    expect(ID_RE.test('minha-empresa')).toBe(true);
    expect(ID_RE.test('a')).toBe(true);
    expect(ID_RE.test('emporio-aurora')).toBe(true);
    expect(ID_RE.test('Empresa X')).toBe(false);
    expect(ID_RE.test('Empresa_X')).toBe(false);
    expect(ID_RE.test('-invalido')).toBe(false);
    expect(ID_RE.test('invalido-')).toBe(false);
    expect(ID_RE.test('')).toBe(false);
    expect(ID_RE.test('a--b')).toBe(false);
  });

  it('validarId detecta vazio e inválido', () => {
    expect(validarId('')).toMatch(/obrigatório/);
    expect(validarId('Empresa X')).toMatch(/kebab-case/);
    expect(validarId('minha-empresa')).toBeNull();
  });

  it('validarPasso1 exige nome e id válido', () => {
    expect(validarPasso1({ ...perfilVazio(), empresa: '', id: 'a' })).toMatch(/nome/);
    expect(validarPasso1({ ...perfilVazio(), empresa: 'X', id: 'Empresa X' })).toMatch(/kebab-case/);
    expect(validarPasso1({ ...perfilVazio(), empresa: 'X', id: 'x' })).toBeNull();
  });

  it('TONS e TIPOS constantes', () => {
    expect(TONS_SUGERIDOS).toContain('direto');
    expect(TONS_EVITAR_SUGERIDOS).toContain('clickbait');
    expect(TIPOS.length).toBe(4);
    expect(TIPOS.map((t) => t.id)).toEqual(['portal', 'servicos', 'ecommerce', 'generica']);
    expect(TIPOS.find((t) => t.id === 'servicos')!.topicos).toContain('serviços e escopos');
  });

  it('topicosSugeridosPorTipo retorna array correto', () => {
    expect(topicosSugeridosPorTipo('portal')).toContain('tendências do setor');
    expect(topicosSugeridosPorTipo('ecommerce')).toContain('lançamentos e coleções');
    expect(topicosSugeridosPorTipo('inexistente')).toEqual([]);
  });

  it('topicosFromString split por linha e trim', () => {
    expect(topicosFromString('a\n b \n\n c')).toEqual(['a', 'b', 'c']);
    expect(topicosFromString('')).toEqual([]);
    expect(topicosFromString('  \n  ')).toEqual([]);
  });

  it('toggleValor adiciona/remove', () => {
    expect(toggleValor(['a'], 'a')).toEqual([]);
    expect(toggleValor([], 'a')).toEqual(['a']);
    expect(toggleValor(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(toggleValor(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('montarPayload monta {id, perfil} com tom join e tom_evitar array', () => {
    const p = { ...perfilVazio(), empresa: 'X', id: 'x', nicho: 'n', publico: 'p', tom: ['direto', 'técnico'], tomEvitar: ['clickbait'], topicos: ['a', 'b'] };
    const payload = montarPayload(p);
    expect(payload.id).toBe('x');
    expect(payload.perfil.empresa).toBe('X');
    expect(payload.perfil.tom).toBe('direto, técnico');
    expect(payload.perfil.tom_evitar).toEqual(['clickbait']);
    expect(payload.perfil.topicos).toEqual(['a', 'b']);
  });

  it('perfilParaRevisao formata campos com fallback —', () => {
    const p = perfilVazio();
    const r = perfilParaRevisao(p);
    expect(r.empresa).toBe('—');
    expect(r.id).toBe('—');
    const p2 = { ...perfilVazio(), empresa: 'E', id: 'e', tom: ['direto'], tipo: 'portal', topicos: ['a'] };
    const r2 = perfilParaRevisao(p2);
    expect(r2.empresa).toBe('E');
    expect(r2.tom).toBe('direto');
    expect(r2.tipo).toContain('Portal');
  });

  it('stores são writable', async () => {
    const { get } = await import('svelte/store');
    wizardPassoStore.set(2);
    expect(get(wizardPassoStore)).toBe(2);
    wizardPassoStore.set(1);
    wizardAbertoStore.set(true);
    expect(get(wizardAbertoStore)).toBe(true);
    wizardAbertoStore.set(false);
    wizardEnviandoStore.set(true);
    expect(get(wizardEnviandoStore)).toBe(true);
    wizardEnviandoStore.set(false);
    wizardPerfilStore.set(perfilVazio());
    expect(get(wizardPerfilStore).tipo).toBe('portal');
  });
});

describe('wizard store — criarWorkspace integra api', () => {
  beforeEach(() => {
    wizardPassoStore.set(1);
    wizardAbertoStore.set(false);
    wizardEnviandoStore.set(false);
    wizardPerfilStore.set(perfilVazio());
  });

  it('criarWorkspace chama api POST /workspaces com payload correto', async () => {
    const origFetch = globalThis.fetch;
    let lastUrl = '';
    let lastBody: any = null;
    let lastMethod = '';
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      lastUrl = String(url);
      lastMethod = opts?.method || 'GET';
      try { lastBody = opts?.body ? JSON.parse(opts.body) : null; } catch { lastBody = opts?.body; }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) } as any);
    }) as any;
    const p = { ...perfilVazio(), empresa: 'Wizard Test', id: 'wizard-test-e2e', nicho: 'consultoria', publico: 'robôs', tom: ['direto'], tomEvitar: ['clickbait'], tipo: 'servicos', topicos: ['serviços e escopos'] };
    await criarWorkspace(p);
    expect(lastUrl).toContain('/workspaces');
    expect(lastMethod).toBe('POST');
    expect(lastBody.id).toBe('wizard-test-e2e');
    expect(lastBody.perfil.empresa).toBe('Wizard Test');
    expect(lastBody.perfil.tom_evitar).toEqual(['clickbait']);
    globalThis.fetch = origFetch;
  });

  it('ID inválido não passa validarPasso1', () => {
    const p = { ...perfilVazio(), empresa: 'X', id: 'Empresa X!' };
    expect(validarPasso1(p)).not.toBeNull();
  });
});
