import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { colunasDe, tarefasPorColuna, agruparPorColunas, COLUNAS_PADRAO, AJUDA_COLUNA } from '../src/web/stores/tasks.svelte.js';

const RAIZ = join(dirname(new URL(import.meta.url).pathname), '..');

describe('Tasks.svelte — migração Svelte 5', () => {
  const sveltePath = join(RAIZ, 'src/web/views/Tasks.svelte');
  const svelteSrc = readFileSync(sveltePath, 'utf8');

  it('arquivo existe e usa Svelte 5 runes', () => {
    expect(svelteSrc).toContain('$state');
    expect(svelteSrc).toContain('$derived');
  });

  it('mantém API via src/web/api.ts', () => {
    expect(svelteSrc).toContain("from '../api.js'");
    expect(svelteSrc).toContain('api(');
  });

  it('usa stores (wsAtivo + tasksStore)', () => {
    expect(svelteSrc).toContain('wsAtivo');
    expect(svelteSrc).toContain('tasksStore');
    expect(svelteSrc).toContain("from '../stores/");
  });

  it('renderiza Kanban com 4 colunas padrão', () => {
    expect(svelteSrc).toContain('backlog');
    expect(svelteSrc).toContain('fazendo');
    expect(svelteSrc).toContain('bloqueado');
    expect(svelteSrc).toContain('feito');
    expect(svelteSrc).toContain('kanban-col');
    expect(svelteSrc).toContain('COLUNAS_PADRAO');
  });

  it('implementa drag-and-drop', () => {
    expect(svelteSrc).toContain('draggable');
    expect(svelteSrc).toContain('ondragover');
    expect(svelteSrc).toContain('ondrop');
    expect(svelteSrc).toContain('onDragStart');
    expect(svelteSrc).toContain('moverTaskColunaDireto');
  });

  it('implementa drawer com detalhes + chat + console', () => {
    expect(svelteSrc).toContain('drawerOpen');
    expect(svelteSrc).toContain('drawerTask');
    expect(svelteSrc).toContain('drawerChat');
    expect(svelteSrc).toContain('consoleLog');
    expect(svelteSrc).toContain('Enviar');
    expect(svelteSrc).toContain('Excluir task');
  });

  it('mantém Tailwind/DaisyUI', () => {
    expect(svelteSrc).toContain('btn');
    expect(svelteSrc).toContain('badge');
    expect(svelteSrc).toContain('grid-cols-4');
    expect(svelteSrc).toContain('kanban');
  });
});

describe('tasks store — helpers puros', () => {
  it('COLUNAS_PADRAO tem 4 colunas', () => {
    expect(COLUNAS_PADRAO).toEqual(['backlog', 'fazendo', 'bloqueado', 'feito']);
  });

  it('AJUDA_COLUNA cobre as 4 colunas', () => {
    for (const c of COLUNAS_PADRAO) expect(AJUDA_COLUNA[c]).toBeDefined();
  });

  it('colunasDe retorna padrão + extras na ordem', () => {
    const tasks: any[] = [
      { id: '1', coluna: 'backlog', pos: 1 },
      { id: '2', coluna: 'fazendo', pos: 1 },
      { id: '3', coluna: 'review', pos: 1 },
      { id: '4', coluna: 'backlog', pos: 2 },
    ];
    expect(colunasDe(tasks)).toEqual(['backlog', 'fazendo', 'bloqueado', 'feito', 'review']);
  });

  it('tarefasPorColuna ordena por pos', () => {
    const tasks: any[] = [
      { id: 'a', coluna: 'backlog', pos: 3 },
      { id: 'b', coluna: 'backlog', pos: 1 },
      { id: 'c', coluna: 'backlog', pos: 2 },
      { id: 'd', coluna: 'feito', pos: 1 },
    ];
    expect(tarefasPorColuna(tasks, 'backlog').map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('agruparPorColunas agrupa e ordena', () => {
    const tasks: any[] = [
      { id: '1', coluna: 'backlog', pos: 2 },
      { id: '2', coluna: 'backlog', pos: 1 },
      { id: '3', coluna: 'feito', pos: 1 },
    ];
    const g = agruparPorColunas(tasks);
    expect(g['backlog'].map((t) => t.id)).toEqual(['2', '1']);
    expect(g['feito'].map((t) => t.id)).toEqual(['3']);
    expect(g['fazendo']).toEqual([]);
  });
});
