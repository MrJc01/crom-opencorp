import { afterAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RegistryError } from "../src/core/errors.js";
import { RegistryStore } from "../src/core/registry-store.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";

const raizes: string[] = [];

async function ambiente() {
  const home = await mkdtemp(join(tmpdir(), "opencorp-reg-"));
  raizes.push(home);
  const manager = new WorkspaceManager({ homeDir: home, cwd: home });
  const ws = await manager.criar("corp-reg");
  const store = new RegistryStore();
  return { home, wsPath: ws.path, store };
}

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

describe("RegistryStore — criar", () => {
  it("exige descrição (-d)", async () => {
    const { wsPath, store } = await ambiente();
    for (const descricao of [undefined, "", "   "]) {
      const err = await store
        .criar(wsPath, { categoria: "notas", id: "x", descricao: descricao as string | undefined, criadoPor: "humano" })
        .catch((e) => e);
      expect(err).toBeInstanceOf(RegistryError);
      expect(err.message).toContain("descrição");
    }
  });

  it("cria com permissões padrão: leitura *, escrita criador+CEOs, meta CEOs", async () => {
    const { wsPath, store } = await ambiente();
    const meta = await store.criar(wsPath, {
      categoria: "notas",
      id: "probe",
      descricao: "teste",
      criadoPor: "humano",
      agentesCEO: ["ceo-documentos"],
    });
    expect(meta.permissoes.leitura).toEqual(["*"]);
    expect(meta.permissoes.escrita).toEqual(["humano", "ceo-documentos"]);
    expect(meta.permissoes.modificacao_meta).toEqual(["ceo-documentos"]);
    expect(existsSync(join(wsPath, ".opencorp", "registries", "notas", "probe", "meta.json"))).toBe(true);
    expect(existsSync(join(wsPath, ".opencorp", "registries", "notas", "probe", "journal.jsonl"))).toBe(true);
  });

  it("rejeita duplicado na mesma categoria", async () => {
    const { wsPath, store } = await ambiente();
    await store.criar(wsPath, { categoria: "notas", id: "dup", descricao: "a", criadoPor: "humano" });
    const err = await store
      .criar(wsPath, { categoria: "notas", id: "dup", descricao: "b", criadoPor: "humano" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(RegistryError);
    expect(err.message).toContain("já existe");
  });

  it("cria categoria custom espontaneamente (inventario/servers)", async () => {
    const { wsPath, store } = await ambiente();
    await store.criar(wsPath, { categoria: "inventario", id: "servers", descricao: "servers", criadoPor: "humano" });
    expect(existsSync(join(wsPath, ".opencorp", "registries", "inventario", "servers"))).toBe(true);
    const grupos = await store.listarCategorias(wsPath);
    const inventario = grupos.find((g) => g.categoria === "inventario");
    expect(inventario?.registros.map((r) => r.id)).toContain("servers");
  });
});

describe("RegistryStore — journal append-only", () => {
  it("anotar nunca reescreve o journal (à prova de manipulação direta do arquivo)", async () => {
    const { wsPath, store } = await ambiente();
    await store.criar(wsPath, { categoria: "notas", id: "probe", descricao: "teste", criadoPor: "humano" });
    const journalPath = join(wsPath, ".opencorp", "registries", "notas", "probe", "journal.jsonl");
    const original = readFileSync(journalPath, "utf8");
    await appendFile(journalPath, '{"ts":"x","por":"intruso","evento":"manipulado","resumo":"linha estranha"}\n', "utf8");
    const manipulado = readFileSync(journalPath, "utf8");
    await store.anotar(wsPath, "notas", "probe", "humano", "anotação legítima");
    const depois = readFileSync(journalPath, "utf8");
    expect(depois.startsWith(original)).toBe(true);
    expect(depois).toContain(manipulado);
    expect(depois.trim().split("\n")).toHaveLength(3);
    expect(depois).toContain("anotação legítima");
    const eventos = await store.lerJournal(wsPath, "notas", "probe");
    expect(eventos.map((e) => e.evento)).toEqual(["criado", "manipulado", "anotacao"]);
  });

  it("update appenda evento modificado sem reescrever o journal e troca o conteúdo", async () => {
    const { wsPath, store } = await ambiente();
    await store.criar(wsPath, {
      categoria: "notas",
      id: "probe",
      descricao: "teste",
      criadoPor: "humano",
      conteudo: "conteudo v1",
    });
    const journalPath = join(wsPath, ".opencorp", "registries", "notas", "probe", "journal.jsonl");
    const antes = readFileSync(journalPath, "utf8");
    const meta = await store.atualizar(wsPath, "notas", "probe", "humano", { conteudo: "conteudo v2" });
    expect(meta.descricao).toBe("teste");
    const depois = readFileSync(journalPath, "utf8");
    expect(depois.startsWith(antes)).toBe(true);
    const eventos = await store.lerJournal(wsPath, "notas", "probe");
    expect(eventos.map((e) => e.evento)).toEqual(["criado", "modificado"]);
    const r = await store.obter(wsPath, "notas", "probe");
    expect(r.conteudo).toBe("conteudo v2");
  });

  it("update com --descricao vazia falha", async () => {
    const { wsPath, store } = await ambiente();
    await store.criar(wsPath, { categoria: "notas", id: "probe", descricao: "teste", criadoPor: "humano" });
    const err = await store
      .atualizar(wsPath, "notas", "probe", "humano", { descricao: "  " })
      .catch((e) => e);
    expect(err).toBeInstanceOf(RegistryError);
    expect(err.message).toContain("descrição");
  });
});

describe("RegistryStore — permissões", () => {
  it("update/log por agente fora da lista de escrita → exit 3 + evento em logs/audit-log", async () => {
    const { wsPath, store } = await ambiente();
    await store.criar(wsPath, { categoria: "notas", id: "probe", descricao: "teste", criadoPor: "humano" });
    const err = await store
      .atualizar(wsPath, "notas", "probe", "executor-padrao", { conteudo: "x" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(RegistryError);
    expect(err.exitCode).toBe(3);
    expect(err.message).toContain("executor-padrao");
    const audit = await store.obter(wsPath, "logs", "audit-log");
    expect(audit.journal.at(-1)?.evento).toBe("acesso_negado");
    expect(audit.journal.at(-1)?.por).toBe("executor-padrao");
    const err2 = await store
      .anotar(wsPath, "notas", "probe", "secretario", "tentativa")
      .catch((e) => e);
    expect(err2.exitCode).toBe(3);
  });

  it("update por agente COM permissão de escrita passa", async () => {
    const { wsPath, store } = await ambiente();
    await store.criar(wsPath, {
      categoria: "notas",
      id: "probe",
      descricao: "teste",
      criadoPor: "humano",
      agentesCEO: ["ceo-documentos"],
    });
    await store.perms(wsPath, "notas", "probe", "humano", { escrita: ["executor-padrao"] });
    const meta = await store.atualizar(wsPath, "notas", "probe", "executor-padrao", { conteudo: "x" });
    expect(meta.atualizado_em >= meta.criado_em).toBe(true);
  });

  it("humano (padrão) sempre pode escrever e modificar meta", async () => {
    const { wsPath, store } = await ambiente();
    await store.criar(wsPath, {
      categoria: "notas",
      id: "probe",
      descricao: "teste",
      criadoPor: "humano",
      agentesCEO: ["ceo-documentos"],
    });
    const meta = await store.perms(wsPath, "notas", "probe", "humano", { escrita: ["ceo-documentos"] });
    expect(meta.permissoes.escrita).toEqual(["ceo-documentos"]);
    const eventos = await store.lerJournal(wsPath, "notas", "probe");
    expect(eventos.at(-1)?.evento).toBe("permissoes");
  });

  it("perms por agente fora de modificacao_meta → exit 3", async () => {
    const { wsPath, store } = await ambiente();
    await store.criar(wsPath, {
      categoria: "notas",
      id: "probe",
      descricao: "teste",
      criadoPor: "humano",
      agentesCEO: ["ceo-documentos"],
    });
    const err = await store
      .perms(wsPath, "notas", "probe", "executor-padrao", { escrita: ["executor-padrao"] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(RegistryError);
    expect(err.exitCode).toBe(3);
  });
});

describe("RegistryStore — índice SQLite (corp.db)", () => {
  it("write-through: search encontra logo após create/update sem reindex", async () => {
    const { wsPath, store } = await ambiente();
    await store.criar(wsPath, {
      categoria: "notas",
      id: "probe",
      descricao: "relatório de vendas do trimestre",
      criadoPor: "humano",
      tags: ["vendas"],
      conteudo: "receita cresceu 10%",
    });
    for (const termo of ["vendas", "receita", "relatório"]) {
      const r = await store.buscar(wsPath, termo);
      expect(r.map((x) => x.id)).toContain("probe");
    }
    await store.atualizar(wsPath, "notas", "probe", "humano", { conteudo: "agora fala de estoque" });
    const r2 = await store.buscar(wsPath, "estoque");
    expect(r2.map((x) => x.id)).toContain("probe");
  });

  it("reindex reconstrói o índice apagando o corp.db (a verdade são os arquivos)", async () => {
    const { wsPath, store } = await ambiente();
    await store.criar(wsPath, {
      categoria: "notas",
      id: "probe",
      descricao: "teste",
      criadoPor: "humano",
      tags: ["tag-x"],
      conteudo: "conteudo qualquer",
    });
    const dbPath = join(wsPath, ".opencorp", "corp.db");
    expect(existsSync(dbPath)).toBe(true);
    store.fechar();
    const { rmSync } = await import("node:fs");
    rmSync(dbPath, { force: true });
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
    expect(existsSync(dbPath)).toBe(false);
    const r = await store.reindexar(wsPath);
    expect(r.registros).toBeGreaterThanOrEqual(1);
    const resultados = await store.buscar(wsPath, "teste");
    expect(resultados.map((x) => `${x.categoria}/${x.id}`)).toContain("notas/probe");
    const sessoes = await store.reindexarSessoes(wsPath);
    expect(sessoes).toBeGreaterThanOrEqual(0);
  });

  it("garantirCategorias cria as categorias padrão da doc 05", async () => {
    const { wsPath, store } = await ambiente();
    const cats = await store.garantirCategorias(wsPath);
    for (const c of ["chats", "documentos", "execucoes", "agentes", "custos", "logs", "custom"]) {
      expect(cats).toContain(c);
      expect(statSync(join(wsPath, ".opencorp", "registries", c)).isDirectory()).toBe(true);
    }
  });
});
