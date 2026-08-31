import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TeamStore } from "../src/core/team-store.js";
import { FlowStore } from "../src/core/flow-store.js";
import { migrarTeamsParaFlows, specTeamParaFlow } from "../src/core/flow-migrate.js";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "opencorp-migra-"));
});

const ws = (): string => {
  const path = join(home, "workspaces", "test-ws");
  require("node:fs").mkdirSync(join(path, ".opencorp", "teams"), { recursive: true });
  require("node:fs").mkdirSync(join(path, ".opencorp", "flows"), { recursive: true });
  return path;
};

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("fusão team×fluxo — migração (PLANO-WEB-CRUD F3)", () => {
  it("converte pipeline em sequência de nós agente", () => {
    const flow = specTeamParaFlow({
      id: "rev-docs",
      titulo: "Revisão de docs",
      padrao: "pipeline",
      passos: [
        { agente: "editor", ordem: "escreva {{entrada}}" },
        { agente: "revisor", ordem: "revise {{anterior}}" },
      ],
      criado_em: new Date().toISOString(),
    } as never);
    expect(flow.nos.map(n => n.tipo)).toEqual(["manual", "agente", "agente"]);
    expect(flow.arestas).toEqual([
      { de: "gatilho", para: "passo-1" },
      { de: "passo-1", para: "passo-2" },
    ]);
    expect(flow.nos[1]!.config).toEqual({ agente: "editor", ordem: "escreva {{entrada}}" });
  });

  it("converte fanout/review/debate nos nós próprios", () => {
    const base = { id: "x", titulo: "X", criado_em: new Date().toISOString() };
    const fanout = specTeamParaFlow({ ...base, padrao: "fanout", paralelos: [{ agente: "a", ordem: "o" }, { agente: "b", ordem: "o" }], sintese: { agente: "s", ordem: "s" } } as never);
    expect(fanout.nos[1]!.tipo).toBe("fanout");
    expect(fanout.nos[1]!.config.paralelos[0]).toEqual({ agente: "a", ordem: "o" });
    expect(fanout.nos[1]!.config.sintese).toEqual({ agente: "s", ordem: "s" });
    const review = specTeamParaFlow({ ...base, padrao: "review", executor: { agente: "e", ordem: "o" }, revisor: { agente: "r", ordem: "o" }, turnos: 3 } as never);
    expect(review.nos[1]!.tipo).toBe("review");
    expect(review.nos[1]!.config.turnos).toBe(3);
    const debate = specTeamParaFlow({ ...base, padrao: "debate", proponentes: [{ agente: "p1", ordem: "o" }, { agente: "p2", ordem: "o" }], moderador: { agente: "m" } } as never);
    expect(debate.nos[1]!.tipo).toBe("debate");
    expect(debate.nos[1]!.config.moderador).toEqual({ agente: "m" });
  });

  it("migra team legado → flow criado + team arquivado (.json.migrado)", async () => {
    const path = ws();
    const teams = new TeamStore();
    const flows = new FlowStore({ homeDir: home });
    await teams.criar(path, {
      id: "e2e-pipe",
      titulo: "Pipe e2e",
      padrao: "pipeline",
      passos: [{ agente: "editor", ordem: "faça" }, { agente: "revisor", ordem: "revise" }],
    });

    const res = await migrarTeamsParaFlows(path, teams, flows);
    expect(res.criados).toEqual(["e2e-pipe"]);
    expect(res.pulados).toEqual([]);

    const flow = await flows.obter(path, "e2e-pipe");
    expect(flow.nome).toBe("Pipe e2e");
    expect(flow.nos).toHaveLength(3);

    // team arquivado: sai da listagem e o arquivo vira .json.migrado
    expect(teams.listar(path).map(t => t.id)).not.toContain("e2e-pipe");
    expect(existsSync(join(path, ".opencorp", "teams", "e2e-pipe.json.migrado"))).toBe(true);
    const original = JSON.parse(readFileSync(join(path, ".opencorp", "teams", "e2e-pipe.json.migrado"), "utf8"));
    expect(original.padrao).toBe("pipeline");
  });

  it("é idempotente — segunda rodada não duplica nem reclama", async () => {
    const path = ws();
    const teams = new TeamStore();
    const flows = new FlowStore({ homeDir: home });
    await teams.criar(path, {
      id: "unico",
      titulo: "Único",
      padrao: "fanout",
      paralelos: [{ agente: "a", ordem: "o" }, { agente: "b", ordem: "o" }],
    });

    const primeira = await migrarTeamsParaFlows(path, teams, flows);
    expect(primeira.criados).toEqual(["unico"]);

    const segunda = await migrarTeamsParaFlows(path, teams, flows);
    expect(segunda.criados).toEqual([]);
    expect(segunda.pulados).toEqual([]); // team arquivado → nem aparece
    expect((await flows.listar(path)).length).toBe(1);
  });
});
