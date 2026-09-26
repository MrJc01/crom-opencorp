import { z } from "zod";

export const ID_AGENTE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const agentSchema = z.object({
  id: z.string().regex(ID_AGENTE_RE, "use kebab-case (letras minúsculas, números e hífens)"),
  role: z.string().min(1),
  category: z.enum(["ceo", "secretario", "operario", "custom"]),
  model: z
    .string()
    .regex(/^[a-z0-9_-]+\/\S+$/i, "use o formato provider/model (ex.: opencode/nemotron-3-ultra-free)"),
  inherits: z.string().min(1).nullable().optional(),
  tools: z.array(z.string().min(1)).min(1),
  permissions: z.enum(["level-1", "level-2", "level-3"]),
  budget: z.object({
    daily_usd: z.number().nonnegative(),
    max_turns: z.number().int().nonnegative().default(0),
  }),
  /** Motor de execução preferido do agente (opencode, claude-code, antigravity, etc.) */
  harness: z.string().optional(),
  /** Alias para harness (motor do agente) */
  engine: z.string().optional(),
  /** Lista de fallback de motores para este agente */
  harness_fallback: z.array(z.string()).optional(),
  /** Alias para harness_fallback */
  engine_fallback: z.array(z.string()).optional(),
  /** Lista de fallback/rotação de modelos personalizada para este agente */
  rotation: z.array(z.string()).optional(),
  /** Alias para rotation */
  model_fallback: z.array(z.string()).optional(),
  /** Se true, se todos os modelos do agente falharem, recorre à rotação do workspace */
  workspace_rotation_fallback: z.boolean().default(true).optional(),
  /** Alias para workspace_rotation_fallback */
  rotacao_global: z.boolean().optional(),
  /** Skills declaradas para o agente (nomes kebab-case instalados em .opencorp/skills/) */
  skills: z
    .array(
      z
        .string()
        .regex(ID_AGENTE_RE, "use kebab-case (letras minúsculas, números e hífens)"),
    )
    .default([]),
  /** Etapa 5 — agentes de catálogo nascem desativados; legados sem o campo = ativos */
  ativo: z.boolean().default(true),
  /** Driver de execução preferido deste agente (sandbox|host|docker|podman). Sobrescreve o global/workspace. */
  execution_driver: z.enum(["sandbox", "host", "docker", "podman", "container"]).optional(),
  memory: z
    .object({
      reads: z.array(z.string().min(1)).default([]),
      writes: z.array(z.string().min(1)).default([]),
    })
    .prefault({}),
});

export type Agente = z.infer<typeof agentSchema>;

export interface AgenteArquivo {
  frontmatter: Agente;
  corpo: string;
  path?: string;
}

export class AgentSchemaError extends Error {
  readonly exitCode = 2;

  constructor(mensagem: string) {
    super(mensagem);
    this.name = "AgentSchemaError";
  }
}

const ANINHADO = Symbol("aninhado");

function converterValor(bruto: string): unknown {
  const t = bruto.trim();
  if (t === "") return ANINHADO;
  if (t === "null") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t.startsWith("[") && t.endsWith("]")) {
    const interno = t.slice(1, -1).trim();
    if (interno === "") return [];
    return interno.split(",").map((item) => converterValor(item.trim()));
  }
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

