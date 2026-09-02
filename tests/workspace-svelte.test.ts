import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  esMarkdown,
  modoPadrao,
  modoValido,
  ordenarNos,
  soOpencorp,
  ignorarNo,
  filtrarCaminhos,
  rotuloTab,
  nomeProximoTerminal,
  MAX_TERMINAIS,
  coletarCaminhos,
  buscarNo,
  DIRS_IGNORADOS,
} from '../src/web/stores/workspace.svelte.js';

const RAIZ = join(dirname(new URL(import.meta.url).pathname), '..');

describe('Workspace.svelte — migração Svelte 5', () => {
  const sveltePath = join(RAIZ, 'src/web/views/Workspace.svelte');
  const storePath = join(RAIZ, 'src/web/stores/workspace.svelte.ts');
  const svelteSrc = existsSync(sveltePath) ? readFileSync(sveltePath, 'utf8') : '';
  const storeSrc = existsSync(storePath) ? readFileSync(storePath, 'utf8') : '';

  it('arquivos existem', () => {
    expect(existsSync(sveltePath), 'Workspace.svelte deve existir').toBe(true);
    expect(existsSync(storePath), 'stores/workspace.svelte.ts deve existir').toBe(true);
  });

  it('usa Svelte 5 runes', () => {
    expect(svelteSrc).toContain('$state');
    expect(svelteSrc).toContain('$derived');
  });

  it('mantém API via src/web/api.ts e compatibilidade menu-contexto', () => {
    expect(svelteSrc).toContain("from '../api.js'");
    expect(svelteSrc).toContain('api');
    expect(svelteSrc).toContain('headers()');
    // menu-contexto usa classe tree-arquivo + data-path
    expect(svelteSrc).toContain('tree-arquivo');
    expect(svelteSrc).toContain('data-path');
    // store expõe abrirArquivo para menu-contexto
    expect(storeSrc).toContain('abrirArquivo');
    expect(storeSrc).toContain('enviarComoContexto');
  });

  it('implementa layout VS Code: explorer à direita, tabs, busca Ctrl+P, terminais', () => {
    expect(svelteSrc).toContain('vs-root');
    expect(svelteSrc).toContain('vs-principal');
    expect(svelteSrc).toContain('vs-lateral');
    expect(svelteSrc).toContain('EXPLORADOR');
    expect(svelteSrc).toContain('vs-tabs');
    expect(svelteSrc).toContain('ws-busca');
    expect(svelteSrc).toContain('Ctrl+P');
    expect(svelteSrc).toContain('vs-term');
    expect(svelteSrc).toContain('TERMINAL');
    expect(svelteSrc).toContain('term-');
  });

  it('implementa árvore lazy com cache e busca recursiva', () => {
    expect(svelteSrc).toContain('garantirFilhos');
    expect(svelteSrc).toContain('listaCache');
    expect(svelteSrc).toContain('carregarArvore');
    expect(svelteSrc).toContain('/files/tree');
    expect(svelteSrc).toContain('/files?path=');
    expect(svelteSrc).toContain('expandidos');
  });

  it('implementa tabs com modos editor/preview/split e salvamento Ctrl+S', () => {
    expect(svelteSrc).toContain('TabArquivo');
    expect(svelteSrc).toContain('modoPadrao');
    expect(svelteSrc).toContain('preview');
    expect(svelteSrc).toContain('split');
    expect(svelteSrc).toContain('salvarAtivo');
    expect(svelteSrc).toContain('Ctrl+S');
    expect(svelteSrc).toContain('PUT');
  });

  it('usa Tailwind/DaisyUI', () => {
    expect(svelteSrc).toContain('flex');
    expect(svelteSrc).toContain('btn');
    expect(svelteSrc).toContain('bg-[');
  });

  it('usa stores (wsAtivo)', () => {
    expect(svelteSrc).toContain('wsAtivo');
    expect(svelteSrc).toContain("from '../stores/");
  });

  it('mantém rascunho localStorage e flush keepalive', () => {
    expect(svelteSrc).toContain('localStorage');
    expect(svelteSrc).toContain('keepalive');
    expect(svelteSrc).toContain('pagehide');
    expect(svelteSrc).toContain('visibilitychange');
    expect(svelteSrc).toContain('hashchange');
  });
});

