import { resolverModelos } from "./helpers.js";
import type { RouteContext } from "../types.js";

export async function handleDaemonRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, url, rota, resolverWs, enviar, tasks, agentes, opencodeServer } = ctx;

  if (rota === "/secretario/status" && req.method === "GET") {
    if (!opencodeServer) {
      enviar(res, 200, { rodando: false, configurado: false, erro: "servidor não disponível" });
      return true;
    }
    const status = await opencodeServer.status();
    const configurado = await opencodeServer.configurado();
    enviar(res, 200, { ...status, configurado });
    return true;
  }

  if (rota === "/secretario/start" && req.method === "POST") {
    if (!opencodeServer) {
      enviar(res, 500, { erro: "servidor do motor de IA não configurado" });
      return true;
    }
    try {
      const { pid, porta } = await opencodeServer.iniciar();
      const status = await opencodeServer.status();
      enviar(res, 200, { pid, porta, agentes: status.rodando ? "configurados" : 0 });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      enviar(res, 500, { erro: `falha ao iniciar secretário: ${mensagem}` });
    }
    return true;
  }

  if (rota === "/secretario/stop" && req.method === "POST") {
    if (!opencodeServer) {
      enviar(res, 200, { ok: true });
      return true;
    }
    await opencodeServer.parar();
    enviar(res, 200, { ok: true });
    return true;
  }

  if (rota === "/secretario/contexto" && req.method === "GET") {
    const ws = await resolverWs(url);
    const listaAgentes = agentes ? await agentes.listar(ws.path).catch(() => []) : [];
    const listaTasks = tasks ? await tasks.listar(ws.path).catch(() => []) : [];
    const { modelos, motorPadrao } = await resolverModelos(ctx, { wsPath: ws.path });
    enviar(res, 200, {
      workspace: { id: ws.id, path: ws.path },
      agentes: listaAgentes.map((a) => ({ id: a.id, role: a.role, ativo: a.ativo })),
      tasks_em_andamento: listaTasks.filter((t) => t.coluna === "fazendo").length,
      total_tasks: listaTasks.length,
      motor_ativo: motorPadrao,
      modelo_principal: modelos[0] ?? null,
      modelos_disponiveis: modelos,
    });
    return true;
  }

  if (rota === "/secretario/sugestoes" && req.method === "GET") {
    enviar(res, 200, {
      sugestoes: [
        "/status",
        "/task list",
        "/agents",
        "/doctor",
        "/git status",
        "/schedules",
      ],
    });
    return true;
  }

  return false;
}