export function parseYamlSimples(texto: string): Record<string, unknown> {
  const raiz: Record<string, unknown> = {};
  const pilha: { indentacao: number; obj: Record<string, unknown> }[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    const semIndent = linha.trim();
    if (semIndent.length === 0 || semIndent.startsWith("#")) continue;
    const indentacao = linha.length - linha.trimStart().length;
    const m = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(semIndent);
    if (!m) {
      throw new Error(`linha não reconhecida: "${semIndent}"`);
    }
    const chave = m[1]!;
    const bruto = m[2]!;
    while (pilha.length > 0 && pilha[pilha.length - 1]!.indentacao >= indentacao) {
      pilha.pop();
    }
    const atual = pilha.length > 0 ? pilha[pilha.length - 1]!.obj : raiz;
    const valor = converterValor(bruto);
    if (valor === ANINHADO) {
      const obj: Record<string, unknown> = {};
      atual[chave] = obj;
      pilha.push({ indentacao, obj });
    } else {
      atual[chave] = valor;
    }
  }
  return raiz;
}

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export function parseAgenteMd(conteudo: string): AgenteArquivo {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)([\s\S]*)$/.exec(conteudo);
  if (!m) {
    throw new AgentSchemaError(
      "arquivo de agente sem frontmatter — comece com '---', o YAML de configuração, outro '---' e então o prompt do sistema",
    );
  }
  let dados: Record<string, unknown>;
  try {
    dados = parseYamlSimples(m[1]!);
  } catch (erro) {
    throw new AgentSchemaError(`frontmatter inválido: ${msg(erro)}`);
  }
  const parsed = agentSchema.safeParse(dados);
  if (!parsed.success) {
    const iss = parsed.error.issues[0]!;
    const campo = iss.path.join(".") || "(raiz)";
    throw new AgentSchemaError(`campo inválido "${campo}": ${iss.message}`);
  }
  return { frontmatter: canonicalizarAgente(parsed.data), corpo: m[2]!.replace(/^\r?\n/, "") };
}

/** Aliases de motor aceitos em frontmatters antigos (mesmo mapa do tradutor legado). */
const ALIAS_MOTOR: Record<string, string> = {
  crom: "crom-agente",
  cromagente: "crom-agente",
  claude: "claude-code",
  claudecode: "claude-code",
  agy: "antigravity",
  "cursor-agent": "cursor",
  cursorcli: "cursor",
  "github-copilot": "copilot",
  "gh-copilot": "copilot",
  "copilot-cli": "copilot",
  "openai-codex": "codex",
  openai: "codex",
};

export function motorCanonico(id: string): string {
  const k = id.trim().toLowerCase();
  return ALIAS_MOTOR[k] ?? k;
}

/**
 * Forma canônica em memória (Etapa 14): `engine` é o campo oficial; `harness`
 * e `harness_fallback` são mantidos iguais só para leitores antigos;
 * `model_fallback` é unido a `rotation`. Idempotente.
 */
export function canonicalizarAgente(ag: Agente): Agente {
  const motor = ag.engine ?? ag.harness;
  const fallback = ag.engine_fallback ?? ag.harness_fallback;
  const rotacao = [...new Set([...(ag.rotation ?? []), ...(ag.model_fallback ?? [])])];
  const out: Agente = { ...ag };
  if (motor) { out.engine = motorCanonico(motor); out.harness = out.engine; }
  if (fallback) { out.engine_fallback = [...new Set(fallback.map(motorCanonico))]; out.harness_fallback = out.engine_fallback; }
  if (rotacao.length > 0) { out.rotation = rotacao; out.model_fallback = undefined; }
  return out;
}

/** Campos legados presentes no YAML bruto de um agente (para a migração). */
export function camposLegadosAgente(dados: Record<string, unknown>): string[] {
  const legados: string[] = [];
  for (const campo of ["harness", "harness_fallback", "model_fallback"]) if (campo in dados) legados.push(campo);
  for (const campo of ["engine", "harness"]) {
    const v = dados[campo];
    if (typeof v === "string" && motorCanonico(v) !== v.trim()) legados.push(`${campo}:alias`);
  }
  return legados;
}

export function normalizarIdAgente(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function validarIdAgente(idBruto: string): string {
  const id = normalizarIdAgente(idBruto);
  if (id.length === 0 || !ID_AGENTE_RE.test(id) || id.length > 64) {
    throw new AgentSchemaError(
      `id de agente inválido: "${idBruto}" — use kebab-case (letras minúsculas, números e hífens; ex.: auditor-fiscal, no máximo 64 caracteres)`,
    );
  }
  return id;
}
