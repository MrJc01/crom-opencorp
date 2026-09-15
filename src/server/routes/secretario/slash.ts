import { readFileSync } from "node:fs";
import { join } from "node:path";
import { opencorpHome } from "../../../utils/paths.js";
import type { OpcoesRun } from "../../../core/session-manager.js";
import type { RouteContext } from "../types.js";

export function textoAjudaSlash(): string {
  return `Comandos rápidos disponíveis no chat (somente no início da linha):

- \`/status\`: diagnóstico rápido de serviços, scheduler e tasks em andamento
- \`/agents\`: catálogo de agentes do workspace
- \`/schedules\`: rotinas agendadas do scheduler
- \`/task list\`: quadro Kanban de tarefas
- \`/task status <id>\`: status detalhado de uma task
- \`/task run <id>\`: despacha a task para o agente responsável
- \`/doctor\`: verifica integridade do motor de IA, API, daemon e portas
- \`/git status|diff|restore|log\`: comandos git do workspace
- \`/help\`: esta lista

Comandos \`/\` não reconhecidos não são enviados ao modelo — são respondidos aqui.`;
}

export function textoAjudaMencoes(): string {
  return `Menções \`@\` (em qualquer posição da linha):

- \`@agente:<id>\`: troca o destinatário da mensagem (só quando é a única menção)
- \`@arquivo:<caminho>\`: inclui o conteúdo real do arquivo como contexto
- \`@task:<id>\`: inclui os dados da task como contexto
- \`@prompt:<chave>\`: expande o prompt salvo para texto editável`;
}

export async function processarSlash(
  ctx: RouteContext,
  mensagem: string,
  ws: { id: string; path: string },
): Promise<{ tratado: boolean; mensagem: string }> {
  const { opencodeServer, settings, homeDir, tasks, agentes, scheduler, sessoes } = ctx;
  const home = homeDir ?? opencorpHome();

  const pedacos = mensagem.trim().split(/\s+/).filter(Boolean);
  const token = (pedacos[0] ?? "").toLowerCase();

  if (token === "/help") return { tratado: true, mensagem: `${textoAjudaSlash()}\n\n${textoAjudaMencoes()}` };

  if (token === "/status") {
    const linhas: string[] = [];
    try {
      if (opencodeServer) {
        const st = await opencodeServer.status();
        const cfg = settings ? await settings.resolve({ workspaceDir: ws.path }).catch(() => null) : null;
        const motorNome = (cfg?.settings as any)?.runner || "opencode";
        linhas.push(`Motor do Secretário (${motorNome}): ${st.rodando ? "rodando" : "parado"}${st.porta ? ` (porta ${st.porta})` : ""}`);
      }
    } catch {
      linhas.push("Motor do Secretário: indisponível");
    }
    try {
      const pidInfo = JSON.parse(readFileSync(join(home, ".opencorp", "scheduler.pid"), "utf8")) as { pid?: number };
      let vivo = false;
      if (typeof pidInfo.pid === "number") {
        try { process.kill(pidInfo.pid, 0); vivo = true; } catch { vivo = false; }
      }
      linhas.push(`Scheduler (daemon): ${vivo ? "rodando" : "parado"}`);
    } catch {
      linhas.push("Scheduler (daemon): parado");
    }
    try {
      const emAndamento = (await tasks.listar(ws.path)).filter((t) => t.coluna === "fazendo" || t.coluna === "bloqueado");
      linhas.push(`Tasks: ${emAndamento.length} em andamento`);
    } catch {
      linhas.push("Tasks: indisponível");
    }
    return { tratado: true, mensagem: `Status do workspace "${ws.id}":\n${linhas.map((l) => `- ${l}`).join("\n")}` };
  }

  if (token === "/agents") {
    const lista = agentes ? await agentes.listar(ws.path).catch(() => []) : [];
    if (lista.length === 0) return { tratado: true, mensagem: "Nenhum agente configurado neste workspace." };
    return {
      tratado: true,
      mensagem: `Agentes do workspace "${ws.id}" (${lista.length}):\n${lista
        .map((a) => `- @${a.id}${a.role ? ` — ${a.role}` : ""}${a.ativo === false ? " (desativado)" : ""}`)
        .join("\n")}`,
    };
  }

  if (token === "/schedules") {
    const jobs = await scheduler.listar().catch(() => []);
    if (jobs.length === 0) return { tratado: true, mensagem: "Nenhuma rotina agendada." };
    return {
      tratado: true,
      mensagem: `Rotinas agendadas (${jobs.length}):\n${jobs
        .map((j) => `- ${j.nome} (${j.workspace}) — ${j.proxima_exec ? j.proxima_exec.slice(0, 16).replace("T", " ") : "sem próxima execução"}`)
        .join("\n")}`,
    };
  }

  if (token === "/task") {
    const sub = (pedacos[1] ?? "").toLowerCase();
    if (sub === "list" || sub === "") {
      const lista = await tasks.listar(ws.path).catch(() => []);
      if (lista.length === 0) return { tratado: true, mensagem: "Nenhuma task no quadro." };
      return {
        tratado: true,
        mensagem: `Quadro de tasks (${lista.length}):\n${lista
          .map((t) => `- ${t.id}: ${t.titulo} [${t.coluna}]`)
          .join("\n")}`,
      };
    }
    if (sub === "status" || sub === "run") {
      const id = pedacos[2];
      if (!id) return { tratado: true, mensagem: `Uso: /task ${sub} <id>` };
      const tk = await tasks.obter(ws.path, id).catch(() => null);
      if (!tk) return { tratado: true, mensagem: `Task "${id}" não encontrada no workspace.` };
      if (sub === "status") {
        return {
          tratado: true,
          mensagem: `Task ${tk.id}: ${tk.titulo}\nColuna: ${tk.coluna} · Prioridade: ${tk.prioridade} · Responsável: ${tk.responsavel || "-"}\n${tk.descricao || ""}`.trim(),
        };
      }
      const agenteTask = (tk.responsavel ?? "").replace(/^agente:/, "").trim() || "executor-padrao";
      void sessoes
        .rodar({
          agente: agenteTask,
          ordem: `Você é o agente "${agenteTask}" executando a task ${tk.id} no workspace "${ws.id}".\nTítulo: ${tk.titulo}\n${tk.descricao ? `Descrição:\n${tk.descricao}` : ""}\nExecute todas as ações necessárias para resolver esta tarefa.`,
          workspaceDir: ws.path,
          gatilho: { tipo: "manual", origem: `task:${tk.id}` },
        } as OpcoesRun)
        .catch(() => undefined);
      return {
        tratado: true,
        mensagem: `Task ${tk.id} despachada para o agente @${agenteTask} (execução em andamento).`,
      };
    }
    return { tratado: true, mensagem: `Subcomando de task não reconhecido. Use /task list, /task status <id> ou /task run <id>.` };
  }

  if (token === "/doctor") {
    const { runDoctor } = await import("../../../core/doctor.js");
    const r = await runDoctor({ homeDir: home, workspacePath: ws.path });
    const linhas = r.checks.map((c) => `- [${c.status === "ok" ? "OK" : c.status.toUpperCase()}] ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
    return {
      tratado: true,
      mensagem: `Doctor (${r.ok ? "tudo ok" : "há pendências"}):\n${linhas.join("\n")}`,
    };
  }

  return { tratado: false, mensagem: "" };
}
