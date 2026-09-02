/**
 * Teste para a migração Agenda → Svelte 5
 * Verifica estrutura do componente, integração com stores/api e helpers puros.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  prepararValorParaApi,
  valorParaInput,
  parseArgsString,
  badgeTipoAgenda,
  validarAgendaForm,
  TIPOS_AGENDA,
  agendaJobsStore,
  agendaCarregandoStore,
  agendaErroStore,
  agendaEscopoStore,
  carregarAgenda,
} from '../src/web/stores/agenda.svelte.js';

const RAIZ = join(dirname(new URL(import.meta.url).pathname), '..');
const SVELTE_PATH = join(RAIZ, 'src/web/views/Agenda.svelte');
const STORE_PATH = join(RAIZ, 'src/web/stores/agenda.svelte.ts');

function lerSvelte(): string {
  return readFileSync(SVELTE_PATH, 'utf8');
}
function lerStore(): string {
  return readFileSync(STORE_PATH, 'utf8');
}

describe('Agenda.svelte — arquivo existe e usa Svelte 5 runes + stores/api', () => {
  it('arquivos existem', () => {
    expect(existsSync(SVELTE_PATH), 'src/web/views/Agenda.svelte deve existir').toBe(true);
    expect(existsSync(STORE_PATH), 'src/web/stores/agenda.svelte.ts deve existir').toBe(true);
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
  });

  it('usa stores (wsAtivo + agenda stores)', () => {
    const src = lerSvelte();
    expect(src).toContain('wsAtivo');
    expect(src).toContain("from '../stores/");
    expect(src).toContain('agendaJobsStore');
    expect(src).toContain('agendaEscopoStore');
    expect(src).toContain('carregarAgenda');
  });

  it('mantém Tailwind/DaisyUI classes', () => {
    const src = lerSvelte();
    expect(src).toContain('btn');
    expect(src).toContain('card');
    expect(src).toContain('badge');
    expect(src).toContain('page-header');
  });

  it('renderiza header Agenda + escopo ws/todas + ajuda', () => {
    const src = lerSvelte();
    expect(src).toContain('Agenda');
    expect(src).toContain('agenda-escopo-ws');
    expect(src).toContain('agenda-escopo-todas');
    expect(src).toContain("ajuda('agenda')");
    expect(src).toContain("ajuda('scheduler')");
  });

  it('renderiza status do scheduler (opencorp scheduler start)', () => {
    const src = lerSvelte();
    expect(src).toContain('scheduler');
    expect(src).toContain('opencorp scheduler start');
    expect(src).toContain('agenda-status');
  });

  it('implementa lista com 3 estados: carregando / erro / vazio', () => {
    const src = lerSvelte();
    expect(src).toContain('Carregando…');
    expect(src).toContain('Algo deu errado');
    expect(src).toContain('Nenhuma rotina');
    expect(src).toContain('agenda-lista');
    expect(src).toContain('Tentar novamente');
  });

  it('lista jobs: badge tipo, ativo/pausado, formatarAgenda, proxima/ultima, nunca rodou', () => {
    const src = lerSvelte();
    expect(src).toContain('badge');
    expect(src).toContain('formatarAgenda');
    expect(src).toContain('formatarDataLocal');
    expect(src).toContain('badgeTipo');
    expect(src).toContain('proxima_exec');
    expect(src).toContain('ultima_exec');
    expect(src).toContain('nunca rodou');
  });

  it('ações CRUD completas na lista', () => {
    const src = lerSvelte();
    expect(src).toContain('Agora');
    expect(src).toContain('Editar');
    expect(src).toContain('Pausar');
    expect(src).toContain('Retomar');
    expect(src).toContain('Excluir');
    expect(src).toContain('handleExecutarAgora');
    expect(src).toContain('handleEditar');
    expect(src).toContain('handleToggleAtivo');
    expect(src).toContain('handleExcluir');
    expect(src).toContain('modalConfirm');
  });

  it('form de criação/edição com tipo dinâmico (intervalo_min/cron/data_unica)', () => {
    const src = lerSvelte();
    expect(src).toContain('Nova rotina');
    expect(src).toContain('Editar rotina');
    expect(src).toContain('intervalo_min');
    expect(src).toContain('cron');
    expect(src).toContain('data_unica');
    expect(src).toContain('agenda-nome');
    expect(src).toContain('agenda-valor');
    expect(src).toContain('agenda-args');
    expect(src).toContain('agenda-edit-nome');
    expect(src).toContain('datetime-local');
    expect(src).toContain('Criar');
    expect(src).toContain('Salvar');
    expect(src).toContain('Cancelar');
  });

  it('usa icone() para Agenda e ações', () => {
    const src = lerSvelte();
    expect(src).toContain("icone('agenda')");
    expect(src).toContain("icone('run')");
    expect(src).toContain("icone('gear')");
    expect(src).toContain("icone('trash')");
  });

  it('mantém escopo store e troca via trocarEscopo', () => {
    const src = lerSvelte();
    expect(src).toContain('trocarEscopo');
    expect(src).toContain('agendaEscopoStore');
  });
});

describe('agenda store — helpers puros', () => {
  it('TIPOS_AGENDA tem 3 tipos', () => {
    expect([...TIPOS_AGENDA]).toEqual(['intervalo_min', 'cron', 'data_unica']);
  });

  it('badgeTipoAgenda mapeia tipo → classe', () => {
    expect(badgeTipoAgenda('cron')).toBe('badge-pipeline');
    expect(badgeTipoAgenda('intervalo_min')).toBe('badge-review');
    expect(badgeTipoAgenda('data_unica')).toBe('badge-warn');
    expect(badgeTipoAgenda('outro')).toBe('badge-neutral');
    expect(badgeTipoAgenda('')).toBe('badge-neutral');
  });

  it('parseArgsString separa por espaços', () => {
    expect(parseArgsString('task create --titulo "x"')).toEqual(['task', 'create', '--titulo', '"x"']);
    expect(parseArgsString('  a  b   c  ')).toEqual(['a', 'b', 'c']);
    expect(parseArgsString('')).toEqual([]);
    expect(parseArgsString('   ')).toEqual([]);
  });

  it('prepararValorParaApi converte por tipo', () => {
    expect(prepararValorParaApi('intervalo_min', '30')).toBe('30');
    expect(prepararValorParaApi('intervalo_min', ' 30 ')).toBe('30');
    expect(prepararValorParaApi('cron', '*/5 * * * *')).toBe('*/5 * * * *');
    const iso = prepararValorParaApi('data_unica', '2026-09-02T10:00');
    expect(new Date(iso).toISOString()).toBe(iso);
    expect(iso).toContain('T');
  });

  it('valorParaInput converte data_unica ISO → datetime-local', () => {
    const iso = '2026-09-02T15:30:00.000Z';
    const local = valorParaInput('data_unica', iso);
    // formato YYYY-MM-DDTHH:mm (local)
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(valorParaInput('cron', '*/5 * * * *')).toBe('*/5 * * * *');
    expect(valorParaInput('intervalo_min', '30')).toBe('30');
    expect(valorParaInput('intervalo_min', 30 as any)).toBe('30');
    expect(valorParaInput('data_unica', '')).toBe('');
  });

  it('validarAgendaForm retorna null quando válido', () => {
    expect(validarAgendaForm('nome', '30', 'task run')).toBeNull();
    expect(validarAgendaForm('  ', '30', 'task')).toMatch(/Nome/);
    expect(validarAgendaForm('nome', '', 'task')).toMatch(/Valor/);
    expect(validarAgendaForm('nome', '30', '')).toMatch(/Comando/);
    expect(validarAgendaForm('nome', '   ', 'task')).toMatch(/Valor/);
  });

  it('stores são writable e escopo default é ws', async () => {
    const { get } = await import('svelte/store');
    // reset para ws
    agendaEscopoStore.set('ws');
    expect(get(agendaEscopoStore)).toBe('ws');
    agendaJobsStore.set([]);
    expect(get(agendaJobsStore)).toEqual([]);
    agendaCarregandoStore.set(false);
    expect(get(agendaCarregandoStore)).toBe(false);
    agendaErroStore.set(null);
    expect(get(agendaErroStore)).toBeNull();
  });
});

