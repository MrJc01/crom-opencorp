export type EngineErrorCode =
  | "ENGINE_NOT_FOUND"
  | "ENGINE_UNAVAILABLE"
  | "PREFLIGHT_BINARY_MISSING"
  | "ENGINE_AUTH_REQUIRED"
  | "MODEL_INCOMPATIBLE"
  | "ENGINE_CAPABILITY_UNAVAILABLE";

export interface EngineErrorOptions {
  engineId?: string;
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly engineId?: string;
  readonly details?: Record<string, unknown>;

  constructor(code: EngineErrorCode, message: string, options: EngineErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.engineId = options.engineId;
    this.details = options.details;
  }
}

export class EngineNotFoundError extends EngineError {
  constructor(engineId: string) {
    super("ENGINE_NOT_FOUND", `Motor "${engineId}" não está registrado. Selecione um dos motores disponíveis.`, {
      engineId,
    });
  }
}

export class EngineUnavailableError extends EngineError {
  constructor(engineId: string, reason?: string, options: Omit<EngineErrorOptions, "engineId"> = {}) {
    const suffix = reason?.trim() ? `: ${reason.trim()}` : "";
    super("ENGINE_UNAVAILABLE", `Motor "${engineId}" indisponível${suffix}`, { ...options, engineId });
  }
}

export class PreflightBinaryMissingError extends EngineError {
  constructor(engineId: string, options: Omit<EngineErrorOptions, "engineId"> = {}) {
    super("PREFLIGHT_BINARY_MISSING", `Binário do motor "${engineId}" não encontrado no preflight.`, {
      ...options,
      engineId,
    });
  }
}

export class EngineAuthRequiredError extends EngineError {
  constructor(engineId: string, options: Omit<EngineErrorOptions, "engineId"> = {}) {
    super("ENGINE_AUTH_REQUIRED", `Motor "${engineId}" requer autenticação.`, { ...options, engineId });
  }
}

export class ModelIncompatibleError extends EngineError {
  constructor(engineId: string, modelId: string, options: Omit<EngineErrorOptions, "engineId"> = {}) {
    super("MODEL_INCOMPATIBLE", `Modelo "${modelId}" não é compatível com o motor "${engineId}".`, {
      ...options,
      engineId,
      details: { ...options.details, modelId },
    });
  }
}

export class EngineCapabilityUnavailableError extends EngineError {
  constructor(engineId: string, capability: string, options: Omit<EngineErrorOptions, "engineId"> = {}) {
    super("ENGINE_CAPABILITY_UNAVAILABLE", `Motor "${engineId}" não oferece a capacidade "${capability}".`, {
      ...options,
      engineId,
      details: { ...options.details, capability },
    });
  }
}
