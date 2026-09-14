import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { opencorpHome } from "../../utils/paths.js";
import type { Agenda } from "../../core/scheduler.js";
import type { RouteContext } from "./types.js";

/** Whitelist de comandos que uma rotina (schedule) pode executar — job inválido
 *  é barrado na criação/edição, não descoberto em produção (PLANO-WEB-CRUD B1). */
export const COMANDOS_AGENDA = new Set([
  "agent", "task", "flow", "team", "meeting", "schedule", "workspace", "doctor", "settings",
  "budget", "approvals", "template", "hook", "tool", "monitor", "app", "registry", "subcorp",
  "supervisor", "scheduler", "serve", "web", "test",
]);

/** Normaliza args de rotina: array → strings; string → split por espaços. */
export function normalizarArgsAgenda(args: unknown): string[] {
  return Array.isArray(args) ? (args as unknown[]).map(String) : String(args ?? "").split(/\s+/).filter(Boolean);
}

/** Monta a Agenda a partir de agenda_tipo/agenda_valor do corpo HTTP. */
export function parseAgendaCorpo(corpo: Record<string, unknown>): Agenda {
  return corpo.agenda_tipo === "cron"
    ? { tipo: "cron", valor: String(corpo.agenda_valor ?? "") }
    : corpo.agenda_tipo === "data_unica"
      ? { tipo: "data_unica", valor: String(corpo.agenda_valor ?? "") }
      : { tipo: "intervalo_min", valor: Number(corpo.agenda_valor ?? 0) };
}

