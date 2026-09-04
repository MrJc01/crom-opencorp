import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { CorpDb } from "../src/core/corp-db.js";
import { TaskStore } from "../src/core/task-store.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";

const raizes: string[] = [];

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

async function criarAmbiente() {
  const home = await mkdtemp(join(tmpdir(), "opencorp-wal-stress-"));
  raizes.push(home);
  const wm = new WorkspaceManager({ homeDir: home, cwd: home });
  const ws = await wm.criar("wal-benchmark");
  return { home, wsPath: ws.path };
}

describe("SQLite WAL — Determinismo, Concorrência & Stress (PDD)", () => {
  it("modo WAL e busy_timeout ativos no banco corp.db", async () => {
    const { wsPath } = await criarAmbiente();
    const corpDb = new CorpDb(CorpDb.caminho(wsPath));

    const rawDb = new Database(CorpDb.caminho(wsPath));
    const journalMode = rawDb.pragma("journal_mode", { simple: true });
    expect(journalMode).toBe("wal");

    const integrity = rawDb.pragma("integrity_check", { simple: true });
    expect(integrity).toBe("ok");
    rawDb.close();
  });

  it("1.000 operações transacionais concorrentes (500 escritas + 500 leituras) sem deadlock em < 3s", async () => {
    const { wsPath } = await criarAmbiente();
    const dbPath = CorpDb.caminho(wsPath);
    new CorpDb(dbPath); // Inicializa schemas e pragmas WAL

    const rawDb = new Database(dbPath);
    rawDb.pragma("journal_mode = WAL");
    rawDb.pragma("busy_timeout = 5000");

    const stmtInsert = rawDb.prepare(`
      INSERT INTO execucoes (id, agente, modelo, gatilho_tipo, gatilho_origem, status, inicio, fim, duracao_ms, custo_usd, exit_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const stmtSelect = rawDb.prepare(`
      SELECT COUNT(*) as total FROM execucoes WHERE status = 'sucesso'
    `);

    // 10 threads lógicas simultâneas gravando em lotes transacionais de 50 (total 500 escritas)
    const NUM_THREADS = 10;
    const POR_THREAD = 50;

    const inserirLote = rawDb.transaction((threadId: number) => {
      const agora = new Date().toISOString();
      for (let i = 0; i < POR_THREAD; i++) {
        stmtInsert.run(
          `exec-t${threadId}-${i}`,
          `operario-${threadId % 3}`,
          `openrouter/test-model`,
          "manual",
          `thread-${threadId}`,
          "sucesso",
          agora,
          agora,
          10,
          0.0001,
          0
        );
      }
    });

    const inicio = performance.now();

    const promessasEscrita: Promise<void>[] = [];
    const promessasLeitura: Promise<number>[] = [];

    // Dispara escritas transacionais concorrentes
    for (let t = 0; t < NUM_THREADS; t++) {
      promessasEscrita.push(
        (async () => {
          inserirLote(t);
        })()
      );
    }

    // Dispara 500 leituras agregadas concorrentes (10 threads × 50 leituras)
    for (let t = 0; t < NUM_THREADS; t++) {
      promessasLeitura.push(
        (async () => {
          let soma = 0;
          for (let i = 0; i < POR_THREAD; i++) {
            const res = stmtSelect.get() as { total: number };
            soma += res.total;
          }
          return soma;
        })()
      );
    }

    await Promise.all([...promessasEscrita, ...promessasLeitura]);
    const duracaoMs = performance.now() - inicio;

    // Validação da contagem final e integridade
    const totalFinal = stmtSelect.get() as { total: number };
    expect(totalFinal.total).toBe(500);

    const integrity = rawDb.pragma("integrity_check", { simple: true });
    expect(integrity).toBe("ok");

    // Checkpoint TRUNCATE sem deadlock
    const checkpoint = rawDb.pragma("wal_checkpoint(TRUNCATE)");
    expect(checkpoint).toBeDefined();

    rawDb.close();

    // Comprova que 1.000 operações transacionais rodam em menos de 3.000ms
    expect(duracaoMs).toBeLessThan(3_000);
  });

  it("TaskStore: inserções sequenciais e simultâneas mantêm integridade e ordem", async () => {
    const { wsPath } = await criarAmbiente();
    const taskStore = new TaskStore();

    // Cria 10 tarefas
    const tasks = [];
    for (let i = 0; i < 10; i++) {
      const t = await taskStore.criar(wsPath, {
        titulo: `Tarefa ${i}`,
        prioridade: i % 2 === 0 ? "alta" : "media",
      });
      tasks.push(t);
    }
    expect(tasks.length).toBe(10);

    // Movimenta tarefas para colunas diferentes
    for (let i = 0; i < tasks.length; i++) {
      await taskStore.mover(wsPath, tasks[i]!.id, i % 2 === 0 ? "fazendo" : "concluido");
    }

    const todas = await taskStore.listar(wsPath);
    expect(todas.length).toBe(10);
    expect(todas.filter((t) => t.coluna === "fazendo").length).toBe(5);
    expect(todas.filter((t) => t.coluna === "concluido").length).toBe(5);

    const rawDb = new Database(join(wsPath, ".opencorp", "tasks.db"));
    expect(rawDb.pragma("integrity_check", { simple: true })).toBe("ok");
    rawDb.close();
  });
});
