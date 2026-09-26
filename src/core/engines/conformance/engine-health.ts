/**
 * Saúde multinível de motores (Etapa 11).
 *
 * Níveis, cumulativos e em ordem:
 *   installed      binário/SDK encontrado (barato)
 *   authenticated  conta/sessão válida (barato)
 *   inference      inferência mínima concluída (real, opt-in)
 *   streaming      eventos de texto recebidos (real, opt-in)
 *   tools          ferramenta de leitura concluída (real, opt-in; só se declarada)
 *   conversation   sessão continuada corretamente (real, opt-in; só se declarada)
 *   lifecycle      nenhum processo remanescente após o probe (real, opt-in)
 *
 * Os níveis baratos nunca fazem inferência. Os reais exigem confirmação
 * explícita de custo, modelo explícito, orçamento de tokens e tempo, e rodam
 * num workspace temporário. O relatório não guarda prompt nem resposta.
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "../events.js";
import type { EngineAdapter } from "../ports.js";
import { isCapabilityAvailable } from "../manifests.js";
import { runConversationProbe } from "../conversation-probe.js";
import type { ProcessRegistry } from "../../runtime/process-registry.js";

export const HEALTH_LEVELS = ["installed", "authenticated", "inference", "streaming", "tools", "conversation", "lifecycle"] as const;
export type HealthLevel = (typeof HEALTH_LEVELS)[number];

/** Níveis que executam inferência real e consomem cota. */
export const REAL_HEALTH_LEVELS: readonly HealthLevel[] = ["inference", "streaming", "tools", "conversation", "lifecycle"];

export type LevelStatus = "passed" | "failed" | "skipped" | "unsupported";

export interface LevelResult {
  level: HealthLevel;
  status: LevelStatus;
  detail?: string;
  latencyMs?: number;
}

export interface EngineHealthReport {
  engineId: string;
  requestedLevel: HealthLevel;
  version: string | null;
  model: string | null;
  startedAt: string;
  durationMs: number;
  totalTokens?: number;
  /** Maior nível consecutivo aprovado a partir de `installed`. */
  highestPassed: HealthLevel | null;
  ok: boolean;
  results: LevelResult[];
}

export interface EngineHealthOptions {
  adapter: EngineAdapter;
  homeDir: string;
  level: HealthLevel;
  /** Obrigatório para níveis reais: probes nunca escolhem modelo. */
  model?: string;
  /** Confirmação explícita de que o probe real pode consumir cota. */
  allowRealProbe?: boolean;
  timeoutMs?: number;
  maxTotalTokens?: number;
  /** Registro de processos usado para verificar o nível `lifecycle`. */
  processRegistry?: ProcessRegistry;
}

export const DEFAULT_HEALTH_TIMEOUT_MS = 120_000;
export const DEFAULT_HEALTH_MAX_TOKENS = 20_000;

export class HealthProbeRequestError extends Error {}

export function isHealthLevel(value: unknown): value is HealthLevel {
  return typeof value === "string" && (HEALTH_LEVELS as readonly string[]).includes(value);
}

/** Valida a requisição antes de qualquer execução. */
export function validateHealthRequest(opts: Pick<EngineHealthOptions, "level" | "model" | "allowRealProbe">): void {
  if (!REAL_HEALTH_LEVELS.includes(opts.level)) return;
  if (!opts.allowRealProbe) {
    throw new HealthProbeRequestError(`O nível "${opts.level}" executa inferência real e consome cota: confirme explicitamente o custo.`);
  }
  if (!opts.model?.trim() || opts.model.trim() === "default") {
    throw new HealthProbeRequestError(`O nível "${opts.level}" exige um modelo explícito; probes nunca escolhem modelo.`);
  }
}

