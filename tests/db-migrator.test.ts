import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { migrarWorkspaceParaSchemaConsolidado } from "../src/core/db/migrator.js";

describe("Migrador ETL: Schema Consolidado (opencorp.db)", () => {
  let tmpWsDir: string;
  let opencorpDir: string;

  beforeEach(() => {
    tmpWsDir = mkdtempSync(join(tmpdir(), "oc-test-migrator-"));
    opencorpDir = join(tmpWsDir, ".opencorp");
    mkdirSync(opencorpDir, { recursive: true });

    // 1. Cria corp.db legado simulado
    const corpDb = new Database(join(opencorpDir, "corp.db"));
    corpDb.exec(`
      CREATE TABLE sessoes (
        id TEXT PRIMARY KEY,
        agente TEXT,
        modelo TEXT,
        inicio TEXT,
        fim TEXT,
        custo_usd REAL,
        status TEXT
      );
      CREATE TABLE execucoes (
        id TEXT PRIMARY KEY,
        agente TEXT,
        modelo TEXT,
        gatilho_tipo TEXT,
        gatilho_origem TEXT,
        status TEXT,
        inicio TEXT,
        fim TEXT,
        duracao_ms INTEGER,
        custo_usd REAL,
        exit_code INTEGER,
        erro TEXT
      );
      CREATE TABLE mensagens (
        id TEXT PRIMARY KEY,
        sessao_id TEXT,
        agente TEXT,
        role TEXT,
        conteudo TEXT,
        criado_em TEXT
      );
      CREATE TABLE acoes_agentes (
        id TEXT PRIMARY KEY,
        trace_id TEXT,
        span_id TEXT,
        parent_span_id TEXT,
        sessao_id TEXT,
        agente TEXT,
        modelo TEXT,
        workspace TEXT,
        tipo_acao TEXT,
        ferramenta TEXT,
        comando_resumo TEXT,
        input_json TEXT,
        output_json TEXT,
        status TEXT,
        duracao_ms INTEGER,
        tokens_prompt INTEGER,
        tokens_saida INTEGER,
        custo_usd REAL,
        erro TEXT,
        criado_em TEXT
      );

      INSERT INTO sessoes VALUES ('sessao-legada-1', 'analista', 'claude-3-haiku', '2026-09-13T10:00:00.000Z', '2026-09-13T10:05:00.000Z', 0.0452, 'executando');
      INSERT INTO execucoes VALUES ('exec-legada-1', 'arquiteto', 'gpt-4o', 'cron', 'job-audit', 'sucesso', '2026-09-13T11:00:00.000Z', '2026-09-13T11:02:00.000Z', 120000, 0.0125, 0, NULL);
      INSERT INTO mensagens VALUES ('msg-corp-1', 'sessao-legada-1', 'analista', 'assistant', 'Análise de métricas pronta.', '2026-09-13T10:02:00.000Z');
      INSERT INTO acoes_agentes VALUES ('acao-1', 'tr-1', 'sp-1', NULL, 'sessao-legada-1', 'analista', 'claude-3-haiku', 'ws-test', 'tool', 'ler_arquivo', 'read log', '{"path":"a"}', '{"ok":true}', 'sucesso', 250, 100, 50, 0.0050, NULL, '2026-09-13T10:01:00.000Z');
    `);
    corpDb.close();

    // 2. Cria tasks.db legado simulado
    const tasksDb = new Database(join(opencorpDir, "tasks.db"));
    tasksDb.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        titulo TEXT NOT NULL,
        descricao TEXT,
        coluna TEXT,
        pos REAL,
        prioridade TEXT,
        labels TEXT,
        responsavel TEXT,
        due TEXT,
        task_pai TEXT,
        bloqueado_por TEXT,
        lock_por TEXT,
        lock_expira TEXT,
        criado_por TEXT,
        criado_em TEXT,
        atualizado_em TEXT
      );
      CREATE TABLE task_mensagens (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        autor TEXT,
        tipo TEXT,
        corpo TEXT,
        menciona TEXT,
        refs TEXT,
        criado_em TEXT
      );

      INSERT INTO tasks VALUES (
        'task-1', 'Definir arquitetura', 'Especificar Tríade', 'fazendo', 1.0, 'alta',
        'urgente, backend, bug', 'arquiteto', '2026-09-20T18:00:00.000Z', NULL, '',
        NULL, NULL, 'ceo', '2026-09-13T09:00:00.000Z', '2026-09-13T09:30:00.000Z'
      );
      INSERT INTO tasks VALUES (
        'task-2', 'Implementar UI', 'Telas SolidJS', 'backlog', 2.0, 'media',
        'frontend', 'frontend-dev', NULL, NULL, 'task-1',
        NULL, NULL, 'ceo', '2026-09-13T09:10:00.000Z', '2026-09-13T09:10:00.000Z'
      );

      INSERT INTO task_mensagens VALUES (
        'tm-1', 'task-1', 'arquiteto', 'comentario',
        'Primeiro rascunho anexado.', 'ceo', 'doc-1', '2026-09-13T09:15:00.000Z'
      );
    `);
    tasksDb.close();

    // 3. Cria notifications.json simulado
    const notifs = [
      {
        id: "notif-1",
        titulo: "Alerta de Backup",
        corpo: "Backup diário concluído",
        tipo: "info",
        lida: true,
        criado_em: "2026-09-13T08:00:00.000Z",
      },
      {
        id: "notif-2",
        titulo: "Falha de execução",
        corpo: "Timeout na tool bash",
        tipo: "erro",
        lida: false,
        criado_em: "2026-09-13T08:30:00.000Z",
      },
    ];
    writeFileSync(join(opencorpDir, "notifications.json"), JSON.stringify(notifs, null, 2), "utf8");
  });

  afterEach(() => {
    rmSync(tmpWsDir, { recursive: true, force: true });
  });

  it("deve executar migração completa, gerar backup e preservar integridade relacional", () => {
    const resultado = migrarWorkspaceParaSchemaConsolidado(tmpWsDir, { backup: true });

    expect(resultado.sucesso).toBe(true);
    expect(resultado.backupPath).toBeTruthy();
    expect(existsSync(resultado.backupPath!)).toBe(true);

    // Valida que os arquivos de backup existem
    expect(existsSync(join(resultado.backupPath!, "corp.db"))).toBe(true);
    expect(existsSync(join(resultado.backupPath!, "tasks.db"))).toBe(true);
    expect(existsSync(join(resultado.backupPath!, "notifications.json"))).toBe(true);

    // Valida o banco consolidado gerado
    const dbNovo = new Database(join(opencorpDir, "opencorp.db"), { readonly: true });
    try {
      // 1. Tasks e Normalização de CSV
      const tasks = dbNovo.prepare("SELECT * FROM tasks ORDER BY id ASC").all() as any[];
      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe("task-1");
      expect(tasks[0].titulo).toBe("Definir arquitetura");
      expect(tasks[0].prioridade).toBe("alta");

      // Labels normalizadas (3 de task-1 + 1 de task-2)
      const labels = dbNovo.prepare("SELECT * FROM task_labels ORDER BY task_id, label ASC").all() as any[];
      expect(labels).toHaveLength(4);
      expect(labels.filter((l) => l.task_id === "task-1").map((l) => l.label)).toEqual(["backend", "bug", "urgente"]);
      expect(labels.filter((l) => l.task_id === "task-2").map((l) => l.label)).toEqual(["frontend"]);

      // Dependências normalizadas (task-2 bloqueada por task-1)
      const deps = dbNovo.prepare("SELECT * FROM task_dependencies").all() as any[];
      expect(deps).toHaveLength(1);
      expect(deps[0]).toEqual({ task_id: "task-2", bloqueado_por_task_id: "task-1" });

      // 2. Conversão de Valores Monetários para Inteiros (Microdólares)
      const sessao1 = dbNovo.prepare("SELECT * FROM sessions WHERE id = 'sessao-legada-1'").get() as any;
      expect(sessao1).toBeTruthy();
      // 0.0452 * 1_000_000 = 45200
      expect(sessao1.custo_micro_usd).toBe(45200);
      expect(sessao1.status).toBe("executando");

      const exec1 = dbNovo.prepare("SELECT * FROM sessions WHERE id = 'exec-legada-1'").get() as any;
      expect(exec1).toBeTruthy();
      // 0.0125 * 1_000_000 = 12500
      expect(exec1.custo_micro_usd).toBe(12500);
      expect(exec1.status).toBe("concluido");

      // 3. Spans e custos
      const span1 = dbNovo.prepare("SELECT * FROM spans WHERE id = 'acao-1'").get() as any;
      expect(span1).toBeTruthy();
      expect(span1.ferramenta).toBe("ler_arquivo");
      // 0.0050 * 1_000_000 = 5000
      expect(span1.custo_micro_usd).toBe(5000);

      // 4. Mensagens universais (corp.db mensagens + tasks.db task_mensagens)
      const msgs = dbNovo.prepare("SELECT * FROM messages ORDER BY id ASC").all() as any[];
      expect(msgs.length).toBeGreaterThanOrEqual(2);

      const msgCorp = msgs.find((m) => m.id === "msg-corp-1");
      expect(msgCorp).toBeTruthy();
      expect(msgCorp.conteudo).toBe("Análise de métricas pronta.");
      expect(msgCorp.session_id).toBe("sessao-legada-1");

      const msgTask = msgs.find((m) => m.id === "tm-1");
      expect(msgTask).toBeTruthy();
      expect(msgTask.conteudo).toBe("Primeiro rascunho anexado.");
      expect(msgTask.tipo).toBe("comentario");
      expect(msgTask.session_id).toBe("task-sessao-task-1");

      // 5. Notificações
      const notifsMigradas = dbNovo.prepare("SELECT * FROM notifications ORDER BY id ASC").all() as any[];
      expect(notifsMigradas).toHaveLength(2);
      expect(notifsMigradas[0].titulo).toBe("Alerta de Backup");
      expect(notifsMigradas[0].lida).toBe(1);
      expect(notifsMigradas[1].titulo).toBe("Falha de execução");
      expect(notifsMigradas[1].lida).toBe(0);
    } finally {
      dbNovo.close();
    }
  });

  it("deve ser idempotente: rodar a migração duas vezes consecutivas não duplica dados", () => {
    migrarWorkspaceParaSchemaConsolidado(tmpWsDir, { backup: false });
    const res2 = migrarWorkspaceParaSchemaConsolidado(tmpWsDir, { backup: false });

    expect(res2.sucesso).toBe(true);

    const dbNovo = new Database(join(opencorpDir, "opencorp.db"), { readonly: true });
    try {
      const countTasks = dbNovo.prepare("SELECT COUNT(*) as c FROM tasks").get() as any;
      const countLabels = dbNovo.prepare("SELECT COUNT(*) as c FROM task_labels").get() as any;
      const countSessions = dbNovo.prepare("SELECT COUNT(*) as c FROM sessions").get() as any;

      expect(countTasks.c).toBe(2);
      expect(countLabels.c).toBe(4);
      // sessao-legada-1 + exec-legada-1 + task-sessao-task-1 = 3
      expect(countSessions.c).toBe(3);
    } finally {
      dbNovo.close();
    }
  });
});
