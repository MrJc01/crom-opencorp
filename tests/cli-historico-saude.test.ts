import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CorpDb } from "../src/core/corp-db.js";

describe("CLI de Histórico e Saúde — Integridade de Dados", () => {
  let tempWs: string;
  let db: CorpDb;

  beforeEach(() => {
    tempWs = mkdtempSync(join(tmpdir(), "opencorp-cli-test-"));
    mkdirSync(join(tempWs, ".opencorp"), { recursive: true });
    db = new CorpDb(CorpDb.caminho(tempWs));
  });

  afterEach(() => {
    try {
      db.fechar();
      rmSync(tempWs, { recursive: true, force: true });
    } catch {}
  });

  it("filtra execuções falhas e recupera mensagem de erro registrada", () => {
    db.upsertExecucao({
      id: "exec-sucesso-1",
      agente: "editor",
      modelo: "openrouter/minimax/minimax-m3:free",
      gatilho_tipo: "cron",
      gatilho_origem: "sch-1",
      status: "concluido",
      inicio: "2026-09-03T10:00:00.000Z",
      fim: "2026-09-03T10:01:00.000Z",
      duracao_ms: 60000,
      custo_usd: 0,
      exit_code: 0,
      erro: null,
    });

    db.upsertExecucao({
      id: "exec-falha-1",
      agente: "critico-site",
      modelo: "openrouter/nvidia/nemotron-3.5-lightning:free",
      gatilho_tipo: "cron",
      gatilho_origem: "sch-2",
      status: "falhou",
      inicio: "2026-09-03T11:00:00.000Z",
      fim: "2026-09-03T11:00:15.000Z",
      duracao_ms: 15000,
      custo_usd: 0,
      exit_code: 1,
      erro: "Error: 429 Rate limit reached",
    });

    const todas = db.listarExecucoes({});
    expect(todas).toHaveLength(2);

    const apenasFalhas = db.listarExecucoes({ status: "falhou" });
    expect(apenasFalhas).toHaveLength(1);
    expect(apenasFalhas[0]!.id).toBe("exec-falha-1");
    expect(apenasFalhas[0]!.erro).toBe("Error: 429 Rate limit reached");
  });

  it("armazena e recupera notas operacionais no contexto.json", () => {
    const contexto = {
      categoria: "ecommerce",
      notas_operacionais: ["Frete grátis acima de R$ 200"],
    };
    const contextoPath = join(tempWs, ".opencorp", "contexto.json");
    writeFileSync(contextoPath, JSON.stringify(contexto, null, 2));

    const lido = JSON.parse(writeFileSync ? require("node:fs").readFileSync(contextoPath, "utf8") : "{}");
    expect(lido.categoria).toBe("ecommerce");
    expect(lido.notas_operacionais).toContain("Frete grátis acima de R$ 200");
  });
});
