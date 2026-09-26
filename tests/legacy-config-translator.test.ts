import { describe, expect, it, vi } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  translateLegacyRuntimeConfig,
  createDeprecationNotice,
  DeprecationEmitter,
  LegacyConfigTranslationError,
  DEPRECATION_CODE,
  DEPRECATION_MIGRATION_COMMAND,
  DEPRECATION_FIRST_DEPRECATED_AT,
  DEPRECATION_NOT_BEFORE_REMOVAL_AT,
  DEPRECATION_REMOVE_IN_VERSION,
  DEPRECATION_RULES,
  LEGACY_ENGINE_PREFIX_MAP,
  CANONICAL_ENGINE_ALIASES,
  type DeprecationNotice,
} from "../src/core/engines/legacy-config-translator.js";
import { runtimeConfigSchema } from "../src/schemas/runtime-config.js";

describe("LegacyConfigTranslator — Constantes e Regras de Depreciação", () => {
  it("contém metadados de remoção e conformidade aprovados", () => {
    expect(DEPRECATION_CODE).toBe("LEGACY_RUNTIME_CONFIG");
    expect(DEPRECATION_MIGRATION_COMMAND).toBe("opencorp migrate-configs");
    expect(DEPRECATION_FIRST_DEPRECATED_AT).toBe("2026-09-25");
    expect(DEPRECATION_NOT_BEFORE_REMOVAL_AT).toBe("2026-11-24");
    expect(DEPRECATION_REMOVE_IN_VERSION).toBe("2.0.0");
    expect(DEPRECATION_RULES.minimumDays).toBe(60);
    expect(DEPRECATION_RULES.minimumMinorVersions).toBe(2);
  });

  it("cria notices estruturados estritamente aderentes ao contrato", () => {
    const notice = createDeprecationNotice({
      source: "runner.json",
      field: "binary_path",
      message: "binary_path depreciado",
    });

    expect(notice).toEqual({
      code: "LEGACY_RUNTIME_CONFIG",
      source: "runner.json",
      field: "binary_path",
      message: "binary_path depreciado",
      migrationCommand: "opencorp migrate-configs",
      firstDeprecatedAt: "2026-09-25",
      notBeforeRemovalAt: "2026-11-24",
      removeInVersion: "2.0.0",
    });
  });
});

