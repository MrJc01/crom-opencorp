import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aggregateCatalog,
  checkModelEngineCompatibility,
  classifyFailure,
  collectCatalog,
  curatedSource,
  decideFallback,
  engineHintSource,
  explicitEngineOfModel,
  formatFallbackAudit,
  modelIdForEngine,
  ModelProbeStore,
  searchCatalog,
  type CatalogSource,
} from "../src/core/models/index.js";

const OR = "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free";
const QWEN = "openrouter/qwen/qwen3.8-27b:free";
const GLM = "opencode-go/glm-5.3-flash";

describe("ETAPA 13 — catálogo soberano", () => {
  it("mesmo modelo por duas origens mantém ambas as rotas e proveniências", () => {
    const [m] = aggregateCatalog([
      { modelId: OR, sourceId: "opencode-cli", kind: "live", engineId: "opencode" },
      { modelId: OR, sourceId: "hint:crom-agente", kind: "engine-hint", engineId: "crom-agente" },
    ]);
    expect(m!.compatibleEngineIds).toEqual(["crom-agente", "opencode"]);
    expect(m!.sources.map((s) => s.sourceId)).toEqual(["opencode-cli", "hint:crom-agente"]);
    expect(m!.providerId).toBe("openrouter");
    expect(m!.free).toBe(true);
  });

  it("openrouter/* sem origem vinculada não é atribuído ao OpenCode", () => {
    const [m] = aggregateCatalog([{ modelId: "openrouter/foo/bar-70b", sourceId: "settings:x", kind: "settings" }]);
    expect(m!.compatibleEngineIds).toEqual([]);
    expect(explicitEngineOfModel("openrouter/foo/bar")).toBeUndefined();
    expect(explicitEngineOfModel("mimo/MiMo-V2-Free")).toBeUndefined();
    expect(explicitEngineOfModel("codex/gpt-5")).toBe("codex");
    expect(explicitEngineOfModel("opencode-go/x")).toBe("opencode");
  });

  it("disponibilidade catalogada é separada do probe aprovado", () => {
    const [m] = aggregateCatalog(
      [{ modelId: OR, sourceId: "curated", kind: "curated", engineId: "opencode" }],
      [{ modelId: OR, engineId: "opencode", status: "passed", at: "2026-09-26T00:00:00Z", level: "inference" }]
    );
    expect(m!.catalogedAt).toBeTruthy();
    expect(m!.probes).toEqual([{ engineId: "opencode", status: "passed", at: "2026-09-26T00:00:00Z", level: "inference" }]);
    const [semProbe] = aggregateCatalog([{ modelId: QWEN, sourceId: "curated", kind: "curated", engineId: "opencode" }]);
    expect(semProbe!.probes).toEqual([]);
  });

  it("governança marca modelos proibidos para agentes autônomos", () => {
    const models = aggregateCatalog([
      { modelId: "openrouter/meta/llama-3.2-1b:free", sourceId: "s", kind: "settings" },
      { modelId: OR, sourceId: "s", kind: "settings" },
    ]);
    expect(models.find((m) => m.modelId.includes("llama-3.2-1b"))!.governance).toMatchObject({ allowedAutonomous: false, tier: "NAO_RECOMENDADO" });
    expect(models.find((m) => m.modelId === OR)!.governance.allowedAutonomous).toBe(true);
  });

  it("compatibilidade: prefixo de outro motor e catálogo bloqueiam; modelo desconhecido passa", () => {
    const catalog = aggregateCatalog([{ modelId: "gemini-3.8-flash-high", sourceId: "hint:antigravity", kind: "engine-hint", engineId: "antigravity" }]);
    expect(checkModelEngineCompatibility("claude-code", "codex/gpt-5")).toMatchObject({ compatible: false });
    expect(checkModelEngineCompatibility("codex", "gemini-3.8-flash-high", catalog)).toMatchObject({ compatible: false });
    expect(checkModelEngineCompatibility("antigravity", "gemini-3.8-flash-high", catalog)).toEqual({ compatible: true, basis: "catalog" });
    expect(checkModelEngineCompatibility("opencode", "openrouter/x/y", catalog)).toEqual({ compatible: true, basis: "unknown-model" });
    expect(modelIdForEngine("codex/gpt-5")).toBe("gpt-5");
    expect(modelIdForEngine("opencode/x")).toBe("opencode/x");
    expect(modelIdForEngine("openrouter/a/b")).toBe("openrouter/a/b");
  });

  it("pesquisa por texto, motor, gratuidade, autonomia e probe", () => {
    const models = aggregateCatalog(
      [
        { modelId: OR, sourceId: "c", kind: "curated", engineId: "opencode" },
        { modelId: "gemini-3.8-flash-high", sourceId: "h", kind: "engine-hint", engineId: "antigravity" },
      ],
      [{ modelId: OR, engineId: "opencode", status: "passed", at: "t" }]
    );
    expect(searchCatalog(models, { text: "nemotron" }).map((m) => m.modelId)).toEqual([OR]);
    expect(searchCatalog(models, { engineId: "antigravity" }).map((m) => m.modelId)).toEqual(["gemini-3.8-flash-high"]);
    expect(searchCatalog(models, { onlyProbed: true, engineId: "opencode" })).toHaveLength(1);
    expect(searchCatalog(models, { onlyFree: true }).map((m) => m.modelId)).toEqual([OR]);
  });

  it("collectCatalog tolera origem com erro e registra o motivo", async () => {
    const quebrada: CatalogSource = { id: "quebrada", list: async () => { throw new Error("binário ausente"); } };
    const { models, errors } = await collectCatalog([quebrada, curatedSource(), engineHintSource([{ id: "mimo", supportedModelsHint: ["mimo/MiMo-V2-Free"] }])]);
    expect(errors).toEqual([{ sourceId: "quebrada", message: "binário ausente" }]);
    expect(models.find((m) => m.modelId === "mimo/MiMo-V2-Free")!.compatibleEngineIds).toEqual(["mimo"]);
    expect(models.some((m) => m.sources.some((s) => s.kind === "curated"))).toBe(true);
  });

  it("ModelProbeStore guarda o último resultado por motor e modelo", async () => {
    const home = await mkdtemp(join(tmpdir(), "opencorp-probes-"));
    try {
      const store = new ModelProbeStore(home);
      await store.record({ engineId: "codex", modelId: "gpt-x", status: "failed", at: "1" });
      await store.record({ engineId: "codex", modelId: "gpt-x", status: "passed", at: "2" });
      await store.record({ engineId: "opencode", modelId: "gpt-x", status: "passed", at: "3" });
      expect(store.list()).toEqual([
        { engineId: "codex", modelId: "gpt-x", status: "passed", at: "2" },
        { engineId: "opencode", modelId: "gpt-x", status: "passed", at: "3" },
      ]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe("ETAPA 13 — roteador de fallback", () => {
  it("conta sem cota gira a conta do mesmo motor, não o motor nem o modelo", () => {
    const d = decideFallback({ engineId: "codex", failedModel: "gpt-x", failure: "quota", modelChain: [QWEN], accountAvailable: true });
    expect(d.result).toEqual({ action: "rotate_account", engineId: "codex", model: "gpt-x" });
  });

  it("sem outra conta, próximo modelo compatível no mesmo motor", () => {
    const d = decideFallback({ engineId: "opencode", failedModel: GLM, failure: "quota", modelChain: [GLM, "codex/gpt-5", OR] });
    expect(d.result).toEqual({ action: "next_model", engineId: "opencode", model: OR });
    expect(d.audit.find((a) => a.candidate === "codex/gpt-5")).toMatchObject({ decision: "skipped" });
  });

  it("falha de provedor prefere outro provedor, sem trocar de motor", () => {
    const d = decideFallback({ engineId: "opencode", failedModel: OR, failure: "provider", modelChain: ["openrouter/nvidia/nemotron-3-super-120b-a12b:free", GLM] });
    expect(d.result).toEqual({ action: "next_model", engineId: "opencode", model: GLM });
  });

  it("falha de provedor sem alternativa no mesmo motor para — não troca motor sem autorização", () => {
    const d = decideFallback({ engineId: "codex", failedModel: "gpt-x", failure: "provider", modelChain: ["claude-code/sonnet"] });
    expect(d.result).toEqual({ action: "stop" });
    expect(d.reason).toContain("troca de motor não autorizada");
  });

  it("troca de motor só com cadeia explícita de motores", () => {
    const d = decideFallback({ engineId: "codex", failedModel: "gpt-x", failure: "provider", modelChain: ["claude-code/sonnet"], engineChain: ["codex", "claude-code"] });
    expect(d.result).toEqual({ action: "next_engine", engineId: "claude-code", model: "claude-code/sonnet" });
  });

  it("modelo bloqueado não entra em rotação autônoma; sem créditos só gratuitos", () => {
    const blocked = decideFallback({ engineId: "opencode", failedModel: GLM, failure: "model", modelChain: ["openrouter/meta/llama-3.2-1b:free"] });
    expect(blocked.result).toEqual({ action: "stop" });
    expect(blocked.audit[0]).toMatchObject({ decision: "skipped", reason: expect.stringContaining("bloqueado") });
    const credits = decideFallback({ engineId: "opencode", failedModel: GLM, failure: "credits", modelChain: ["openrouter/anthropic/claude-3.5-sonnet", QWEN] });
    expect(credits.result).toEqual({ action: "next_model", engineId: "opencode", model: QWEN });
  });

  it("falha de autenticação não gira modelo", () => {
    expect(decideFallback({ engineId: "codex", failedModel: "gpt-x", failure: "auth", modelChain: [QWEN] }).result).toEqual({ action: "stop" });
  });

  it("toda decisão é auditável em texto", () => {
    const d = decideFallback({ engineId: "opencode", failedModel: GLM, failure: "quota", modelChain: ["codex/gpt-5", OR] });
    const text = formatFallbackAudit(d);
    expect(text).toContain("✗ codex/gpt-5");
    expect(text).toContain(`✓ ${OR}`);
  });

  it("classifica falhas", () => {
    expect(classifyFailure("Weekly usage limit reached")).toBe("quota");
    expect(classifyFailure("insufficient credits")).toBe("credits");
    expect(classifyFailure("401 Unauthorized")).toBe("auth");
    expect(classifyFailure("503 Service Unavailable")).toBe("provider");
    expect(classifyFailure("model not found")).toBe("model");
    expect(classifyFailure("x", { inactivity: true })).toBe("inactivity");
  });
});
