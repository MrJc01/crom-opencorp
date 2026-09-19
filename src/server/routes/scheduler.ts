import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { opencorpHome } from "../../utils/paths.js";
import type { RouteContext } from "./types.js";

/** Whitelist de comandos permitidos (usada na rota /terminal do sistema). */
export const COMANDOS_AGENDA = new Set([
  "agent", "task", "flow", "team", "meeting", "schedule", "workspace", "doctor", "settings",
  "budget", "approvals", "template", "hook", "tool", "monitor", "app", "registry", "subcorp",
  "supervisor", "scheduler", "serve", "web", "test",
]);

export async function handleSchedulerRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, url, enviar, scheduler, homeDir } = ctx;
  if (!scheduler) return false;

  const rota = ctx.rota;

  // ── GET /scheduler/status e /scheduler/saude ─────────────────────────
  if ((rota === "/scheduler/status" || rota === "/scheduler/saude") && req.method === "GET") {
    const home = homeDir ?? opencorpHome();
    let schedulerVivo = false;
    let schedulerPid: number | null = null;
    const pidPath = join(home, ".opencorp", "scheduler.pid");
    if (existsSync(pidPath)) {
      try {
        const sp = JSON.parse(readFileSync(pidPath, "utf8")) as { pid?: number };
        if (typeof sp.pid === "number") {
          try {
            process.kill(sp.pid, 0);
            schedulerVivo = true;
            schedulerPid = sp.pid;
          } catch (e) {
            schedulerVivo = (e as NodeJS.ErrnoException).code === "EPERM";
            if (schedulerVivo) schedulerPid = sp.pid;
          }
        }
      } catch {}
    }

    const agendamentos = await scheduler.listarAgendamentos().catch(() => []);
    const ativos = agendamentos.filter((a) => a.ativo);
    const comProxima = agendamentos
      .filter((a) => a.ativo && a.proxima_exec)
      .sort((a, b) => (a.proxima_exec || "").localeCompare(b.proxima_exec || ""));
    const proximaGeral = comProxima[0]?.proxima_exec ?? null;

    enviar(res, 200, {
      ok: true,
      daemon: {
        ativo: schedulerVivo,
        pid: schedulerPid,
      },
      jobs: {
        total: agendamentos.length,
        ativos: ativos.length,
      },
      agendamentos: {
        total: agendamentos.length,
        ativos: ativos.length,
      },
      proxima_execucao: proximaGeral,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  // Normaliza aliases: /scheduler/jobs, /jobs, /agenda → /schedules
  let normalizada = rota;
  if (normalizada.startsWith("/scheduler/jobs")) {
    normalizada = normalizada.replace(/^\/scheduler\/jobs/, "/schedules");
  } else if (normalizada.startsWith("/jobs")) {
    normalizada = normalizada.replace(/^\/jobs/, "/schedules");
  } else if (normalizada.startsWith("/agenda")) {
    normalizada = normalizada.replace(/^\/agenda/, "/schedules");
  }

  // ── GET /schedules ───────────────────────────────────────────────────
  // Retorna fluxos agendados (com nó cron) de cada workspace.
  if (normalizada === "/schedules" && req.method === "GET") {
    const wsFiltro = url.searchParams.get("workspace");
    const agendamentos = await scheduler.listarAgendamentos();
    const resultado = !wsFiltro || url.searchParams.has("all")
      ? agendamentos
      : agendamentos.filter((a) => a.workspace === wsFiltro);
    enviar(res, 200, resultado);
    return true;
  }

  // ── POST /schedules → deprecated ────────────────────────────────────
  // Criação de rotinas agora é via fluxos: POST /flows
  if (normalizada === "/schedules" && req.method === "POST") {
    enviar(res, 410, {
      erro: "Criação de jobs legados foi removida. Use POST /flows para criar um fluxo com nó 'cron'.",
      migracao: "Crie um flow com: { nos: [{ id: 'gatilho', tipo: 'cron', config: { expressao_cron: '...' } }, ...], ... }",
    });
    return true;
  }

  // ── GET /schedules/:id ──────────────────────────────────────────────
  const mSched = /^\/schedules\/([^/]+)$/.exec(normalizada);
  if (mSched && req.method === "GET") {
    const id = decodeURIComponent(mSched[1]!);
    const agendamentos = await scheduler.listarAgendamentos();
    const encontrado = agendamentos.find((a) => a.id === id);
    if (!encontrado) {
      enviar(res, 404, { erro: `agendamento "${id}" não encontrado — veja GET /schedules` });
      return true;
    }
    enviar(res, 200, encontrado);
    return true;
  }

  // ── Mutation routes → deprecated ────────────────────────────────────
  if (mSched && (req.method === "PATCH" || req.method === "DELETE" || req.method === "POST" || req.method === "PUT")) {
    enviar(res, 410, {
      erro: "Operações CRUD em jobs legados foram removidas. Use as rotas /flows/:id para gerenciar fluxos.",
    });
    return true;
  }

  // ── POST /schedules/:id/run|executar|toggle|pausar|ativar → deprecated ──
  const mSchedAction = /^\/schedules\/([^/]+)\/(run|executar|toggle|pausar|ativar|runs)$/.exec(normalizada);
  if (mSchedAction) {
    const acao = mSchedAction[2]!;
    if (acao === "runs" && req.method === "GET") {
      // Histórico de execuções: redireciona para o fluxo
      const id = decodeURIComponent(mSchedAction[1]!);
      enviar(res, 410, {
        erro: `Use GET /flows/${id}/execucoes para histórico de execuções do fluxo.`,
      });
      return true;
    }
    enviar(res, 410, {
      erro: "Operações em jobs legados foram removidas. Use POST /flows/:id/run para executar um fluxo.",
    });
    return true;
  }

  return false;
}
