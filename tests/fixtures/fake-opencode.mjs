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

  // POST /session/:id/message - send message (SYNCHRONOUS response with assistant message)
  const matchMsg = path.match(/^\/session\/([^/]+)\/message$/);
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

    // Resposta SÍNCRONA com role assistant — o proxy extrai texto quando info.role === "assistant"
    const textoUsuario = parts?.[0]?.text ?? "mensagem";
    const assistantMsg = {
      role: "assistant",
      parts: [{ type: "text", text: `Resposta do assistant para: ${parts?.[0]?.text ?? "mensagem"}` }],
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