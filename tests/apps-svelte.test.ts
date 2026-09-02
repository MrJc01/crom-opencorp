/**
 * Teste para migração Apps → Svelte 5
 * Verifica estrutura do componente, integração com stores/api e helpers puros.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  APP_PERFIL_NOME_REGEX,
  BANNER_CARTAO,
  CAMPOS_APP,
  ROTULO_TIPO,
  TIPOS,
  agruparPerfis,
  filtrarPerfis,
  ordenarPerfis,
  validarIdPerfil,
  validarPerfilCampos,
  montarPayloadPerfil,
  contarMetrica,
  contagemGrafico,
  agruparKanban,
  tipoDeNomeApp,
  badgeTipoApp,
  appsStore,
  carregandoStore,
  erroStore,
  perfisStore,
  carregarApps,
  carregarPerfis,
} from '../src/web/stores/apps.svelte.js';

const RAIZ = join(dirname(new URL(import.meta.url).pathname), '..');
const SVELTE_PATH = join(RAIZ, 'src/web/views/Apps.svelte');
const STORE_PATH = join(RAIZ, 'src/web/stores/apps.svelte.ts');

function lerSvelte(): string {
  return readFileSync(SVELTE_PATH, 'utf8');
}
function lerStore(): string {
  return readFileSync(STORE_PATH, 'utf8');
}

describe('Apps.svelte — arquivo existe e usa Svelte 5 runes + stores/api', () => {
  it('arquivos existem', () => {
    expect(existsSync(SVELTE_PATH), 'src/web/views/Apps.svelte deve existir').toBe(true);
    expect(existsSync(STORE_PATH), 'src/web/stores/apps.svelte.ts deve existir').toBe(true);
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

  it('usa stores (wsAtivo + appsStore)', () => {
    const src = lerSvelte();
    expect(src).toContain('wsAtivo');
    expect(src).toContain("from '../stores/");
    expect(src).toContain('appsStore');
    expect(src).toContain('perfisStore');
    expect(src).toContain('carregarApps');
    expect(src).toContain('carregarPerfis');
  });

  it('mantém Tailwind/DaisyUI classes', () => {
    const src = lerSvelte();
    expect(src).toContain('btn');
    expect(src).toContain('card');
    expect(src).toContain('badge');
    expect(src).toContain('page-header');
    expect(src).toContain('border-zinc-700');
  });

  it('renderiza header Apps + ajuda apps', () => {
    const src = lerSvelte();
    expect(src).toContain('Apps');
    expect(src).toContain("ajuda('apps')");
    expect(src).toContain("icone('apps')");
  });

  it('implementa tabs Apps / Configurar apps', () => {
    const src = lerSvelte();
    expect(src).toContain('Configurar apps');
    expect(src).toContain("ajuda('apps-perfis')");
    expect(src).toContain("aba === 'apps'");
    expect(src).toContain("aba === 'perfis'");
    expect(src).toContain('trocarAba');
  });

  it('implementa lista de apps com 3 estados: carregando / erro / vazio', () => {
    const src = lerSvelte();
    expect(src).toContain('Carregando apps');
    expect(src).toContain('Algo deu errado');
    expect(src).toContain('Nenhum mini-app');
    expect(src).toContain('Tentar novamente');
    expect(src).toContain('apps-lista');
    expect(src).toContain('apps-grid');
    expect(src).toContain('opencorp app seed painel-tarefas');
  });

  it('implementa abrirApp / fecharApp e detalhe com widgets', () => {
    const src = lerSvelte();
    expect(src).toContain('abrirApp');
    expect(src).toContain('fecharApp');
    expect(src).toContain('Voltar');
    expect(src).toContain('appAberto');
    expect(src).toContain('widgetsDados');
    expect(src).toContain('/apps/');
    expect(src).toContain('/spec');
  });

  it('implementa renderização de widgets: metrica, tabela, grafico, kanban, markdown, lista_tarefas, formulario', () => {
    const src = lerSvelte();
    for (const tipo of ['metrica', 'tabela', 'grafico', 'kanban', 'markdown', 'lista_tarefas', 'formulario']) {
      expect(src).toContain(tipo);
    }
    expect(src).toContain('widget-card');
    expect(src).toContain('widget-grid');
    expect(src).toContain('handleEnviarForm');
    expect(src).toContain('Enviar');
  });

  it('implementa perfis: lista agrupada + form por tipo + banner cartao', () => {
    const src = lerSvelte();
    expect(src).toContain('Perfis de apps');
    expect(src).toContain('Novo perfil');
    expect(src).toContain('BANNER_CARTAO');
    expect(src).toContain('CAMPOS_APP');
    expect(src).toContain('ROTULO_TIPO');
    expect(src).toContain('formTipo');
    expect(src).toContain('formId');
    expect(src).toContain('Salvar perfil');
    expect(src).toContain('Excluir');
    expect(src).toContain('definido');
  });

  it('usa icone() para apps, history, close, gear, trash, spark', () => {
    const src = lerSvelte();
    expect(src).toContain("icone('apps')");
    expect(src).toContain("icone('history')");
    expect(src).toContain("icone('close')");
    expect(src).toContain("icone('gear')");
    expect(src).toContain("icone('trash')");
  });

  it('mantém contratos: widgets com fonte.rota e acao.campos', () => {
    const src = lerSvelte();
    expect(src).toContain('fonte?.rota');
    expect(src).toContain('acao?.campos');
    expect(src).toContain('rotulo_campo');
    expect(src).toContain('campo_valor');
  });

  it('store exporta helpers e constantes', () => {
    const src = lerStore();
    expect(src).toContain('APP_PERFIL_NOME_REGEX');
    expect(src).toContain('CAMPOS_APP');
    expect(src).toContain('ROTULO_TIPO');
    expect(src).toContain('TIPOS');
    expect(src).toContain('BANNER_CARTAO');
    expect(src).toContain('carregarApps');
    expect(src).toContain('carregarPerfis');
    expect(src).toContain('salvarPerfil');
    expect(src).toContain('excluirPerfil');
    expect(src).toContain('filtrarPerfis');
    expect(src).toContain('agruparPerfis');
  });
});

describe('apps store — helpers puros', () => {
  it('APP_PERFIL_NOME_REGEX valida app:<tipo>:<id>', () => {
    expect(APP_PERFIL_NOME_REGEX.test('app:vps:servidor-1')).toBe(true);
    expect(APP_PERFIL_NOME_REGEX.test('app:wordpress:meu-site')).toBe(true);
    expect(APP_PERFIL_NOME_REGEX.test('app:mercadopago:loja-1')).toBe(true);
    expect(APP_PERFIL_NOME_REGEX.test('app:cartao:visa-4242')).toBe(true);
    expect(APP_PERFIL_NOME_REGEX.test('app:custom:meu-custom')).toBe(true);
    expect(APP_PERFIL_NOME_REGEX.test('app:vps:BAD_ID')).toBe(false);
    expect(APP_PERFIL_NOME_REGEX.test('app:invalid:foo')).toBe(false);
    expect(APP_PERFIL_NOME_REGEX.test('minha_api_key')).toBe(false);
  });

  it('TIPOS contém 5 tipos', () => {
    expect(TIPOS.sort()).toEqual(['cartao', 'custom', 'mercadopago', 'vps', 'wordpress'].sort());
  });

  it('CAMPOS_APP tem campos obrigatórios por tipo', () => {
    expect(CAMPOS_APP.vps!.some((c) => c.nome === 'host' && c.obrigatorio)).toBe(true);
    expect(CAMPOS_APP.wordpress!.some((c) => c.nome === 'senha_app' && c.obrigatorio)).toBe(true);
    expect(CAMPOS_APP.mercadopago!.some((c) => c.nome === 'ambiente' && c.opcoes?.includes('prod'))).toBe(true);
    expect(CAMPOS_APP.cartao!.some((c) => c.nome === 'ultimos4')).toBe(true);
    expect(CAMPOS_APP.custom!.some((c) => c.nome === 'conteudo' && c.textarea)).toBe(true);
  });

  it('ROTULO_TIPO mapeia tipos para rótulo humano', () => {
    expect(ROTULO_TIPO.vps).toContain('VPS');
    expect(ROTULO_TIPO.wordpress).toContain('WordPress');
    expect(ROTULO_TIPO.mercadopago).toContain('MercadoPago');
    expect(ROTULO_TIPO.cartao).toContain('Cartão');
    expect(ROTULO_TIPO.custom).toContain('Custom');
  });

  it('BANNER_CARTAO menciona recurso NÃO testado', () => {
    expect(BANNER_CARTAO).toContain('NÃO testado');
    expect(BANNER_CARTAO).toContain('nunca número completo');
  });

  it('validarIdPerfil aceita [a-z0-9][a-z0-9-]{0,40}', () => {
    expect(validarIdPerfil('servidor-1')).toBe(true);
    expect(validarIdPerfil('a')).toBe(true);
    expect(validarIdPerfil('abc123-def')).toBe(true);
    expect(validarIdPerfil('BAD_ID')).toBe(false);
    expect(validarIdPerfil('')).toBe(false);
    expect(validarIdPerfil('-invalido')).toBe(false);
    expect(validarIdPerfil('a'.repeat(42))).toBe(false);
    expect(validarIdPerfil('a'.repeat(41))).toBe(true);
  });

  it('tipoDeNomeApp extrai tipo ou null', () => {
    expect(tipoDeNomeApp('app:vps:servidor-1')).toBe('vps');
    expect(tipoDeNomeApp('app:wordpress:site-1')).toBe('wordpress');
    expect(tipoDeNomeApp('minha_api_key')).toBeNull();
    expect(tipoDeNomeApp('app:invalid:foo')).toBeNull();
  });

  it('filtrarPerfis mantém apenas perfis válidos ordenados', () => {
    const secrets: any[] = [
      { nome: 'app:vps:b', definido: true },
      { nome: 'minha_api_key', definido: true },
      { nome: 'app:wordpress:a', definido: true },
      { nome: 'app:invalid:x', definido: true },
      { nome: 'app:vps:a', definido: true },
    ];
    const filtrados = filtrarPerfis(secrets as any);
    expect(filtrados.map((p) => p.nome)).toEqual(['app:vps:a', 'app:vps:b', 'app:wordpress:a']);
  });

  it('agruparPerfis agrupa por tipo', () => {
    const perfis = [
      { nome: 'app:vps:a', tipo: 'vps', id: 'a' },
      { nome: 'app:vps:b', tipo: 'vps', id: 'b' },
      { nome: 'app:wordpress:x', tipo: 'wordpress', id: 'x' },
    ];
    const grupos = agruparPerfis(perfis);
    expect(grupos.get('vps')!.length).toBe(2);
    expect(grupos.get('wordpress')!.length).toBe(1);
  });

  it('ordenarPerfis ordena por tipo+id', () => {
    const perfis = [
      { nome: 'app:wordpress:z', tipo: 'wordpress', id: 'z' },
      { nome: 'app:vps:a', tipo: 'vps', id: 'a' },
      { nome: 'app:cartao:b', tipo: 'cartao', id: 'b' },
    ];
    const ord = ordenarPerfis(perfis);
    expect(ord.map((p) => p.tipo)).toEqual(['cartao', 'vps', 'wordpress']);
  });

  it('validarPerfilCampos detecta erros', () => {
    expect(validarPerfilCampos('vps', 'BAD_ID', { rotulo: 'R', host: 'h', usuario: 'u' })).toMatch(/ID inválido/);
    expect(validarPerfilCampos('vps', 'ok-id', { rotulo: '', host: 'h', usuario: 'u' })).toMatch(/Campo obrigatório/);
    expect(validarPerfilCampos('vps', 'ok-id', { rotulo: 'R', host: 'h', usuario: 'u', porta: '99999' })).toMatch(/Porta inválida/);
    expect(validarPerfilCampos('cartao', 'ok-id', { rotulo: 'R', bandeira: 'visa', ultimos4: '42', validade: '12/30' })).toMatch(/Últimos 4/);
    expect(validarPerfilCampos('vps', 'ok-id', { rotulo: 'R', host: 'h', usuario: 'u' })).toBeNull();
    expect(validarPerfilCampos('cartao', 'ok-id', { rotulo: 'R', bandeira: 'visa', ultimos4: '4242', validade: '12/30' })).toBeNull();
  });

  it('montarPayloadPerfil converte porta para número', () => {
    const dados = montarPayloadPerfil('vps', { rotulo: 'R', host: 'h', usuario: 'u', porta: '22', notas: '' });
    expect(dados.porta).toBe(22);
    expect(typeof dados.porta).toBe('number');
    const semPorta = montarPayloadPerfil('vps', { rotulo: 'R', host: 'h', usuario: 'u', porta: '' });
    expect(semPorta.porta).toBeUndefined();
  });

  it('contarMetrica conta array ou objeto', () => {
    expect(contarMetrica([1, 2, 3])).toBe(3);
    expect(contarMetrica({ a: 1, b: 2 })).toBe(2);
    expect(contarMetrica(null)).toBe(0);
    expect(contarMetrica(undefined)).toBe(0);
  });

  it('contagemGrafico agrupa por campo_valor', () => {
    const linhas = [{ status: 'ok' }, { status: 'erro' }, { status: 'ok' }] as any[];
    expect(contagemGrafico(linhas, 'status')).toEqual({ ok: 2, erro: 1 });
    expect(contagemGrafico([], 'status')).toEqual({});
  });

  it('agruparKanban agrupa por coluna', () => {
    const linhas = [
      { coluna: 'backlog', titulo: 'A' },
      { coluna: 'feito', titulo: 'B' },
      { titulo: 'C' },
    ] as any[];
    const grupos = agruparKanban(linhas);
    expect(grupos.backlog!.length).toBe(2); // 'backlog' + fallback
    expect(grupos.feito!.length).toBe(1);
  });

  it('badgeTipoApp mapeia tipo → classe', () => {
    expect(badgeTipoApp('vps')).toBe('badge-info');
    expect(badgeTipoApp('wordpress')).toBe('badge-success');
    expect(badgeTipoApp('mercadopago')).toBe('badge-warning');
    expect(badgeTipoApp('cartao')).toBe('badge-error');
    expect(badgeTipoApp('custom')).toBe('badge-neutral');
    expect(badgeTipoApp('outro')).toBe('badge-neutral');
  });

  it('stores são writable', async () => {
    const { get } = await import('svelte/store');
    appsStore.set([{ id: 'a', titulo: 'A', widgets: 1 }]);
    expect(get(appsStore)).toHaveLength(1);
    appsStore.set([]);
    expect(get(appsStore)).toEqual([]);
    carregandoStore.set(true);
    expect(get(carregandoStore)).toBe(true);
    carregandoStore.set(false);
    erroStore.set('erro teste');
    expect(get(erroStore)).toBe('erro teste');
    erroStore.set(null);
    perfisStore.set([{ nome: 'app:vps:a', definido: true }]);
    expect(get(perfisStore)).toHaveLength(1);
    perfisStore.set([]);
  });
});

describe('apps store — carregarApps integra api', () => {
  beforeEach(() => {
    appsStore.set([]);
    erroStore.set(null);
    carregandoStore.set(false);
    perfisStore.set([]);
  });

  it('carregarApps chama api("/apps")', async () => {
    const origFetch = globalThis.fetch;
    const mockApps = [{ id: 'painel', titulo: 'Painel', widgets: 3 }];
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/apps')) {
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => mockApps } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) } as any);
    }) as any;
    const lista = await carregarApps();
    expect(lista.length).toBe(1);
    expect(lista[0].id).toBe('painel');
    globalThis.fetch = origFetch;
  });

  it('carregarPerfis chama api("/secrets")', async () => {
    const origFetch = globalThis.fetch;
    const mockSecrets = [{ nome: 'app:vps:a', definido: true, tipo_app: 'vps' }];
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/secrets')) {
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => mockSecrets } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => [] } as any);
    }) as any;
    const lista = await carregarPerfis();
    expect(lista.length).toBe(1);
    expect(lista[0].nome).toBe('app:vps:a');
    globalThis.fetch = origFetch;
  });

  it('store helper expõe funções e constantes', () => {
    const src = lerStore();
    expect(src).toContain('carregarApps');
    expect(src).toContain('carregarAppSpec');
    expect(src).toContain('carregarPerfis');
    expect(src).toContain('salvarPerfil');
    expect(src).toContain('excluirPerfil');
    expect(src).toContain('buscarDadosWidget');
    expect(src).toContain('enviarFormWidget');
    expect(src).toContain('APP_PERFIL_NOME_REGEX');
    expect(src).toContain('BANNER_CARTAO');
  });
});