describe("LegacyConfigTranslator — Tradução de Configurações", () => {
  it("preserva configuração já moderna sem alteração e sem emitir notices", () => {
    const modernConfig = {
      engine: "codex",
      mode: "conversation" as const,
      model: {
        provider: "openai",
        id: "gpt-5-codex",
        accountId: "conta-corp",
      },
      fallback: {
        engines: ["claude-code", "opencode"],
        models: [{ provider: "openrouter", id: "nvidia/nemotron" }],
      },
    };

    const res = translateLegacyRuntimeConfig(modernConfig);

    expect(res.translated).toBe(false);
    expect(res.notices).toHaveLength(0);
    expect(res.source).toBe("explicit");
    expect(res.config).toEqual(modernConfig);
    expect(() => runtimeConfigSchema.parse(res.config)).not.toThrow();
  });

  it("traduz runner.json mínimo", () => {
    const legacyRunner = {
      engine: "opencode",
    };

    const res = translateLegacyRuntimeConfig(legacyRunner, { source: "runner.json" });

    expect(res.translated).toBe(true);
    expect(res.config.engine).toBe("opencode");
    expect(res.config.mode).toBe("one-shot");
    expect(res.config.model).toEqual({ provider: "opencode", id: "nemotron-3-ultra-free" });
    expect(res.config.fallback?.engines).toEqual([]);
    expect(res.config.fallback?.models).toEqual([]);
    expect(res.source).toBe("runner.json");
    expect(res.notices.length).toBeGreaterThan(0);
    expect(() => runtimeConfigSchema.parse(res.config)).not.toThrow();
  });

  it("traduz runner.json completo com binary_path, timeout_min e harness_fallback", () => {
    const legacyRunner = {
      engine: "opencode",
      binary_path: "/usr/local/bin/opencode",
      timeout_min: 25,
      harness_fallback: ["antigravity", "copilot", "opencode"],
    };

    const res = translateLegacyRuntimeConfig(legacyRunner);

    expect(res.translated).toBe(true);
    expect(res.source).toBe("runner.json");
    expect(res.config.engine).toBe("opencode");
    expect(res.config.mode).toBe("one-shot");
    expect(res.config.fallback?.engines).toEqual(["antigravity", "copilot", "opencode"]);
    expect(res.config.fallback?.models).toEqual([]);

    const fieldsWithNotice = res.notices.map((n) => n.field);
    expect(fieldsWithNotice).toContain("binary_path");
    expect(fieldsWithNotice).toContain("timeout_min");
    expect(fieldsWithNotice).toContain("harness_fallback");
  });

  it("resolve cadeia de harness_fallback e ausência resultando em lista vazia", () => {
    const withFallback = translateLegacyRuntimeConfig({
      engine: "codex",
      model: "openai/gpt-4o",
      harness_fallback: ["claude-code", "opencode"],
    });
    expect(withFallback.config.fallback?.engines).toEqual(["claude-code", "opencode"]);

    const withoutFallback = translateLegacyRuntimeConfig({
      engine: "codex",
      model: "openai/gpt-4o",
    });
    expect(withoutFallback.config.fallback?.engines).toEqual([]);
    expect(withoutFallback.config.fallback?.models).toEqual([]);
  });

  it("traduz campos antigos de agentes: harness, engine_fallback e rotation", () => {
    const legacyAgent = {
      harness: "agy",
      engine_fallback: ["opencode"],
      model: "antigravity/gemini-2.5-pro",
      rotation: ["openrouter/deepseek/deepseek-chat", "opencode/nemotron-3-ultra-free"],
    };

    const res = translateLegacyRuntimeConfig(legacyAgent);

    expect(res.translated).toBe(true);
    expect(res.config.engine).toBe("antigravity");
    expect(res.config.fallback?.engines).toEqual(["opencode"]);
    expect(res.config.fallback?.models).toEqual([
      { provider: "openrouter", id: "deepseek/deepseek-chat" },
      { provider: "opencode", id: "nemotron-3-ultra-free" },
    ]);
  });

  it("cobre todos os prefixos legados conhecidos quando engine é omitido", () => {
    const cases: Array<{ modelPrefix: string; expectedEngine: string; modelString: string }> = [
      { modelPrefix: "opencode", expectedEngine: "opencode", modelString: "opencode/nemotron" },
      { modelPrefix: "opencode-go", expectedEngine: "opencode", modelString: "opencode-go/glm-5.3-flash" },
      { modelPrefix: "claude-code", expectedEngine: "claude-code", modelString: "claude-code/claude-3-5-sonnet" },
      { modelPrefix: "claude", expectedEngine: "claude-code", modelString: "claude/claude-3-5-haiku" },
      { modelPrefix: "antigravity", expectedEngine: "antigravity", modelString: "antigravity/gemini-2.5-pro" },
      { modelPrefix: "agy", expectedEngine: "antigravity", modelString: "agy/gemini-2.5-flash" },
      { modelPrefix: "crom-agente", expectedEngine: "crom-agente", modelString: "crom-agente/deepseek-v3" },
      { modelPrefix: "crom", expectedEngine: "crom-agente", modelString: "crom/deepseek-v3" },
      { modelPrefix: "cursor", expectedEngine: "cursor", modelString: "cursor/claude-3.5" },
      { modelPrefix: "copilot", expectedEngine: "copilot", modelString: "copilot/gpt-4o" },
      { modelPrefix: "codex", expectedEngine: "codex", modelString: "codex/gpt-5-codex" },
      { modelPrefix: "aider", expectedEngine: "aider", modelString: "aider/gpt-4" },
      { modelPrefix: "mimo", expectedEngine: "mimo", modelString: "mimo/mimo-v2.6" },
    ];

    for (const c of cases) {
      const res = translateLegacyRuntimeConfig({ model: c.modelString });
      expect(res.config.engine).toBe(c.expectedEngine);
      expect(res.translated).toBe(true);
      expect(res.notices.some((n) => n.field === "engine")).toBe(true);
    }
  });

  it("preserva openrouter/* como provedor e não como engine", () => {
    const res = translateLegacyRuntimeConfig(
      {
        engine: "codex",
        model: "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
      },
      { defaultEngine: "opencode" }
    );

    expect(res.config.engine).toBe("codex");
    expect(res.config.model.provider).toBe("openrouter");
    expect(res.config.model.id).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
    expect(res.config.engine).not.toBe("opencode");
  });

  it("garante que motor explícito prevalece sobre inferência de prefixo do modelo", () => {
    const res = translateLegacyRuntimeConfig({
      engine: "codex",
      model: "claude-code/claude-3-5-sonnet",
    });

    expect(res.config.engine).toBe("codex");
    expect(res.config.model).toEqual({
      provider: "claude-code",
      id: "claude-3-5-sonnet",
    });

    const engineNotice = res.notices.find((n) => n.field === "engine");
    expect(engineNotice).toBeDefined();
    expect(engineNotice?.message).toContain("Motor explícito 'codex' prevaleceu");
  });

  it("normaliza aliases legados de motores", () => {
    const res = translateLegacyRuntimeConfig({
      engine: "agy",
      model: "google/gemini-2.5-pro",
    });

    expect(res.config.engine).toBe("antigravity");
    const aliasNotice = res.notices.find((n) => n.field === "engine");
    expect(aliasNotice?.message).toContain("alias legado depreciado");
  });

  it("mantém idempotência: traduzir o resultado produz o mesmo config com translated: false", () => {
    const legacy = {
      harness: "claude",
      model: "anthropic/claude-3.5-sonnet",
      harness_fallback: ["opencode"],
    };

    const firstPass = translateLegacyRuntimeConfig(legacy);
    expect(firstPass.translated).toBe(true);

    const secondPass = translateLegacyRuntimeConfig(firstPass.config);
    expect(secondPass.translated).toBe(false);
    expect(secondPass.notices).toHaveLength(0);
    expect(secondPass.config).toEqual(firstPass.config);
  });

  it("não modifica o objeto original recebido (imutabilidade)", () => {
    const original = Object.freeze({
      engine: "agy",
      model: "google/gemini-2.5-pro",
      harness_fallback: Object.freeze(["opencode"]),
    });

    const res = translateLegacyRuntimeConfig(original);
    expect(res.config.engine).toBe("antigravity");
    expect(original.engine).toBe("agy");
  });

  it("não escreve nem cria nenhum arquivo em disco", () => {
    const testDir = join(process.cwd(), ".opencorp");
    let filesBefore: string[] = [];
    try {
      filesBefore = readdirSync(testDir);
    } catch {
      // diretório pode não existir ou ter arquivos
    }

    translateLegacyRuntimeConfig({
      engine: "opencode",
      binary_path: "/bin/test",
      harness_fallback: ["codex"],
    });

    let filesAfter: string[] = [];
    try {
      filesAfter = readdirSync(testDir);
    } catch {
      //
    }

    expect(filesAfter).toEqual(filesBefore);
  });
});

