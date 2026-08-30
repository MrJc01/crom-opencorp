import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirRecursive } from "../src/utils/fs-safe.js";
import { TeamStore, validarPadrao } from "../src/core/team-store.js";
import { TeamError } from "../src/core/errors.js";

const raizes: string[] = [];

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

let relogio = 0;
let wsPath = "";
let store: TeamStore;

beforeEach(async () => {
  const home = await mkdtemp(join(tmpdir(), "opencorp-team-"));
  raizes.push(home);
  const { WorkspaceManager } = await import("../src/core/workspace-manager.js");
  const ws = await new WorkspaceManager({ homeDir: home, cwd: home }).criar("corp-team");
  wsPath = ws.path;
  relogio = Date.now();
  store = new TeamStore();
});

describe("TeamStore — CRUD e listagem", () => {
  it("cria team pipeline com 2 passos, salva JSON válido e lista resumo", async () => {
    const team = await store.criar(wsPath, {
      id: "meu-pipeline",
      titulo: "Meu Pipeline",
      padrao: "pipeline",
      passos: [
        { agente: "a", ordem: "x {{entrada}}" },
        { agente: "b", ordem: "y" },
      ],
    });
    expect(team.id).toBe("meu-pipeline");
    expect(team.titulo).toBe("Meu Pipeline");
    expect(team.padrao).toBe("pipeline");
    expect(team.passos).toHaveLength(2);
    expect(team.criado_em).toBeDefined();

    const lista = store.listar(wsPath);
    expect(lista).toEqual([
      { id: "meu-pipeline", titulo: "Meu Pipeline", padrao: "pipeline", passos: 2 },
    ]);
  });

  it("valida exigências por padrão", async () => {
    // fanout sem paralelos
    await expect(
      store.criar(wsPath, { id: "fanout-ruim", titulo: "Fanout", padrao: "fanout" }),
    ).rejects.toThrow(TeamError);
    await expect(
      store.criar(wsPath, { id: "fanout-ruim", titulo: "Fanout", padrao: "fanout" }),
    ).rejects.toThrow(/paralelos/);

    // review sem revisor
    await expect(
      store.criar(wsPath, {
        id: "review-ruim",
        titulo: "Review",
        padrao: "review",
        executor: { agente: "a", ordem: "x" },
      }),
    ).rejects.toThrow(TeamError);
    await expect(
      store.criar(wsPath, {
        id: "review-ruim",
        titulo: "Review",
        padrao: "review",
        executor: { agente: "a", ordem: "x" },
      }),
    ).rejects.toThrow(/revisor/);

    // debate com 1 proponente
    await expect(
      store.criar(wsPath, {
        id: "debate-ruim",
        titulo: "Debate",
        padrao: "debate",
        proponentes: [{ agente: "a", ordem: "x" }],
        moderador: { agente: "mod" },
      }),
    ).rejects.toThrow(TeamError);
    await expect(
      store.criar(wsPath, {
        id: "debate-ruim",
        titulo: "Debate",
        padrao: "debate",
        proponentes: [{ agente: "a", ordem: "x" }],
        moderador: { agente: "mod" },
      }),
    ).rejects.toThrow(/proponentes/);

    // pipeline sem passos
    await expect(
      store.criar(wsPath, { id: "pipe-ruim", titulo: "Pipe", padrao: "pipeline" }),
    ).rejects.toThrow(TeamError);
    await expect(
      store.criar(wsPath, { id: "pipe-ruim", titulo: "Pipe", padrao: "pipeline" }),
    ).rejects.toThrow(/passos/);
  });

  it("recusa id fora de kebab-case", async () => {
    await expect(
      store.criar(wsPath, { id: "Meu Team", titulo: "X", padrao: "pipeline", passos: [{ agente: "a", ordem: "x" }] }),
    ).rejects.toThrow(TeamError);
  });

  it("obter inexistente lança TeamError com status 404", () => {
    expect(() => store.obter(wsPath, "nao-existe")).toThrow(TeamError);
    try {
      store.obter(wsPath, "nao-existe");
    } catch (e) {
      expect((e as { status?: number }).status).toBe(404);
      expect((e as Error).message).toContain('team "nao-existe" não encontrado');
    }
  });

  it("arquivo JSON inválido é ignorado em listar mas obter dá erro claro", async () => {
    const teamsDir = join(wsPath, ".opencorp", "teams");
    await mkdirRecursive(teamsDir);
    await writeFile(join(teamsDir, "quebrado.json"), "{ nao e json }", "utf8");

    const lista = store.listar(wsPath);
    expect(lista).toEqual([]);

    expect(() => store.obter(wsPath, "quebrado")).toThrow(TeamError);
    try {
      store.obter(wsPath, "quebrado");
    } catch (e) {
      expect((e as Error).message).toContain("JSON inválido");
    }
  });

  it("exclui team", async () => {
    await store.criar(wsPath, {
      id: "para-excluir",
      titulo: "Excluir",
      padrao: "pipeline",
      passos: [{ agente: "a", ordem: "x" }],
    });
    await store.excluir(wsPath, "para-excluir");
    expect(() => store.obter(wsPath, "para-excluir")).toThrow(TeamError);
    try {
      store.obter(wsPath, "para-excluir");
    } catch (e) {
      expect((e as { status?: number }).status).toBe(404);
    }
  });

  it("emite team.salvo e team.excluido no eventBus", async () => {
    const eventos: string[] = [];
    const { eventBus } = await import("../src/core/event-bus.js");
    const off = eventBus.on((ev) => eventos.push(ev.tipo));

    await store.criar(wsPath, {
      id: "emit-teste",
      titulo: "Emit",
      padrao: "pipeline",
      passos: [{ agente: "a", ordem: "x" }],
    });
    await store.excluir(wsPath, "emit-teste");
    off();

    expect(eventos).toContain("team.salvo");
    expect(eventos).toContain("team.excluido");
  });
});

describe("validarPadrao — validações diretas", () => {
  it("pipeline sem passos lança", () => {
    expect(() =>
      validarPadrao({
        id: "x",
        titulo: "X",
        padrao: "pipeline",
        criado_em: new Date().toISOString(),
      }),
    ).toThrow(/passos/);
  });

  it("fanout com 1 paralelo lança", () => {
    expect(() =>
      validarPadrao({
        id: "x",
        titulo: "X",
        padrao: "fanout",
        paralelos: [{ agente: "a", ordem: "x" }],
        criado_em: new Date().toISOString(),
      }),
    ).toThrow(/paralelos/);
  });

  it("review sem executor lança", () => {
    expect(() =>
      validarPadrao({
        id: "x",
        titulo: "X",
        padrao: "review",
        revisor: { agente: "b", ordem: "y" },
        criado_em: new Date().toISOString(),
      }),
    ).toThrow(/executor/);
  });

  it("debate sem moderador lança", () => {
    expect(() =>
      validarPadrao({
        id: "x",
        titulo: "X",
        padrao: "debate",
        proponentes: [
          { agente: "a", ordem: "x" },
          { agente: "b", ordem: "y" },
        ],
        criado_em: new Date().toISOString(),
      }),
    ).toThrow(/moderador/);
  });
});