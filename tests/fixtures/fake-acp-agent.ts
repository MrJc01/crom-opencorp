/**
 * Agente ACP v1 falso e determinístico, em processo (transporte em memória).
 *
 * Perfis reproduzem as capacidades anunciadas nos handshakes reais:
 * - "copilot": loadSession, close, list; sem fork/resume; sem configOptions de modelo.
 * - "mimo": loadSession, fork, resume, list; `configOptions` com o seletor `model`.
 *
 * Vocabulário de cenários pelo texto do prompt: "erro" → erro JSON-RPC;
 * "lento" → só termina com session/cancel; "permissão" → session/request_permission
 * antes de responder; "morrer" → o processo encerra no meio do turno.
 * Caso contrário: ferramenta de leitura + "Olá, resposta para: <texto>" em chunks.
 */
import type { JsonRpcTransport } from "../../src/core/engines/index.js";

export type AcpProfile = "copilot" | "mimo";

export interface FakeAcpOptions {
  profile?: AcpProfile;
  /** Divide cada linha de saída em pedaços deste tamanho (frames parciais). */
  chunkSize?: number;
  /** Junta várias mensagens num único chunk. */
  coalesce?: boolean;
  /** `session/new` responde erro de autenticação. */
  requireAuth?: boolean;
  /** Protocolo anunciado no `initialize`. */
  protocolVersion?: number;
  /** Emite uma notificação sem requisição logo após o initialize. */
  unsolicitedNotification?: boolean;
  /** Responde requisições concorrentes em ordem inversa. */
  reverseResponses?: boolean;
}

export interface FakeAcpProcess extends JsonRpcTransport {
  /** Escreve no stderr do processo falso. */
  logError(line: string): void;
  pid: number;
  alive: boolean;
  received: any[];
  permissionOutcomes: any[];
  sessions: Set<string>;
  args: string[];
}

class ChunkQueue {
  private items: string[] = [];
  private waiters: Array<(r: IteratorResult<string>) => void> = [];
  private done = false;
  push(s: string) {
    if (this.done) return;
    const w = this.waiters.shift();
    if (w) w({ value: s, done: false });
    else this.items.push(s);
  }
  end() {
    this.done = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined as any, done: true });
  }
  async *iterate() {
    while (true) {
      if (this.items.length) { yield this.items.shift()!; continue; }
      if (this.done) return;
      const r = await new Promise<IteratorResult<string>>((res) => this.waiters.push(res));
      if (r.done) return;
      yield r.value;
    }
  }
}

let nextPid = 9100;

