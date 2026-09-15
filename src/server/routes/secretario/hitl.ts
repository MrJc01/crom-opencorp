import type { RouteContext } from "../types.js";

export async function handleHitlRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, url, rota, resolverWs, lerCorpo, enviar, approvals } = ctx;

  const mHitl = /^\/secretario\/hitl\/([^/]+)\/(aprovar|rejeitar)$/.exec(rota);
  if (mHitl && req.method === "POST") {
    if (!approvals) {
      enviar(res, 500, { erro: "approvals não configurado" });
      return true;
    }
    const ws = await resolverWs(url);
    const id = decodeURIComponent(mHitl[1]!);
    const acao = mHitl[2] === "aprovar" ? "approve" : "reject";
    if (acao === "approve") {
      const p = await approvals.aprovar(ws.path, id);
      enviar(res, 200, { id: p.id, status: p.status });
    } else {
      const corpo = (await lerCorpo(req)) as { motivo?: string };
      const p = await approvals.rejeitar(ws.path, id, corpo.motivo ?? "");
      enviar(res, 200, { id: p.id, status: p.status });
    }
    return true;
  }

  return false;
}
