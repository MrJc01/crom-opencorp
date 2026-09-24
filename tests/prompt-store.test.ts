import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceManager } from "../src/core/contexts/workspace/workspace-manager.js";
import { PromptStore, interpolarPrompt, type Prompt } from "../src/core/contexts/agents/prompt-store.js";
import { AgentError } from "../src/core/shared/errors.js";

const raizes: string[] = [];

async function ambiente(opts: { global?: Record<string, string> } = {}) {
  const home = await mkdtemp(join(tmpdir(), "opencorp-prompt-"));
  raizes.push(home);
  if (opts.global) {
    mkdirSync(join(home, ".opencorp"), { recursive: true });
    writeFileSync(join(home, ".opencorp", "prompts.json"), JSON.stringify(opts.global, null, 2));
  }
  const manager = new WorkspaceManager({ homeDir: home, cwd: home });
  const ws = await manager.criar("corp-pr");
  return { home, ws, store: new PromptStore({ homeDir: home, cwd: home }) };
}

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

describe("interpolarPrompt", () => {
  it("substitui {{vars}} e mantém texto sem variável", () => {
    expect(interpolarPrompt("Olá {{nome}}, bem-vindo!", { nome: "Ana" })).toBe("Olá Ana, bem-vindo!");
    expect(interpolarPrompt("sem variáveis")).toBe("sem variáveis");
    expect(interpolarPrompt("{{a}} e {{a}}", { a: "x" })).toBe("x e x");
  });

  it("variável desconhecida gera erro legível", () => {
    let erro: unknown;
    try {
      interpolarPrompt("Olá {{nome}}", {}, "saudacao");
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(AgentError);
    expect((erro as Error).message).toContain('"{{nome}}" não fornecida');
    expect((erro as Error).message).toContain("saudacao");
  });
});

describe("PromptStore — CRUD no workspace", () => {
  it("set/get/listar/remover com interpolação", async () => {
    const { ws, store } = await ambiente();
    await store.set(ws.path, "saudacao", "Olá {{nome}}!");
    await store.set(ws.path, "assinatura", "Equipe OpenCorp");

    const lista = await store.listar(ws.path);
    expect(lista.map((p: Prompt) => p.chave)).toEqual(["assinatura", "saudacao"]);

    expect(await store.get(ws.path, "saudacao", { nome: "Ana" })).toBe("Olá Ana!");
    expect(await store.get(ws.path, "assinatura")).toBe("Equipe OpenCorp");

    await store.remover(ws.path, "assinatura");
    expect(await store.listar(ws.path)).toEqual([{ chave: "saudacao", texto: "Olá {{nome}}!" }]);
  });

  it("chave desconhecida = erro legível; remover ausente = erro", async () => {
    const { ws, store } = await ambiente();
    const err = await store.get(ws.path, "fantasma").catch((e) => e);
    expect(err).toBeInstanceOf(AgentError);
    expect(err.message).toContain('prompt "fantasma" não encontrado');

    const err2 = await store.remover(ws.path, "fantasma").catch((e) => e);
    expect(err2).toBeInstanceOf(AgentError);
  });

  it("rejeita chave inválida", async () => {
    const { ws, store } = await ambiente();
    const err = await store.set(ws.path, "chave com espaço", "x").catch((e) => e);
    expect(err).toBeInstanceOf(AgentError);
  });
});

describe("PromptStore — seed na criação (D1)", () => {
  it("copia o global para o workspace recém-criado", async () => {
    const { ws, store } = await ambiente({ global: { "politica-tom": "Seja direto." } });
    const caminho = store.caminho(ws.path);
    expect(existsSync(caminho)).toBe(true);
    const json = JSON.parse(readFileSync(caminho, "utf8"));
    expect(json["politica-tom"]).toBe("Seja direto.");
    expect(await store.get(ws.path, "politica-tom")).toBe("Seja direto.");
  });

  it("sem global, a criação segue normal (prompts vazio)", async () => {
    const { ws, store } = await ambiente();
    expect(existsSync(store.caminho(ws.path))).toBe(false);
    expect(await store.listar(ws.path)).toEqual([]);
  });
});

describe("PromptStore — fallback global em runtime (settings)", () => {
  it("default OFF: chave global não é puxada", async () => {
    const { home, ws, store } = await ambiente();
    // global criado DEPOIS do workspace (não entra no seed) — testa só o runtime
    writeFileSync(join(home, ".opencorp", "prompts.json"), JSON.stringify({ "tom-global": "Formal" }));

    const err = await store.get(ws.path, "tom-global").catch((e) => e);
    expect(err).toBeInstanceOf(AgentError);
    expect(await store.listar(ws.path)).toEqual([]);
  });

  it("settings fallback ON: chave global aparece e workspace vence", async () => {
    const { home, ws, store } = await ambiente();
    writeFileSync(
      join(home, ".opencorp", "prompts.json"),
      JSON.stringify({ "tom-global": "Formal", "compartilhada": "global" }),
    );
    await store.set(ws.path, "compartilhada", "local");

    // ativa fallback no config do workspace
    writeFileSync(join(ws.path, ".opencorp", "config.json"), JSON.stringify({ prompts: { fallback_global: true } }));

    expect(await store.get(ws.path, "tom-global")).toBe("Formal");
    expect(await store.get(ws.path, "compartilhada")).toBe("local");
    const lista = await store.listar(ws.path);
    expect(lista.map((p: Prompt) => p.chave)).toContain("tom-global");
  });
});

describe("PromptStore — resolverReferencias ({{prompt:chave}})", () => {
  it("resolve referências e mantém compatibilidade sem a sintaxe", async () => {
    const { ws, store } = await ambiente();
    await store.set(ws.path, "intro", "Execute a tarefa com cuidado.");

    const resolvido = await store.resolverReferencias(ws.path, "Corpo: {{prompt:intro}} Fim.");
    expect(resolvido).toBe("Corpo: Execute a tarefa com cuidado. Fim.");

    const intacto = await store.resolverReferencias(ws.path, "Sem referências {{workspace}} aqui.");
    expect(intacto).toBe("Sem referências {{workspace}} aqui.");
  });

  it("referência a chave inexistente gera erro legível", async () => {
    const { ws, store } = await ambiente();
    const err = await store.resolverReferencias(ws.path, "{{prompt:nao-existe}}").catch((e) => e);
    expect(err).toBeInstanceOf(AgentError);
    expect(err.message).toContain('prompt "nao-existe" não encontrado');
  });
});
