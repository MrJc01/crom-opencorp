import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  obterModelosDefensivos,
  parsearModelo,
} from "../src/server/routes/secretario/helpers.js";

describe("helpers de modelos do Secretário", () => {
  const temporarios: string[] = [];

  afterEach(() => {
    for (const dir of temporarios.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("remove prefixo duplicado do modelID sem alterar nomes aninhados válidos", () => {
    expect(parsearModelo("google/google/gemini-2.5-flash")).toEqual({
      providerID: "google",
      modelID: "gemini-2.5-flash",
    });
    expect(
      parsearModelo("openrouter/nvidia/nemotron-3-ultra-550b-a55b:free"),
    ).toEqual({
      providerID: "openrouter",
      modelID: "nvidia/nemotron-3-ultra-550b-a55b:free",
    });
  });

  it("não trata credencial Antigravity como chave Google e prioriza a cadeia validada", () => {
    const home = join(tmpdir(), `opencorp-secretario-models-${randomUUID()}`);
    temporarios.push(home);
    const ocDir = join(home, ".opencorp");
    const authDir = join(ocDir, "opencode-data", "opencode");
    mkdirSync(authDir, { recursive: true });
    writeFileSync(
      join(authDir, "auth.json"),
      JSON.stringify({
        antigravity: { type: "api", key: "agy-runtime" },
        openrouter: { type: "api", key: "openrouter-key" },
      }),
    );
    writeFileSync(join(ocDir, "engine-accounts.json"), "[]");

    expect(obterModelosDefensivos(home).modelos).toEqual([
      "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
      "openrouter/thinkingmachines/inkling:free",
      "openrouter/nvidia/nemotron-3.5-lightning:free",
      "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
      "openrouter/qwen/qwen3.8-27b:free",
    ]);
  });
});
