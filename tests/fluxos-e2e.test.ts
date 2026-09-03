/**
 * Testes E2E dos Fluxos de Trabalho (Canvas, NDV, Context Menu, Modais)
 *
 * Valida a integridade da view Fluxos.tsx e do store fluxos.svelte.ts
 * cobrindo: catálogo de nodes, menu de contexto, formulário NDV,
 * backdrop close, grafo topológico, templates e helpers puros.
 */
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

/* ────────────────────────────────────────────────────────────
   1. CANVAS VIEW (Fluxos.tsx) — Estrutura & Funcionalidades
   ──────────────────────────────────────────────────────────── */
describe('Fluxos.tsx — Canvas Visual estilo n8n', () => {
  const tsxPath = join(RAIZ, 'src/web/views/Fluxos.tsx');
  const tsxSrc = readFileSync(tsxPath, 'utf8');

  it('arquivo TSX existe', () => {
    expect(existsSync(tsxPath)).toBe(true);
  });

  // ── Menu de Contexto (Botão Direito) ──
  describe('Menu de Contexto (Context Menu)', () => {
    it('implementa estado menuContexto com aberto/x/y/noId', () => {
      expect(tsxSrc).toContain('menuContexto');
      expect(tsxSrc).toContain('aberto');
      expect(tsxSrc).toContain('noId');
    });

    it('usa onContextMenu no canvas e nos nodes', () => {
      expect(tsxSrc).toContain('onContextMenu');
      expect(tsxSrc).toContain('onContextMenuCanvas');
    });

    it('menu no canvas vazio tem: Adicionar Node, Resetar Visualização, Copiar JSON', () => {
      expect(tsxSrc).toContain('Adicionar Node');
      expect(tsxSrc).toContain('Resetar Visualização');
      expect(tsxSrc).toContain('Copiar Workflow JSON');
    });

    it('menu no node tem: Abrir Parâmetros, Duplicar, Conectar Novo, Excluir', () => {
      expect(tsxSrc).toContain('Abrir Parâmetros');
      expect(tsxSrc).toContain('Duplicar Node');
      expect(tsxSrc).toContain('Conectar Novo Node');
      expect(tsxSrc).toContain('Excluir Node');
    });

    it('fecha ao clicar fora (window click listener)', () => {
      expect(tsxSrc).toContain('addEventListener');
      expect(tsxSrc).toContain("click");
    });
  });

  // ── Catálogo de Novos Nodes (Modal) ──
  describe('Catálogo de Adicionar Node', () => {
    it('implementa modal modalAdicionarNode', () => {
      expect(tsxSrc).toContain('modalAdicionarNode');
      expect(tsxSrc).toContain('setModalAdicionarNode');
    });

    it('exporta TIPOS_NODE_CATALOGO com 7 tipos de blocos', () => {
      expect(tsxSrc).toContain('TIPOS_NODE_CATALOGO');
      expect(tsxSrc).toContain('"agente"');
      expect(tsxSrc).toContain('"script"');
      expect(tsxSrc).toContain('"reuniao"');
      expect(tsxSrc).toContain('"decisao"');
      expect(tsxSrc).toContain('"task_create"');
      expect(tsxSrc).toContain('"registro"');
      expect(tsxSrc).toContain('"webhook"');
    });

    it('modal fecha ao clicar no backdrop (stopPropagation no inner)', () => {
      // O backdrop do modal de adicionar node tem onClick para fechar
      expect(tsxSrc).toContain('onClick={() => setModalAdicionarNode(false)}');
      expect(tsxSrc).toContain('e.stopPropagation()');
    });

    it('modal fecha ao clicar no X (IconButton)', () => {
      expect(tsxSrc).toContain('onClick={() => setModalAdicionarNode(false)}');
    });

    it('implementa adicionarNodeAoWorkflow que cria node e salva', () => {
      expect(tsxSrc).toContain('adicionarNodeAoWorkflow');
      expect(tsxSrc).toContain('salvarAlteracoesWorkflow');
    });
  });

  // ── NDV (Node Details View) com Formulário e JSON ──
  describe('NDV — Node Details View', () => {
    it('implementa alternância Form / JSON', () => {
      expect(tsxSrc).toContain('modoNdv');
      expect(tsxSrc).toContain('"form"');
      expect(tsxSrc).toContain('"json"');
      expect(tsxSrc).toContain('setModoNdv');
    });

    it('formulário automático para tipo agente: selector de agente + textarea de ordem', () => {
      expect(tsxSrc).toContain('Agente Especialista');
      expect(tsxSrc).toContain('Ordem / Instrução');
      expect(tsxSrc).toContain('atualizarConfigNo("agente"');
      expect(tsxSrc).toContain('atualizarConfigNo("ordem"');
    });

    it('formulário automático para tipo script: arquivo + comando', () => {
      expect(tsxSrc).toContain('Caminho do Script');
      expect(tsxSrc).toContain('Comando Bash Alternativo');
      expect(tsxSrc).toContain('atualizarConfigNo("arquivo"');
      expect(tsxSrc).toContain('atualizarConfigNo("comando"');
    });

    it('formulário automático para tipo reunião: pauta', () => {
      expect(tsxSrc).toContain('Pauta da Reunião');
      expect(tsxSrc).toContain('atualizarConfigNo("pauta"');
    });

    it('formulário automático para tipo decisão: pergunta', () => {
      expect(tsxSrc).toContain('Pergunta de Decisão');
      expect(tsxSrc).toContain('atualizarConfigNo("pergunta"');
    });

    it('formulário automático para tipo task: título + coluna + prioridade', () => {
      expect(tsxSrc).toContain('Título da Tarefa');
      expect(tsxSrc).toContain('atualizarConfigNo("coluna"');
      expect(tsxSrc).toContain('atualizarConfigNo("prioridade"');
    });

    it('formulário automático para tipo registro/saída: categoria', () => {
      expect(tsxSrc).toContain('Categoria do Registro');
      expect(tsxSrc).toContain('atualizarConfigNo("categoria"');
    });

    it('versão JSON mostra JSON.stringify do nó', () => {
      expect(tsxSrc).toContain('JSON.stringify(noSelecionado()');
    });
  });

  // ── Canvas Interativo ──
  describe('Canvas Interativo', () => {
    it('implementa zoom e pan', () => {
      expect(tsxSrc).toContain('zoom');
      expect(tsxSrc).toContain('pan');
      expect(tsxSrc).toContain('isPanning');
      expect(tsxSrc).toContain('onMouseDownCanvas');
      expect(tsxSrc).toContain('onMouseMoveCanvas');
    });

    it('renderiza grid pontilhado estilo n8n', () => {
      expect(tsxSrc).toContain('radial-gradient');
      expect(tsxSrc).toContain('background-size');
    });

    it('renderiza nós com handles de entrada e saída', () => {
      expect(tsxSrc).toContain('Input Port');
      expect(tsxSrc).toContain('Output Port');
    });

    it('renderiza arestas Bezier via SVG path', () => {
      expect(tsxSrc).toContain('arestasCurvadas');
      expect(tsxSrc).toContain('<path');
      expect(tsxSrc).toContain('edge-gradient');
    });

    it('layout topológico automático calcula posições', () => {
      expect(tsxSrc).toContain('nosPosicionados');
      expect(tsxSrc).toContain('COL_WIDTH');
      expect(tsxSrc).toContain('ROW_HEIGHT');
    });

    it('implementa resetView para centralizar canvas', () => {
      expect(tsxSrc).toContain('resetView');
    });
  });

  // ── Operações de Workflow ──
  describe('Operações de Workflow', () => {
    it('permite duplicar nodes', () => {
      expect(tsxSrc).toContain('duplicarNodeSelecionado');
    });

    it('permite excluir nodes com validação de mínimo 1', () => {
      expect(tsxSrc).toContain('excluirNode');
      expect(tsxSrc).toContain('precisa ter ao menos um nó');
    });

    it('permite copiar workflow JSON para clipboard', () => {
      expect(tsxSrc).toContain('copiarWorkflowJson');
      expect(tsxSrc).toContain('clipboard.writeText');
    });

    it('permite executar workflow com entrada', () => {
      expect(tsxSrc).toContain('dispararExecucao');
      expect(tsxSrc).toContain('/run');
    });

    it('lista workflows com busca de texto', () => {
      expect(tsxSrc).toContain('fluxosFiltrados');
      expect(tsxSrc).toContain('buscaTexto');
    });
  });

  // ── Modais & Fechar ──
  describe('Modais — fechar corretamente', () => {
    it('modal Adicionar Node fecha por backdrop click', () => {
      const match = tsxSrc.match(/modalAdicionarNode\(\)[\s\S]*?onClick=\{.*?setModalAdicionarNode\(false\)/);
      expect(match).not.toBeNull();
    });

    it('modal Novo Workflow fecha por backdrop click', () => {
      expect(tsxSrc).toContain('onClick={() => setModalNovoFluxo(false)}');
    });

    it('modal Executar fecha por backdrop click', () => {
      expect(tsxSrc).toContain('onClick={() => setModalExecutar(false)}');
    });
  });
});

/* ────────────────────────────────────────────────────────────
   2. STORE PUROS (fluxos.svelte.ts) — Helpers & Validação
   ──────────────────────────────────────────────────────────── */
describe('fluxos store — helpers puros (e2e lógica)', () => {
  // ── TIPOS_EDITAVEIS ──
  describe('TIPOS_EDITAVEIS', () => {
    it('contém manual, agente, task_create, registro, saida', () => {
      for (const t of ['manual', 'agente', 'task_create', 'registro', 'saida']) {
        expect(TIPOS_EDITAVEIS.has(t), `deve conter "${t}"`).toBe(true);
      }
    });

    it('NÃO contém decisao, condicao, script, reuniao, webhook', () => {
      for (const t of ['decisao', 'condicao', 'script', 'reuniao', 'webhook']) {
        expect(TIPOS_EDITAVEIS.has(t), `NÃO deve conter "${t}"`).toBe(false);
      }
    });
  });

  // ── isFluxoEditavel ──
  describe('isFluxoEditavel', () => {
    it('retorna true para pipeline simples (manual + agente)', () => {
      expect(isFluxoEditavel([{ tipo: 'manual' }, { tipo: 'agente' }])).toBe(true);
    });

    it('retorna false se tem nó avançado (condicao)', () => {
      expect(isFluxoEditavel([{ tipo: 'manual' }, { tipo: 'condicao' }])).toBe(false);
    });

    it('retorna false se tem nó avançado (decisao)', () => {
      expect(isFluxoEditavel([{ tipo: 'decisao' }])).toBe(false);
    });

    it('retorna true para array vazio', () => {
      expect(isFluxoEditavel([])).toBe(true);
    });

    it('retorna true para combinação editável (manual + agente + task_create + saida)', () => {
      expect(isFluxoEditavel([
        { tipo: 'manual' },
        { tipo: 'agente' },
        { tipo: 'task_create' },
        { tipo: 'saida' },
      ])).toBe(true);
    });
  });

  // ── sequenciaDeFlow ──
  describe('sequenciaDeFlow', () => {
    it('reconstrói ordem linear correta', () => {
      const nos: any[] = [
        { id: 'gatilho', tipo: 'manual', config: {} },
        { id: 'a', tipo: 'agente', config: { agente: 'editor', ordem: 'escreva' } },
        { id: 'b', tipo: 'saida', config: { registro: 'documentos/x' } },
      ];
      const arestas = [
        { de: 'gatilho', para: 'a' },
        { de: 'a', para: 'b' },
      ];
      const seq = sequenciaDeFlow(nos, arestas);
      expect(seq.map((n) => n.id)).toEqual(['a', 'b']);
    });

    it('para em ciclo (evita loop infinito)', () => {
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

    it('retorna vazio se não há aresta de gatilho', () => {
      const nos: any[] = [{ id: 'x', tipo: 'agente', config: {} }];
      const arestas = [{ de: 'x', para: 'y' }];
      expect(sequenciaDeFlow(nos, arestas)).toEqual([]);
    });

    it('pipeline com 5 etapas mantém ordem', () => {
      const nos: any[] = Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`,
        tipo: 'agente',
        config: { agente: `ag${i}`, ordem: `step ${i}` },
      }));
      const arestas = [
        { de: 'gatilho', para: 'p0' },
        ...nos.slice(0, -1).map((n, i) => ({ de: n.id, para: `p${i + 1}` })),
      ];
      const seq = sequenciaDeFlow(nos, arestas);
      expect(seq).toHaveLength(5);
      expect(seq.map((n) => n.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
    });
  });

  // ── brutoParaUi ──
  describe('brutoParaUi', () => {
    it('mapeia agente corretamente', () => {
      const ui = brutoParaUi({ id: 'x', tipo: 'agente', config: { agente: 'editor', ordem: 'faça' } });
      expect(ui.tipo).toBe('agente');
      expect(ui.agente).toBe('editor');
      expect(ui.ordem).toBe('faça');
    });

    it('mapeia saida.registro para categoria', () => {
      const ui = brutoParaUi({ id: 'y', tipo: 'saida', config: { registro: 'documentos/x' } });
      expect(ui.categoria).toBe('documentos/x');
    });

    it('mapeia task_create.titulo', () => {
      const ui = brutoParaUi({ id: 'z', tipo: 'task_create', config: { titulo: 'Minha task' } });
      expect(ui.titulo).toBe('Minha task');
    });

    it('trata config vazio sem erro', () => {
      const ui = brutoParaUi({ id: 'w', tipo: 'agente', config: {} });
      expect(ui.agente).toBe('');
      expect(ui.ordem).toBe('');
    });
  });

  // ── validarIdFlow ──
  describe('validarIdFlow', () => {
    it('aceita kebab-case válidos', () => {
      expect(validarIdFlow('ciclo-publicacao')).toBe(true);
      expect(validarIdFlow('fluxo1')).toBe(true);
      expect(validarIdFlow('a-b-c')).toBe(true);
      expect(validarIdFlow('x')).toBe(true);
    });

    it('rejeita formatos inválidos', () => {
      expect(validarIdFlow('Maiusculo')).toBe(false);
      expect(validarIdFlow('com espaco')).toBe(false);
      expect(validarIdFlow('-invalido')).toBe(false);
      expect(validarIdFlow('invalido-')).toBe(false);
      expect(validarIdFlow('')).toBe(false);
      expect(validarIdFlow('com_underscore')).toBe(false);
    });
  });

  // ── montarGrafoPipeline ──
  describe('montarGrafoPipeline', () => {
    it('monta grafo com gatilho + 2 passos', () => {
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
    });

    it('retorna null se agente sem nome ou ordem', () => {
      expect(montarGrafoPipeline([
        { tipo: 'agente', agente: '', ordem: '', titulo: '', categoria: '' },
      ])).toBeNull();
    });

    it('retorna null se task_create sem titulo', () => {
      expect(montarGrafoPipeline([
        { tipo: 'task_create', agente: '', ordem: '', titulo: '', categoria: '' },
      ])).toBeNull();
    });

    it('retorna null se registro sem categoria', () => {
      expect(montarGrafoPipeline([
        { tipo: 'registro', agente: '', ordem: '', titulo: '', categoria: '' },
      ])).toBeNull();
    });

    it('normaliza registro para documentos/ se não contém /', () => {
      const g = montarGrafoPipeline([
        { tipo: 'saida', agente: '', ordem: '', titulo: '', categoria: 'minha-cat' },
      ]);
      expect(g!.nos[1]!.config.registro).toBe('documentos/minha-cat');
    });

    it('preserva registro com / intacto', () => {
      const g = montarGrafoPipeline([
        { tipo: 'saida', agente: '', ordem: '', titulo: '', categoria: 'documentos/outra' },
      ]);
      expect(g!.nos[1]!.config.registro).toBe('documentos/outra');
    });

    it('monta pipeline com 4 passos encadeados', () => {
      const g = montarGrafoPipeline([
        { tipo: 'agente', agente: 'pesq', ordem: 'pesquisar', titulo: '', categoria: '' },
        { tipo: 'agente', agente: 'red', ordem: 'redigir', titulo: '', categoria: '' },
        { tipo: 'task_create', agente: '', ordem: '', titulo: 'Publicar', categoria: '' },
        { tipo: 'saida', agente: '', ordem: '', titulo: '', categoria: 'publicacoes' },
      ]);
      expect(g).not.toBeNull();
      expect(g!.nos).toHaveLength(5); // gatilho + 4
      expect(g!.arestas).toHaveLength(4);
      expect(g!.arestas[3]).toEqual({ de: 'passo-3', para: 'passo-4' });
    });
  });
});

/* ────────────────────────────────────────────────────────────
   3. SIDEBAR — Reuniões removido, acessível pelo Secretário
   ──────────────────────────────────────────────────────────── */
describe('Sidebar — Reuniões removido do menu lateral', () => {
  const sidebarPath = join(RAIZ, 'src/web/components/Sidebar.tsx');
  const sidebarSrc = readFileSync(sidebarPath, 'utf8');

  it('NÃO contém link para /reunioes no sidebar', () => {
    // A linha original era: { href: "/reunioes", label: "Reuniões", ... }
    // Após remoção, não deve ter essa entrada no array navGroups
    const linhasComReunioesNavItem = sidebarSrc
      .split('\n')
      .filter((l) => l.includes('"/reunioes"') && l.includes('label'));
    expect(linhasComReunioesNavItem).toHaveLength(0);
  });

  it('mantém itens essenciais: Início, Secretário, Workspace, Tasks, Agentes', () => {
    expect(sidebarSrc).toContain('"/home"');
    expect(sidebarSrc).toContain('"/secretario"');
    expect(sidebarSrc).toContain('"/workspace"');
    expect(sidebarSrc).toContain('"/tasks"');
    expect(sidebarSrc).toContain('"/agentes"');
  });
});

describe('Secretario.tsx — botão de acesso a Reuniões', () => {
  const secPath = join(RAIZ, 'src/web/views/Secretario.tsx');
  const secSrc = readFileSync(secPath, 'utf8');

  it('importa Users icon e useNavigate', () => {
    expect(secSrc).toContain('Users');
    expect(secSrc).toContain('useNavigate');
  });

  it('tem botão Reuniões que navega para /reunioes', () => {
    expect(secSrc).toContain('navigate("/reunioes")');
    expect(secSrc).toContain('Reuniões');
  });
});
