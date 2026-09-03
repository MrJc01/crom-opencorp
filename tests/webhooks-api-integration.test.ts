import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { createApiServer } from "../src/server/index.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { HookStore } from "../src/core/hook-store.js";
import { ApprovalsStore } from "../src/core/approvals-store.js";

describe("Webhooks API — Integração HTTP Completa", () => {
  let homeDir: string;
  let wsId: string;
  let wsPath: string;
  let server: Server;
  let baseUrl: string;
  let apiToken: string;

  beforeAll(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "opencorp-webhook-api-test-"));
    const wm = new WorkspaceManager({ homeDir });
    const ws = await wm.criar("corp-webhook-test");
    wsId = ws.id;
    wsPath = ws.path;
    apiToken = "test-token-webhook-12345";

    const criado = createApiServer({
      homeDir,
      token: apiToken,
      instalarMencoes: false,
    });
    server = criado.server;
    server.listen(0, "127.0.0.1");
    const port = await criado.porta;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(homeDir, { recursive: true, force: true });
  });

  async function reqApi(path: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
    };
    if (!headers["authorization"] && !headers["Authorization"] && !path.startsWith("/hooks/")) {
      headers["Authorization"] = `Bearer ${apiToken}`;
    }
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  }

  it("cria um webhook via POST /hooks com auth Bearer token", async () => {
    const { status, json } = await reqApi(`/hooks?workspace=${wsId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: "Deploy Hook",
        alvo: {
          tipo: "task_create",
          titulo: "Deploy do serviço {{payload.service}} por {{payload.author}}",
        },
        auth: {
          tipo: "token",
          secret: "segredo-super-secreto-123",
        },
        respond: "imediato",
      }),
    });

    expect(status).toBe(201);
    expect(json.id).toMatch(/^hook-/);
    expect(json.url).toBe(`/hooks/${wsId}/${json.id}`);
  });

  it("rejeita disparo público sem token com 401", async () => {
    const hookStore = new HookStore();
    const hook = await hookStore.criar(wsPath, wsId, {
      nome: "Hook Protegido",
      alvo: { tipo: "task_create", titulo: "Task Teste" },
      auth: { tipo: "token", secret: "token-secreto-xyz" },
      respond: "imediato",
    });

    const res = await fetch(`${baseUrl}/hooks/${wsId}/${hook.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: "valor" }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.erro).toContain("token do hook ausente ou inválido");
  });

  it("aceita disparo público com token via Authorization: Bearer", async () => {
    const hookStore = new HookStore();
    const hook = await hookStore.criar(wsPath, wsId, {
      nome: "Hook Token Bearer",
      alvo: { tipo: "task_create", titulo: "Task por {{payload.origem}}" },
      auth: { tipo: "token", secret: "token-bearer-valido" },
      respond: "imediato",
    });

    const res = await fetch(`${baseUrl}/hooks/${wsId}/${hook.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer token-bearer-valido",
      },
      body: JSON.stringify({ origem: "ci-pipeline" }),
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("iniciado");
  });

  it("valida autenticação HMAC-SHA256 e rejeita assinatura incorreta", async () => {
    const secretHmac = "minha-chave-secreta-hmac-256";
    const hookStore = new HookStore();
    const hook = await hookStore.criar(wsPath, wsId, {
      nome: "Hook HMAC GitHub",
      alvo: { tipo: "task_create", titulo: "Alerta GitHub" },
      auth: { tipo: "hmac_sha256", secret: secretHmac },
      respond: "imediato",
    });

    const corpo = JSON.stringify({ action: "opened", issue: { number: 42 } });

    // 1. Assinatura inválida
    const resInvalida = await fetch(`${baseUrl}/hooks/${wsId}/${hook.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": "sha256=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      },
      body: corpo,
    });
    expect(resInvalida.status).toBe(401);

    // 2. Assinatura válida
    const hmac = createHmac("sha256", secretHmac);
    hmac.update(corpo);
    const sigValida = `sha256=${hmac.digest("hex")}`;

    const resValida = await fetch(`${baseUrl}/hooks/${wsId}/${hook.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": sigValida,
      },
      body: corpo,
    });
    expect(resValida.status).toBe(202);
    const jsonValida = await resValida.json();
    expect(jsonValida.ok).toBe(true);
  });

  it("retém disparo para aprovação humana quando exige_aprovacao = true", async () => {
    const hookStore = new HookStore();
    const hook = await hookStore.criar(wsPath, wsId, {
      nome: "Hook com HITL Mandatório",
      alvo: {
        tipo: "agent_run",
        agente: "devops",
        ordem: "Reiniciar cluster {{payload.cluster}}",
      },
      auth: { tipo: "nenhuma" },
      exige_aprovacao: true,
      respond: "imediato",
    });

    const res = await fetch(`${baseUrl}/hooks/${wsId}/${hook.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cluster: "producao-k8s" }),
    });

    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.status).toBe("aguardando_aprovacao");
    expect(json.mensagem).toContain("aprovação humana");

    // Aguarda o disparo assíncrono gravar a pendência
    await new Promise((r) => setTimeout(r, 100));

    // Verifica que a pendência foi registrada na ApprovalsStore
    const approvalsStore = new ApprovalsStore();
    const pendentes = await approvalsStore.pendentes(wsPath);
    const pendente = pendentes.find((p) => p.ordem.includes("producao-k8s"));
    expect(pendente).toBeDefined();
    expect(pendente?.agente).toBe("devops");
    expect(pendente?.motivo_guard).toContain("Webhook");
  });
});
