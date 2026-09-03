import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SecretsStore } from "../src/core/secrets-store.js";

describe("SecretsStore - Isolamento por Workspace", () => {
  let tempHome: string;
  let tempWs1: string;
  let tempWs2: string;
  let store: SecretsStore;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), "opencorp-secrets-home-"));
    tempWs1 = mkdtempSync(join(tmpdir(), "opencorp-ws1-"));
    tempWs2 = mkdtempSync(join(tmpdir(), "opencorp-ws2-"));
    store = new SecretsStore(tempHome);
  });

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(tempWs1, { recursive: true, force: true });
    rmSync(tempWs2, { recursive: true, force: true });
  });

  it("salva segredo no escopo global e lê corretamente", async () => {
    await store.definir("chave_global", "valor_global_123", "global");
    const item = store.obterValor("chave_global");
    expect(item).toEqual({ valor: "valor_global_123", origem: "global" });

    // Em qualquer workspace ele aparece por herança
    const itemNoWs = store.obterValor("chave_global", tempWs1);
    expect(itemNoWs).toEqual({ valor: "valor_global_123", origem: "global" });
  });

  it("salva segredo no escopo workspace e isola de outros workspaces", async () => {
    await store.definir("api_token_ws1", "segredo_ws1", "workspace", tempWs1);

    // Presente no ws1
    const noWs1 = store.obterValor("api_token_ws1", tempWs1);
    expect(noWs1).toEqual({ valor: "segredo_ws1", origem: "workspace" });

    // Ausente no ws2
    const noWs2 = store.obterValor("api_token_ws1", tempWs2);
    expect(noWs2).toBeNull();

    // Ausente no global
    const noGlobal = store.obterValor("api_token_ws1");
    expect(noGlobal).toBeNull();
  });

  it("workspace sobrepõe o global quando há mesmo nome", async () => {
    await store.definir("minha_senha", "senha_global", "global");
    await store.definir("minha_senha", "senha_especifica_ws1", "workspace", tempWs1);

    // No ws1, prevalece o do workspace
    const noWs1 = store.obterValor("minha_senha", tempWs1);
    expect(noWs1).toEqual({ valor: "senha_especifica_ws1", origem: "workspace" });

    // No ws2, prevalece o global
    const noWs2 = store.obterValor("minha_senha", tempWs2);
    expect(noWs2).toEqual({ valor: "senha_global", origem: "global" });
  });

  it("listarMerge retorna a origem correta de cada chave", async () => {
    await store.definir("global_only", "1", "global");
    await store.definir("ws1_only", "2", "workspace", tempWs1);

    const listaWs1 = store.listarMerge(tempWs1);
    expect(listaWs1).toEqual([
      { nome: "global_only", definido: true, tipo_app: null, origem: "global" },
      { nome: "ws1_only", definido: true, tipo_app: null, origem: "workspace" },
    ]);

    const listaWs2 = store.listarMerge(tempWs2);
    expect(listaWs2).toEqual([
      { nome: "global_only", definido: true, tipo_app: null, origem: "global" },
    ]);
  });
});
