/**
 * Teste para migração Home → Svelte 5
 * Verifica estrutura do componente, integração com stores/api e helpers puros.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  hojeIso,
  contarTasksVencidas,
  filtrarAprovsPendentes,
  fluxosAtivosCount,
  corDotSaude,
  isTudoFalhou,
  feedIconMeta,
  homeStatusStore,
  homeAprovsStore,
  homeBudgetStore,
  homeTasksStore,
  homeFlowsStore,
  homeNotifStore,
  homeCarregandoStore,
  homeErroStore,
  homeFeedStore,
  adicionarFeedItemStore,
  carregarHome,
} from '../src/web/stores/home.svelte.js';

const RAIZ = join(dirname(new URL(import.meta.url).pathname), '..');
const SVELTE_PATH = join(RAIZ, 'src/web/views/Home.svelte');
const STORE_PATH = join(RAIZ, 'src/web/stores/home.svelte.ts');

function lerSvelte(): string { return readFileSync(SVELTE_PATH, 'utf8'); }
function lerStore(): string { return readFileSync(STORE_PATH, 'utf8'); }

describe('Home.svelte — arquivo existe e usa Svelte 5 runes + stores/api', () => {
  it('arquivos existem', () => {
    expect(existsSync(SVELTE_PATH), 'src/web/views/Home.svelte deve existir').toBe(true);
    expect(existsSync(STORE_PATH), 'src/web/stores/home.svelte.ts deve existir').toBe(true);
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
  it('usa stores (wsAtivo + home stores)', () => {
    const src = lerSvelte();
    expect(src).toContain('wsAtivo');
    expect(src).toContain("from '../stores/");
    expect(src).toContain('homeStatusStore');
    expect(src).toContain('homeTasksStore');
    expect(src).toContain('carregarHome');
  });
  it('mantém Tailwind/DaisyUI classes', () => {
    const src = lerSvelte();
    expect(src).toContain('btn');
    expect(src).toContain('card');
    expect(src).toContain('badge');
    expect(src).toContain('page-header');
    expect(src).toContain('kpi-grid');
    expect(src).toContain('kpi-card');
  });
  it('renderiza header Início + hub-header + workspace', () => {
    const src = lerSvelte();
    expect(src).toContain('Início');
    expect(src).toContain('home');
    expect(src).toContain('wsAtual');
    expect(src).toContain('hub-header');
    expect(src).toContain("ajuda('home')");
    expect(src).toContain('Nova task');
    expect(src).toContain('Criar empresa');
    expect(src).toContain('Run agente');
  });
  it('renderiza KPIs: vencidas, custos, saúde, fluxos, notificações', () => {
    const src = lerSvelte();
    expect(src).toContain('Tasks vencidas');
    expect(src).toContain('Custos do dia');
    expect(src).toContain('saúde desconhecida');
    expect(src).toContain('Fluxos ativos');
    expect(src).toContain('Notificações não lidas');
    expect(src).toContain('data-kpi="tasks-vencidas"');
    expect(src).toContain('data-kpi="custos"');
    expect(src).toContain('data-kpi="saude"');
    expect(src).toContain('data-kpi="fluxos"');
    expect(src).toContain('data-kpi="notificacoes"');
    expect(src).toContain('kpi-saude');
  });
  it('renderiza Ações e avisos + cards', () => {
    const src = lerSvelte();
    expect(src).toContain('Ações e avisos');
    expect(src).toContain('Ações da empresa');
    expect(src).toContain('Não vistas');
    expect(src).toContain('card-acoes');
    expect(src).toContain('card-nao-vistas');
    expect(src).toContain('home-grid');
  });
  it('renderiza Comando ao Secretário com / @ ! + palette', () => {
    const src = lerSvelte();
    expect(src).toContain('Comando ao Secretário');
    expect(src).toContain('home-comando');
    expect(src).toContain("ajuda('home-comando')");
    expect(src).toContain('parsearComposer');
    expect(src).toContain('COMANDOS_OPCORP');
    expect(src).toContain('gatilhoComposer');
    expect(src).toContain('paletteTecla');
    expect(src).toContain('fecharPalette');
    expect(src).toContain('setRascunho');
  });
  it('renderiza Sistema e atalhos', () => {
    const src = lerSvelte();
    expect(src).toContain('Sistema e atalhos');
    expect(src).toContain('Config');
    expect(src).toContain('Secrets');
    expect(src).toContain('Ferramentas');
    expect(src).toContain('Doutor');
    expect(src).toContain('opencorp doctor');
  });
  it('renderiza Aprovações e Fluxos hub', () => {
    const src = lerSvelte();
    expect(src).toContain('Aprovações');
    expect(src).toContain("ajuda('hitl')");
    expect(src).toContain('aprovs-pendentes');
    expect(src).toContain('Aprovar');
    expect(src).toContain('Rejeitar');
    expect(src).toContain('Linhas de pensamento');
    expect(src).toContain('hub-flows');
    expect(src).toContain('Rodar agora');
  });
  it('renderiza Feed ao vivo', () => {
    const src = lerSvelte();
    expect(src).toContain('Feed ao vivo');
    expect(src).toContain('feed-atividade');
    expect(src).toContain('todas as empresas');
    expect(src).toContain('Aguardando eventos');
  });
  it('implementa estados carregando / erro / vazio', () => {
    const src = lerSvelte();
    expect(src).toContain('Carregando hub');
    expect(src).toContain('Algo deu errado');
    expect(src).toContain('Selecione uma empresa');
    expect(src).toContain('Tentar novamente');
    expect(src).toContain('Nenhuma aprovação pendente');
    expect(src).toContain('Nenhum fluxo no workspace');
  });
  it('usa icone() para seções', () => {
    const src = lerSvelte();
    expect(src).toContain("icone('home')");
    expect(src).toContain("icone('plus')");
    expect(src).toContain("icone('run')");
    expect(src).toContain("icone('spark')");
  });
  it('store exporta helpers e carregarHome', () => {
    const src = lerStore();
    expect(src).toContain('hojeIso');
    expect(src).toContain('contarTasksVencidas');
    expect(src).toContain('filtrarAprovsPendentes');
    expect(src).toContain('carregarHome');
    expect(src).toContain("'/status'");
    expect(src).toContain("'/approvals'");
    expect(src).toContain("'/budget/status'");
    expect(src).toContain("'/tasks'");
    expect(src).toContain("'/flows'");
    expect(src).toContain("'/notifications'");
    expect(src).toContain('Promise.allSettled');
  });
});

describe('home store — helpers puros', () => {
  it('hojeIso retorna AAAA-MM-DD', () => {
    const iso = hojeIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    expect(iso).toBe(expected);
  });
  it('contarTasksVencidas filtra por due < hoje e coluna != feito', () => {
    const hoje = '2026-09-02';
    const tasks: any[] = [
      { id: '1', coluna: 'backlog', due: '2026-09-01' },
      { id: '2', coluna: 'fazendo', due: '2026-09-02' },
      { id: '3', coluna: 'feito', due: '2026-08-01' },
      { id: '4', coluna: 'backlog', due: null },
      { id: '5', coluna: 'bloqueado', due: '2026-08-30T10:00:00Z' },
    ];
    expect(contarTasksVencidas(tasks, hoje)).toBe(2); // 1 e 5
    expect(contarTasksVencidas([], hoje)).toBe(0);
    expect(contarTasksVencidas(null as any, hoje)).toBe(0);
  });
  it('filtrarAprovsPendentes retorna só pendentes', () => {
    expect(filtrarAprovsPendentes([
      { id: 'a', status: 'pendente' },
      { id: 'b', status: 'aprovado' },
      { id: 'c', status: 'pendente' },
    ] as any).map(a=>a.id)).toEqual(['a','c']);
    expect(filtrarAprovsPendentes(null)).toEqual([]);
    expect(filtrarAprovsPendentes([])).toEqual([]);
  });
  it('fluxosAtivosCount retorna length ou null', () => {
    expect(fluxosAtivosCount([{id:'a'},{id:'b'}] as any)).toBe(2);
    expect(fluxosAtivosCount([] as any)).toBe(0);
    expect(fluxosAtivosCount(null)).toBeNull();
  });
  it('corDotSaude mapeia boolean → cor', () => {
    expect(corDotSaude(true)).toBe('var(--ok)');
    expect(corDotSaude(false)).toBe('var(--err)');
    expect(corDotSaude(undefined)).toBe('#737373');
  });
  it('isTudoFalhou detecta tudo null', () => {
    expect(isTudoFalhou({ status:null, aprovs:null, budget:null, tasks:null, flows:null, notif:null })).toBe(true);
    expect(isTudoFalhou({ status:{}, aprovs:null, budget:null, tasks:null, flows:null, notif:null } as any)).toBe(false);
  });
  it('feedIconMeta mapeia tipo → icon', () => {
    expect(feedIconMeta('sessao_criada')).toEqual({ icon:'run', iconClass:'sessao' });
    expect(feedIconMeta('hook_disparado')).toEqual({ icon:'spark', iconClass:'hook' });
    expect(feedIconMeta('team_inicio')).toEqual({ icon:'teams', iconClass:'team' });
    expect(feedIconMeta('task_criada')).toEqual({ icon:'tasks', iconClass:'task' });
    expect(feedIconMeta('desconhecido')).toEqual({ icon:'tasks', iconClass:'task' });
  });
  it('stores são writable', async () => {
    const { get } = await import('svelte/store');
    homeStatusStore.set({ scheduler:true } as any);
    expect(get(homeStatusStore)).toEqual({ scheduler:true });
    homeStatusStore.set(null);
    homeFeedStore.set([]);
    adicionarFeedItemStore({ tipo:'task_criada', id:'1' });
    expect(get(homeFeedStore).length).toBe(1);
    homeFeedStore.set([]);
    homeCarregandoStore.set(false);
    expect(get(homeCarregandoStore)).toBe(false);
    homeErroStore.set(null);
    expect(get(homeErroStore)).toBeNull();
  });
});

describe('home store — carregarHome integra api', () => {
  beforeEach(() => {
    homeStatusStore.set(null);
    homeAprovsStore.set(null);
    homeBudgetStore.set(null);
    homeTasksStore.set(null);
    homeFlowsStore.set(null);
    homeNotifStore.set(null);
  });
  it('carregarHome retorna dados com allSettled', async () => {
    const origFetch = globalThis.fetch;
    const mock = {
      '/status': { scheduler:true, secretario:false },
      '/approvals': [{ id:'ap1', status:'pendente' }],
      '/budget/status': { estado:{ workspace_usd_hoje: 1.5 }, limites:{ daily_usd:10 } },
      '/tasks': [{ id:'t1', coluna:'backlog', due:'2026-09-01' }],
      '/flows': [{ id:'flow1' }],
      '/notifications': { resumo:{ nao_lidas:2 } },
    };
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      for (const [k,v] of Object.entries(mock)) {
        if (u.includes(k)) return Promise.resolve({ ok:true, headers:{ get:()=> 'application/json'}, json: async()=> v } as any);
      }
      return Promise.resolve({ ok:true, headers:{ get:()=> 'application/json'}, json: async()=> null } as any);
    }) as any;
    const dados = await carregarHome();
    expect(dados.status).toBeTruthy();
    expect(dados.tasks?.length).toBe(1);
    expect(dados.flows?.length).toBe(1);
    globalThis.fetch = origFetch;
  });
  it('carregarHome trata falha parcial (null)', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/status')) return Promise.resolve({ ok:false, status:500, json: async()=> ({ erro:'fail'}) } as any);
      return Promise.resolve({ ok:true, headers:{ get:()=> 'application/json'}, json: async()=> [] } as any);
    }) as any;
    const dados = await carregarHome();
    expect(dados.status).toBeNull();
    expect(dados.tasks).toEqual([]);
    globalThis.fetch = origFetch;
  });
});
