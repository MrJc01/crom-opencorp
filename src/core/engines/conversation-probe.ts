import { randomUUID } from "node:crypto";
import type { AgentEvent } from "./events.js";
import type { ConversationRef, ConversationRuntime } from "./ports.js";

/**
 * Probe real e opt-in de um runtime conversacional.
 *
 * Executa dois turnos curtos numa conversa nova e verifica inferência,
 * streaming e continuação. Nunca aprova ações do motor, respeita um orçamento
 * de tokens e de tempo, e não devolve prompt nem resposta — apenas se o
 * marcador esperado apareceu.
 */

export interface ConversationProbeOptions {
  runtime: ConversationRuntime;
  workspaceId: string;
  workspacePath: string;
  homeDir: string;
  /** Modelo explícito. Probes nunca usam modelo escolhido ao acaso. */
  model: string;
  /** Tempo máximo por turno. */
  turnTimeoutMs?: number;
  /** Orçamento total de tokens informado pelo motor (soma dos turnos). */
  maxTotalTokens?: number;
}

export type ProbeCheckStatus = "passed" | "failed" | "skipped";

export interface ProbeCheck {
  status: ProbeCheckStatus;
  detail?: string;
  latencyMs?: number;
}

export interface ConversationProbeReport {
  engineId: string;
  model: string;
  startedAt: string;
  totalTokens?: number;
  budgetExceeded: boolean;
  approvalsRejected: number;
  checks: {
    inference: ProbeCheck;
    streaming: ProbeCheck;
    conversation: ProbeCheck;
  };
}

export const DEFAULT_PROBE_TURN_TIMEOUT_MS = 120_000;
export const DEFAULT_PROBE_MAX_TOTAL_TOKENS = 40_000;

interface TurnOutcome {
  text: string;
  deltas: number;
  completed: boolean;
  failure?: string;
  tokens?: number;
  latencyMs: number;
  approvalsRejected: number;
  budgetExceeded: boolean;
}

export async function runConversationProbe(opts: ConversationProbeOptions): Promise<ConversationProbeReport> {
  const turnTimeoutMs = opts.turnTimeoutMs ?? DEFAULT_PROBE_TURN_TIMEOUT_MS;
  const maxTotalTokens = opts.maxTotalTokens ?? DEFAULT_PROBE_MAX_TOTAL_TOKENS;
  const marker = `PROBE-${randomUUID().slice(0, 8).toUpperCase()}`;
  const report: ConversationProbeReport = {
    engineId: opts.runtime.engineId,
    model: opts.model,
    startedAt: new Date().toISOString(),
    budgetExceeded: false,
    approvalsRejected: 0,
    checks: {
      inference: { status: "skipped" },
      streaming: { status: "skipped" },
      conversation: { status: "skipped" },
    },
  };

  let ref: ConversationRef | undefined;
  let tokensUsed = 0;
  try {
    ref = await opts.runtime.create({
      workspaceId: opts.workspaceId,
      workspacePath: opts.workspacePath,
      homeDir: opts.homeDir,
      model: opts.model,
      title: "OpenCorp probe",
    });

    const first = await runTurn(
      opts,
      ref,
      `Responda exatamente com o texto ${marker} e nada mais. Não execute comandos nem altere arquivos.`,
      turnTimeoutMs,
      maxTotalTokens - tokensUsed
    );
    tokensUsed += first.tokens ?? 0;
    report.approvalsRejected += first.approvalsRejected;
    report.budgetExceeded ||= first.budgetExceeded;
    report.checks.inference = first.completed && first.text.includes(marker)
      ? { status: "passed", latencyMs: first.latencyMs }
      : { status: "failed", latencyMs: first.latencyMs, detail: first.failure ?? "resposta sem o marcador solicitado" };
    report.checks.streaming = first.deltas > 0
      ? { status: "passed" }
      : { status: "failed", detail: "nenhum message.delta recebido" };

    if (report.checks.inference.status === "passed" && !report.budgetExceeded) {
      const second = await runTurn(
        opts,
        ref,
        "Repita exatamente o texto que você respondeu na mensagem anterior e nada mais.",
        turnTimeoutMs,
        maxTotalTokens - tokensUsed
      );
      tokensUsed += second.tokens ?? 0;
      report.approvalsRejected += second.approvalsRejected;
      report.budgetExceeded ||= second.budgetExceeded;
      report.checks.conversation = second.completed && second.text.includes(marker)
        ? { status: "passed", latencyMs: second.latencyMs }
        : { status: "failed", latencyMs: second.latencyMs, detail: second.failure ?? "o segundo turno não recuperou o contexto" };
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (report.checks.inference.status === "skipped") report.checks.inference = { status: "failed", detail };
  } finally {
    if (ref) await opts.runtime.close(ref).catch(() => {});
  }
  report.totalTokens = tokensUsed || undefined;
  return report;
}

async function runTurn(
  opts: ConversationProbeOptions,
  ref: ConversationRef,
  text: string,
  timeoutMs: number,
  remainingTokens: number
): Promise<TurnOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  const outcome: TurnOutcome = { text: "", deltas: 0, completed: false, latencyMs: 0, approvalsRejected: 0, budgetExceeded: false };
  try {
    for await (const event of opts.runtime.send(ref, { text }, controller.signal) as AsyncIterable<AgentEvent>) {
      if (event.type === "message.delta") {
        outcome.deltas += 1;
        outcome.text += event.text;
      } else if (event.type === "approval.requested") {
        outcome.approvalsRejected += 1;
        await opts.runtime.respondApproval?.(event.approval.id, "reject", { workspaceId: opts.workspaceId });
      } else if (event.type === "usage.updated" && typeof event.usage.totalTokens === "number") {
        outcome.tokens = (outcome.tokens ?? 0) + event.usage.totalTokens;
        if (outcome.tokens > remainingTokens) {
          outcome.budgetExceeded = true;
          controller.abort();
        }
      } else if (event.type === "run.completed") {
        outcome.completed = event.result.stopReason !== "cancelled";
        if (!outcome.text) outcome.text = event.result.output;
        if (event.result.stopReason === "cancelled") {
          outcome.failure = outcome.budgetExceeded ? "orçamento de tokens excedido" : `tempo limite de ${timeoutMs} ms excedido`;
        }
      } else if (event.type === "run.failed") {
        outcome.failure = event.error.message;
      }
    }
  } finally {
    clearTimeout(timer);
    outcome.latencyMs = Date.now() - started;
  }
  return outcome;
}
