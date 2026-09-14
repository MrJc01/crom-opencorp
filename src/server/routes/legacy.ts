/**
 * Rotas Legadas — Extração Modular (MICRO-PASSO 15)
 * Manipula /teams/* e /hooks/* mantendo compatibilidade retroativa e emitindo avisos de depreciação.
 */

import type { RouteContext } from "./types.js";
import type { AlvoHook, Hook, PayloadHook } from "../../core/hook-store.js";
import { eventBus } from "../../core/event-bus.js";
import { extrairTokenBearer, compararTokensSeguro } from "../middleware/index.js";

class WebhookRateLimiter {
  private requests = new Map<string, number[]>();
  constructor(private limit = 30, private windowMs = 60_000) {}

  check(ip: string): { ok: boolean; retryAfter?: number } {
    const now = Date.now();
    const timestamps = (this.requests.get(ip) ?? []).filter((t) => now - t < this.windowMs);
    if (timestamps.length >= this.limit) {
      const oldest = timestamps[0] ?? now;
      const retryAfter = Math.ceil((oldest + this.windowMs - now) / 1000);
      return { ok: false, retryAfter: Math.max(retryAfter, 1) };
    }
    timestamps.push(now);
    this.requests.set(ip, timestamps);
    return { ok: true };
  }
}

const defaultWebhookLimiter = new WebhookRateLimiter(30, 60_000);

