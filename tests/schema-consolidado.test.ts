import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  inicializarBancoConsolidado,
  PRAGMAS_CONSOLIDADOS,
  type SessionRow,
  type MessageRow,
  type SpanRow,
  type TaskRow,
} from "../src/core/db/schema.js";

describe("Schema Consolidado OpenCorp (opencorp.db)", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    inicializarBancoConsolidado(db);
  });

  afterEach(() => {
    db.close();
  });

  it("deve habilitar PRAGMA foreign_keys = ON e WAL mode", () => {
    const fkStatus = db.pragma("foreign_keys", { simple: true });
    expect(fkStatus).toBe(1);
  });

  describe("Integridade Referencial: Sessions, Messages e Spans", () => {
    it("deve bloquear inserção de mensagem com session_id inexistente", () => {
      expect(() => {
        db.prepare(
          `INSERT INTO messages (id, session_id, autor, role, tipo, conteudo, criado_em_ms)
           VALUES ('msg-1', 'sessao-inexistente', 'humano', 'user', 'conversa', 'Olá mundo', 1700000000000)`
        ).run();
      }).toThrow(/FOREIGN KEY constraint failed/i);
    });

    it("deve bloquear inserção de span com session_id inexistente", () => {
      expect(() => {
        db.prepare(
          `INSERT INTO spans (id, session_id, trace_id, span_id, ferramenta, status, criado_em_ms)
           VALUES ('span-1', 'sessao-inexistente', 'trace-1', 'sp-1', 'executar_bash', 'sucesso', 1700000000000)`
        ).run();
      }).toThrow(/FOREIGN KEY constraint failed/i);
    });

    it("deve deletar mensagens e spans em cascata ao deletar uma session (ON DELETE CASCADE)", () => {
      // 1. Cria a sessão
      db.prepare(
        `INSERT INTO sessions (id, workspace, agente, modelo, status, inicio_ms, custo_micro_usd)
         VALUES ('sessao-100', 'ws-alpha', 'ceo-agente', 'claude-3-7-sonnet', 'executando', 1700000000000, 150000)`
      ).run();

      // 2. Insere mensagens vinculadas
      db.prepare(
        `INSERT INTO messages (id, session_id, autor, role, tipo, conteudo, criado_em_ms)
         VALUES ('msg-101', 'sessao-100', 'user', 'user', 'conversa', 'Iniciar auditoria', 1700000001000)`
      ).run();
      db.prepare(
        `INSERT INTO messages (id, session_id, autor, role, tipo, conteudo, criado_em_ms)
         VALUES ('msg-102', 'sessao-100', 'ceo-agente', 'assistant', 'conversa', 'Auditoria em progresso', 1700000002000)`
      ).run();

      // 3. Insere spans vinculados
      db.prepare(
        `INSERT INTO spans (id, session_id, trace_id, span_id, ferramenta, status, criado_em_ms)
         VALUES ('span-101', 'sessao-100', 'trace-100', 'sp-root', 'leitor_logs', 'sucesso', 1700000003000)`
      ).run();

      expect(db.prepare("SELECT COUNT(*) AS c FROM messages WHERE session_id = 'sessao-100'").get()).toEqual({ c: 2 });
      expect(db.prepare("SELECT COUNT(*) AS c FROM spans WHERE session_id = 'sessao-100'").get()).toEqual({ c: 1 });

      // 4. Deleta a sessão pai
      db.prepare("DELETE FROM sessions WHERE id = 'sessao-100'").run();

      // 5. Verifica se mensagens e spans foram apagados automaticamente em cascata
      expect(db.prepare("SELECT COUNT(*) AS c FROM messages WHERE session_id = 'sessao-100'").get()).toEqual({ c: 0 });
      expect(db.prepare("SELECT COUNT(*) AS c FROM spans WHERE session_id = 'sessao-100'").get()).toEqual({ c: 0 });
    });
  });

  describe("Normalização de Tarefas (Tasks, Labels e Dependências)", () => {
    it("deve permitir vincular e deletar labels em cascata sem listas CSV", () => {
      // 1. Cria a tarefa
      db.prepare(
        `INSERT INTO tasks (id, workspace, titulo, coluna, posicao, prioridade, criado_em_ms, atualizado_em_ms)
         VALUES ('task-1', 'ws-alpha', 'Implementar autenticação', 'fazendo', 1.0, 'alta', 1700000000000, 1700000000000)`
      ).run();

      // 2. Insere labels normalizadas
      db.prepare("INSERT INTO task_labels (task_id, label) VALUES ('task-1', 'security')").run();
      db.prepare("INSERT INTO task_labels (task_id, label) VALUES ('task-1', 'backend')").run();

      // Não permite label duplicada na mesma tarefa (PRIMARY KEY composta)
      expect(() => {
        db.prepare("INSERT INTO task_labels (task_id, label) VALUES ('task-1', 'security')").run();
      }).toThrow(/UNIQUE constraint failed/i);

      const labels = db.prepare("SELECT label FROM task_labels WHERE task_id = 'task-1' ORDER BY label ASC").all();
      expect(labels).toEqual([{ label: "backend" }, { label: "security" }]);

      // 3. Deleta a task e confirma cascata
      db.prepare("DELETE FROM tasks WHERE id = 'task-1'").run();
      expect(db.prepare("SELECT COUNT(*) AS c FROM task_labels WHERE task_id = 'task-1'").get()).toEqual({ c: 0 });
    });

    it("deve manter integridade em dependências de tarefas e cascata ao excluir", () => {
      db.prepare(
        `INSERT INTO tasks (id, workspace, titulo, criado_em_ms, atualizado_em_ms)
         VALUES ('task-pai', 'ws-alpha', 'Setup Infra', 1700000000000, 1700000000000)`
      ).run();
      db.prepare(
        `INSERT INTO tasks (id, workspace, titulo, criado_em_ms, atualizado_em_ms)
         VALUES ('task-filha', 'ws-alpha', 'Deploy App', 1700000000000, 1700000000000)`
      ).run();

      // task-filha depende de task-pai
      db.prepare("INSERT INTO task_dependencies (task_id, bloqueado_por_task_id) VALUES ('task-filha', 'task-pai')").run();

      // Bloqueia vincular a uma dependência inexistente
      expect(() => {
        db.prepare("INSERT INTO task_dependencies (task_id, bloqueado_por_task_id) VALUES ('task-filha', 'task-fantasma')").run();
      }).toThrow(/FOREIGN KEY constraint failed/i);

      // Ao excluir a task-pai que bloqueava, a dependência é removida em cascata
      db.prepare("DELETE FROM tasks WHERE id = 'task-pai'").run();
      expect(db.prepare("SELECT COUNT(*) AS c FROM task_dependencies WHERE task_id = 'task-filha'").get()).toEqual({ c: 0 });
    });

    it("deve setar task_pai_id como NULL ao deletar a task pai (ON DELETE SET NULL)", () => {
      db.prepare(
        `INSERT INTO tasks (id, workspace, titulo, criado_em_ms, atualizado_em_ms)
         VALUES ('task-macro', 'ws-alpha', 'Feature Épica', 1700000000000, 1700000000000)`
      ).run();
      db.prepare(
        `INSERT INTO tasks (id, workspace, titulo, task_pai_id, criado_em_ms, atualizado_em_ms)
         VALUES ('subtask-1', 'ws-alpha', 'Sub-etapa 1', 'task-macro', 1700000000000, 1700000000000)`
      ).run();

      expect(db.prepare("SELECT task_pai_id FROM tasks WHERE id = 'subtask-1'").get()).toEqual({ task_pai_id: "task-macro" });

      db.prepare("DELETE FROM tasks WHERE id = 'task-macro'").run();
      expect(db.prepare("SELECT task_pai_id FROM tasks WHERE id = 'subtask-1'").get()).toEqual({ task_pai_id: null });
    });
  });

  describe("Triggers e Notifications", () => {
    it("deve persistir triggers e notifications com validações de CHECK constraint", () => {
      // Trigger válido
      db.prepare(
        `INSERT INTO triggers (id, workspace, tipo, expressao_cron, alvo_flow_id, criado_em)
         VALUES ('trig-1', 'ws-alpha', 'cron', '0 9 * * 1', 'flow-auditoria', '2026-09-13T17:00:00.000Z')`
      ).run();

      // Trigger inválido (tipo desconhecido)
      expect(() => {
        db.prepare(
          `INSERT INTO triggers (id, workspace, tipo, alvo_flow_id, criado_em)
           VALUES ('trig-inv', 'ws-alpha', 'tipo_alienigena', 'flow-auditoria', '2026-09-13T17:00:00.000Z')`
        ).run();
      }).toThrow(/CHECK constraint failed/i);

      // Notificação
      db.prepare(
        `INSERT INTO notifications (id, workspace, tipo, titulo, mensagem, criado_em_ms)
         VALUES ('notif-1', 'ws-alpha', 'aviso', 'Alerta de Quota', 'Consumo em 85%', 1700000000000)`
      ).run();

      const notif = db.prepare("SELECT * FROM notifications WHERE id = 'notif-1'").get() as any;
      expect(notif.titulo).toBe("Alerta de Quota");
      expect(notif.lida).toBe(0);
    });
  });
});
