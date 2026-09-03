import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { gerarRelatorio } from "../src/cli/commands/relatorio.js";
import { TaskStore } from "../src/core/task-store.js";
import { AgentStore } from "../src/core/agent-store.js";

describe("CLI Features (CLI-06 e CLI-07)", () => {
  let tempWs: string;

  beforeEach(() => {
    tempWs = mkdtempSync(join(tmpdir(), "opencorp-cli-test-"));
    mkdirSync(join(tempWs, ".opencorp", "agents"), { recursive: true });
    mkdirSync(join(tempWs, ".opencorp", "registries", "agentes"), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempWs, { recursive: true, force: true });
    } catch {}
  });

  it("CLI-06: TaskStore retorna lista de tarefas serializável em JSON", async () => {
    const store = new TaskStore();
    await store.criar(tempWs, {
      titulo: "Implementar endpoint de telemetria",
      prioridade: "alta",
      responsavel: "agente:dev",
      coluna: "a_fazer",
    });

    const lista = await store.listar(tempWs);
    expect(lista.length).toBe(1);
    expect(lista[0]?.titulo).toBe("Implementar endpoint de telemetria");

    const jsonStr = JSON.stringify(lista);
    const parsed = JSON.parse(jsonStr);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].prioridade).toBe("alta");
  });

  it("CLI-06: AgentStore retorna lista serializável em JSON", async () => {
    const store = new AgentStore();
    await store.criar(tempWs, "pesquisador-metricas", {
      model: "openrouter/nvidia/nemotron-3.5-lightning:free",
    });

    const agentes = await store.listar(tempWs);
    expect(agentes.length).toBeGreaterThan(0);
    const alvo = agentes.find((a) => a.id === "pesquisador-metricas");
    expect(alvo).toBeDefined();

    const jsonStr = JSON.stringify(agentes);
    const parsed = JSON.parse(jsonStr);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("CLI-07: gerarRelatorio calcula métricas e taxa de sucesso corretamente", () => {
    const dbPath = join(tempWs, ".opencorp", "corp.db");
    const db = new Database(dbPath);

    db.exec(`
      CREATE TABLE execucoes (
        id TEXT PRIMARY KEY,
        agente TEXT NOT NULL,
        modelo TEXT,
        status TEXT NOT NULL,
        exit_code INTEGER,
        duracao_ms INTEGER,
        inicio TEXT NOT NULL,
        fim TEXT,
        erro TEXT
      );
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        titulo TEXT NOT NULL,
        coluna TEXT NOT NULL
      );
    `);

    const hoje = new Date().toISOString().slice(0, 10);
    db.prepare(`
      INSERT INTO execucoes (id, agente, modelo, status, exit_code, duracao_ms, inicio)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("exec-1", "agente-a", "model-x", "concluido", 0, 10000, `${hoje}T10:00:00Z`);

    db.prepare(`
      INSERT INTO execucoes (id, agente, modelo, status, exit_code, duracao_ms, inicio, erro)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("exec-2", "agente-a", "model-x", "falhou", 1, 5000, `${hoje}T10:15:00Z`, "Timeout de conexao");

    db.prepare(`
      INSERT INTO execucoes (id, agente, modelo, status, exit_code, duracao_ms, inicio)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("exec-3", "agente-b", "model-y", "concluido", 0, 20000, `${hoje}T10:30:00Z`);

    db.prepare("INSERT INTO tasks (id, titulo, coluna) VALUES (?, ?, ?)").run("t1", "Task 1", "fazendo");
    db.prepare("INSERT INTO tasks (id, titulo, coluna) VALUES (?, ?, ?)").run("t2", "Task 2", "concluido");

    db.close();

    const relatorio = gerarRelatorio(tempWs, "teste-ws", true);

    expect(relatorio.workspace).toBe("teste-ws");
    expect(relatorio.total_execucoes).toBe(3);
    expect(relatorio.concluidas).toBe(2);
    expect(relatorio.falhas).toBe(1);
    expect(relatorio.taxa_sucesso_pct).toBe(66.7);
    expect(relatorio.duracao_media_s).toBe(11.7); // (10+5+20)/3 = 11.666... -> 11.7
    expect(relatorio.agentes.length).toBe(2);
    expect(relatorio.modelos.length).toBe(2);
    expect(relatorio.top_erros[0]?.erro).toBe("Timeout de conexao");
    expect(relatorio.kanban?.total).toBe(2);
    expect(relatorio.kanban?.colunas.fazendo).toBe(1);
    expect(relatorio.kanban?.colunas.concluido).toBe(1);
  });
});
