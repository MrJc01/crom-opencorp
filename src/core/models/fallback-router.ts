/**
 * Roteamento de fallback auditável (Etapa 13, D1).
 *
 * Separa as quatro rotações — conta, modelo, provedor e motor — e registra o
 * motivo de cada decisão, inclusive dos candidatos descartados.
 *
 * Regras:
 *   1. Falha de cota: gira a conta do MESMO motor, se houver outra elegível.
 *   2. Senão, próximo modelo da cadeia EXPLÍCITA, compatível com o mesmo motor
 *      e permitido para agentes autônomos. Em falha de provedor, prefere um
 *      provedor diferente; em falta de créditos, só modelos gratuitos.
 *   3. Troca de motor somente se o motor seguinte estiver na cadeia explícita
 *      de motores (`engineChain`). Sem ela, o fallback para — nunca troca em silêncio.
 */
import { checkModelEngineCompatibility, explicitEngineOfModel, governanceOf, providerOfModel, type CatalogModel } from "./catalog.js";
import { ehModeloGratuito } from "../contexts/agents/model-resolver.js";

export type FailureKind = "quota" | "credits" | "provider" | "model" | "inactivity" | "auth" | "other";

export interface FallbackRequest {
  engineId: string;
  failedModel: string;
  failure: FailureKind;
  /** Cadeia explícita de modelos (agente → workspace). Nunca inventada. */
  modelChain: string[];
  /** Modelos já tentados nesta cadeia de execução. */
  tried?: string[];
  /** Há outra conta elegível do mesmo motor para este workspace? */
  accountAvailable?: boolean;
  /** Cadeia explícita de motores autorizada pelo usuário (vazia = nunca trocar). */
  engineChain?: string[];
  catalog?: CatalogModel[];
}

export type FallbackAction =
  | { action: "rotate_account"; engineId: string; model: string }
  | { action: "next_model"; engineId: string; model: string }
  | { action: "next_engine"; engineId: string; model: string }
  | { action: "stop" };

export interface FallbackAuditEntry {
  candidate?: string;
  decision: "chosen" | "skipped" | "stop";
  reason: string;
}

export interface FallbackDecision {
  result: FallbackAction;
  reason: string;
  audit: FallbackAuditEntry[];
}

export function classifyFailure(text: string, opts: { inactivity?: boolean } = {}): FailureKind {
  if (opts.inactivity) return "inactivity";
  if (/insufficient credits|créditos|credit balance|payment required|402/i.test(text)) return "credits";
  if (/usage limit|rate limit|quota|429|resource exhausted|status_cota|weekly usage|monthly usage/i.test(text)) return "quota";
  if (/unauthorized|401|403|auth(entication)? required|invalid api key|sign in/i.test(text)) return "auth";
  if (/model not found|unknown model|model .* not (supported|available)|modelo incompat/i.test(text)) return "model";
  if (/5\d\d|service unavailable|overloaded|timeout|ECONNRESET|ENOTFOUND|provider/i.test(text)) return "provider";
  return "other";
}

