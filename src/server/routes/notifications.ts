/**
 * Rotas de Notificações — Extração Modular (MICRO-PASSO 9)
 */

import type { TipoNotificacao } from "../../core/notification-store.js";
import type { RouteContext } from "./types.js";

export async function handleNotificationRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, url, rota, resolverWs, lerCorpo, enviar, notificacoes } = ctx;

  const ehNotifBase = rota === "/notifications" || rota === "/notificacoes";

  if (ehNotifBase && req.method === "GET") {
    const ws = await resolverWs(url);
    const apenasNaoLidas = url.searchParams.get("nao_lidas") === "1";
    const lista = notificacoes.listar(ws.path, { apenasNaoLidas });
    enviar(res, 200, {
      notificacoes: lista,
      resumo: { nao_lidas: notificacoes.naoLidas(ws.path), total: lista.length },
    });
    return true;
  }

  if (ehNotifBase && req.method === "POST") {
    const ws = await resolverWs(url);
    const corpo = (await lerCorpo(req)) as Record<string, unknown>;
    const n = await notificacoes.adicionar(ws.path, {
      titulo: String(corpo.titulo ?? ""),
      corpo: String(corpo.corpo ?? ""),
      tipo: corpo.tipo as TipoNotificacao | undefined,
      origem: corpo.origem !== undefined ? String(corpo.origem) : "painel",
    });
    enviar(res, 201, n);
    return true;
  }

  const ehTodasLidas =
    rota === "/notifications/lidas" ||
    rota === "/notifications/todas-lidas" ||
    rota === "/notificacoes/lidas" ||
    rota === "/notificacoes/todas-lidas";

  if (ehTodasLidas && req.method === "POST") {
    const ws = await resolverWs(url);
    const marcadas = await notificacoes.marcarTodasLidas(ws.path);
    enviar(res, 200, { ok: true, marcadas });
    return true;
  }

  const mNotifLida = /^\/(?:notifications|notificacoes)\/([^/]+)\/lida$/.exec(rota);
  if (mNotifLida && req.method === "POST") {
    const ws = await resolverWs(url);
    const n = await notificacoes.marcarLida(ws.path, decodeURIComponent(mNotifLida[1]!));
    enviar(res, 200, n);
    return true;
  }

  if (ehNotifBase && req.method === "DELETE") {
    const ws = await resolverWs(url);
    await notificacoes.limpar(ws.path);
    enviar(res, 200, { ok: true });
    return true;
  }

  return false;
}
