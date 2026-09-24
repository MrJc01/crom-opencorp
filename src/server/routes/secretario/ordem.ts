import type { OpcoesRun } from "../../../core/contexts/execution/session-manager.js";
import type { RouteContext } from "../types.js";

export async function handleOrdemRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, url, rota, resolverWs, lerCorpo, enviar, sessoes } = ctx;

  // Comandos Git Slash (/secretario/git, /secretario/git-slash)
  if ((rota === "/secretario/git" || rota === "/secretario/git-slash") && req.method === "POST") {
    const ws = await resolverWs(url);
    const corpo = (await lerCorpo(req)) as { comando?: string; mensagem?: string };
    const cmd = String(corpo.comando ?? corpo.mensagem ?? "").trim();
    if (!cmd) {
      enviar(res, 400, { erro: "comando git obrigatório" });
      return true;
    }
    const { processarComandoGitSecretario } = await import("../../../core/contexts/workspace/secretario-git-slash.js");
    const resultado = await processarComandoGitSecretario(cmd, ws.path, ws.id);
    enviar(res, 200, { ok: true, ...resultado });
    return true;
  }

  // Despacho de Ordem Direta (/secretario/ordem, /secretario/chat)
  if ((rota === "/secretario/ordem" || rota === "/secretario/chat") && req.method === "POST") {
    const ws = await resolverWs(url);
    const corpo = (await lerCorpo(req)) as {
      ordem?: string;
      mensagem?: string;
      agente?: string;
      modelo?: string;
      model?: string;
      motor?: string;
      engine?: string;
    };
    const textoOrdem = String(corpo.ordem ?? corpo.mensagem ?? "").trim();
    if (!textoOrdem) {
      enviar(res, 400, { erro: "ordem ou mensagem obrigatória" });
      return true;
    }
    const ag = corpo.agente || "secretario-exec";
    const modeloEspecificado = corpo.modelo || corpo.model;
    const motorEspecificado = corpo.motor || corpo.engine;

    const resRun = await sessoes.rodar({
      agente: ag,
      ordem: textoOrdem,
      workspaceDir: ws.path,
      gatilho: { tipo: "manual", origem: "api:secretario" },
      ...(modeloEspecificado ? { modelo: modeloEspecificado } : {}),
      ...(motorEspecificado ? { motor: motorEspecificado } : {}),
    } as OpcoesRun);
    enviar(res, 200, resRun);
    return true;
  }

  return false;
}
