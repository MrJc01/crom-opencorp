import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  TIPOS_EDITAVEIS,
  isFluxoEditavel,
  sequenciaDeFlow,
  brutoParaUi,
  montarGrafoPipeline,
  validarIdFlow,
} from '../src/web/stores/fluxos.svelte.js';

const RAIZ = join(dirname(new URL(import.meta.url).pathname), '..');

describe('Fluxos.svelte — migração Svelte 5', () => {
  const sveltePath = join(RAIZ, 'src/web/views/Fluxos.svelte');
  const svelteSrc = readFileSync(sveltePath, 'utf8');

  it('arquivo existe e usa Svelte 5 runes', () => {
    expect(existsSync(sveltePath), 'src/web/views/Fluxos.svelte deve existir').toBe(true);
    expect(svelteSrc).toContain('$state');
    expect(svelteSrc).toContain('$derived');
  });

  it('mantém API via src/web/api.ts', () => {
    expect(svelteSrc).toContain("from '../api.js'");
    expect(svelteSrc).toContain('api(');
    // também usa q alias
    expect(svelteSrc).toContain('toast');
  });

  it('usa stores (wsAtivo + fluxosStore)', () => {
    expect(svelteSrc).toContain('wsAtivo');
    expect(svelteSrc).toContain('fluxosStore');
    expect(svelteSrc).toContain("from '../stores/");
  });

  it('renderiza 4 templates (pipeline, fanout, review, debate)', () => {
    expect(svelteSrc).toContain('pipeline');
    expect(svelteSrc).toContain('fanout');
    expect(svelteSrc).toContain('review');
    expect(svelteSrc).toContain('debate');
    expect(svelteSrc).toContain('abrirFormFlow');
  });

  it('implementa pipeline com passos dinâmicos', () => {
    expect(svelteSrc).toContain('passosPipeline');
    expect(svelteSrc).toContain('addPassoFlow');
    expect(svelteSrc).toContain('agente');
    expect(svelteSrc).toContain('task_create');
    expect(svelteSrc).toContain('registro');
    expect(svelteSrc).toContain('saida');
  });

  it('implementa fanout / review / debate', () => {
    expect(svelteSrc).toContain('paralelos');
    expect(svelteSrc).toContain('executor');
    expect(svelteSrc).toContain('revisor');
    expect(svelteSrc).toContain('proponentes');
    expect(svelteSrc).toContain('moderador');
  });

  it('implementa ações: criar, editar, excluir, executar, detalhes, migrar', () => {
    expect(svelteSrc).toContain('criarFlow');
    expect(svelteSrc).toContain('editarFlow');
    expect(svelteSrc).toContain('excluirFlow');
    expect(svelteSrc).toContain('executarFlow');
    expect(svelteSrc).toContain('detalhesFlow');
    expect(svelteSrc).toContain('migrarTeams');
    expect(svelteSrc).toContain('/flows');
    expect(svelteSrc).toContain('/teams');
  });

  it('implementa drawer de detalhes + retomar', () => {
    expect(svelteSrc).toContain('drawerOpen');
    expect(svelteSrc).toContain('drawerFlowJson');
    expect(svelteSrc).toContain('retomarFlow');
    expect(svelteSrc).toContain('/flows/');
    expect(svelteSrc).toContain('resume');
  });

  it('mantém Tailwind/DaisyUI', () => {
    expect(svelteSrc).toContain('btn');
    expect(svelteSrc).toContain('card');
    expect(svelteSrc).toContain('badge');
    expect(svelteSrc).toContain('page-header');
    expect(svelteSrc).toContain('border-zinc-700');
  });

  it('exibe estados: carregando, erro, vazio', () => {
    expect(svelteSrc).toContain('Carregando fluxos');
    expect(svelteSrc).toContain('Algo deu errado');
    expect(svelteSrc).toContain('Nenhum fluxo');
    expect(svelteSrc).toContain('estado-erro');
  });

  it('lida com times legados', () => {
    expect(svelteSrc).toContain('Times legados');
    expect(svelteSrc).toContain('Migrar todos');
  });

  it('usa icone e ajuda', () => {
    expect(svelteSrc).toContain('icone(');
    expect(svelteSrc).toContain("ajuda('flows'");
  });
});

