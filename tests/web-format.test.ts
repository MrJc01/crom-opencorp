/**
 * Testes para módulos puros da web (format.ts, icons.ts, state helpers).
 * Vitest roda TS nativamente — sem build prévio.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock localStorage for tests
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem(key: string) { return this.store[key] ?? null; },
  setItem(key: string, value: string) { this.store[key] = value; },
  removeItem(key: string) { delete this.store[key]; },
  clear() { this.store = {}; },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});
import { escapeHtml, formatarAgenda, badgeTipo, badgeTeamPadrao, formatarDataLocal, formatarHora, truncar, mesclarHistorico } from "../src/web/format.js";
import { ICONES, icone } from "../src/web/icons.js";
import { loadPersistedAuth, getToken, getWsAtivo, setToken, setWsAtivo, setWorkspaces, getWorkspaces, getViewAtual, setViewAtual, getTaskAberta, setTaskAberta, getAgendaEscopoAtual, setAgendaEscopoAtual, isSseConnected, setSseConnected, clearAuth, resetState, subscribe } from "../src/web/state.js";

describe("format.ts — formatters puros", () => {
  describe("escapeHtml", () => {
    it("escapa & < > \" '", () => {
      expect(escapeHtml('A & B < C > D "E" \'F\'')).toBe('A & B < C > D "E" &#039;F&#039;');
    });
    it("string vazia retorna vazio", () => {
      expect(escapeHtml('')).toBe('');
    });
    it("números são convertidos para string", () => {
      expect(escapeHtml(123 as unknown as string)).toBe('123');
    });
  });

  describe("formatarAgenda", () => {
    it("intervalo_min", () => {
      expect(formatarAgenda({ agenda: { tipo: 'intervalo_min', valor: 30 } })).toBe('cada 30 min');
    });
    it("cron", () => {
      const r = formatarAgenda({ agenda: { tipo: 'cron', valor: '*/5 * * * *' } });
      expect(r).toContain('cron:');
      expect(r).toContain('*/5 * * * *');
    });
    it("data_unica", () => {
      const r = formatarAgenda({ agenda: { tipo: 'data_unica', valor: '2025-01-01T10:00:00Z' } });
      expect(r).toContain('em:');
      expect(r).toContain('2025-01-01T10:00:00Z');
    });
    it("tipo desconhecido usa fallback", () => {
      const r = formatarAgenda({ agenda: { tipo: 'desconhecido', valor: 'x' } });
      expect(r).toContain('em:');
    });
  });

  describe("badgeTipo", () => {
    it("cron → badge-pipeline", () => expect(badgeTipo('cron')).toBe('badge-pipeline'));
    it("intervalo_min → badge-review", () => expect(badgeTipo('intervalo_min')).toBe('badge-review'));
    it("data_unica → badge-warn", () => expect(badgeTipo('data_unica')).toBe('badge-warn'));
    it("outro → badge-neutral", () => expect(badgeTipo('foo')).toBe('badge-neutral'));
  });

  describe("badgeTeamPadrao", () => {
    it("pipeline", () => expect(badgeTeamPadrao('pipeline')).toBe('badge-pipeline'));
    it("fanout", () => expect(badgeTeamPadrao('fanout')).toBe('badge-fanout'));
    it("review", () => expect(badgeTeamPadrao('review')).toBe('badge-review'));
    it("debate", () => expect(badgeTeamPadrao('debate')).toBe('badge-debate'));
    it("outro → badge-neutral", () => expect(badgeTeamPadrao('x')).toBe('badge-neutral'));
  });

  describe("formatarDataLocal", () => {
    it("formata ISO para pt-BR", () => {
      const r = formatarDataLocal('2025-01-15T14:30:00Z');
      expect(r).toMatch(/\d{2}\/\d{2}\/\d{4}/);
      expect(r).toMatch(/\d{2}:\d{2}/);
    });
    it("string inválida retorna original", () => {
      expect(formatarDataLocal('invalido')).toBe('invalido');
    });
  });

  describe("formatarHora", () => {
    it("extrai hh:mm:ss de ISO", () => {
      const r = formatarHora('2025-01-15T14:30:45Z');
      expect(r).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("truncar", () => {
    it("trunca com reticências", () => {
      expect(truncar('abcdef', 4)).toBe('abc…');
    });
    it("não trunca se menor", () => {
      expect(truncar('abc', 10)).toBe('abc');
    });
  });

  describe("mesclarHistorico", () => {
    const baseSession = { id: 'sess-1', agente: 'executor', status: 'concluido', inicio: '2025-01-15T10:00:00Z', duracao: 30 };
    const baseTask = { id: 'task-1', titulo: 'Minha task', coluna: 'fazendo', responsavel: 'joao', criado_em: '2025-01-15T11:00:00Z' };
    const baseJob = { id: 'job-1', nome: 'Rotina diária', agenda: { tipo: 'intervalo_min', valor: 60 }, args: [], workspace: 'ws1', ativo: true, ultima_exec: '2025-01-15T09:00:00Z' };

    it("ordena por quando desc (mais recente primeiro)", () => {
      const r = mesclarHistorico(
        [{ ...baseSession, inicio: '2025-01-15T10:00:00Z' }],
        [{ ...baseTask, criado_em: '2025-01-15T11:00:00Z' }],
        [{ ...baseJob, ultima_exec: '2025-01-15T09:00:00Z' }]
      );
      expect(r[0].tipo).toBe('task'); // 11:00 mais recente
      expect(r[1].tipo).toBe('execucao'); // 10:00
      expect(r[2].tipo).toBe('rotina'); // 09:00
    });

    it("filtra por tipo execucao", () => {
      const r = mesclarHistorico(
        [baseSession],
        [baseTask],
        [baseJob],
        { filtro: 'execucao' }
      );
      expect(r.length).toBe(1);
      expect(r[0].tipo).toBe('execucao');
    });

    it("filtra por tipo task", () => {
      const r = mesclarHistorico(
        [baseSession],
        [baseTask],
        [baseJob],
        { filtro: 'task' }
      );
      expect(r.length).toBe(1);
      expect(r[0].tipo).toBe('task');
    });

    it("filtra por tipo rotina", () => {
      const r = mesclarHistorico(
        [baseSession],
        [baseTask],
        [baseJob],
        { filtro: 'rotina' }
      );
      expect(r.length).toBe(1);
      expect(r[0].tipo).toBe('rotina');
    });

    it("respeita limite", () => {
      const sessions = Array.from({ length: 10 }, (_, i) => ({ ...baseSession, id: `s-${i}`, inicio: `2025-01-15T${String(10+i).padStart(2,'0')}:00:00Z` }));
      const r = mesclarHistorico(sessions, [], [], { limite: 3 });
      expect(r.length).toBe(3);
    });

    it("campos ausentes não quebram (session sem inicio, job sem ultima_exec)", () => {
      const r = mesclarHistorico(
        [{ id: 's-1', agente: 'a' }], // sem inicio
        [{ titulo: 't', coluna: 'c' }], // sem criado_em
        [{ id: 'j-1', nome: 'j', agenda: { tipo: 'cron', valor: '*' }, args: [], workspace: 'w', ativo: true }] // sem ultima_exec
      );
      // Apenas a task deve aparecer (tem fallback de data)
      expect(r.length).toBe(1);
      expect(r[0].tipo).toBe('task');
    });

    it("task usa status da coluna", () => {
      const r = mesclarHistorico(
        [],
        [{ titulo: 'T', coluna: 'feito', responsavel: 'x' }],
        []
      );
      expect(r[0].status).toBe('feito');
    });
  });
});

describe("icons.ts — mapa de ícones", () => {
  it("contém todos os ícones esperados", () => {
    const esperados = ['home','tasks','agenda','teams','reunioes','fluxos','apps','run','pause','trash','stop','plus','close','lock','chat','spark'];
    for (const k of esperados) {
      expect(ICONES[k]).toBeDefined();
      expect(ICONES[k]).toContain('<svg');
      expect(ICONES[k]).toContain('stroke="currentColor"');
    }
  });

  it("icone() retorna span com classe", () => {
    const r = icone('home', 'minha-classe');
    expect(r).toContain('<span class="nav-icon minha-classe"');
    expect(r).toContain('<svg');
  });

  it("icone() desconhecido retorna vazio", () => {
    expect(icone('nao-existe')).toBe('');
  });
});

describe("state.ts — estado global", () => {
  beforeEach(() => {
    localStorage.clear();
    resetState();
  });

  it("loadPersistedAuth lê do localStorage", () => {
    localStorage.setItem('oc-token', 'tok123');
    localStorage.setItem('oc-ws', 'ws1');
    const { token, ws } = loadPersistedAuth();
    expect(token).toBe('tok123');
    expect(ws).toBe('ws1');
  });

  it("setToken/getToken", () => {
    setToken('abc');
    expect(getToken()).toBe('abc');
    expect(localStorage.getItem('oc-token')).toBe('abc');
    setToken(null);
    expect(getToken()).toBeNull();
    expect(localStorage.getItem('oc-token')).toBeNull();
  });

  it("setWsAtivo/getWsAtivo", () => {
    setWsAtivo('meu-ws');
    expect(getWsAtivo()).toBe('meu-ws');
    expect(localStorage.getItem('oc-ws')).toBe('meu-ws');
    setWsAtivo('');
    expect(getWsAtivo()).toBe('');
    expect(localStorage.getItem('oc-ws')).toBeNull();
  });

  it("setWorkspaces/getWorkspaces", () => {
    const ws = [{ id: 'a' }, { id: 'b' }];
    setWorkspaces(ws);
    expect(getWorkspaces()).toEqual(ws);
  });

  it("setViewAtual/getViewAtual", () => {
    setViewAtual('tasks');
    expect(getViewAtual()).toBe('tasks');
  });

  it("setTaskAberta/getTaskAberta", () => {
    setTaskAberta('task-1');
    expect(getTaskAberta()).toBe('task-1');
    setTaskAberta(null);
    expect(getTaskAberta()).toBeNull();
  });

  it("setAgendaEscopoAtual/getAgendaEscopoAtual", () => {
    setAgendaEscopoAtual('todas');
    expect(getAgendaEscopoAtual()).toBe('todas');
    setAgendaEscopoAtual('ws');
    expect(getAgendaEscopoAtual()).toBe('ws');
  });

  it("setSseConnected/isSseConnected", () => {
    setSseConnected(true);
    expect(isSseConnected()).toBe(true);
    setSseConnected(false);
    expect(isSseConnected()).toBe(false);
  });

  it("subscribe notifica mudanças", () => {
    let calls = 0;
    const unsub = subscribe(() => calls++);
    setToken('x');
    expect(calls).toBe(1);
    unsub();
    setToken('y');
    expect(calls).toBe(1);
  });

  it("clearAuth limpa tudo", () => {
    setToken('t');
    setWsAtivo('w');
    clearAuth();
    expect(getToken()).toBeNull();
    expect(getWsAtivo()).toBe('');
    expect(localStorage.getItem('oc-token')).toBeNull();
    expect(localStorage.getItem('oc-ws')).toBeNull();
  });
});