export async function runEngineHealth(opts: EngineHealthOptions): Promise<EngineHealthReport> {
  validateHealthRequest(opts);
  const started = Date.now();
  const target = HEALTH_LEVELS.indexOf(opts.level);
  const wants = (level: HealthLevel) => HEALTH_LEVELS.indexOf(level) <= target;
  const results: LevelResult[] = [];
  const push = (r: LevelResult) => results.push(r);
  const skipRest = (from: HealthLevel, reason: string) => {
    for (const level of HEALTH_LEVELS.slice(HEALTH_LEVELS.indexOf(from))) {
      if (wants(level) && !results.some((r) => r.level === level)) push({ level, status: "skipped", detail: reason });
    }
  };
  const report = (): EngineHealthReport => {
    let highest: HealthLevel | null = null;
    for (const level of HEALTH_LEVELS) {
      const r = results.find((x) => x.level === level);
      if (!r) break;
      if (r.status === "passed") highest = level;
      else if (r.status === "unsupported") continue;
      else break;
    }
    const requested = results.filter((r) => wants(r.level));
    return {
      engineId: opts.adapter.engineId,
      requestedLevel: opts.level,
      version,
      model: opts.model?.trim() || null,
      startedAt: new Date(started).toISOString(),
      durationMs: Date.now() - started,
      totalTokens: totalTokens || undefined,
      highestPassed: highest,
      ok: requested.length > 0 && requested.every((r) => r.status === "passed" || r.status === "unsupported"),
      results,
    };
  };
  let version: string | null = null;
  let totalTokens = 0;

  // installed
  const t0 = Date.now();
  const install = await opts.adapter.installer.status(opts.homeDir).catch((e) => ({ installed: false, isManaged: false, path: null, version: null, details: String(e?.message ?? e) }));
  version = install.version ?? null;
  push(install.installed
    ? { level: "installed", status: "passed", detail: install.path ?? undefined, latencyMs: Date.now() - t0 }
    : { level: "installed", status: "failed", detail: install.details ?? "binário não encontrado", latencyMs: Date.now() - t0 });
  if (!install.installed) { skipRest("authenticated", "requer nível installed"); return report(); }
  if (!wants("authenticated")) return report();

  // authenticated
  const t1 = Date.now();
  const auth = await opts.adapter.authenticator.status(opts.homeDir).catch((e) => ({ authenticated: false, method: "erro", details: String(e?.message ?? e) }));
  push({ level: "authenticated", status: auth.authenticated ? "passed" : "failed", detail: `${auth.method}${auth.details ? ` — ${auth.details}` : ""}`, latencyMs: Date.now() - t1 });
  if (!auth.authenticated) { skipRest("inference", "requer nível authenticated"); return report(); }
  if (!wants("inference")) return report();

  // Níveis reais: workspace temporário, orçamento e tempo.
  const model = opts.model!.trim();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
  const maxTokens = opts.maxTotalTokens ?? DEFAULT_HEALTH_MAX_TOKENS;
  const workspace = await mkdtemp(join(tmpdir(), `opencorp-health-${opts.adapter.engineId}-`));
  const workspaceId = `health-${randomUUID().slice(0, 8)}`;
  try {
    const marker = `OK-${randomUUID().slice(0, 8).toUpperCase()}`;
    const one = await runOneShot(opts, workspace, workspaceId, model, `Responda exatamente com o texto ${marker} e nada mais. Não execute comandos.`, timeoutMs, maxTokens);
    totalTokens += one.tokens;
    push(one.completed && one.text.includes(marker)
      ? { level: "inference", status: "passed", latencyMs: one.latencyMs }
      : { level: "inference", status: "failed", latencyMs: one.latencyMs, detail: one.failure ?? "resposta sem o marcador solicitado" });
    if (wants("streaming")) {
      push(one.deltas > 0
        ? { level: "streaming", status: "passed" }
        : { level: "streaming", status: "failed", detail: "nenhum message.delta recebido" });
    }
    if (results.at(-1)?.status !== "passed") { skipRest("tools", "requer níveis anteriores"); return report(); }

    if (wants("tools")) {
      if (!isCapabilityAvailable(opts.adapter.manifest, "tools") && opts.adapter.manifest.features.tools?.level !== "declared") {
        push({ level: "tools", status: "unsupported", detail: "ferramentas não declaradas no manifesto" });
      } else {
        const secret = `ARQ-${randomUUID().slice(0, 8).toUpperCase()}`;
        await writeFile(join(workspace, "probe.txt"), `${secret}\n`);
        const tool = await runOneShot(opts, workspace, workspaceId, model, "Leia o arquivo probe.txt deste diretório com uma ferramenta e responda somente com o conteúdo dele.", timeoutMs, maxTokens - totalTokens);
        totalTokens += tool.tokens;
        push(tool.completed && tool.text.includes(secret)
          ? { level: "tools", status: "passed", latencyMs: tool.latencyMs, detail: tool.toolCalls > 0 ? `${tool.toolCalls} chamada(s) de ferramenta` : "conteúdo lido (ferramenta não reportada em evento)" }
          : { level: "tools", status: "failed", latencyMs: tool.latencyMs, detail: tool.failure ?? "o conteúdo do arquivo não foi devolvido" });
        if (results.at(-1)?.status === "failed") { skipRest("conversation", "requer nível tools"); return report(); }
      }
    }

    if (wants("conversation")) {
      if (!opts.adapter.conversationRuntime) {
        push({ level: "conversation", status: "unsupported", detail: "motor sem runtime conversacional" });
      } else {
        const conv = await runConversationProbe({
          runtime: opts.adapter.conversationRuntime,
          workspaceId,
          workspacePath: workspace,
          homeDir: opts.homeDir,
          model,
          turnTimeoutMs: timeoutMs,
          maxTotalTokens: Math.max(0, maxTokens - totalTokens),
        });
        totalTokens += conv.totalTokens ?? 0;
        push({ level: "conversation", status: conv.checks.conversation.status === "passed" ? "passed" : "failed", latencyMs: conv.checks.conversation.latencyMs, detail: conv.checks.conversation.detail ?? conv.checks.inference.detail });
        if (results.at(-1)?.status === "failed") { skipRest("lifecycle", "requer nível conversation"); return report(); }
      }
    }

    if (wants("lifecycle")) {
      const registry = opts.processRegistry;
      if (!registry) {
        push({ level: "lifecycle", status: "skipped", detail: "sem ProcessRegistry para verificar" });
      } else {
        const key = `${opts.adapter.engineId}::${workspaceId}`;
        const record = registry.get(key);
        if (record) await registry.terminate(record.key, "health_probe");
        const alive = record ? isPidAlive(record.pid) : false;
        push(alive
          ? { level: "lifecycle", status: "failed", detail: `processo ${record!.pid} continua ativo após o encerramento` }
          : { level: "lifecycle", status: "passed", detail: record ? `processo ${record.pid} encerrado` : "nenhum processo residente" });
      }
    }
    return report();
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function runOneShot(
  opts: EngineHealthOptions,
  workspace: string,
  workspaceId: string,
  model: string,
  prompt: string,
  timeoutMs: number,
  remainingTokens: number
): Promise<{ text: string; deltas: number; toolCalls: number; completed: boolean; failure?: string; tokens: number; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  const out = { text: "", deltas: 0, toolCalls: 0, completed: false, failure: undefined as string | undefined, tokens: 0, latencyMs: 0 };
  let budgetExceeded = false;
  try {
    const events = opts.adapter.runner.run(
      { workspaceId, workspacePath: workspace, sessionId: `health-${randomUUID()}`, agentId: "health-probe", model, prompt, homeDir: opts.homeDir, timeoutMs },
      controller.signal
    ) as AsyncIterable<AgentEvent>;
    for await (const event of events) {
      if (event.type === "message.delta") { out.deltas += 1; out.text += event.text; }
      else if (event.type === "tool.requested") out.toolCalls += 1;
      else if (event.type === "usage.updated" && typeof event.usage.totalTokens === "number") {
        out.tokens += event.usage.totalTokens;
        if (out.tokens > remainingTokens) { budgetExceeded = true; controller.abort(); }
      } else if (event.type === "run.completed") {
        out.completed = event.result.stopReason !== "cancelled" && event.result.stopReason !== "timeout";
        if (!out.text) out.text = event.result.output;
        if (!out.completed) out.failure = budgetExceeded ? "orçamento de tokens excedido" : `tempo limite de ${timeoutMs} ms excedido`;
      } else if (event.type === "run.failed") {
        out.failure = controller.signal.aborted && !budgetExceeded ? `tempo limite de ${timeoutMs} ms excedido` : event.error.message;
      }
    }
  } catch (error) {
    out.failure = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timer);
    out.latencyMs = Date.now() - started;
  }
  if (budgetExceeded) { out.completed = false; out.failure = "orçamento de tokens excedido"; }
  return out;
}
