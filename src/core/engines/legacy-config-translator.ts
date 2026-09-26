import { runtimeConfigSchema, type ModelRef, type RuntimeConfig } from "../../schemas/runtime-config.js";

export const DEPRECATION_CODE = "LEGACY_RUNTIME_CONFIG" as const;
export const DEPRECATION_MIGRATION_COMMAND = "opencorp migrate-configs" as const;
export const DEPRECATION_FIRST_DEPRECATED_AT = "2026-09-25";
export const DEPRECATION_NOT_BEFORE_REMOVAL_AT = "2026-11-24";
export const DEPRECATION_REMOVE_IN_VERSION = "2.0.0" as const;

export const DEPRECATION_RULES = {
  code: DEPRECATION_CODE,
  migrationCommand: DEPRECATION_MIGRATION_COMMAND,
  firstDeprecatedAt: DEPRECATION_FIRST_DEPRECATED_AT,
  notBeforeRemovalAt: DEPRECATION_NOT_BEFORE_REMOVAL_AT,
  removeInVersion: DEPRECATION_REMOVE_IN_VERSION,
  minimumDays: 60,
  minimumMinorVersions: 2,
} as const;

export interface DeprecationNotice {
  code: "LEGACY_RUNTIME_CONFIG";
  source: string;
  field?: string;
  message: string;
  migrationCommand: "opencorp migrate-configs";
  firstDeprecatedAt: string;
  notBeforeRemovalAt: string;
  removeInVersion: "2.0.0";
}

export type LegacyConfigSource = "runner.json" | "agent_frontmatter" | "settings" | "explicit" | string;

export interface LegacyTranslationContext {
  source?: LegacyConfigSource;
  defaultEngine?: string;
  defaultMode?: "one-shot" | "conversation";
  defaultModel?: ModelRef | string;
}

export interface LegacyTranslationResult {
  config: RuntimeConfig;
  translated: boolean;
  source: LegacyConfigSource;
  notices: DeprecationNotice[];
}

export class LegacyConfigTranslationError extends Error {
  readonly path?: string;
  readonly details?: unknown;

  constructor(message: string, options: { path?: string; details?: unknown } = {}) {
    super(message);
    this.name = "LegacyConfigTranslationError";
    this.path = options.path;
    this.details = options.details;
  }
}

export const CANONICAL_ENGINE_ALIASES: Record<string, string> = {
  "crom": "crom-agente",
  "cromagente": "crom-agente",
  "claude": "claude-code",
  "claudecode": "claude-code",
  "agy": "antigravity",
  "cursor-agent": "cursor",
  "cursorcli": "cursor",
  "github-copilot": "copilot",
  "gh-copilot": "copilot",
  "copilot-cli": "copilot",
  "openai-codex": "codex",
  "openai": "codex",
};

export const LEGACY_ENGINE_PREFIX_MAP: Record<string, string> = {
  "opencode": "opencode",
  "opencode-go": "opencode",
  "claude-code": "claude-code",
  "claude": "claude-code",
  "antigravity": "antigravity",
  "agy": "antigravity",
  "crom-agente": "crom-agente",
  "crom": "crom-agente",
  "cursor": "cursor",
  "copilot": "copilot",
  "codex": "codex",
  "aider": "aider",
  "mimo": "mimo",
};

export function createDeprecationNotice(params: {
  source: string;
  field?: string;
  message: string;
}): DeprecationNotice {
  return {
    code: DEPRECATION_CODE,
    source: params.source,
    field: params.field,
    message: params.message,
    migrationCommand: DEPRECATION_MIGRATION_COMMAND,
    firstDeprecatedAt: DEPRECATION_FIRST_DEPRECATED_AT,
    notBeforeRemovalAt: DEPRECATION_NOT_BEFORE_REMOVAL_AT,
    removeInVersion: DEPRECATION_REMOVE_IN_VERSION,
  };
}

export type DeprecationLogger = (formattedMessage: string, notice: DeprecationNotice) => void;