describe("LegacyConfigTranslator — Tratamento de Erros e Caminhos Úteis", () => {
  it("rejeita entradas não-objeto com mensagem útil", () => {
    expect(() => translateLegacyRuntimeConfig(null)).toThrow(LegacyConfigTranslationError);
    expect(() => translateLegacyRuntimeConfig(null)).toThrow(/esperava um objeto de configuração/);
    expect(() => translateLegacyRuntimeConfig("string")).toThrow(LegacyConfigTranslationError);
    expect(() => translateLegacyRuntimeConfig(123)).toThrow(LegacyConfigTranslationError);
  });

  it("rejeita engine vazio com caminho 'engine'", () => {
    try {
      translateLegacyRuntimeConfig({ engine: "   ", model: "openai/gpt-4" });
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(LegacyConfigTranslationError);
      expect(err.path).toBe("engine");
      expect(err.message).toMatch(/não pode ser vazio/);
    }
  });

  it("rejeita modo inválido com caminho 'mode'", () => {
    try {
      translateLegacyRuntimeConfig({ engine: "codex", mode: "invalido", model: "openai/gpt-4" });
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(LegacyConfigTranslationError);
      expect(err.path).toBe("mode");
      expect(err.message).toMatch(/deve ser 'one-shot' ou 'conversation'/);
    }
  });

  it("rejeita modelo malformado com caminhos úteis", () => {
    try {
      translateLegacyRuntimeConfig({ engine: "codex", model: "   " });
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(LegacyConfigTranslationError);
      expect(err.path).toBe("model");
    }

    try {
      translateLegacyRuntimeConfig({ engine: "codex", model: "/sem-provedor" });
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(LegacyConfigTranslationError);
      expect(err.path).toBe("model.provider");
    }

    try {
      translateLegacyRuntimeConfig({ engine: "codex", model: "provedor/" });
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(LegacyConfigTranslationError);
      expect(err.path).toBe("model.id");
    }

    try {
      translateLegacyRuntimeConfig({ engine: "codex", model: { provider: "", id: "ok" } });
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(LegacyConfigTranslationError);
      expect(err.path).toBe("model.provider");
    }
  });

  it("rejeita item inválido em fallback de motores com caminho posicional", () => {
    try {
      translateLegacyRuntimeConfig({
        engine: "codex",
        model: "openai/gpt-4",
        harness_fallback: ["opencode", "  "],
      });
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(LegacyConfigTranslationError);
      expect(err.path).toBe("fallback.engines[1]");
    }
  });

  it("rejeita item inválido em fallback de modelos com caminho posicional", () => {
    try {
      translateLegacyRuntimeConfig({
        engine: "codex",
        model: "openai/gpt-4",
        model_fallback: ["openai/gpt-4o", "invalido-sem-barra"],
      });
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(LegacyConfigTranslationError);
      expect(err.path).toBe("fallback.models[1]");
    }
  });
});

