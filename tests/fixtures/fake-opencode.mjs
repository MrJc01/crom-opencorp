#!/usr/bin/env node
// Fake opencode server para testes - responde nas rotas de sessão/mensagem
import { createServer } from "node:http";
import { parse } from "node:url";

// Parse argumentos: serve --port <porta> --hostname <host>
const args = process.argv.slice(2);
let PORT = 0;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && i + 1 < args.length) {
    PORT = parseInt(args[i + 1], 10);
  }
}
if (!PORT) {
  console.error("FAKE_OPENCODE_PORT:0");
  process.exit(1);
}

const sessions = new Map();
let sessionCounter = 0;

function send(res, status, data) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

function generateId() {
  return `ses_${++sessionCounter}_${Date.now().toString(36)}`;
}

const server = createServer(async (req, res) => {
  const url = parse(req.url ?? "/", true);
  const path = url.pathname ?? "/";
  const method = req.method ?? "GET";

  // Health check
  if (path === "/health" && method === "GET") {
    send(res, 200, { ok: true });
    return;
  }

  // GET /session - list sessions
  if (path === "/session" && method === "GET") {
    const list = Array.from(sessions.values()).map((s) => ({
      id: s.id,
      title: s.title,
      created: s.created,
      updated: s.updated,
    }));
    send(res, 200, list);
    return;
  }

  // POST /session - create session
  if (path === "/session" && method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { title, agent } = body ? JSON.parse(body) : {};
    const id = generateId();
    const now = Date.now();
    const session = {
      id,
      title: title ?? "Nova sessão",
      agent,
      created: now,
      updated: now,
      messages: [],
    };
    sessions.set(id, session);
    send(res, 200, session);
    return;
  }

  // GET /session/:id - get session
  const matchGet = path.match(/^\/session\/([^/]+)$/);
  if (matchGet && method === "GET") {
    const id = matchGet[1];
    const session = sessions.get(id);
    if (!session) {
      send(res, 404, { error: "not found" });
      return;
    }
    send(res, 200, session);
    return;
  }

  // GET /session/:id/message - mensagens no formato opencode ≥1.18 ([{info:{role,time},parts}])
  // (o proxy do stream usa esta rota — sem ela o stream fica preso esperando a resposta)
  const matchMsgs = path.match(/^\/session\/([^/]+)\/message$/);
  if (matchMsgs && method === "GET") {
    const session = sessions.get(matchMsgs[1]);
    if (!session) {
      send(res, 404, { error: "not found" });
      return;
    }
    send(res, 200, session.messages.map((m, i) => ({
      info: { id: `${session.id}_msg_${i}`, role: m.role, time: m.time },
      parts: m.parts,
    })));
    return;
  }

  // POST /session/:id/truncate - trunca histórico para edição (manter_ate = qtos msgs manter)
  const matchTrunc = path.match(/^\/session\/([^/]+)\/truncate$/);
  if (matchTrunc && method === "POST") {
    const id = matchTrunc[1];
    const session = sessions.get(id);
    if (!session) {
      send(res, 404, { error: "not found" });
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const { manter_ate } = body ? JSON.parse(body) : {};
    const manter = typeof manter_ate === "number" ? Math.floor(manter_ate) : -1;
    if (!Number.isInteger(manter) || manter < 0) {
      send(res, 400, { error: "manter_ate deve ser >=0" });
      return;
    }
    // mensagem filtrada no proxy = user/assistant com conteúdo; no fake, todas têm conteúdo, então raw length == filtrado
    // Para simplificar, tratamos manter_ate como índice na lista raw filtrada (user/assistant) — como o proxy faz
    // Vamos mapear raw -> filtrado da mesma forma que o proxy, depois truncar
    const filtradosIdx = session.messages
      .map((m, idx) => ({ m, idx, content: (m.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n").trim() }))
      .filter((x) => (x.m.role === "user" || x.m.role === "assistant") && x.content.length > 0)
      .map((x) => x.idx);
    if (manter > filtradosIdx.length) {
      send(res, 400, { error: `manter_ate ${manter} fora do range` });
      return;
    }
    if (manter < filtradosIdx.length) {
      const corteIdx = filtradosIdx[manter];
      session.messages = session.messages.slice(0, corteIdx);
      session.updated = Date.now();
    }
    send(res, 200, { ok: true, removidos: session.messages.length });
    return;
  }

  // POST /session/:id/message - send message (SYNCHRONOUS response with assistant message)
  const matchMsg = path.match(/^\/session\/([^\/]+)\/message$/);
  if (matchMsg && method === "POST") {
    const id = matchMsg[1];
    const session = sessions.get(id);
    if (!session) {
      send(res, 404, { error: "not found" });
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const { parts } = body ? JSON.parse(body) : {};
    const userMsg = {
      role: "user",
      parts: parts ?? [{ type: "text", text: "" }],
      time: { created: Date.now() },
    };
    session.messages.push(userMsg);
    session.updated = Date.now();

    // Mensagem que pede ação ("crie…") → resposta com TOOL PART (exercita o
    // evento "acao" do stream: itens com tool/status/resumo)
    const textoUsuario = parts?.[0]?.text ?? "mensagem";
    const pedeAcao = /^crie/i.test(textoUsuario.trim());
    const respostaParts = pedeAcao
      ? [
          {
            type: "tool",
            tool: "opencorp_task_create",
            callID: "call-e2e-1",
            state: { status: "completed", title: "", input: { titulo: "Task criada pelo e2e" } },
          },
          { type: "text", text: `Task criada com ID: tsk-e2e-1` },
        ]
      : [{ type: "text", text: `Resposta do assistant para: ${textoUsuario}` }];
    const assistantMsg = {
      role: "assistant",
      parts: respostaParts,
      time: { created: Date.now(), completed: Date.now() + 100 },
    };
    session.messages.push(assistantMsg);
    session.updated = Date.now();

    // Retorno no formato que o proxy espera: { info: { role: "assistant" }, parts: [...] }
    send(res, 200, {
      info: { role: "assistant" },
      parts: assistantMsg.parts,
    });
    return;
  }

  send(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  const addr = server.address();
  if (addr && typeof addr === "object") {
    console.log(`FAKE_OPENCODE_PORT:${addr.port}`);
  } else {
    console.error("FAKE_OPENCODE_PORT:0");
    process.exit(1);
  }
});