describe('agenda store — carregarAgenda integra api', () => {
  beforeEach(() => {
    agendaJobsStore.set([]);
    agendaErroStore.set(null);
    agendaCarregandoStore.set(false);
    agendaEscopoStore.set('ws');
  });

  it('carregarAgenda ws chama q("/schedules")', async () => {
    const origFetch = globalThis.fetch;
    const mockJobs = [{ id: '1', nome: 'a', agenda: { tipo: 'intervalo_min', valor: '30' }, args: ['x'], workspace: 'w', ativo: true }];
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/schedules')) {
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => mockJobs } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) } as any);
    }) as any;
    const jobs = await carregarAgenda('ws');
    expect(jobs.length).toBe(1);
    expect(jobs[0].id).toBe('1');
    globalThis.fetch = origFetch;
  });

  it('carregarAgenda todas chama api("/schedules?all=1")', async () => {
    const origFetch = globalThis.fetch;
    let lastUrl = '';
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      lastUrl = String(url);
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => [] } as any);
    }) as any;
    await carregarAgenda('todas');
    expect(lastUrl).toContain('all=1');
    globalThis.fetch = origFetch;
  });

  it('store helper prepararValorParaApi usado no fluxo de criar', () => {
    const src = lerStore();
    expect(src).toContain('prepararValorParaApi');
    expect(src).toContain('carregarAgenda');
    expect(src).toContain('criarAgendaStore');
    expect(src).toContain('atualizarAgendaStore');
    expect(src).toContain('toggleAgendaAtivoStore');
    expect(src).toContain('executarAgendaAgoraStore');
    expect(src).toContain('excluirAgendaStore');
    expect(src).toContain('buscarAgendaPorId');
  });
});