describe("LegacyConfigTranslator — Emissor e Deduplicação de Avisos", () => {
  it("emite aviso apenas uma vez por chave determinística (origem::campo)", () => {
    const logs: string[] = [];
    const emitter = new DeprecationEmitter((msg) => logs.push(msg));

    const notice1 = createDeprecationNotice({
      source: "runner.json",
      field: "binary_path",
      message: "binary_path depreciado",
    });

    const notice2 = createDeprecationNotice({
      source: "runner.json",
      field: "binary_path",
      message: "outra mensagem sobre binary_path",
    });

    const emitted1 = emitter.emit(notice1);
    const emitted2 = emitter.emit(notice2);

    expect(emitted1).toBe(true);
    expect(emitted2).toBe(false);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("[DEPRECATION NOTICE]");
    expect(logs[0]).toContain("runner.json");
    expect(logs[0]).toContain("binary_path");
    expect(logs[0]).toContain("opencorp migrate-configs");
    expect(logs[0]).toContain("2026-11-24");
    expect(logs[0]).toContain("v2.0.0");
  });

  it("permite limpar o estado de deduplicação entre testes", () => {
    const logs: string[] = [];
    const emitter = new DeprecationEmitter((msg) => logs.push(msg));

    const notice = createDeprecationNotice({
      source: "runner.json",
      field: "harness_fallback",
      message: "fallback depreciado",
    });

    expect(emitter.emit(notice)).toBe(true);
    expect(emitter.emit(notice)).toBe(false);

    emitter.clear();

    expect(emitter.emit(notice)).toBe(true);
    expect(logs).toHaveLength(2);
  });

  it("suporta emitAll com contagem de novos avisos emitidos", () => {
    const emitter = new DeprecationEmitter(() => {});

    const n1 = createDeprecationNotice({ source: "agent", field: "harness", message: "m1" });
    const n2 = createDeprecationNotice({ source: "agent", field: "harness", message: "m2" });
    const n3 = createDeprecationNotice({ source: "agent", field: "rotation", message: "m3" });

    const count = emitter.emitAll([n1, n2, n3]);
    expect(count).toBe(2);
  });
});