export class DeprecationEmitter {
  private emittedKeys = new Set<string>();
  private logger: DeprecationLogger;

  constructor(logger?: DeprecationLogger) {
    this.logger = logger ?? ((msg) => console.warn(msg));
  }

  public setLogger(logger: DeprecationLogger): void {
    this.logger = logger;
  }

  public getDeduplicationKey(notice: DeprecationNotice): string {
    return `${notice.source}::${notice.field || "*"}`;
  }

  public formatNotice(notice: DeprecationNotice): string {
    const fieldInfo = notice.field ? ` (campo: "${notice.field}")` : "";
    return `[DEPRECATION NOTICE] ${notice.message} [origem: ${notice.source}${fieldInfo}] — Execute "${notice.migrationCommand}" para atualizar. Removido não antes de ${notice.notBeforeRemovalAt} (v${notice.removeInVersion}).`;
  }

  public emit(notice: DeprecationNotice): boolean {
    const key = this.getDeduplicationKey(notice);
    if (this.emittedKeys.has(key)) {
      return false;
    }
    this.emittedKeys.add(key);
    this.logger(this.formatNotice(notice), notice);
    return true;
  }

  public emitAll(notices: DeprecationNotice[]): number {
    let count = 0;
    for (const notice of notices) {
      if (this.emit(notice)) {
        count++;
      }
    }
    return count;
  }

  public hasEmitted(notice: DeprecationNotice): boolean {
    return this.emittedKeys.has(this.getDeduplicationKey(notice));
  }

  public clear(): void {
    this.emittedKeys.clear();
  }

  public getEmittedCount(): number {
    return this.emittedKeys.size;
  }
}

export const defaultDeprecationEmitter = new DeprecationEmitter();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseModelString(modelStr: string, basePath = "model"): { provider: string; id: string } {
  const trimmed = modelStr.trim();
  if (!trimmed) {
    throw new LegacyConfigTranslationError("Identificador de modelo não pode ser vazio.", { path: basePath });
  }

  const firstSlash = trimmed.indexOf("/");
  if (firstSlash === -1) {
    throw new LegacyConfigTranslationError(
      `Identificador de modelo '${trimmed}' não possui prefixo de provedor. Formato esperado: 'provedor/modelo'.`,
      { path: basePath }
    );
  }

  const provider = trimmed.slice(0, firstSlash).trim();
  const id = trimmed.slice(firstSlash + 1).trim();

  if (!provider) {
    throw new LegacyConfigTranslationError(
      `Identificador de modelo '${trimmed}' possui provedor vazio antes da barra.`,
      { path: `${basePath}.provider` }
    );
  }

  if (!id) {
    throw new LegacyConfigTranslationError(
      `Identificador de modelo '${trimmed}' possui ID vazio após a barra.`,
      { path: `${basePath}.id` }
    );
  }

  return { provider, id };
}

/**
 * Tradutor puro de configurações legadas de motor para RuntimeConfig.
 *
 * Características:
 * - Não lê ou escreve arquivos em disco;
 * - Não realiza requisições de rede;
 * - Não muta o objeto de entrada;
 * - Idempotente e determinístico;
 * - Valida a saída contra runtimeConfigSchema;
 * - Emite DeprecationNotices estruturados sem poluir stdout.
 */