export function decideFallback(req: FallbackRequest): FallbackDecision {
  const audit: FallbackAuditEntry[] = [];
  const tried = new Set([req.failedModel, ...(req.tried ?? [])].map((m) => m.trim().toLowerCase()));

  if (req.failure === "auth") {
    audit.push({ decision: "stop", reason: "falha de autenticação: trocar modelo não resolve; exige ação do usuário" });
    return { result: { action: "stop" }, reason: audit.at(-1)!.reason, audit };
  }

  // 1. Conta (mesmo motor, mesmo modelo).
  if ((req.failure === "quota" || req.failure === "credits") && req.accountAvailable) {
    const reason = `cota/créditos esgotados em "${req.engineId}": nova conta do mesmo motor, mesmo modelo`;
    audit.push({ candidate: req.failedModel, decision: "chosen", reason });
    return { result: { action: "rotate_account", engineId: req.engineId, model: req.failedModel }, reason, audit };
  }

  // 2. Modelo (mesmo motor).
  const failedProvider = providerOfModel(req.failedModel);
  const pick = (preferOtherProvider: boolean) => {
    for (const raw of req.modelChain) {
      const model = raw.trim();
      const key = model.toLowerCase();
      if (!model || tried.has(key)) continue;
      const compat = checkModelEngineCompatibility(req.engineId, model, req.catalog);
      if (!compat.compatible) {
        audit.push({ candidate: model, decision: "skipped", reason: `incompatível com o motor atual: ${compat.reason}` });
        tried.add(key);
        continue;
      }
      const gov = governanceOf(model);
      if (!gov.allowedAutonomous) {
        audit.push({ candidate: model, decision: "skipped", reason: `bloqueado para rotação autônoma: ${gov.reason}` });
        tried.add(key);
        continue;
      }
      if (req.failure === "credits" && !ehModeloGratuito(model)) {
        audit.push({ candidate: model, decision: "skipped", reason: "sem créditos: apenas modelos gratuitos" });
        tried.add(key);
        continue;
      }
      if (preferOtherProvider && providerOfModel(model) === failedProvider) continue;
      return model;
    }
    return undefined;
  };
  const preferOther = req.failure === "provider";
  const next = pick(preferOther) ?? (preferOther ? pick(false) : undefined);
  if (next) {
    const reason = `${describe(req.failure)}: próximo modelo da cadeia explícita no mesmo motor "${req.engineId}"`;
    audit.push({ candidate: next, decision: "chosen", reason });
    return { result: { action: "next_model", engineId: req.engineId, model: next }, reason, audit };
  }

  // 3. Motor — só com cadeia explícita.
  const chain = req.engineChain ?? [];
  const index = chain.indexOf(req.engineId);
  const nextEngine = chain.slice(index + 1)[0];
  if (nextEngine) {
    // Trocar de motor exige evidência positiva de compatibilidade (prefixo do
    // motor ou catálogo) — "modelo desconhecido" não basta.
    const model = req.modelChain.find((m) => {
      const verdict = checkModelEngineCompatibility(nextEngine, m.trim(), req.catalog);
      const evidence = explicitEngineOfModel(m.trim()) === nextEngine || (verdict.compatible && verdict.basis === "catalog");
      return verdict.compatible && evidence && governanceOf(m).allowedAutonomous;
    });
    if (model) {
      const reason = `cadeia de modelos esgotada em "${req.engineId}": motor seguinte autorizado explicitamente ("${nextEngine}")`;
      audit.push({ candidate: model, decision: "chosen", reason });
      return { result: { action: "next_engine", engineId: nextEngine, model }, reason, audit };
    }
  }
  const reason = chain.length === 0
    ? `cadeia de modelos compatíveis com "${req.engineId}" esgotada; troca de motor não autorizada (sem cadeia explícita de motores)`
    : nextEngine
      ? `cadeia de modelos esgotada em "${req.engineId}"; nenhum modelo da cadeia tem compatibilidade comprovada com "${nextEngine}"`
      : `cadeias de modelos e motores esgotadas`;
  audit.push({ decision: "stop", reason });
  return { result: { action: "stop" }, reason, audit };
}

function describe(failure: FailureKind): string {
  switch (failure) {
    case "quota": return "cota esgotada sem outra conta";
    case "credits": return "créditos esgotados";
    case "provider": return "falha do provedor";
    case "model": return "modelo indisponível";
    case "inactivity": return "modelo inativo";
    default: return "falha de execução";
  }
}

/** Texto único para o journal/ledger a partir de uma decisão. */
export function formatFallbackAudit(decision: FallbackDecision): string {
  const parts = decision.audit.map((a) => `${a.decision === "chosen" ? "✓" : a.decision === "skipped" ? "✗" : "■"} ${a.candidate ? `${a.candidate}: ` : ""}${a.reason}`);
  return parts.join(" | ");
}