describe('fluxos store — helpers puros', () => {
  it('TIPOS_EDITAVEIS contém 5 tipos', () => {
    expect(TIPOS_EDITAVEIS.has('manual')).toBe(true);
    expect(TIPOS_EDITAVEIS.has('agente')).toBe(true);
    expect(TIPOS_EDITAVEIS.has('task_create')).toBe(true);
    expect(TIPOS_EDITAVEIS.has('registro')).toBe(true);
    expect(TIPOS_EDITAVEIS.has('saida')).toBe(true);
    expect(TIPOS_EDITAVEIS.has('condicao')).toBe(false);
    expect(TIPOS_EDITAVEIS.has('decisao')).toBe(false);
  });

  it('isFluxoEditavel detecta nós avançados', () => {
    expect(isFluxoEditavel([{ tipo: 'manual' }, { tipo: 'agente' }])).toBe(true);
    expect(isFluxoEditavel([{ tipo: 'manual' }, { tipo: 'condicao' }])).toBe(false);
    expect(isFluxoEditavel([{ tipo: 'decisao' }])).toBe(false);
    expect(isFluxoEditavel([])).toBe(true);
  });

  it('sequenciaDeFlow reconstrói ordem gatilho→passos', () => {
    const nos: any[] = [
      { id: 'gatilho', tipo: 'manual', config: {} },
      { id: 'passo-1', tipo: 'agente', config: { agente: 'a', ordem: 'o' } },
      { id: 'passo-2', tipo: 'saida', config: { registro: 'documentos/x' } },
    ];
    const arestas = [
      { de: 'gatilho', para: 'passo-1' },
      { de: 'passo-1', para: 'passo-2' },
    ];
    const seq = sequenciaDeFlow(nos, arestas);
    expect(seq.map((n) => n.id)).toEqual(['passo-1', 'passo-2']);
  });

  it('sequenciaDeFlow para em ciclo', () => {
    const nos: any[] = [
      { id: 'a', tipo: 'agente', config: {} },
      { id: 'b', tipo: 'agente', config: {} },
    ];
    const arestas = [
      { de: 'gatilho', para: 'a' },
      { de: 'a', para: 'b' },
      { de: 'b', para: 'a' },
    ];
    const seq = sequenciaDeFlow(nos, arestas);
    expect(seq.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('brutoParaUi mapeia config corretamente', () => {
    expect(brutoParaUi({ id: 'x', tipo: 'agente', config: { agente: 'editor', ordem: 'faça' } })).toEqual({
      tipo: 'agente',
      agente: 'editor',
      ordem: 'faça',
      titulo: '',
      categoria: '',
    });
    expect(brutoParaUi({ id: 'y', tipo: 'saida', config: { registro: 'documentos/x' } }).categoria).toBe('documentos/x');
    expect(brutoParaUi({ id: 'z', tipo: 'task_create', config: { titulo: 'Minha task' } }).titulo).toBe('Minha task');
  });

  it('validarIdFlow aceita kebab-case', () => {
    expect(validarIdFlow('ciclo-publicacao')).toBe(true);
    expect(validarIdFlow('fluxo1')).toBe(true);
    expect(validarIdFlow('a-b-c')).toBe(true);
    expect(validarIdFlow('Maiusculo')).toBe(false);
    expect(validarIdFlow('com espaco')).toBe(false);
    expect(validarIdFlow('-invalido')).toBe(false);
  });

  it('montarGrafoPipeline monta nos+arestas', () => {
    const g = montarGrafoPipeline([
      { tipo: 'agente', agente: 'editor', ordem: 'escreva', titulo: '', categoria: '' },
      { tipo: 'saida', agente: '', ordem: '', titulo: '', categoria: 'documentos' },
    ]);
    expect(g).not.toBeNull();
    expect(g!.nos).toHaveLength(3); // gatilho + 2
    expect(g!.arestas).toEqual([
      { de: 'gatilho', para: 'passo-1' },
      { de: 'passo-1', para: 'passo-2' },
    ]);
    expect(g!.nos[1]!.config.agente).toBe('editor');
    expect(g!.nos[2]!.config.registro).toBe('documentos/documentos');
  });

  it('montarGrafoPipeline retorna null se inválido', () => {
    expect(montarGrafoPipeline([{ tipo: 'agente', agente: '', ordem: '', titulo: '', categoria: '' }])).toBeNull();
    expect(montarGrafoPipeline([{ tipo: 'task_create', agente: '', ordem: '', titulo: '', categoria: '' }])).toBeNull();
    expect(montarGrafoPipeline([{ tipo: 'registro', agente: '', ordem: '', titulo: '', categoria: '' }])).toBeNull();
  });

  it('montarGrafoPipeline normaliza registro para documentos/', () => {
    const g = montarGrafoPipeline([{ tipo: 'saida', agente: '', ordem: '', titulo: '', categoria: 'minha-cat' }]);
    expect(g!.nos[1]!.config.registro).toBe('documentos/minha-cat');
    const g2 = montarGrafoPipeline([{ tipo: 'saida', agente: '', ordem: '', titulo: '', categoria: 'documentos/outra' }]);
    expect(g2!.nos[1]!.config.registro).toBe('documentos/outra');
  });
});