export function translateLegacyRuntimeConfig(
  input: unknown,
  context?: LegacyTranslationContext
): LegacyTranslationResult {
  if (!isPlainObject(input)) {
    throw new LegacyConfigTranslationError("Configuração inválida: esperava um objeto de configuração.", { path: "" });
  }

  const hasLegacyKeys =
    "harness" in input ||
    "harness_fallback" in input ||
    "engine_fallback" in input ||
    "model_fallback" in input ||
    "rotation" in input ||
    "binary_path" in input ||
    "timeout_min" in input;

  const rawEngineString = typeof input.engine === "string" ? input.engine.trim() : "";
  const isEngineAlias = rawEngineString ? Boolean(CANONICAL_ENGINE_ALIASES[rawEngineString.toLowerCase()]) : false;

  // Verificação de configuração já canônica e moderna
  if (!hasLegacyKeys && !isEngineAlias) {
    const parseResult = runtimeConfigSchema.safeParse(input);
    if (parseResult.success) {
      return {
        config: parseResult.data,
        translated: false,
        source: context?.source ?? "explicit",
        notices: [],
      };
    }
  }

  // Detecta a origem da configuração legada
  let source: LegacyConfigSource;
  if (context?.source) {
    source = context.source;
  } else if ("harness_fallback" in input || "binary_path" in input || "timeout_min" in input) {
    source = "runner.json";
  } else if ("harness" in input || "engine_fallback" in input || "model_fallback" in input || "rotation" in input) {
    source = "agent_frontmatter";
  } else {
    source = "legacy_config";
  }

  const notices: DeprecationNotice[] = [];

  function addNotice(field: string | undefined, message: string) {
    notices.push(
      createDeprecationNotice({
        source,
        field,
        message,
      })
    );
  }

  // Resolução de avisos específicos de runner.json
  if ("binary_path" in input && input.binary_path !== undefined) {
    addNotice("binary_path", "O campo 'binary_path' em runner.json está depreciado. Use settings.engines[<engine>].binary_path.");
  }
  if ("timeout_min" in input && input.timeout_min !== undefined) {
    addNotice("timeout_min", "O campo 'timeout_min' em runner.json está depreciado.");
  }

  // 1. Resolução do Motor (engine / harness)
  let rawEngine: string | undefined;
  if ("engine" in input && input.engine !== undefined && "harness" in input && input.harness !== undefined) {
    addNotice("harness", "O campo 'harness' está depreciado em favor de 'engine'.");
    if (typeof input.engine !== "string") {
      throw new LegacyConfigTranslationError("Campo 'engine' deve ser uma string.", { path: "engine" });
    }
    rawEngine = input.engine.trim();
  } else if ("engine" in input && input.engine !== undefined) {
    if (typeof input.engine !== "string") {
      throw new LegacyConfigTranslationError("Campo 'engine' deve ser uma string.", { path: "engine" });
    }
    rawEngine = input.engine.trim();
  } else if ("harness" in input && input.harness !== undefined) {
    addNotice("harness", "O campo 'harness' está depreciado. Defina a configuração usando 'engine'.");
    if (typeof input.harness !== "string") {
      throw new LegacyConfigTranslationError("Campo 'harness' deve ser uma string.", { path: "harness" });
    }
    rawEngine = input.harness.trim();
  }

  if (rawEngine !== undefined && rawEngine.length === 0) {
    throw new LegacyConfigTranslationError("Campo de motor ('engine'/'harness') não pode ser vazio.", { path: "engine" });
  }

  // Normalização de alias de motor
  let explicitEngine: string | undefined;
  if (rawEngine !== undefined) {
    const alias = CANONICAL_ENGINE_ALIASES[rawEngine.toLowerCase()];
    if (alias) {
      addNotice("engine", `O motor '${rawEngine}' é um alias legado depreciado. Use o identificador canônico '${alias}'.`);
      explicitEngine = alias;
    } else {
      explicitEngine = rawEngine;
    }
  }

  // Verificação de modelo bruto para inferência de motor
  let rawModelString: string | undefined;
  if (typeof input.model === "string") {
    rawModelString = input.model.trim();
  }

  let inferredEngineFromModel: string | undefined;
  let modelPrefixFound: string | undefined;
  if (rawModelString && rawModelString.includes("/")) {
    const prefix = rawModelString.slice(0, rawModelString.indexOf("/")).trim().toLowerCase();
    modelPrefixFound = prefix;
    if (LEGACY_ENGINE_PREFIX_MAP[prefix]) {
      inferredEngineFromModel = LEGACY_ENGINE_PREFIX_MAP[prefix];
    }
  }

  let finalEngine: string;
  if (explicitEngine !== undefined) {
    finalEngine = explicitEngine;
    if (inferredEngineFromModel && inferredEngineFromModel !== explicitEngine) {
      addNotice(
        "engine",
        `Motor explícito '${explicitEngine}' prevaleceu sobre a inferência do prefixo do modelo '${inferredEngineFromModel}'.`
      );
    }
  } else if (inferredEngineFromModel !== undefined) {
    finalEngine = inferredEngineFromModel;
    addNotice(
      "engine",
      `Motor de execução não declarado explicitamente; inferido como '${inferredEngineFromModel}' a partir do prefixo do modelo '${modelPrefixFound}'.`
    );
  } else if (context?.defaultEngine?.trim()) {
    finalEngine = context.defaultEngine.trim();
    addNotice("engine", `Motor não especificado; aplicando motor padrão configurado '${finalEngine}'.`);
  } else if (source === "runner.json" || "binary_path" in input || "harness_fallback" in input) {
    finalEngine = "opencode";
    addNotice("engine", "runner.json não especificou motor; aplicando padrão 'opencode'.");
  } else {
    throw new LegacyConfigTranslationError(
      "Não foi possível determinar o motor de execução. Informe 'engine' ou declare um modelo com prefixo conhecido.",
      { path: "engine" }
    );
  }

  // 2. Resolução do Modo (mode)
  let finalMode: "one-shot" | "conversation";
  if ("mode" in input && input.mode !== undefined) {
    if (input.mode !== "one-shot" && input.mode !== "conversation") {
      throw new LegacyConfigTranslationError("Campo 'mode' deve ser 'one-shot' ou 'conversation'.", { path: "mode" });
    }
    finalMode = input.mode;
  } else if (context?.defaultMode) {
    finalMode = context.defaultMode;
  } else {
    finalMode = "one-shot";
  }

  // 3. Resolução do Modelo (model)
  let finalModel: ModelRef;
  if (isPlainObject(input.model)) {
    const rawObj = input.model;
    if (typeof rawObj.provider !== "string" || !rawObj.provider.trim()) {
      throw new LegacyConfigTranslationError("Campo 'model.provider' deve ser uma string não vazia.", { path: "model.provider" });
    }
    if (typeof rawObj.id !== "string" || !rawObj.id.trim()) {
      throw new LegacyConfigTranslationError("Campo 'model.id' deve ser uma string não vazia.", { path: "model.id" });
    }
    finalModel = {
      provider: rawObj.provider.trim(),
      id: rawObj.id.trim(),
      ...(typeof rawObj.accountId === "string" && rawObj.accountId.trim() ? { accountId: rawObj.accountId.trim() } : {}),
    };
  } else if (typeof input.model === "string") {
    addNotice("model", `O modelo informado como string '${input.model.trim()}' está depreciado. Use o objeto estruturado { provider, id }.`);
    const parsed = parseModelString(input.model);
    finalModel = {
      provider: parsed.provider,
      id: parsed.id,
    };
  } else if (input.model === undefined || input.model === null) {
    if (context?.defaultModel) {
      if (typeof context.defaultModel === "string") {
        const parsed = parseModelString(context.defaultModel);
        finalModel = { provider: parsed.provider, id: parsed.id };
      } else {
        finalModel = {
          provider: context.defaultModel.provider.trim(),
          id: context.defaultModel.id.trim(),
          ...(context.defaultModel.accountId ? { accountId: context.defaultModel.accountId.trim() } : {}),
        };
      }
      addNotice("model", `Modelo não especificado; aplicando modelo padrão '${finalModel.provider}/${finalModel.id}'.`);
    } else if (source === "runner.json" || "binary_path" in input || "harness_fallback" in input) {
      finalModel = { provider: "opencode", id: "nemotron-3-ultra-free" };
      addNotice("model", "runner.json não especifica modelo; aplicando padrão 'opencode/nemotron-3-ultra-free'.");
    } else {
      throw new LegacyConfigTranslationError("Não foi possível determinar o modelo na configuração informada.", { path: "model" });
    }
  } else {
    throw new LegacyConfigTranslationError("Campo 'model' deve ser uma string ou um objeto { provider, id }.", { path: "model" });
  }

  // 4. Resolução de Fallbacks (fallback.engines e fallback.models)
  let rawFallbackEngines: unknown[] = [];
  if (isPlainObject(input.fallback) && Array.isArray(input.fallback.engines)) {
    rawFallbackEngines = input.fallback.engines;
  } else if (Array.isArray(input.harness_fallback)) {
    addNotice("harness_fallback", "O campo 'harness_fallback' está depreciado. Use 'fallback.engines'.");
    rawFallbackEngines = input.harness_fallback;
  } else if (Array.isArray(input.engine_fallback)) {
    addNotice("engine_fallback", "O campo 'engine_fallback' está depreciado. Use 'fallback.engines'.");
    rawFallbackEngines = input.engine_fallback;
  }

  const normalizedFallbackEngines: string[] = [];
  for (let i = 0; i < rawFallbackEngines.length; i++) {
    const item = rawFallbackEngines[i];
    if (typeof item !== "string" || !item.trim()) {
      throw new LegacyConfigTranslationError(
        `Item inválido no fallback de motores na posição ${i}: esperava string não vazia.`,
        { path: `fallback.engines[${i}]` }
      );
    }
    const trimmed = item.trim();
    const alias = CANONICAL_ENGINE_ALIASES[trimmed.toLowerCase()];
    normalizedFallbackEngines.push(alias ?? trimmed);
  }

  let rawFallbackModels: unknown[] = [];
  if (isPlainObject(input.fallback) && Array.isArray(input.fallback.models)) {
    rawFallbackModels = input.fallback.models;
  } else if (Array.isArray(input.model_fallback)) {
    addNotice("model_fallback", "O campo 'model_fallback' está depreciado. Use 'fallback.models'.");
    rawFallbackModels = input.model_fallback;
  } else if (Array.isArray(input.rotation)) {
    addNotice("rotation", "O campo 'rotation' de modelos está depreciado. Use 'fallback.models'.");
    rawFallbackModels = input.rotation;
  }

  const normalizedFallbackModels: Array<{ provider: string; id: string }> = [];
  for (let i = 0; i < rawFallbackModels.length; i++) {
    const item = rawFallbackModels[i];
    if (typeof item === "string") {
      const parsed = parseModelString(item, `fallback.models[${i}]`);
      normalizedFallbackModels.push(parsed);
    } else if (isPlainObject(item)) {
      if (typeof item.provider !== "string" || !item.provider.trim()) {
        throw new LegacyConfigTranslationError(
          `Item inválido no fallback de modelos na posição ${i}: campo 'provider' vazio.`,
          { path: `fallback.models[${i}].provider` }
        );
      }
      if (typeof item.id !== "string" || !item.id.trim()) {
        throw new LegacyConfigTranslationError(
          `Item inválido no fallback de modelos na posição ${i}: campo 'id' vazio.`,
          { path: `fallback.models[${i}].id` }
        );
      }
      normalizedFallbackModels.push({ provider: item.provider.trim(), id: item.id.trim() });
    } else {
      throw new LegacyConfigTranslationError(
        `Item inválido no fallback de modelos na posição ${i}: formato não suportado.`,
        { path: `fallback.models[${i}]` }
      );
    }
  }

  const rawConfig: RuntimeConfig = {
    engine: finalEngine,
    mode: finalMode,
    model: finalModel,
    fallback: {
      engines: normalizedFallbackEngines,
      models: normalizedFallbackModels,
    },
  };

  const parsedConfig = runtimeConfigSchema.parse(rawConfig);

  return {
    config: parsedConfig,
    translated: true,
    source,
    notices,
  };
}
