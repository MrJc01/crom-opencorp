import { afterAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceManager } from "../src/core/contexts/workspace/workspace-manager.js";
import { SkillStore, montarSecaoSkills, parseSkillMd, type Skill } from "../src/core/contexts/agents/skill-store.js";
import { AgentError } from "../src/core/shared/errors.js";

const raizes: string[] = [];

async function ambiente() {
  const home = await mkdtemp(join(tmpdir(), "opencorp-skill-"));
  raizes.push(home);
  const manager = new WorkspaceManager({ homeDir: home, cwd: home });
  const ws = await manager.criar("corp-sk");
  return { home, ws, store: new SkillStore() };
}

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

function skillMd(name: string, description = "Faz uma tarefa", corpo = "Corpo da skill.") {
  return `---\nname: ${name}\ndescription: ${description}\nallowed-tools: [bash, read]\n---\n\n${corpo}`;
}

describe("SkillStore — parse e instalação", () => {
  it("parseia SKILL.md com name/description/allowed-tools", () => {
    const s = parseSkillMd(skillMd("auditoria-seo"));
    expect(s.name).toBe("auditoria-seo");
    expect(s.description).toBe("Faz uma tarefa");
    expect(s.allowed_tools).toEqual(["bash", "read"]);
    expect(s.corpo).toContain("Corpo da skill.");
  });

  it("rejeita name fora de kebab-case", () => {
    expect(() => parseSkillMd(skillMd("Auditoria SEO"))).toThrow(AgentError);
  });

  it("rejeita description ausente", () => {
    const md = "---\nname: valida\n---\n\ncorpo";
    expect(() => parseSkillMd(md)).toThrow(/description/);
  });

  it("instala de uma pasta e lista/mostra/remove", async () => {
    const { ws, store } = await ambiente();
    const origem = join(ws.path, "minha-skill-src");
    await mkdir(origem, { recursive: true });
    await writeFile(join(origem, "SKILL.md"), skillMd("auditoria-seo", "Audita SEO", "Passos de auditoria."));
    await writeFile(join(origem, "skill.json"), JSON.stringify({ versao: "1.2.0", requires: ["base"] }));

    const instalada = await store.instalar(ws.path, origem);
    expect(instalada.name).toBe("auditoria-seo");
    expect(existsSync(join(ws.path, ".opencorp", "skills", "auditoria-seo", "SKILL.md"))).toBe(true);

    const lista = await store.listar(ws.path);
    expect(lista.map((s) => s.name)).toEqual(["auditoria-seo"]);
    expect(lista[0]!.versao).toBe("1.2.0");
    expect(lista[0]!.requires).toEqual(["base"]);

    const mostrada = await store.mostrar(ws.path, "auditoria-seo");
    expect(mostrada.corpo).toContain("Passos de auditoria.");

    await store.remover(ws.path, "auditoria-seo");
    expect(await store.listar(ws.path)).toEqual([]);
  });

  it("rejeita instalação duplicada e skill não encontrada", async () => {
    const { ws, store } = await ambiente();
    const origem = join(ws.path, "dup-src");
    await mkdir(origem, { recursive: true });
    await writeFile(join(origem, "SKILL.md"), skillMd("dup-skill"));
    await store.instalar(ws.path, origem);
    const err = await store.instalar(ws.path, origem).catch((e) => e);
    expect(err).toBeInstanceOf(AgentError);
    expect(err.message).toContain("já instalada");

    const err2 = await store.mostrar(ws.path, "fantasma").catch((e) => e);
    expect(err2).toBeInstanceOf(AgentError);
    expect(err2.message).toContain("não instalada");
  });

  it("resolverInstaladas lança erro legível para skill faltante", async () => {
    const { ws, store } = await ambiente();
    let erro: unknown;
    try {
      store.resolverInstaladas(ws.path, ["nao-existe"]);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(AgentError);
    expect((erro as Error).message).toContain("não instalada(s): nao-existe");
  });
});

describe("montarSecaoSkills", () => {
  it("monta seção ordenada com cabeçalho e aviso de teto", () => {
    const skills: Skill[] = [
      { name: "zeta", description: "Z", corpo: "corpo z" },
      { name: "alfa", description: "A", corpo: "corpo a" },
    ];
    const secao = montarSecaoSkills(skills);
    expect(secao).toContain("## Skills (2)");
    expect(secao.indexOf("### alfa")).toBeLessThan(secao.indexOf("### zeta"));
    expect(secao).toContain("### alfa: A\ncorpo a");
  });

  it("retorna vazio para lista vazia", () => {
    expect(montarSecaoSkills([])).toBe("");
  });

  it("trunca com aviso quando excede o teto", () => {
    const corpoLongo = "x".repeat(9000);
    const secao = montarSecaoSkills([{ name: "grande", description: "G", corpo: corpoLongo }]);
    expect(secao).toContain("## Skills (1)");
    expect(secao).toContain("truncada");
  });
});
