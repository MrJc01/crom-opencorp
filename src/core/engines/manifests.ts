import { EngineError } from "./errors.js";

export type CapabilitySupportLevel = "unsupported" | "declared" | "integrated" | "verified";

export type EngineTransport = "spawn_cli" | "http_server" | "stdio_jsonrpc" | "embedded";

export interface FeatureCapability {
  level: CapabilitySupportLevel;
  notes?: string;
  flags?: string[];
}

export type FeatureKey =
  | "streaming"
  | "continuation"
  | "fork"
  | "hitl"
  | "tools"
  | "mcp"
  | "images"
  | "cancellation";

export interface EngineCapabilityManifest {
  engineId: string;
  name: string;
  transport: EngineTransport;
  features: Record<FeatureKey, FeatureCapability>;
  supportsConversation?: boolean;
  details?: Record<string, unknown>;
}

export function isCapabilityAvailable(
  manifest: EngineCapabilityManifest,
  feature: FeatureKey
): boolean {
  const cap = manifest?.features?.[feature];
  if (!cap) return false;
  return cap.level === "integrated" || cap.level === "verified";
}

export function manifestSupportsConversation(manifest: EngineCapabilityManifest): boolean {
  if (typeof manifest.supportsConversation === "boolean") {
    return manifest.supportsConversation;
  }
  return manifest.features?.continuation?.level !== "unsupported";
}

export class InvalidEngineManifestError extends EngineError {
  constructor(engineId: string, reason: string) {
    super("ENGINE_CAPABILITY_UNAVAILABLE", `Manifesto do motor "${engineId}" é inválido: ${reason}`, {
      engineId,
    });
  }
}

export function validateEngineCapabilityManifest(raw: unknown): EngineCapabilityManifest {
  if (typeof raw !== "object" || raw === null) {
    throw new InvalidEngineManifestError("unknown", "esperava um objeto de manifesto");
  }

  const m = raw as Partial<EngineCapabilityManifest>;
  if (!m.engineId || typeof m.engineId !== "string" || !m.engineId.trim()) {
    throw new InvalidEngineManifestError("unknown", "campo 'engineId' é obrigatório");
  }

  const engineId = m.engineId.trim().toLowerCase();

  const validTransports: EngineTransport[] = ["spawn_cli", "http_server", "stdio_jsonrpc", "embedded"];
  if (!m.transport || !validTransports.includes(m.transport)) {
    throw new InvalidEngineManifestError(
      engineId,
      `campo 'transport' deve ser um dos: ${validTransports.join(", ")}`
    );
  }

  const requiredFeatures: FeatureKey[] = [
    "streaming",
    "continuation",
    "fork",
    "hitl",
    "tools",
    "mcp",
    "images",
    "cancellation",
  ];

  if (!m.features || typeof m.features !== "object") {
    throw new InvalidEngineManifestError(engineId, "campo 'features' é obrigatório");
  }

  const validLevels: CapabilitySupportLevel[] = ["unsupported", "declared", "integrated", "verified"];

  for (const feat of requiredFeatures) {
    const f = m.features[feat];
    if (!f || typeof f !== "object" || !validLevels.includes(f.level)) {
      throw new InvalidEngineManifestError(
        engineId,
        `feature '${feat}' deve possuir nível válido: ${validLevels.join(", ")}`
      );
    }
  }

  return raw as EngineCapabilityManifest;
}

