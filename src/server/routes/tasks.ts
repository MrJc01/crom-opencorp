/**
 * Rotas de Tarefas (Kanban) — Extração Modular (MICRO-PASSO 9)
 */

import { taskCreateSchema } from "../../schemas/task.js";
import { parseAgendaTask } from "../../core/scheduler.js";
import { SessionManager } from "../../core/session-manager.js";
import { opencorpHome } from "../../utils/paths.js";
import type { Task } from "../../core/task-store.js";
import type { RouteContext } from "./types.js";

export async function handleTaskRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, url, rota, resolverWs, lerCorpo, enviar, tasks, scheduler, registros, sessoes, homeDir } = ctx;

  if (rota === "/tasks" && req.method === "GET") {
    const ws = await resolverWs(url);
    enviar(res, 200, await tasks.listar(ws.path, {
      coluna: url.searchParams.get("coluna") ?? undefined,
      responsavel: url.searchParams.get("responsavel") ?? undefined,
    }));
    return true;
  }

  if (rota === "/tasks" && req.method === "POST") {
    const ws = await resolverWs(url);
    const corpo = (await lerCorpo(req)) as Record<string, unknown>;
    const valido = taskCreateSchema.safeParse(corpo);
    if (!valido.success) {
      enviar(res, 422, { erro: "task inválida", detalhes: valido.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
      return true;
    }
    const c = valido.data;

    const agendaInfo = parseAgendaTask({
      quando: typeof corpo.quando === "string" ? corpo.quando : typeof corpo.at === "string" ? corpo.at : undefined,
      cron: typeof corpo.cron === "string" ? corpo.cron : typeof corpo.agendar === "string" ? corpo.agendar : undefined,
      repete: typeof corpo.repete === "string" ? corpo.repete : typeof corpo.repetir === "string" ? corpo.repetir : undefined,
      intervaloMin: typeof corpo.intervalo_min === "number" ? corpo.intervalo_min : undefined,
    });

    const labelsIniciais = [...(c.labels ?? [])];
    if (agendaInfo) {
      if (agendaInfo.agenda.tipo === "cron" || agendaInfo.agenda.tipo === "intervalo_min") {
        if (!labelsIniciais.includes("recorrente")) labelsIniciais.push("recorrente");
      } else {
        if (!labelsIniciais.includes("agendada")) labelsIniciais.push("agendada");
      }
    }

    const executarAgora = Boolean(corpo.executar_agora || corpo.imediato || corpo.run);

    const t = await tasks.criar(ws.path, {
      titulo: c.titulo,
      descricao: c.descricao,
      coluna: c.coluna || (executarAgora ? "fazendo" : undefined),
      prioridade: c.prioridade,
      labels: labelsIniciais.length > 0 ? labelsIniciais : undefined,
      responsavel: c.responsavel,
      due: c.due || (agendaInfo?.agenda.tipo === "data_unica" ? agendaInfo.agenda.valor : undefined),
      task_pai: c.task_pai,
      bloqueado_por: c.bloqueado_por,
    }, "api");

    let jobInfo: Record<string, unknown> | undefined = undefined;
    if (agendaInfo) {
      try {
        const jobNome = `task-${t.id}`;
        const job = await scheduler.criar({
          nome: jobNome,
          agenda: agendaInfo.agenda,
          args: ["task", "run", t.id],
          workspace: ws.id,
        });
        jobInfo = { id: job.id, proxima_exec: job.proxima_exec, descricao: agendaInfo.descricao };
        await tasks.mensagem(ws.path, t.id, {
          autor: "sistema",
          corpo: `📅 Agendamento configurado: ${agendaInfo.descricao} (Job: ${job.id}, Próxima: ${job.proxima_exec ? job.proxima_exec.slice(0, 16).replace("T", " ") : "-"})`,
          tipo: "sistema",
        });
      } catch (err) {
        console.error("[task schedule] erro ao criar job:", err);
      }
    }

    if (executarAgora) {
      void (async () => {
        try {
          const sessoesManager = new SessionManager({ homeDir: homeDir ?? opencorpHome() });
          const agente = c.responsavel ? c.responsavel.replace(/^agente:/, "").trim() : "executor-padrao";
          await sessoesManager.rodar({
            agente,
            ordem: `Você é o agente "${agente}" executando a task ${t.id} no workspace "${ws.id}".\nTítulo: ${t.titulo}\n${t.descricao ? `Descrição:\n${t.descricao}` : ""}\nExecute todas as ações necessárias para resolver esta tarefa.`,
            workspaceDir: ws.path,
            gatilho: { tipo: "manual", origem: `task:${t.id}` },
          });
        } catch (err) {
          console.error("[task run imediato] falhou:", err);
        }
      })();
    }

    enviar(res, 201, { ...t, agendamento: jobInfo, executando_agora: executarAgora });
    return true;
  }

  if (rota === "/tasks/colunas" && req.method === "GET") {
    const ws = await resolverWs(url);
    enviar(res, 200, await tasks.colunas(ws.path));
    return true;
  }

  const mTask = /^\/tasks\/([^/]+)(?:\/(chat|mensagens|move|mover|execucoes|lock))?$/.exec(rota);
  if (mTask) {
    const ws = await resolverWs(url);
    const id = decodeURIComponent(mTask[1]!);
    const subrecurso = mTask[2];

    if (subrecurso === "chat" || subrecurso === "mensagens") {
      if (req.method === "GET") {
        enviar(res, 200, await tasks.chat(ws.path, id));
        return true;
      }
      if (req.method === "POST") {
        const corpo = (await lerCorpo(req)) as Record<string, unknown>;
        const m = await tasks.mensagem(ws.path, id, {
          autor: String(corpo.autor ?? "humano"),
          corpo: String(corpo.corpo ?? ""),
          tipo: corpo.tipo as "comentario" | "handoff" | "sistema" | "artefato" | "decisao" | undefined,
          refs: Array.isArray(corpo.refs) ? (corpo.refs as unknown[]).map(String) : undefined,
        });
        enviar(res, 201, m);
        return true;
      }
    } else if (subrecurso === "execucoes" && req.method === "GET") {
      const limite = Math.min(Number(url.searchParams.get("limite")) || 50, 200);
      const metas = await registros.listar(ws.path, "execucoes").catch(() => []);
      const candidatas = metas.filter((m) => {
        const ex = (m.extras ?? {}) as Record<string, unknown>;
        const ordem = typeof ex.ordem === "string" ? ex.ordem : "";
        const gat = (ex.gatilho ?? {}) as { origem?: unknown };
        const origem = typeof gat.origem === "string" ? gat.origem : "";
        return (typeof ex.task_id === "string" && ex.task_id === id)
          || ordem.includes(id)
          || origem === id
          || origem.startsWith(`${id}/`);
      });
      const execs = (await sessoes.listarExecucoes(ws.path)) as Array<{
        id: string;
        agente: string;
        inicio: string;
        status: string;
      }>;
      const mapa = new Map(execs.map((e) => [e.id, e]));
      const itens = candidatas
        .map((m) => {
          const s = mapa.get(m.id);
          const ex = (m.extras ?? {}) as Record<string, unknown>;
          return {
            id: m.id,
            agente: s?.agente ?? String(m.criado_por ?? "agente"),
            inicio: s?.inicio ?? String(m.criado_em ?? ""),
            status: s?.status ?? (typeof ex.status === "string" ? ex.status : "concluido"),
            ordem: typeof ex.ordem === "string" ? ex.ordem.slice(0, 160) : undefined,
            modelo: typeof ex.modelo === "string" ? ex.modelo : undefined,
            duracao_ms: typeof ex.duracao_ms === "number" ? ex.duracao_ms : undefined,
          };
        })
        .sort((a, b) => String(b.inicio || "").localeCompare(String(a.inicio || "")))
        .slice(0, limite);
      enviar(res, 200, itens);
      return true;
    } else if ((subrecurso === "move" || subrecurso === "mover") && req.method === "POST") {
      const corpo = (await lerCorpo(req)) as Record<string, unknown>;
      const coluna = String(corpo.coluna ?? "fazendo");
      const pos = typeof corpo.pos === "number" ? corpo.pos : undefined;
      const t = await tasks.mover(ws.path, id, coluna, pos);
      enviar(res, 200, t);
      return true;
    } else if (subrecurso === "lock") {
      if (req.method === "POST") {
        const corpo = (await lerCorpo(req)) as Record<string, unknown>;
        const por = String(corpo.por ?? "agente");
        const minutos = typeof corpo.minutos === "number"
          ? corpo.minutos
          : typeof corpo.ttl_segundos === "number"
          ? Math.max(1, Math.round(corpo.ttl_segundos / 60))
          : 30;
        await tasks.travar(ws.path, id, por, minutos);
        const t = await tasks.obter(ws.path, id);
        enviar(res, 200, t);
        return true;
      }
      if (req.method === "DELETE") {
        const corpo = (await lerCorpo(req)) as Record<string, unknown>;
        const por = String(corpo.por ?? "agente");
        await tasks.liberar(ws.path, id, por);
        const t = await tasks.obter(ws.path, id);
        enviar(res, 200, t);
        return true;
      }
    } else if (req.method === "GET") {
      const t = await tasks.obter(ws.path, id);
      enviar(res, 200, { ...t, bloqueada: tasks.bloqueado(ws.path, t) });
      return true;
    } else if (req.method === "PATCH" || req.method === "PUT") {
      const corpo = (await lerCorpo(req)) as Record<string, unknown>;
      let t: Task = await tasks.obter(ws.path, id);
      if (typeof corpo.titulo === "string" || typeof corpo.descricao === "string" ||
          typeof corpo.prioridade === "string" || corpo.due !== undefined) {
        t = await tasks.editar(ws.path, id, {
          titulo: typeof corpo.titulo === "string" ? corpo.titulo : undefined,
          descricao: typeof corpo.descricao === "string" ? corpo.descricao : undefined,
          prioridade: typeof corpo.prioridade === "string" ? corpo.prioridade : undefined,
          due: corpo.due === null ? null : typeof corpo.due === "string" ? corpo.due : undefined,
        });
      }
      if (typeof corpo.coluna === "string") {
        t = await tasks.mover(ws.path, id, corpo.coluna, typeof corpo.pos === "number" ? corpo.pos : undefined);
      }
      if (typeof corpo.responsavel === "string") {
        t = await tasks.atribuir(ws.path, id, corpo.responsavel);
      }
      if (Array.isArray(corpo.labels)) {
        t = await tasks.label(ws.path, id, "add", (corpo.labels as unknown[]).map(String));
      }
      enviar(res, 200, t);
      return true;
    } else if (req.method === "DELETE") {
      await tasks.excluir(ws.path, id);
      enviar(res, 200, { ok: true, id });
      return true;
    }
  }

  return false;
}
