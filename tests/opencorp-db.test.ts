import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OpencorpDb, microUsdToUsd, usdToMicroUsd } from "../src/core/db/opencorp-db.js";

describe("OpencorpDb: Repositório / DAO Unificado", () => {
  let tmpWsDir: string;
  let opencorpDir: string;

  beforeEach(() => {
    tmpWsDir = mkdtempSync(join(tmpdir(), "oc-test-dao-"));
    opencorpDir = join(tmpWsDir, ".opencorp");
    mkdirSync(opencorpDir, { recursive: true });
  });

  afterEach(() => {
    OpencorpDb.limparCache();
    rmSync(tmpWsDir, { recursive: true, force: true });
  });

  it("deve realizar conversões monetárias estritas entre USD e micro-dólares", () => {
    expect(usdToMicroUsd(0.0452)).toBe(45200);
    expect(microUsdToUsd(45200)).toBe(0.0452);
    expect(usdToMicroUsd(1.5)).toBe(1500000);
    expect(microUsdToUsd(1500000)).toBe(1.5);
    expect(usdToMicroUsd(0)).toBe(0);
    expect(microUsdToUsd(0)).toBe(0);
  });

  it("deve auto-migrar transparentemente ao abrir workspace com bancos legados", () => {
    // Cria corp.db legado simulado
    const corpDb = new Database(join(opencorpDir, "corp.db"));
    corpDb.exec(`
      CREATE TABLE sessoes (id TEXT PRIMARY KEY, agente TEXT, modelo TEXT, inicio TEXT, fim TEXT, custo_usd REAL, status TEXT);
      CREATE TABLE execucoes (id TEXT PRIMARY KEY, agente TEXT, modelo TEXT, gatilho_tipo TEXT, gatilho_origem TEXT, status TEXT, inicio TEXT, fim TEXT, duracao_ms INTEGER, custo_usd REAL, exit_code INTEGER, erro TEXT);
      CREATE TABLE mensagens (id TEXT PRIMARY KEY, sessao_id TEXT, agente TEXT, role TEXT, conteudo TEXT, criado_em TEXT);
      CREATE TABLE acoes_agentes (id TEXT PRIMARY KEY, trace_id TEXT, span_id TEXT, parent_span_id TEXT, sessao_id TEXT, agente TEXT, modelo TEXT, workspace TEXT, tipo_acao TEXT, ferramenta TEXT, comando_resumo TEXT, input_json TEXT, output_json TEXT, status TEXT, duracao_ms INTEGER, tokens_prompt INTEGER, tokens_saida INTEGER, custo_usd REAL, erro TEXT, criado_em TEXT);
      INSERT INTO sessoes VALUES ('sess-auto-1', 'analista', 'claude-3-haiku', '2026-09-13T10:00:00.000Z', NULL, 0.05, 'executando');
    `);
    corpDb.close();

    // Cria tasks.db legado simulado
    const tasksDb = new Database(join(opencorpDir, "tasks.db"));
    tasksDb.exec(`
      CREATE TABLE tasks (id TEXT PRIMARY KEY, titulo TEXT NOT NULL, descricao TEXT, coluna TEXT, pos REAL, prioridade TEXT, labels TEXT, responsavel TEXT, due TEXT, task_pai TEXT, bloqueado_por TEXT, lock_por TEXT, lock_expira TEXT, criado_por TEXT, criado_em TEXT, atualizado_em TEXT);
      CREATE TABLE task_mensagens (id TEXT PRIMARY KEY, task_id TEXT, autor TEXT, tipo TEXT, corpo TEXT, menciona TEXT, refs TEXT, criado_em TEXT);
      INSERT INTO tasks VALUES ('t-auto-1', 'Tarefa Legada', 'Migrada', 'backlog', 1.0, 'alta', 'migracao, legada', 'dev', NULL, NULL, '', NULL, NULL, 'admin', '2026-09-13T09:00:00.000Z', '2026-09-13T09:00:00.000Z');
    `);
    tasksDb.close();

    expect(existsSync(join(opencorpDir, "opencorp.db"))).toBe(false);

    // Instancia OpencorpDb — deve disparar a auto-migração
    const db = OpencorpDb.obter(tmpWsDir);

    expect(existsSync(join(opencorpDir, "opencorp.db"))).toBe(true);

    const tasks = db.listarTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("t-auto-1");
    expect(tasks[0].labels).toEqual(["legada", "migracao"]);

    const sessao = db.obterSessao("sess-auto-1");
    expect(sessao).toBeTruthy();
    expect(sessao!.custo_micro_usd).toBe(50000);
  });

  describe("Ciclo de Vida de Tarefas (Tasks)", () => {
    it("deve criar, listar com relações normalizadas, atualizar e deletar tarefas", () => {
      const db = OpencorpDb.obter(tmpWsDir);

      // 1. Cria task 1
      const t1 = db.criarTask({
        titulo: "Criar endpoint /status",
        descricao: "Retornar métricas em tempo real",
        prioridade: "alta",
        labels: ["backend", "api", "urgente"],
      });

      expect(t1.id).toBeTruthy();
      expect(t1.titulo).toBe("Criar endpoint /status");
      expect(t1.labels).toEqual(["api", "backend", "urgente"].sort());

      // 2. Cria task 2 bloqueada por task 1
      const t2 = db.criarTask({
        titulo: "Criar tela de monitoramento",
        coluna: "backlog",
        prioridade: "media",
        labels: ["frontend", "ui"],
        bloqueado_por: [t1.id],
      });

      expect(t2.bloqueado_por).toEqual([t1.id]);

      // 3. Listar tarefas
      const lista = db.listarTasks();
      expect(lista).toHaveLength(2);

      const task1Recuperada = lista.find((t) => t.id === t1.id);
      expect(task1Recuperada?.labels).toEqual(["api", "backend", "urgente"].sort());

      const task2Recuperada = lista.find((t) => t.id === t2.id);
      expect(task2Recuperada?.bloqueado_por).toEqual([t1.id]);

      // 4. Atualizar tarefa
      db.atualizarTask(t1.id, {
        coluna: "fazendo",
        labels: ["backend", "em-progresso"],
      });

      const listaAtualizada = db.listarTasks();
      const t1Atualizada = listaAtualizada.find((t) => t.id === t1.id);
      expect(t1Atualizada?.coluna).toBe("fazendo");
      expect(t1Atualizada?.labels).toEqual(["backend", "em-progresso"].sort());

      // 5. Deletar tarefa 1 (deve acionar cascata em dependências)
      db.deletarTask(t1.id);

      const listaPosDelete = db.listarTasks();
      expect(listaPosDelete).toHaveLength(1);
      expect(listaPosDelete[0].id).toBe(t2.id);
      expect(listaPosDelete[0].bloqueado_por).toEqual([]);
    });
  });

  describe("Ciclo de Vida de Sessões, Mensagens e Spans", () => {
    it("deve gerenciar sessão, stream de mensagens e spans de telemetria", () => {
      const db = OpencorpDb.obter(tmpWsDir);

      // 1. Cria Sessão
      const sessao = db.criarSessao({
        agente: "pesquisador",
        modelo: "gpt-4o",
        custo_usd: 0.005,
      });

      expect(sessao.status).toBe("executando");
      expect(sessao.custo_micro_usd).toBe(5000);

      // 2. Insere Mensagens no Stream
      const m1 = db.inserirMensagem({
        session_id: sessao.id,
        autor: "usuario",
        role: "user",
        conteudo: "Buscar documentação de SQLite",
      });

      const m2 = db.inserirMensagem({
        session_id: sessao.id,
        autor: "pesquisador",
        role: "assistant",
        conteudo: "Encontrei a documentação oficial.",
      });

      const mensagens = db.listarMensagens(sessao.id);
      expect(mensagens).toHaveLength(2);
      expect(mensagens[0].id).toBe(m1.id);
      expect(mensagens[1].id).toBe(m2.id);

      // 3. Insere Span de Tool
      db.inserirSpan({
        session_id: sessao.id,
        trace_id: "trace-42",
        span_id: "span-read",
        ferramenta: "web_search",
        input_json: '{"q":"sqlite wal"}',
        output_json: '{"ok":true}',
        custo_usd: 0.002,
      });

      const spans = db.listarSpans(sessao.id);
      expect(spans).toHaveLength(1);
      expect(spans[0].ferramenta).toBe("web_search");
      expect(spans[0].custo_micro_usd).toBe(2000);

      // 4. Finaliza Sessão
      db.finalizarSessao(sessao.id, "concluido", { custo_usd: 0.025, exit_code: 0 });

      const sessaoFinal = db.obterSessao(sessao.id);
      expect(sessaoFinal?.status).toBe("concluido");
      expect(sessaoFinal?.fim_ms).toBeTruthy();
      expect(sessaoFinal?.custo_micro_usd).toBe(25000);
      expect(microUsdToUsd(sessaoFinal!.custo_micro_usd)).toBe(0.025);
    });
  });

  describe("Notificações", () => {
    it("deve criar, listar e marcar notificações como lidas", () => {
      const db = OpencorpDb.obter(tmpWsDir);

      const n1 = db.inserirNotificacao({
        titulo: "Build Concluído",
        mensagem: "Vite build finalizado sem erros.",
        tipo: "info",
      });

      expect(n1.lida).toBe(0);

      const lista = db.listarNotificacoes();
      expect(lista).toHaveLength(1);
      expect(lista[0].titulo).toBe("Build Concluído");
      expect(lista[0].lida).toBe(0);

      db.marcarNotificacaoComoLida(n1.id);

      const listaAtualizada = db.listarNotificacoes();
      expect(listaAtualizada[0].lida).toBe(1);
    });
  });
});