describe('workspace store — helpers puros', () => {
  it('esMarkdown detecta .md case-insensitive', () => {
    expect(esMarkdown('README.md')).toBe(true);
    expect(esMarkdown('doc.MD')).toBe(true);
    expect(esMarkdown('app.ts')).toBe(false);
    expect(esMarkdown('notes.txt')).toBe(false);
  });

  it('modoPadrao: .md → preview, resto → editor', () => {
    expect(modoPadrao('readme.md')).toBe('preview');
    expect(modoPadrao('main.ts')).toBe('editor');
    expect(modoPadrao('style.css')).toBe('editor');
  });

  it('modoValido valida modos', () => {
    expect(modoValido('editor')).toBe(true);
    expect(modoValido('preview')).toBe(true);
    expect(modoValido('split')).toBe(true);
    expect(modoValido('foo')).toBe(false);
    expect(modoValido(null)).toBe(false);
  });

  it('ordenarNos: dirs primeiro, alfabético', () => {
    const nos: any[] = [
      { nome: 'z.ts', caminho: 'z.ts', tipo: 'arquivo' },
      { nome: 'a', caminho: 'a', tipo: 'dir' },
      { nome: 'b.ts', caminho: 'b.ts', tipo: 'arquivo' },
      { nome: 'm', caminho: 'm', tipo: 'dir' },
    ];
    const ord = ordenarNos(nos).map((n) => n.nome);
    expect(ord).toEqual(['a', 'm', 'b.ts', 'z.ts']);
  });

  it('soOpencorp detecta workspace vazio', () => {
    expect(soOpencorp([])).toBe(true);
    expect(soOpencorp([{ nome: '.opencorp', caminho: '.opencorp', tipo: 'dir' } as any])).toBe(true);
    expect(soOpencorp([{ nome: '.opencorp', caminho: '.opencorp', tipo: 'dir' } as any, { nome: 'src', caminho: 'src', tipo: 'dir' } as any])).toBe(false);
  });

  it('ignorarNo respeita DIRS_IGNORADOS e logs em .opencorp', () => {
    expect(ignorarNo('node_modules', '')).toBe(true);
    expect(ignorarNo('.git', '')).toBe(true);
    expect(ignorarNo('dist', '')).toBe(true);
    expect(ignorarNo('logs', '.opencorp')).toBe(true);
    expect(ignorarNo('logs', 'src')).toBe(false);
    expect(ignorarNo('src', '')).toBe(false);
  });

  it('filtrarCaminhos: substring case-insensitive, ordena por tamanho, limita', () => {
    const caminhos = ['src/web/views/workspace.ts', 'src/web/api.ts', 'README.md', 'src/web/views/Config.svelte'];
    expect(filtrarCaminhos(caminhos, 'xyz')).toEqual([]);
    const res = filtrarCaminhos(caminhos, 'web');
    expect(res).toContain('src/web/api.ts');
    expect(res.length).toBeLessThanOrEqual(12);
    // case insensitive
    expect(filtrarCaminhos(caminhos, 'README')).toEqual(['README.md']);
    // <2 chars → vazio
    expect(filtrarCaminhos(caminhos, 'a')).toEqual([]);
  });

  it('rotuloTab marca ● se sujo', () => {
    const tab: any = { nome: 'a.ts', original: 'x', editado: 'x' };
    expect(rotuloTab(tab)).toBe('a.ts');
    const suja: any = { nome: 'a.ts', original: 'x', editado: 'y' };
    expect(rotuloTab(suja)).toBe('● a.ts');
  });

  it('nomeProximoTerminal evita colisão', () => {
    const terms: any[] = [{ nome: 'term-1' }, { nome: 'term-2' }];
    expect(nomeProximoTerminal(terms)).toBe('term-3');
    expect(nomeProximoTerminal([])).toBe('term-1');
    expect(nomeProximoTerminal([{ nome: 'term-2' }] as any)).toBe('term-1');
  });

  it('coletarCaminhos extrai arquivos da árvore', () => {
    const arv: any[] = [
      { nome: 'src', caminho: 'src', tipo: 'dir', filhos: [{ nome: 'a.ts', caminho: 'src/a.ts', tipo: 'arquivo' }] },
      { nome: 'README.md', caminho: 'README.md', tipo: 'arquivo' },
    ];
    const c = coletarCaminhos(arv);
    expect(c).toContain('src/a.ts');
    expect(c).toContain('README.md');
  });

  it('buscarNo encontra nó profundo', () => {
    const arv: any[] = [
      { nome: 'src', caminho: 'src', tipo: 'dir', filhos: [{ nome: 'a', caminho: 'src/a', tipo: 'dir', filhos: [{ nome: 'b.ts', caminho: 'src/a/b.ts', tipo: 'arquivo' }] }] },
    ];
    expect(buscarNo(arv, 'src/a/b.ts')?.nome).toBe('b.ts');
    expect(buscarNo(arv, 'inexistente')).toBeNull();
  });

  it('MAX_TERMINAIS = 4', () => {
    expect(MAX_TERMINAIS).toBe(4);
  });

  it('DIRS_IGNORADOS contém node_modules/.git/dist', () => {
    expect(DIRS_IGNORADOS.has('node_modules')).toBe(true);
    expect(DIRS_IGNORADOS.has('.git')).toBe(true);
  });
});