export async function handleLegacyRoutes(ctx: RouteContext): Promise<boolean> {
  const {
    req,
    res,
    url,
    rota,
    resolverWs,
    lerCorpo,
    enviar,
    teams,
    orquestrador,
    hooks,
    workspaces,
  } = ctx;
  const webhookLimiter = ctx.webhookLimiter ?? defaultWebhookLimiter;

  // ─────────────────────────────────────────────────────────────────────
  // 1. ROTAS LEGADAS DE TEAMS (/teams/*)
  // ─────────────────────────────────────────────────────────────────────
  if (rota === "/teams" || rota.startsWith("/teams/")) {
    console.warn(`[legacy] rota ${req.method} ${rota} acessada — considere migrar para flows`);

    if (!teams) {
      enviar(res, 500, { erro: "store de teams não configurada" });
      return true;
    }

    if (rota === "/teams" && req.method === "GET") {
      const ws = await resolverWs(url);
      enviar(res, 200, teams.listar(ws.path));
      return true;
    }

    if (rota === "/teams" && req.method === "POST") {
      const ws = await resolverWs(url);
      const corpo = (await lerCorpo(req)) as Record<string, unknown>;
      if (typeof corpo.criado_em !== "string" || corpo.criado_em.length === 0) {
        corpo.criado_em = new Date().toISOString();
      }
      const spec = teams.validarTexto(JSON.stringify(corpo), "POST /teams");
      await teams.salvar(ws.path, spec);
      enviar(res, 201, spec);
      return true;
    }

    const mTeam = /^\/teams\/([^/]+)(?:\/(run))?$/.exec(rota);
    if (mTeam) {
      const ws = await resolverWs(url);
      const teamId = decodeURIComponent(mTeam[1]!);
      const acao = mTeam[2];

      if (!acao && req.method === "GET") {
        enviar(res, 200, teams.obter(ws.path, teamId));
        return true;
      }

      if (!acao && req.method === "DELETE") {
        await teams.excluir(ws.path, teamId);
        enviar(res, 200, { ok: true, id: teamId });
        return true;
      }

      if (!acao && req.method === "PUT") {
        const corpo = (await lerCorpo(req)) as Record<string, unknown>;
        if (corpo.id && corpo.id !== teamId) {
          enviar(res, 422, { erro: `id do corpo ("${String(corpo.id)}") não bate com a rota ("${teamId}")` });
          return true;
        }
        const atual = teams.obter(ws.path, teamId);
        const spec = { ...corpo, id: teamId, criado_em: String(corpo.criado_em ?? atual.criado_em) };
        await teams.salvar(ws.path, spec as Parameters<typeof teams.salvar>[1]);
        eventBus.emit("team.salvo", { team: teamId });
        enviar(res, 200, spec);
        return true;
      }

      if (acao === "run" && req.method === "POST") {
        if (!orquestrador) {
          enviar(res, 500, { erro: "orquestrador de teams não configurado" });
          return true;
        }
        const corpo = (await lerCorpo(req)) as { entrada?: string; sessao_por_integrante?: boolean };
        const resOrq = await orquestrador.executar(ws.path, teamId, String(corpo.entrada ?? ""));
        const sessaoPorIntegrante = corpo.sessao_por_integrante !== false;
        if (!sessaoPorIntegrante) {
          enviar(res, 200, resOrq);
          return true;
        }
        enviar(res, 200, {
          ...resOrq,
          total: resOrq.passos.length,
          resumos: resOrq.passos.map((p) => ({
            agente: p.agente,
            sessao: p.sessao,
            resumo: p.resumo,
            ok: p.ok,
          })),
        });
        return true;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. ROTAS LEGADAS DE HOOKS (/hooks/*)
  // ─────────────────────────────────────────────────────────────────────
  if (rota === "/hooks" || rota.startsWith("/hooks/")) {
    console.warn(`[legacy] rota ${req.method} ${rota} acessada — considere usar flows com nó webhook`);

    if (!hooks) {
      enviar(res, 500, { erro: "store de hooks não configurada" });
      return true;
    }

    if (rota === "/hooks" && req.method === "GET") {
      const ws = await resolverWs(url);
      enviar(res, 200, hooks.listar(ws.path).map((h) => ({ ...h, token: undefined })));
      return true;
    }

    if (rota === "/hooks" && req.method === "POST") {
      const ws = await resolverWs(url);
      const corpo = (await lerCorpo(req)) as Record<string, unknown>;
      const alvo = corpo.alvo as AlvoHook;
      const h = await hooks.criar(ws.path, ws.id, {
        nome: String(corpo.nome ?? ""),
        alvo,
        respond: corpo.respond as "imediato" | "final" | undefined,
        dedup_seg: typeof corpo.dedup_seg === "number" ? corpo.dedup_seg : undefined,
        token: typeof corpo.token === "string" ? corpo.token : undefined,
        auth: corpo.auth as any,
        exige_aprovacao: Boolean(corpo.exige_aprovacao),
        reenvio_urls: Array.isArray(corpo.reenvio_urls) ? corpo.reenvio_urls : undefined,
      });
      enviar(res, 201, { ...h, url: `/hooks/${ws.id}/${h.id}` });
      return true;
    }

    const mHook = /^\/hooks\/([^/]+)$/.exec(rota);
    if (mHook && req.method === "GET") {
      const ws = await resolverWs(url);
      enviar(res, 200, hooks.obter(ws.path, decodeURIComponent(mHook[1]!)));
      return true;
    }

    if (mHook && req.method === "DELETE") {
      const ws = await resolverWs(url);
      await hooks.excluir(ws.path, decodeURIComponent(mHook[1]!));
      enviar(res, 200, { ok: true, id: mHook[1] });
      return true;
    }

    // Disparo público de webhook (/hooks/:workspace/:id)
    const mHookPublico = /^\/hooks\/([^/]+)\/([^/]+)$/.exec(rota);
    if (mHookPublico && (req.method === "POST" || req.method === "GET")) {
      const wsId = decodeURIComponent(mHookPublico[1]!);
      const hookId = decodeURIComponent(mHookPublico[2]!);

      // Rate limit por IP se disponível
      if (webhookLimiter) {
        const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1").split(",")[0]!.trim();
        const check = webhookLimiter.check(ip);
        if (!check.ok) {
          enviar(res, 429, { erro: "limite de requisições excedido", retry_after: check.retryAfter }, { "retry-after": String(check.retryAfter ?? 60) });
          return true;
        }
      }

      const ws = await workspaces.resolver(wsId) as unknown as { id: string; path: string };
      const h: Hook = hooks.obter(ws.path, hookId);
      if (!h.metodos.includes(req.method ?? "POST")) {
        enviar(res, 405, { erro: `método ${req.method} não permitido (aceitos: ${h.metodos.join(", ")})` });
        return true;
      }

      let corpoPayload: Record<string, unknown> = {};
      let rawBody = "";
      if (req.method === "POST") {
        try {
          const partes: Buffer[] = [];
          for await (const parte of req) {
            partes.push(parte as Buffer);
          }
          rawBody = Buffer.concat(partes).toString("utf8");
          const texto = rawBody.trim();
          corpoPayload = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
        } catch {
          corpoPayload = rawBody ? { _raw: rawBody } : {};
        }
      }

      // Validação de Segurança (Token / HMAC-SHA256 / Aberta)
      const tipoAuth = h.auth?.tipo ?? "token";
      const secretEsperado = h.auth?.secret || h.token;

      if (tipoAuth === "token") {
        const authHeader = String(req.headers["authorization"] ?? "");
        const bearerToken = extrairTokenBearer(authHeader);
        const tokenRecebido = String(req.headers["x-opencorp-token"] ?? bearerToken ?? url.searchParams.get("token") ?? "");
        if (!tokenRecebido || !compararTokensSeguro(tokenRecebido, secretEsperado)) {
          enviar(res, 401, { erro: "token do hook ausente ou inválido (envie via x-opencorp-token, Authorization: Bearer, ou ?token=)" });
          return true;
        }
      } else if (tipoAuth === "hmac_sha256") {
        const sigHeader = String(req.headers["x-hub-signature-256"] ?? req.headers["x-signature-sha256"] ?? "");
        const sigRecebida = sigHeader.startsWith("sha256=") ? sigHeader.slice(7).trim() : sigHeader.trim();
        if (!sigRecebida) {
          enviar(res, 401, { erro: "assinatura HMAC ausente (envie cabeçalho x-hub-signature-256: sha256=...)" });
          return true;
        }
        const { createHmac, timingSafeEqual } = await import("node:crypto");
        const hmac = createHmac("sha256", secretEsperado);
        hmac.update(rawBody);
        const sigEsperada = hmac.digest("hex");
        try {
          const bufEsperado = Buffer.from(sigEsperada, "hex");
          const bufRecebido = Buffer.from(sigRecebida, "hex");
          if (bufEsperado.length !== bufRecebido.length || !timingSafeEqual(bufEsperado, bufRecebido)) {
            enviar(res, 401, { erro: "assinatura HMAC inválida para o secret configurado" });
            return true;
          }
        } catch {
          enviar(res, 401, { erro: "formato de assinatura HMAC inválido" });
          return true;
        }
      }

      const query: Record<string, string> = {};
      url.searchParams.forEach((v, k) => {
        if (k !== "token") query[k] = v;
      });
      const payload: PayloadHook = { corpo: corpoPayload, query };

      if (h.respond === "final") {
        const r = await hooks.disparar(ws.path, h, payload);
        enviar(res, 200, { ok: true, exec_id: r.exec_id, resultado: r.resultado.slice(0, 4096) });
      } else {
        void hooks
          .disparar(ws.path, h, payload)
          .catch((e: unknown) => console.error(`[hook] disparo de "${h.id}" falhou:`, e instanceof Error ? e.message : e));
        enviar(res, 202, {
          ok: true,
          modo: "imediato",
          status: h.exige_aprovacao ? "aguardando_aprovacao" : "iniciado",
          mensagem: h.exige_aprovacao ? "Webhook recebido e retido para aprovação humana" : "Disparo iniciado",
        });
      }
      return true;
    }
  }

  return false;
}
