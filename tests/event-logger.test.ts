import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { eventLogger, EventLogger } from "../src/core/event-logger.js";
import { eventBus } from "../src/core/event-bus.js";

describe("EventLogger e Logs Contínuos (LOG-01)", () => {
  let tempWs: string;

  beforeEach(() => {
    tempWs = mkdtempSync(join(tmpdir(), "opencorp-log-test-"));
    mkdirSync(join(tempWs, ".opencorp", "logs"), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempWs, { recursive: true, force: true });
    } catch {}
  });

  it("registra entrada estruturada manualmente no workspace", () => {
    eventLogger.registrar(
      {
        nivel: "info",
        tipo: "deploy.sucesso",
        workspace: "teste-ws",
        resumo: "Deploy v2 realizado com sucesso",
        dados: { versao: "2.0.0" },
      },
      tempWs,
    );

    const logPath = join(tempWs, ".opencorp", "logs", "events.jsonl");
    expect(existsSync(logPath)).toBe(true);

    const linhas = readFileSync(logPath, "utf8").trim().split("\n");
    expect(linhas.length).toBeGreaterThanOrEqual(1);

    const ultima = JSON.parse(linhas[linhas.length - 1]!);
    expect(ultima.nivel).toBe("info");
    expect(ultima.tipo).toBe("deploy.sucesso");
    expect(ultima.resumo).toBe("Deploy v2 realizado com sucesso");
    expect(ultima.dados.versao).toBe("2.0.0");
  });

  it("captura eventos emitidos no eventBus e infere nível de log corretamente", () => {
    // Dispara evento normal
    eventBus.emit("task.criada", {
      id: "tsk-teste-1",
      titulo: "Escrever SOP",
      ws_path: tempWs,
      workspace: "teste-ws",
    });

    // Dispara evento de erro
    eventBus.emit("secretario.erro", {
      erro: "Falha ao conectar no upstream",
      ws_path: tempWs,
      workspace: "teste-ws",
    });

    const logs = eventLogger.lerLogs(tempWs, { limite: 10 });
    expect(logs.length).toBeGreaterThanOrEqual(2);

    const logTask = logs.find((l) => l.tipo === "task.criada");
    expect(logTask).toBeDefined();
    expect(logTask?.nivel).toBe("info");

    const logErro = logs.find((l) => l.tipo === "secretario.erro");
    expect(logErro).toBeDefined();
    expect(logErro?.nivel).toBe("erro");
  });

  it("filtra logs por nível e respeita limites", () => {
    eventLogger.registrar(
      {
        nivel: "erro",
        tipo: "banco.falha",
        workspace: "teste-ws",
        resumo: "Erro de lock no SQLite",
        dados: {},
      },
      tempWs,
    );

    const apenasErros = eventLogger.lerLogs(tempWs, { nivel: "erro" });
    expect(apenasErros.every((e) => e.nivel === "erro")).toBe(true);
    expect(apenasErros.some((e) => e.tipo === "banco.falha")).toBe(true);

    const limitado = eventLogger.lerLogs(tempWs, { limite: 1 });
    expect(limitado.length).toBeLessThanOrEqual(1);
  });
});
