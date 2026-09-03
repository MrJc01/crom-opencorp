import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  obterChavesProvedores,
  listarProvedoresStatus,
  completarChatDirect,
  testarModeloDirect,
} from "../src/core/llm-client.js";

describe("DirectLLMClient (Core)", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = join(tmpdir(), `opencorp-llm-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    mkdirSync(join(tempHome, ".opencorp", "opencode-data", "opencode"), { recursive: true });
    mkdirSync(join(tempHome, ".local", "share", "opencode"), { recursive: true });
  });

  it("obterChavesProvedores extrai chaves dos arquivos auth.json e secrets.json", () => {
    const authData = {
      openrouter: { key: "sk-or-v1-teste1234567890abcdef" },
      google: "AIzaSyTesteGoogleKey123456",
    };
    writeFileSync(
      join(tempHome, ".opencorp", "opencode-data", "opencode", "auth.json"),
      JSON.stringify(authData)
    );

    const chaves = obterChavesProvedores(tempHome);
    expect(chaves["openrouter"]).toBe("sk-or-v1-teste1234567890abcdef");
    expect(chaves["google"]).toBe("AIzaSyTesteGoogleKey123456");
  });

  it("listarProvedoresStatus gera lista com preview mascarado", () => {
    writeFileSync(
      join(tempHome, ".opencorp", "opencode-data", "opencode", "auth.json"),
      JSON.stringify({ openrouter: { key: "sk-or-v1-1234567890abcdef" } })
    );

    const status = listarProvedoresStatus(tempHome);
    const or = status.find((p) => p.id === "openrouter");
    expect(or).toBeDefined();
    expect(or?.conectado).toBe(true);
    expect(or?.previewChave).toContain("…");

    const anth = status.find((p) => p.id === "anthropic");
    expect(anth?.conectado).toBe(false);
  });

  it("completarChatDirect dispara chamada com headers corretos e retorna resultado", async () => {
    writeFileSync(
      join(tempHome, ".opencorp", "opencode-data", "opencode", "auth.json"),
      JSON.stringify({ openrouter: { key: "sk-or-mock-key" } })
    );

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "google/gemini-3.8-flash",
        provider: "Google AI Studio",
        choices: [{ message: { content: "Olá Mundo" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, is_byok: true, cost: 0 },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await completarChatDirect({
      model: "openrouter/google/gemini-3.8-flash",
      messages: [{ role: "user", content: "Olá" }],
      homeDir: tempHome,
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(res.content).toBe("Olá Mundo");
    expect(res.is_byok).toBe(true);
    expect(res.cost).toBe(0);

    vi.unstubAllGlobals();
  });

  it("testarModeloDirect retorna ok: true quando a API responde", async () => {
    writeFileSync(
      join(tempHome, ".opencorp", "opencode-data", "opencode", "auth.json"),
      JSON.stringify({ openrouter: { key: "sk-or-mock-key" } })
    );

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "google/gemini-3.8-flash",
        provider: "Google AI Studio",
        choices: [{ message: { content: "OK" } }],
        usage: { is_byok: true, cost: 0 },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const teste = await testarModeloDirect("google/gemini-3.8-flash", tempHome);
    expect(teste.ok).toBe(true);
    expect(teste.content).toBe("OK");
    expect(teste.is_byok).toBe(true);

    vi.unstubAllGlobals();
  });
});