export const CANONICAL_ENGINE_MANIFESTS: Record<string, EngineCapabilityManifest> = {
  "opencode": {
    engineId: "opencode",
    name: "OpenCode Engine",
    transport: "http_server",
    supportsConversation: true,
    features: {
      streaming: { level: "integrated", notes: "Via SSE do servidor HTTP" },
      continuation: { level: "integrated", flags: ["--session", "--continue"] },
      fork: { level: "integrated", flags: ["--fork"] },
      hitl: { level: "integrated", notes: "Suportado via rotas de aprovação" },
      tools: { level: "integrated", notes: "Ferramentas nativas e customizadas" },
      mcp: { level: "integrated", notes: "Integração MCP do OpenCode" },
      images: { level: "integrated", notes: "Modelos multimodais suportados" },
      cancellation: { level: "integrated", notes: "AbortSignal e DELETE em sessões" },
    },
  },
  "codex": {
    engineId: "codex",
    name: "OpenAI Codex CLI",
    transport: "stdio_jsonrpc",
    supportsConversation: true,
    features: {
      streaming: { level: "integrated", flags: ["item/agentMessage/delta"] },
      continuation: { level: "integrated", flags: ["thread/resume"] },
      fork: { level: "integrated", flags: ["thread/fork"] },
      hitl: { level: "integrated", notes: "Solicitações JSON-RPC encaminhadas ao HITL do Secretário" },
      tools: { level: "integrated", notes: "commandExecution e fileChange do app-server/exec traduzidos em tool.requested/tool.completed" },
      mcp: { level: "declared", notes: "Suporte MCP do Codex" },
      images: { level: "declared", notes: "Multimodal via modelos OpenAI" },
      cancellation: { level: "integrated", flags: ["turn/interrupt"], notes: "Interrupção do turno via JSON-RPC" },
    },
  },
  "claude-code": {
    engineId: "claude-code",
    name: "Anthropic Claude Code",
    transport: "spawn_cli",
    supportsConversation: true,
    features: {
      streaming: { level: "declared", flags: ["--verbose"] },
      continuation: { level: "declared", flags: ["--resume", "--continue"] },
      fork: { level: "declared", flags: ["--fork-session"] },
      hitl: { level: "declared", notes: "Confirmações manuais do CLI" },
      tools: { level: "declared", notes: "Ferramentas nativas do Claude Code" },
      mcp: { level: "declared", notes: "Configuração MCP em .claude.json" },
      images: { level: "declared", notes: "Suporte multimodal Anthropic" },
      cancellation: { level: "integrated", notes: "SIGTERM do subprocesso" },
    },
  },
  "antigravity": {
    engineId: "antigravity",
    name: "Google Antigravity (AGY)",
    transport: "spawn_cli",
    supportsConversation: true,
    features: {
      streaming: { level: "declared" },
      continuation: { level: "declared", flags: ["--conversation", "--continue"] },
      fork: { level: "unsupported", notes: "Sem suporte nativo a fork no CLI" },
      hitl: { level: "declared", notes: "Políticas de permissão skip-permissions/prompt" },
      tools: { level: "declared" },
      mcp: { level: "declared" },
      images: { level: "declared", notes: "Gemini Vision" },
      cancellation: { level: "integrated" },
    },
  },
  "copilot": {
    engineId: "copilot",
    name: "GitHub Copilot CLI",
    transport: "spawn_cli",
    supportsConversation: true,
    features: {
      streaming: { level: "declared" },
      continuation: { level: "declared", flags: ["--resume", "--continue", "--session-id"] },
      fork: { level: "unsupported" },
      hitl: { level: "declared" },
      tools: { level: "declared" },
      mcp: { level: "unsupported" },
      images: { level: "unsupported" },
      cancellation: { level: "integrated" },
    },
  },
  "cursor": {
    engineId: "cursor",
    name: "Cursor Agent CLI",
    transport: "spawn_cli",
    supportsConversation: true,
    features: {
      streaming: { level: "declared" },
      continuation: { level: "declared", flags: ["--resume", "--continue"] },
      fork: { level: "unsupported" },
      hitl: { level: "declared" },
      tools: { level: "declared" },
      mcp: { level: "unsupported" },
      images: { level: "unsupported" },
      cancellation: { level: "integrated" },
    },
  },
  "crom-agente": {
    engineId: "crom-agente",
    name: "Crom-Agente (Go)",
    transport: "spawn_cli",
    supportsConversation: true,
    features: {
      streaming: { level: "integrated", notes: "Streaming de chunks no stdout" },
      continuation: { level: "integrated", flags: ["--session"] },
      fork: { level: "unsupported", notes: "Sem fork nativo" },
      hitl: { level: "integrated", notes: "Controle de permissão via --permission-mode" },
      tools: { level: "integrated", notes: "Tools integradas pelo binário Crom" },
      mcp: { level: "unsupported" },
      images: { level: "unsupported" },
      cancellation: { level: "integrated", notes: "SIGTERM/SIGKILL do subprocesso" },
    },
  },
  "aider": {
    engineId: "aider",
    name: "Aider CLI",
    transport: "spawn_cli",
    supportsConversation: false,
    features: {
      streaming: { level: "unsupported" },
      continuation: { level: "unsupported", notes: "Sem resume/continue nativo por flag" },
      fork: { level: "unsupported" },
      hitl: { level: "unsupported" },
      tools: { level: "declared" },
      mcp: { level: "unsupported" },
      images: { level: "unsupported" },
      cancellation: { level: "integrated" },
    },
  },
  "mimo": {
    engineId: "mimo",
    name: "Xiaomi MiMo Code",
    transport: "spawn_cli",
    supportsConversation: false,
    features: {
      streaming: { level: "unsupported" },
      continuation: { level: "unsupported", notes: "Sem continuação nativa por flag de sessão" },
      fork: { level: "unsupported" },
      hitl: { level: "unsupported" },
      tools: { level: "declared", notes: "Execução direta via run" },
      mcp: { level: "unsupported" },
      images: { level: "declared", notes: "Modelos multimodais MiMo" },
      cancellation: { level: "integrated", notes: "Encerramento via SIGTERM do processo" },
    },
  },
};
