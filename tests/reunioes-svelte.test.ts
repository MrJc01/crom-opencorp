/**
 * Teste para a migração Reuniões → Svelte 5
 * Verifica estrutura do componente, stores/api e helpers puros (polling 2s).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock mínimo de DOM para toast/api (sem jsdom)
if (typeof (globalThis as unknown as Record<string, unknown>).document === 'undefined') {
  const fakeContainer: any = { appendChild: () => {}, style: {} as Record<string,string>, innerHTML: '', textContent: '' };
  (globalThis as unknown as Record<string, unknown>).document = {
    getElementById: (id: string) => (id === 'toast-container' ? fakeContainer : null),
    createElement: (tag: string) => ({ style: {} as Record<string,string>, appendChild: () => {}, innerHTML: '', textContent: '', setAttribute: () => {}, classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false }, addEventListener: () => {} } as unknown as HTMLElement),
    head: { appendChild: () => {} } as unknown as HTMLElement,
    body: { appendChild: () => {}, removeChild: () => {} } as unknown as HTMLElement,
    addEventListener: () => {},
  };
}
if (typeof (globalThis as unknown as Record<string, unknown>).localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as unknown as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  } as unknown as Storage;
}
if (typeof (globalThis as unknown as Record<string, unknown>).window === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).window = globalThis as unknown as Window;
}
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  badgeStatusReuniao,
  badgeStatusSala,
  badgeRotinaReuniao,
  isVivaStatus,
  filtrarRotinasReuniao,
  construirNomeRotina,
  construirArgsReuniao,
  prepararAgendaReuniao,
  validarPauta,
  validarAgendaReuniaoForm,
  consensoTexto,
  intervaloPollingMs,
  reunioesStore,
  reunioesCarregandoStore,
  reunioesErroStore,
  salaStore,
  salaAbertaIdStore,
  rotinasReuniaoStore,
  agentesReuniaoStore,
  carregarReunioes,
  criarReuniaoStore,
  encerrarReuniaoStore,
  carregarRotinasReuniao,
  excluirRotinaReuniaoStore,
  criarAgendaReuniaoStore,
  carregarAgentesReuniao,
  isSalaAoVivoAberta,
  pararPollingSala,
  fecharSalaVivaStore,
  abrirSalaVivaStore,
  fetchSala,
} from '../src/web/stores/reunioes.svelte.js';

const RAIZ = join(dirname(new URL(import.meta.url).pathname), '..');
const SVELTE_PATH = join(RAIZ, 'src/web/views/Reunioes.svelte');
const STORE_PATH = join(RAIZ, 'src/web/stores/reunioes.svelte.ts');

function lerSvelte(): string {
  return readFileSync(SVELTE_PATH, 'utf8');
}
function lerStore(): string {
  return readFileSync(STORE_PATH, 'utf8');
}

describe('Reunioes.svelte — arquivo existe e usa Svelte 5 runes + stores/api', () => {
  it('arquivos existem', () => {
    expect(existsSync(SVELTE_PATH), 'src/web/views/Reunioes.svelte deve existir').toBe(true);
    expect(existsSync(STORE_PATH), 'src/web/stores/reunioes.svelte.ts deve existir').toBe(true);
  });

  it('usa Svelte 5 runes', () => {
    const src = lerSvelte();
    expect(src).toContain('$state');
    expect(src).toContain('$derived');
    expect(src).toContain('onMount');
    expect(src).toContain('onDestroy');
  });

  it('importa api via src/web/api.ts', () => {
    const src = lerSvelte();
    expect(src).toContain("from '../api.js'");
    expect(src).toMatch(/api\s*[\(<]/);
    expect(src).toContain('toast');
  });

  it('usa stores (wsAtivo + reunioes stores)', () => {
    const src = lerSvelte();
    expect(src).toContain('wsAtivo');
    expect(src).toContain("from '../stores/");
    expect(src).toContain('reunioesStore');
    expect(src).toContain('carregarReunioes');
    expect(src).toContain('rotinasReuniaoStore');
    expect(src).toContain('salaStore');
  });

  it('mantém Tailwind/DaisyUI classes', () => {
    const src = lerSvelte();
    expect(src).toContain('btn');
    expect(src).toContain('badge');
    expect(src).toContain('card');
    expect(src).toContain('page-header');
    expect(src).toContain('space-y-4');
    expect(src).toContain('flex');
    expect(src).toContain('grid');
  });

  it('renderiza header Reuniões + ajuda + icone', () => {
    const src = lerSvelte();
    expect(src).toContain('Reuniões');
    expect(src).toContain("icone('reunioes')");
    expect(src).toContain("ajuda('reunioes')");
  });

  it('renderiza form convocar: pauta + seletor agentes + Convocar', () => {
    const src = lerSvelte();
    expect(src).toContain('Convocar reunião');
    expect(src).toContain('reuniao-pauta');
    expect(src).toContain('reuniao-seletor-agentes');
    expect(src).toContain('reunioes-form');
    expect(src).toContain('form-nova-reuniao');
    expect(src).toContain('Convocar');
    expect(src).toContain('Participantes');
  });

  it('renderiza lista com 3 estados: carregando / erro / vazio', () => {
    const src = lerSvelte();
    expect(src).toContain('Carregando…');
    expect(src).toContain('Algo deu errado');
    expect(src).toContain('Nenhuma reunião');
    expect(src).toContain('reunioes-lista');
    expect(src).toContain('Tentar novamente');
    expect(src).toContain('estado-loading');
    expect(src).toContain('estado-erro');
  });

  it('lista reuniões: badge status, participantes, datas, ata, Sala ao vivo e Encerrar', () => {
    const src = lerSvelte();
    expect(src).toContain('badge');
    expect(src).toContain('badgeStatusReuniao');
    expect(src).toContain('Participantes');
    expect(src).toContain('criado_em');
    expect(src).toContain('encerrada_em');
    expect(src).toContain('ver ata');
    expect(src).toContain('Sala ao vivo');
    expect(src).toContain('Encerrar');
    expect(src).toContain("icone('chat')");
    expect(src).toContain("icone('stop')");
  });

  it('implementa sala ao vivo com polling 2s (GET /meetings/:id)', () => {
    const src = lerSvelte();
    expect(src).toContain('reuniao-sala');
    expect(src).toContain('Sala ao vivo');
    expect(src).toContain('reuniao-sala-feed');
    expect(src).toContain('polling');
    expect(src).toContain('2s');
    expect(src).toContain('pollSala');
    expect(src).toContain('abrirSalaVivaStore');
    expect(src).toContain('fecharSalaVivaStore');
    expect(src).toContain('pararPollingSala');
    expect(src).toContain('turno');
    expect(src).toContain('consenso');
    expect(src).toContain('Fechar painel');
    expect(src).toContain('mensagens');
  });

  it('implementa agendamento: Agendar reunião automática + frequência + rotinas', () => {
    const src = lerSvelte();
    expect(src).toContain('Agendar reunião automática');
    expect(src).toContain('reuniao-agenda-form');
    expect(src).toContain('reuniao-agenda-lista');
    expect(src).toContain('reuniao-ag-pauta');
    expect(src).toContain('reuniao-ag-freq');
    expect(src).toContain('diario');
    expect(src).toContain('semanal');
    expect(src).toContain('intervalo');
    expect(src).toContain('reuniao-ag-hora');
    expect(src).toContain('reuniao-ag-valor');
    expect(src).toContain('meeting iniciar');
    expect(src).toContain('handleCriarAgenda');
    expect(src).toContain('Rotinas de reunião');
    expect(src).toContain('Excluir');
    expect(src).toContain("icone('agenda')");
    expect(src).toContain("icone('trash')");
  });

  it('ações CRUD completas via api endpoints', () => {
    const srcSvelte = lerSvelte();
    const srcStore = lerStore();
    expect(srcSvelte).toContain('handleCriarReuniao');
    expect(srcSvelte).toContain('handleEncerrar');
    expect(srcSvelte).toContain('handleExcluirRotina');
    expect(srcStore).toContain("'/meetings'");
    expect(srcStore).toContain("'/meetings/'");
    expect(srcStore).toContain('/stop');
    expect(srcStore).toContain("'/schedules'");
    expect(srcStore).toContain("'/agents'");
    expect(srcStore).toContain('modalConfirm');
  });

  it('usa icone e formatação preservados', () => {
    const src = lerSvelte();
    expect(src).toContain('icone(');
    expect(src).toContain('formatarAgenda');
    expect(src).toContain('formatarDataLocal');
  });

  it('store exporta helpers e polling 2s', () => {
    const src = lerStore();
    expect(src).toContain('badgeStatusReuniao');
    expect(src).toContain('filtrarRotinasReuniao');
    expect(src).toContain('construirNomeRotina');
    expect(src).toContain('construirArgsReuniao');
    expect(src).toContain('prepararAgendaReuniao');
    expect(src).toContain('isSalaAoVivoAberta');
    expect(src).toContain('pararPollingSala');
    expect(src).toContain('intervaloPollingMs');
    expect(src).toContain('2000');
  });
});

describe('reunioes store — helpers puros', () => {
  it('badgeStatusReuniao mapeia status → classe', () => {
    expect(badgeStatusReuniao('em-andamento')).toBe('badge-warn');
    expect(badgeStatusReuniao('em_andamento')).toBe('badge-warn');
    expect(badgeStatusReuniao('agendando')).toBe('badge-warn');
    expect(badgeStatusReuniao('encerrada')).toBe('badge-neutral');
    expect(badgeStatusReuniao('desconhecido')).toBe('badge-neutral');
    expect(badgeStatusReuniao('')).toBe('badge-neutral');
    expect(badgeStatusReuniao(undefined as any)).toBe('badge-neutral');
  });

  it('badgeStatusSala mapeia', () => {
    expect(badgeStatusSala('em_andamento')).toBe('badge-warn');
    expect(badgeStatusSala('agendando')).toBe('badge-warn');
    expect(badgeStatusSala('encerrada')).toBe('badge-neutral');
  });

  it('badgeRotinaReuniao mapeia tipo → classe', () => {
    expect(badgeRotinaReuniao('cron')).toBe('badge-pipeline');
    expect(badgeRotinaReuniao('intervalo_min')).toBe('badge-review');
    expect(badgeRotinaReuniao('outro')).toBe('badge-warn');
  });

  it('isVivaStatus detecta salas vivas', () => {
    expect(isVivaStatus('em_andamento')).toBe(true);
    expect(isVivaStatus('agendando')).toBe(true);
    expect(isVivaStatus('em-andamento')).toBe(true);
    expect(isVivaStatus('encerrada')).toBe(false);
    expect(isVivaStatus('')).toBe(false);
  });

  it('filtrarRotinasReuniao filtra só meeting', () => {
    const jobs: any[] = [
      { id: '1', args: ['meeting', 'iniciar'] },
      { id: '2', args: ['task', 'create'] },
      { id: '3', args: ['meeting', 'iniciar', '--pauta', 'x'] },
      { id: '4', args: [] },
      { id: '5', args: null },
    ];
    expect(filtrarRotinasReuniao(jobs).map((j) => j.id)).toEqual(['1', '3']);
    expect(filtrarRotinasReuniao([])).toEqual([]);
  });

  it('construirNomeRotina gera slug + sufixo', () => {
    expect(construirNomeRotina('revisão semanal de custos', 'abcd')).toBe('reuniao-revis-o-semanal-de-custos-abcd');
    // ascii fallback: pauta com espaços e pontuação
    expect(construirNomeRotina('Hello World!', 'zz')).toBe('reuniao-hello-world-zz');
    expect(construirNomeRotina('', 'xx')).toBe('reuniao-auto-xx');
    expect(construirNomeRotina('   ', 'yy')).toBe('reuniao-auto-yy');
    // truncagem 30 chars
    const longa = 'a'.repeat(50);
    const nome = construirNomeRotina(longa, 'qq');
    expect(nome.slice(0, 8)).toBe('reuniao-');
    expect(nome.endsWith('-qq')).toBe(true);
    expect(nome.length).toBeLessThan(50);
  });

  it('construirArgsReuniao monta args meeting headless', () => {
    expect(construirArgsReuniao('pauta x', [])).toEqual(['meeting', 'iniciar', '--pauta', 'pauta x', '--nao-interativo']);
    expect(construirArgsReuniao('pauta y', ['ag-a', 'ag-b'])).toEqual(['meeting', 'iniciar', '--pauta', 'pauta y', '--nao-interativo', '--agentes', 'ag-a,ag-b']);
    expect(construirArgsReuniao('pauta', ['unico'])).toEqual(['meeting', 'iniciar', '--pauta', 'pauta', '--nao-interativo', '--agentes', 'unico']);
  });

  it('prepararAgendaReuniao converte freq → agenda_tipo/valor', () => {
    expect(prepararAgendaReuniao('intervalo', '09:00', '30')).toEqual({ agenda_tipo: 'intervalo_min', agenda_valor: '30' });
    expect(prepararAgendaReuniao('intervalo', '09:00', '  120  ')).toEqual({ agenda_tipo: 'intervalo_min', agenda_valor: '120' });
    const di = prepararAgendaReuniao('diario', '09:00', '') as any;
    expect(di.agenda_tipo).toBe('cron');
    expect(di.agenda_valor).toBe('0 9 * * *');
    const sem = prepararAgendaReuniao('semanal', '14:30', '') as any;
    expect(sem.agenda_valor).toBe('30 14 * * 1');
    expect((prepararAgendaReuniao('intervalo', '09:00', '0') as any).erro).toMatch(/≥ 1/);
    expect((prepararAgendaReuniao('intervalo', '09:00', '') as any).erro).toMatch(/≥ 1/);
    expect((prepararAgendaReuniao('diario', '', '') as any).erro).toMatch(/hora/);
  });

  it('validarPauta exige não vazia', () => {
    expect(validarPauta('')).toMatch(/obrigatória/);
    expect(validarPauta('   ')).toMatch(/obrigatória/);
    expect(validarPauta('pauta ok')).toBeNull();
  });

  it('validarAgendaReuniaoForm valida pauta + freq + hora/valor', () => {
    expect(validarAgendaReuniaoForm('', 'diario', '09:00', '')).toMatch(/Pauta/);
    expect(validarAgendaReuniaoForm('pauta', '', '09:00', '')).toMatch(/Frequência/);
    expect(validarAgendaReuniaoForm('pauta', 'diario', 'bad', '')).toMatch(/hora/);
    expect(validarAgendaReuniaoForm('pauta', 'intervalo', '09:00', '0')).toMatch(/≥ 1/);
    expect(validarAgendaReuniaoForm('pauta', 'diario', '09:00', '')).toBeNull();
    expect(validarAgendaReuniaoForm('pauta', 'intervalo', '09:00', '30')).toBeNull();
  });

  it('consensoTexto formata', () => {
    expect(consensoTexto({ pedidos: 1, total: 2 })).toBe('1/2 pediram encerrar');
    expect(consensoTexto({ pedidos: 2, total: 2 })).toBe('2/2 pediram encerrar');
    expect(consensoTexto({ pedidos: 0, total: 0 })).toBe('');
  });

  it('intervaloPollingMs retorna 2000', () => {
    expect(intervaloPollingMs()).toBe(2000);
  });

  it('stores são writable e default', async () => {
    const { get } = await import('svelte/store');
    reunioesStore.set([]);
    expect(get(reunioesStore)).toEqual([]);
    reunioesCarregandoStore.set(false);
    expect(get(reunioesCarregandoStore)).toBe(false);
    reunioesErroStore.set(null);
    expect(get(reunioesErroStore)).toBeNull();
    salaStore.set(null);
    expect(get(salaStore)).toBeNull();
    salaAbertaIdStore.set(null);
    expect(get(salaAbertaIdStore)).toBeNull();
    rotinasReuniaoStore.set([]);
    expect(get(rotinasReuniaoStore)).toEqual([]);
    agentesReuniaoStore.set([]);
    expect(get(agentesReuniaoStore)).toEqual([]);
  });
});

describe('reunioes store — polling helpers', () => {
  it('pararPollingSala e isSalaAoVivoAberta existem e são idempotentes', () => {
    pararPollingSala();
    expect(isSalaAoVivoAberta()).toBe(false);
    fecharSalaVivaStore();
    expect(isSalaAoVivoAberta()).toBe(false);
    // não deve throw duplicado
    pararPollingSala();
    fecharSalaVivaStore();
    expect(isSalaAoVivoAberta()).toBe(false);
  });

  it('store helpers de polling e intervalos existem no arquivo', () => {
    const src = lerStore();
    expect(src).toContain('isSalaAoVivoAberta');
    expect(src).toContain('pararPollingSala');
    expect(src).toContain('fecharSalaVivaStore');
    expect(src).toContain('abrirSalaVivaStore');
    expect(src).toContain('setInterval');
    expect(src).toContain('2000');
    expect(src).toContain('pollSalaOnce');
  });
});

describe('reunioes store — carregarReunioes integra api', () => {
  beforeEach(() => {
    reunioesStore.set([]);
    reunioesErroStore.set(null);
    reunioesCarregandoStore.set(false);
    rotinasReuniaoStore.set([]);
    salaStore.set(null);
    salaAbertaIdStore.set(null);
    fecharSalaVivaStore();
  });

  it('carregarReunioes chama api("/meetings") e popula store', async () => {
    const origFetch = globalThis.fetch;
    const mock: any[] = [{ id: 'reuniao-1', status: 'em-andamento', pauta: 'p1', participantes: ['ag-a'], criado_em: new Date().toISOString() }];
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/meetings') && !u.includes('/stop')) {
        return Promise.resolve({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => mock } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) } as any);
    }) as any;
    const lista = await carregarReunioes();
    expect(lista.length).toBe(1);
    expect(lista[0].id).toBe('reuniao-1');
    const { get } = await import('svelte/store');
    expect(get(reunioesStore).length).toBe(1);
    globalThis.fetch = origFetch;
  });

  it('carregarRotinasReuniao filtra só meeting (GET /schedules)', async () => {
    const origFetch = globalThis.fetch;
    const jobs: any[] = [
      { id: '1', nome: 'reuniao-x', agenda: { tipo: 'cron', valor: '0 9 * * *' }, args: ['meeting', 'iniciar', '--pauta', 'x'], workspace: 'ws', ativo: true },
      { id: '2', nome: 'outra', agenda: { tipo: 'intervalo_min', valor: '30' }, args: ['task', 'create'], workspace: 'ws', ativo: true },
    ];
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/schedules')) {
        return Promise.resolve({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => jobs } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) } as any);
    }) as any;
    const rotinas = await carregarRotinasReuniao();
    expect(rotinas.length).toBe(1);
    expect(rotinas[0].id).toBe('1');
    const { get } = await import('svelte/store');
    expect(get(rotinasReuniaoStore).length).toBe(1);
    globalThis.fetch = origFetch;
  });

  it('criarReuniaoStore POST /meetings com pauta e agentes', async () => {
    const origFetch = globalThis.fetch;
    let lastBody: any = null;
    let lastUrl = '';
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      lastUrl = String(url);
      if (String(url).includes('/meetings') && opts?.method === 'POST') {
        lastBody = JSON.parse(opts.body);
        return Promise.resolve({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ status: 'iniciado', id: 'reuniao-abc' }) } as any);
      }
      if (String(url).includes('/meetings')) {
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => [] } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) } as any);
    }) as any;
    const res = await criarReuniaoStore('pauta teste', ['ag-a', 'ag-b']);
    expect(res.id).toBe('reuniao-abc');
    expect(lastUrl).toContain('/meetings');
    expect(lastBody.pauta).toBe('pauta teste');
    expect(lastBody.agentes).toBe('ag-a,ag-b');
    // sem agentes → não envia campo
    lastBody = null;
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      lastUrl = String(url);
      if (String(url).includes('/meetings') && opts?.method === 'POST') {
        lastBody = JSON.parse(opts.body);
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ status: 'iniciado', id: 'reuniao-2' }) } as any);
      }
      if (String(url).includes('/meetings')) {
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => [] } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) } as any);
    }) as any;
    await criarReuniaoStore('outra pauta', []);
    expect(lastBody.pauta).toBe('outra pauta');
    expect(lastBody.agentes).toBeUndefined();
    globalThis.fetch = origFetch;
  });

  it('abrirSalaVivaStore polling 2s via GET /meetings/:id', async () => {
    const origFetch = globalThis.fetch;
    const estado: any = {
      id: 'reuniao-1',
      status: 'em_andamento',
      pauta: 'pauta x',
      participantes: [{ id: 'ag-a', ativo: true }],
      turno_atual: 1,
      mensagens: [{ agente: 'ag-a', texto: 'oi', ts: new Date().toISOString() }],
      consenso: { pedidos: 0, total: 1 },
      iniciado_em: new Date().toISOString(),
    };
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/meetings/reuniao-1')) {
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => estado } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) } as any);
    }) as any;
    await abrirSalaVivaStore('reuniao-1');
    expect(isSalaAoVivoAberta()).toBe(true);
    const { get } = await import('svelte/store');
    expect(get(salaAbertaIdStore)).toBe('reuniao-1');
    expect(get(salaStore)?.id).toBe('reuniao-1');
    // fechar limpa
    fecharSalaVivaStore();
    expect(isSalaAoVivoAberta()).toBe(false);
    expect(get(salaAbertaIdStore)).toBeNull();
    globalThis.fetch = origFetch;
    pararPollingSala();
  });

  it('carregarAgentesReuniao GET /agents', async () => {
    const origFetch = globalThis.fetch;
    const agentes: any[] = [{ id: 'ag-a', role: 'Dev' }, { id: 'ag-b' }];
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/agents')) {
        return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => agentes } as any);
      }
      return Promise.resolve({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) } as any);
    }) as any;
    const lista = await carregarAgentesReuniao();
    expect(lista.length).toBe(2);
    expect(lista[0].id).toBe('ag-a');
    globalThis.fetch = origFetch;
  });
});