export async function handleSchedulerRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, url, resolverWs, lerCorpo, enviar, scheduler, homeDir } = ctx;
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

    const jobs = await scheduler.listar().catch(() => []);
    const ativos = jobs.filter((j) => j.ativo);
    const quarentena = jobs.filter((j) => j.quarentena);
    const comFalhas = jobs.filter((j) => (j.falhas_consecutivas ?? 0) > 0);

    const comProxima = jobs
      .filter((j) => j.ativo && j.proxima_exec)
      .sort((a, b) => (a.proxima_exec || "").localeCompare(b.proxima_exec || ""));
    const proximaGeral = comProxima[0]?.proxima_exec ?? null;

    enviar(res, 200, {
      ok: true,
      daemon: {
        ativo: schedulerVivo,
        pid: schedulerPid,
      },
      jobs: {
        total: jobs.length,
        ativos: ativos.length,
        quarentena: quarentena.length,
        com_falhas: comFalhas.length,
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

  // ── GET /schedules (ou /scheduler/jobs, /jobs, /agenda) ──────────────
  if (normalizada === "/schedules" && req.method === "GET") {
    const wsFiltro = url.searchParams.get("workspace");
    const jobs = await scheduler.listar();
    enviar(res, 200, !wsFiltro || url.searchParams.has("all") ? jobs : jobs.filter((j) => j.workspace === wsFiltro));
    return true;
  }

  // ── POST /schedules (ou /scheduler/jobs, /jobs, /agenda) ─────────────
  if (normalizada === "/schedules" && req.method === "POST") {
    const corpo = (await lerCorpo(req)) as Record<string, unknown>;
    const argsJob = normalizarArgsAgenda(corpo.args);
    if (argsJob.length === 0 || !COMANDOS_AGENDA.has(argsJob[0]!)) {
      enviar(res, 422, { erro: `args[0] inválido: "${String(argsJob[0] ?? "")}" não é um comando opencorp` });
      return true;
    }
    const agenda: Agenda = parseAgendaCorpo(corpo);
    const j = await scheduler.criar({
      nome: String(corpo.nome ?? ""),
      agenda,
      args: argsJob,
      workspace: corpo.workspace !== undefined ? String(corpo.workspace) : (await resolverWs(url)).id,
      graca_min: typeof corpo.graca_min === "number" ? corpo.graca_min : undefined,
    });
    enviar(res, 201, j);
    return true;
  }

  // ── POST /schedules/:id/run ou /executar ──────────────────────────────
  const mSchedRun = /^\/schedules\/([^/]+)\/(?:run|executar)$/.exec(normalizada);
  if (mSchedRun && req.method === "POST") {
    const id = decodeURIComponent(mSchedRun[1]!);
    const { resultado } = await scheduler.runNow(id);
    enviar(res, 200, { ok: true, resultado });
    return true;
  }

  // ── GET /schedules/:id/runs ──────────────────────────────────────────
  const mSchedRuns = /^\/schedules\/([^/]+)\/runs$/.exec(normalizada);
  if (mSchedRuns && req.method === "GET") {
    const id = decodeURIComponent(mSchedRuns[1]!);
    const limite = Math.min(Number(url.searchParams.get("limite")) || 20, 100);
    enviar(res, 200, await scheduler.listarRuns(id, limite));
    return true;
  }

  // ── POST /schedules/:id/toggle ou /pausar ou /ativar ──────────────────
  const mSchedToggle = /^\/schedules\/([^/]+)\/(?:toggle|pausar|ativar)$/.exec(normalizada);
  if (mSchedToggle && req.method === "POST") {
    const id = decodeURIComponent(mSchedToggle[1]!);
    const sub = normalizada.split("/").pop();
    if (sub === "pausar") {
      enviar(res, 200, await scheduler.pausar(id));
      return true;
    }
    if (sub === "ativar") {
      enviar(res, 200, await scheduler.retomar(id));
      return true;
    }
    // toggle inteligente
    const corpo = (await lerCorpo(req).catch(() => ({}))) as { ativo?: boolean };
    if (typeof corpo?.ativo === "boolean") {
      const atualizado = corpo.ativo ? await scheduler.retomar(id) : await scheduler.pausar(id);
      enviar(res, 200, atualizado);
    } else {
      const atual = await scheduler.obter(id);
      const atualizado = atual.ativo ? await scheduler.pausar(id) : await scheduler.retomar(id);
      enviar(res, 200, atualizado);
    }
    return true;
  }

  // ── GET, PATCH, DELETE, POST /schedules/:id ──────────────────────────
  const mSched = /^\/schedules\/([^/]+)$/.exec(normalizada);
  if (mSched) {
    const id = decodeURIComponent(mSched[1]!);

    if (req.method === "GET") {
      enviar(res, 200, await scheduler.obter(id));
      return true;
    }

    if (req.method === "PATCH") {
      const corpo = (await lerCorpo(req)) as Record<string, unknown>;
      if (corpo.ativo === false) {
        enviar(res, 200, await scheduler.pausar(id));
      } else if (corpo.ativo === true) {
        enviar(res, 200, await scheduler.retomar(id));
      } else if (corpo.agenda_tipo !== undefined || corpo.agenda_valor !== undefined) {
        if (corpo.agenda_tipo === undefined || corpo.agenda_valor === undefined) {
          enviar(res, 422, { erro: "informe agenda_tipo E agenda_valor juntos para editar a agenda" });
          return true;
        }
        const argsJob = corpo.args !== undefined ? normalizarArgsAgenda(corpo.args) : undefined;
        if (argsJob && (argsJob.length === 0 || !COMANDOS_AGENDA.has(argsJob[0]!))) {
          enviar(res, 422, { erro: `args[0] inválido: "${String(argsJob[0] ?? "")}" não é um comando opencorp` });
          return true;
        }
        enviar(
          res,
          200,
          await scheduler.atualizar(id, {
            nome: corpo.nome !== undefined ? String(corpo.nome) : undefined,
            agenda: parseAgendaCorpo(corpo),
            args: argsJob,
            graca_min: typeof corpo.graca_min === "number" ? corpo.graca_min : undefined,
          }),
        );
      } else if (corpo.nome !== undefined || corpo.args !== undefined || corpo.graca_min !== undefined) {
        const argsJob = corpo.args !== undefined ? normalizarArgsAgenda(corpo.args) : undefined;
        if (argsJob && (argsJob.length === 0 || !COMANDOS_AGENDA.has(argsJob[0]!))) {
          enviar(res, 422, { erro: `args[0] inválido: "${String(argsJob[0] ?? "")}" não é um comando opencorp` });
          return true;
        }
        enviar(
          res,
          200,
          await scheduler.atualizar(id, {
            nome: corpo.nome !== undefined ? String(corpo.nome) : undefined,
            agenda: parseAgendaCorpo(corpo),
            args: argsJob,
            graca_min: typeof corpo.graca_min === "number" ? corpo.graca_min : undefined,
          }),
        );
      } else {
        enviar(res, 400, { erro: "corpo vazio — use {ativo}, {nome}, {agenda_tipo/agenda_valor}, {args} ou {graca_min}" });
      }
      return true;
    }

    if (req.method === "DELETE") {
      await scheduler.excluir(id);
      enviar(res, 200, { ok: true, id });
      return true;
    }

    if (req.method === "POST") {
      const { resultado } = await scheduler.runNow(id);
      enviar(res, 200, { ok: true, resultado });
      return true;
    }
  }

  return false;
}