export function createFakeAcpAgent(args: string[] = [], opts: FakeAcpOptions = {}): FakeAcpProcess {
  const profile = opts.profile ?? "mimo";
  const out = new ChunkQueue();
  const err = new ChunkQueue();
  let resolveExit!: (code: number) => void;
  const exitCode = new Promise<number>((r) => { resolveExit = r; });
  const pending: string[] = [];
  let flushScheduled = false;
  const heldResponses: any[] = [];
  let serverRequestId = 1000;
  const waitingPermission = new Map<number, (outcome: any) => void>();
  const activePrompts = new Map<string, { id: number; cancel: () => void }>();

  const proc: FakeAcpProcess = {
    pid: ++nextPid,
    alive: true,
    received: [],
    permissionOutcomes: [],
    sessions: new Set(),
    args,
    stdout: out.iterate(),
    stderr: err.iterate(),
    logError: (line: string) => err.push(`${line}\n`),
    exitCode,
    write(data: string) {
      for (const line of data.split("\n")) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        proc.received.push(msg);
        void handle(msg);
      }
      return true;
    },
    kill() {
      die(0);
    },
  };

  function die(code: number) {
    if (!proc.alive) return;
    proc.alive = false;
    out.end();
    err.end();
    resolveExit(code);
  }

  function emit(message: unknown) {
    if (!proc.alive) return;
    const line = `${JSON.stringify(message)}\n`;
    if (opts.coalesce) {
      pending.push(line);
      if (!flushScheduled) {
        flushScheduled = true;
        setTimeout(() => { flushScheduled = false; out.push(pending.splice(0).join("")); }, 1);
      }
      return;
    }
    if (opts.chunkSize) {
      for (let i = 0; i < line.length; i += opts.chunkSize) out.push(line.slice(i, i + opts.chunkSize));
      return;
    }
    out.push(line);
  }

  const respond = (id: number, result: unknown) => {
    if (opts.reverseResponses) { heldResponses.push({ jsonrpc: "2.0", id, result }); return; }
    emit({ jsonrpc: "2.0", id, result });
  };
  const fail = (id: number, code: number, message: string) => emit({ jsonrpc: "2.0", id, error: { code, message } });
  const update = (sessionId: string, u: unknown) => emit({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: u } });

  const modelOptions = [
    { id: "model", name: "Model", category: "model", type: "select", currentValue: "xiaomi/mimo-v2.6-flash", options: [
      { value: "xiaomi/mimo-v2.6-flash", name: "Flash" },
      { value: "xiaomi/mimo-v2.6-pro", name: "Pro" },
    ] },
  ];

  const newSession = () => {
    const id = `ses_${profile}_${proc.sessions.size + 1}`;
    proc.sessions.add(id);
    return id;
  };

  async function handle(msg: any) {
    const { id, method, params } = msg;
    // Resposta do cliente a uma requisição nossa (permissão).
    if (method === undefined && id !== undefined) {
      const resume = waitingPermission.get(id);
      if (resume) { waitingPermission.delete(id); proc.permissionOutcomes.push(msg.result?.outcome ?? msg.error); resume(msg.result?.outcome); }
      return;
    }
    switch (method) {
      case "initialize":
        respond(id, {
          protocolVersion: opts.protocolVersion ?? 1,
          agentCapabilities: {
            loadSession: true,
            mcpCapabilities: { http: true, sse: true },
            promptCapabilities: { image: true, embeddedContext: true },
            sessionCapabilities: profile === "copilot" ? { close: {}, list: {} } : { fork: {}, list: {}, resume: {} },
          },
          agentInfo: { name: profile === "copilot" ? "Copilot" : "OpenCode", version: "fake" },
          authMethods: [{ id: `${profile}-login`, name: "Login" }],
        });
        if (opts.unsolicitedNotification) update("ses_desconhecida", { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "RUÍDO" } });
        if (opts.reverseResponses) flushHeld();
        return;
      case "session/new": {
        if (opts.requireAuth) return fail(id, -32000, "Authentication required");
        const sessionId = newSession();
        respond(id, profile === "mimo" ? { sessionId, configOptions: modelOptions } : { sessionId });
        if (opts.reverseResponses) flushHeld();
        return;
      }
      case "session/load":
      case "session/resume": {
        if (method === "session/resume" && profile === "copilot") return fail(id, -32601, "Method not found");
        if (!proc.sessions.has(params.sessionId)) return fail(id, -32002, "Session not found");
        if (method === "session/load") update(params.sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "HISTÓRICO" } });
        return respond(id, profile === "mimo" ? { configOptions: modelOptions } : {});
      }
      case "session/fork": {
        if (profile === "copilot") return fail(id, -32601, "Method not found");
        return respond(id, { sessionId: newSession(), configOptions: modelOptions });
      }
      case "session/close":
        if (profile !== "copilot") return fail(id, -32601, "Method not found");
        return respond(id, {});
      case "session/set_config_option":
        modelOptions[0]!.currentValue = params.value;
        return respond(id, { configOptions: modelOptions });
      case "session/cancel": {
        activePrompts.get(params.sessionId)?.cancel();
        return;
      }
      case "session/prompt":
        return prompt(id, params.sessionId, String(params.prompt?.[0]?.text ?? ""));
      default:
        if (id !== undefined) fail(id, -32601, `Method not found: ${method}`);
    }
  }

  function flushHeld() {
    setTimeout(() => { for (const r of heldResponses.splice(0).reverse()) emit(r); }, 5);
  }

  async function prompt(id: number, sessionId: string, text: string) {
    if (!proc.sessions.has(sessionId)) return fail(id, -32002, "Session not found");
    let cancelled = false;
    let wake: () => void = () => {};
    const cancelledPromise = new Promise<void>((r) => { wake = r; });
    activePrompts.set(sessionId, { id, cancel: () => { cancelled = true; wake(); } });
    const finish = (stopReason: string, usage?: unknown) => {
      activePrompts.delete(sessionId);
      emit({ jsonrpc: "2.0", id, result: { stopReason, ...(usage ? { usage } : {}) } });
    };

    if (text.includes("sem crédito")) {
      // Comportamento real do MiMo 0.1.15: erro só no stderr e `end_turn` vazio.
      proc.logError("error: MiMo free API service has ended. Sign in or configure a third-party API.");
      return finish("end_turn");
    }
    if (text.includes("erro")) { activePrompts.delete(sessionId); return fail(id, -32603, "Model not found: x/y"); }
    if (text.includes("morrer")) {
      update(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "começando" } });
      setTimeout(() => die(1), 5);
      return;
    }
    if (text.includes("lento")) {
      await cancelledPromise;
      return finish("cancelled");
    }
    if (text.includes("permissão")) {
      const reqId = serverRequestId++;
      const outcome = await new Promise<any>((resolve) => {
        waitingPermission.set(reqId, resolve);
        void cancelledPromise.then(() => {
          // O cliente deve responder "cancelled" às permissões pendentes; aguardamos a resposta.
        });
        emit({ jsonrpc: "2.0", id: reqId, method: "session/request_permission", params: {
          sessionId,
          toolCall: { toolCallId: "call_perm", title: "git push origin main", kind: "execute", rawInput: { command: "git push origin main" } },
          options: [
            { optionId: "opt-allow", name: "Allow once", kind: "allow_once" },
            { optionId: "opt-always", name: "Always", kind: "allow_always" },
            { optionId: "opt-reject", name: "Reject", kind: "reject_once" },
          ],
        } });
      });
      if (cancelled || outcome?.outcome === "cancelled") return finish("cancelled");
      if (outcome?.optionId === "opt-reject") {
        update(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "rejeitado" } });
        return finish("end_turn");
      }
    }
    update(sessionId, { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "pensando" } });
    update(sessionId, { sessionUpdate: "tool_call", toolCallId: "call_1", title: "Ler a.txt", kind: "read", status: "pending", rawInput: { path: "a.txt" } });
    update(sessionId, { sessionUpdate: "tool_call_update", toolCallId: "call_1", status: "completed", content: [{ type: "content", content: { type: "text", text: "conteúdo" } }] });
    for (const t of ["Olá, ", "resposta para: ", text]) update(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: t } });
    finish("end_turn", { inputTokens: 100, outputTokens: 20, thoughtTokens: 5, totalTokens: 125 });
  }

  return proc;
}
