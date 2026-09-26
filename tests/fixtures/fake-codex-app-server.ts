/**
 * Fakes do Codex para testes: `codex app-server` (JSON-RPC por linhas via stdio)
 * e `codex exec --json` (one-shot), seguindo o protocolo gerado por
 * `codex app-server generate-ts` (Etapa 8).
 *
 * Vocabulário de cenários pelo texto da mensagem, igual ao do fake OpenCode:
 * "erro" → turno falha; "lento" → só termina se interrompido; "permissão" →
 * pede aprovação de comando antes de responder. Caso contrário responde
 * "Olá, resposta para: <texto>" em deltas, com uma execução de comando.
 */
import { randomUUID } from "node:crypto";
import type {
  CodexAppServerHandle,
  CodexAppServerLaunchOptions,
  CodexLaunchOptions,
  CodexProcessHandle,
} from "../../src/core/engines/index.js";

class LineQueue {
  private values: string[] = [];
  private waiters: Array<(value: IteratorResult<string>) => void> = [];
  private closed = false;
  push(value: unknown) {
    if (this.closed) return;
    const line = `${JSON.stringify(value)}\n`;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: line, done: false });
    else this.values.push(line);
  }
  close() {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined as any, done: true });
  }
  async *iterate() {
    while (true) {
      if (this.values.length) {
        yield this.values.shift()!;
        continue;
      }
      if (this.closed) return;
      const next = await new Promise<IteratorResult<string>>((resolve) => this.waiters.push(resolve));
      if (next.done) return;
      yield next.value;
    }
  }
}

export interface FakeCodexServer {
  pid: number;
  alive: boolean;
  messages: any[];
}

export interface FakeCodex {
  servers: FakeCodexServer[];
  appServerLauncher: (opts: CodexAppServerLaunchOptions) => Promise<CodexAppServerHandle>;
  cliLauncher: (opts: CodexLaunchOptions) => Promise<CodexProcessHandle>;
  /** Processos falsos ainda vivos (app-servers e one-shots). */
  liveProcesses(): number;
}

export function createFakeCodex(): FakeCodex {
  const servers: FakeCodexServer[] = [];
  let liveOneShots = 0;
  let nextPid = 7000;

  const reply = (out: LineQueue, threadId: string, turnId: string, text: string) => {
    out.push({ method: "item/started", params: { threadId, turnId, item: { id: "cmd-1", type: "commandExecution", command: "cat a.txt" } } });
    out.push({ method: "item/completed", params: { threadId, turnId, item: { id: "cmd-1", type: "commandExecution", command: "cat a.txt", aggregatedOutput: "conteúdo", exitCode: 0 } } });
    for (const delta of ["Olá, ", "resposta para: ", text]) {
      out.push({ method: "item/agentMessage/delta", params: { threadId, turnId, itemId: "msg", delta } });
    }
    out.push({ method: "thread/tokenUsage/updated", params: { threadId, turnId, tokenUsage: { last: { inputTokens: 100, outputTokens: 25, totalTokens: 125 } } } });
    out.push({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } });
  };

  async function appServerLauncher(_opts: CodexAppServerLaunchOptions): Promise<CodexAppServerHandle> {
    const out = new LineQueue();
    let resolveExit!: (code: number) => void;
    const exitCode = new Promise<number>((resolve) => { resolveExit = resolve; });
    const server: FakeCodexServer = { pid: ++nextPid, alive: true, messages: [] };
    servers.push(server);
    const threads = new Set<string>();
    const waitingApproval = new Map<number, { threadId: string; turnId: string; text: string }>();
    let turnCounter = 0;
    let requestId = 0;
    const exit = () => {
      if (!server.alive) return;
      server.alive = false;
      out.close();
      resolveExit(0);
    };
    return {
      pid: server.pid,
      stdout: out.iterate(),
      exitCode,
      kill: () => exit(),
      write(line) {
        const message = JSON.parse(line);
        server.messages.push(message);
        const p = message.params ?? {};
        switch (message.method) {
          case "initialize":
            out.push({ id: message.id, result: { userAgent: "fake-codex" } });
            return;
          case "thread/start": {
            const id = randomUUID();
            threads.add(id);
            out.push({ id: message.id, result: { thread: { id } } });
            return;
          }
          case "thread/resume":
            if (!threads.has(p.threadId)) threads.add(p.threadId);
            out.push({ id: message.id, result: { thread: { id: p.threadId } } });
            return;
          case "thread/fork": {
            const id = randomUUID();
            threads.add(id);
            out.push({ id: message.id, result: { thread: { id } } });
            return;
          }
          case "turn/start": {
            const turnId = `turn-${++turnCounter}`;
            const threadId = p.threadId;
            const text = String(p.input?.[0]?.text ?? "");
            out.push({ id: message.id, result: { turn: { id: turnId } } });
            if (text.includes("erro")) {
              out.push({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "failed", error: { message: "Model not found: x/y" } } } });
            } else if (text.includes("lento")) {
              // só termina com turn/interrupt
            } else if (text.includes("permissão")) {
              const id = requestId++;
              waitingApproval.set(id, { threadId, turnId, text });
              out.push({ method: "item/commandExecution/requestApproval", id, params: { threadId, turnId, itemId: "cmd", command: "git push origin main", kind: "command" } });
            } else {
              reply(out, threadId, turnId, text);
            }
            return;
          }
          case "turn/interrupt":
            out.push({ id: message.id, result: {} });
            out.push({ method: "turn/completed", params: { threadId: p.threadId, turn: { id: p.turnId, status: "interrupted" } } });
            return;
          default:
            // Resposta do cliente a uma solicitação do servidor (aprovação).
            if (message.method === undefined && waitingApproval.has(message.id)) {
              const turn = waitingApproval.get(message.id)!;
              waitingApproval.delete(message.id);
              reply(out, turn.threadId, turn.turnId, turn.text);
            }
        }
      },
    };
  }

  async function cliLauncher(opts: CodexLaunchOptions): Promise<CodexProcessHandle> {
    liveOneShots += 1;
    const prompt = opts.args.at(-1) ?? "";
    let done!: (code: number) => void;
    const exitCode = new Promise<number>((resolve) => { done = resolve; });
    async function* stdout() {
      try {
        yield `${JSON.stringify({ type: "thread.started", thread_id: randomUUID() })}\n`;
        yield `${JSON.stringify({ type: "item.completed", item: { id: "msg", type: "agent_message", text: `Olá, resposta para: ${prompt}` } })}\n`;
        yield `${JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } })}\n`;
      } finally {
        liveOneShots -= 1;
        done(0);
      }
    }
    return { pid: ++nextPid, stdout: stdout(), exitCode, kill: () => {} };
  }

  return {
    servers,
    appServerLauncher,
    cliLauncher,
    liveProcesses: () => servers.filter((s) => s.alive).length + liveOneShots,
  };
}
