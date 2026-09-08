import type { Command } from "commander";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { TaskStore, type Task } from "../../core/task-store.js";
import { ApprovalsStore } from "../../core/approvals-store.js";
import { Scheduler } from "../../core/scheduler.js";
import { opencorpHome } from "../../utils/paths.js";
import { pidVivo } from "../../core/supervisor.js";
import { SessionManager } from "../../core/session-manager.js";
import { EngineAccountStore } from "../../core/engines/engine-account-store.js";
import { engineRegistry } from "../../core/engines/index.js";

function reportar(erro: unknown): void {
  if (erro instanceof Error) {
    const exitCode = (erro as { exitCode?: number }).exitCode;
    console.error(`erro: ${erro.message}`);
    process.exitCode = exitCode ?? 1;
    return;
  }
  console.error(`erro inesperado: ${String(erro)}`);
  process.exitCode = 1;
}

async function comErros(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (erro) {
    reportar(erro);
  }
}

async function lerJson<T>(caminho: string): Promise<T | null> {
  try {
    const conteudo = await readFile(caminho, "utf8");
    return JSON.parse(conteudo) as T;
  } catch {
    return null;
  }
}

export interface StatusInfo {
  workspace: {
    id: string;
    path: string;
  };
  servicos: {
    daemon: { ativo: boolean; pid: number | null };
    serve: { ativo: boolean; pid: number | null; porta: number | null };
    scheduler: { ativo: boolean; pid: number | null };
    opencode: { ativo: boolean; pid: number | null; porta: number | null };
  };
  tasks: {
    total: number;
    por_coluna: Record<string, number>;
    fazendo: Array<{ id: string; titulo: string; responsavel: string; prioridade: string }>;
    travadas: Array<{ id: string; titulo: string; responsavel: string }>;
  };
  approvals: {
    total_pendentes: number;
    pendencias: Array<{ id: string; acao: string; agente?: string; descricao?: string }>;
  };
  scheduler: {
    total_ativos: number;
    proxima_exec: string | null;
    proximo_job: string | null;
  };
  ultima_execucao?: {
    id: string;
    agente: string;
    status: string;
    data: string;
  } | null;
  motores?: {
    motor_ativo: string;
    harness_fallback: string[];
    lista: Array<{
      id: string;
      nome: string;
      instalado: boolean;
      ativo: boolean;
      timeout_min: number;
      max_turns: number;
      rate_limit_rpm: number;
      daily_cost_usd: number;
      status_cota: string;
      contas_total: number;
      conta_ativa: string | null;
      contas: Array<{ id: string; nome: string; ativa: boolean; status_cota: string }>;
      tokens?: {
        tokensDisponiveis: number | string;
        saldoUsd?: number;
        statusCota: string;
        mensagem: string;
        source: string;
        provedor: string;
      };
    }>;
  };
}

export async function coletarStatus(wsId?: string): Promise<StatusInfo> {
  const manager = new WorkspaceManager();
  const ws = await manager.resolver(wsId);
  const home = opencorpHome();

  // 1. Serviços
  const daemonInfo = await lerJson<{ pid?: number }>(join(home, ".opencorp", "daemon.pid"));
  const daemonAtivo = !!daemonInfo?.pid && (await pidVivo(daemonInfo.pid));

  const serveInfo = await lerJson<{ pid?: number; porta?: number }>(join(home, ".opencorp", "api.pid"));
  const serveAtivo = !!serveInfo?.pid && (await pidVivo(serveInfo.pid));

  const schedInfo = await lerJson<{ pid?: number }>(join(home, ".opencorp", "scheduler.pid"));
  const schedAtivo = !!schedInfo?.pid && (await pidVivo(schedInfo.pid));

  const ocServerInfo = await lerJson<{ pid?: number; porta?: number }>(join(home, ".opencorp", "opencode-server.json"));
  const ocServerAtivo = !!ocServerInfo?.pid && (await pidVivo(ocServerInfo.pid));

  // 2. Tasks
  const taskStore = new TaskStore();
  let todasTasks: Task[] = [];
  try {
    todasTasks = await taskStore.listar(ws.path);
  } catch {
    todasTasks = [];
  }

  const porColuna: Record<string, number> = {};
  const fazendoTasks: StatusInfo["tasks"]["fazendo"] = [];
  const travadasTasks: StatusInfo["tasks"]["travadas"] = [];

  for (const t of todasTasks) {
    const col = t.coluna || "backlog";
    porColuna[col] = (porColuna[col] || 0) + 1;

    if (col === "fazendo" || col === "em_andamento" || col === "in_progress") {
      fazendoTasks.push({
        id: t.id,
        titulo: t.titulo,
        responsavel: t.responsavel || "-",
        prioridade: t.prioridade,
      });
    } else if (col === "bloqueado") {
      travadasTasks.push({
        id: t.id,
        titulo: t.titulo,
        responsavel: t.responsavel || "-",
      });
    }
  }

  // 3. Approvals (HITL)
  const approvalsStore = new ApprovalsStore();
  let pendencias: any[] = [];
  try {
    pendencias = await approvalsStore.pendentes(ws.path);
  } catch {
    pendencias = [];
  }

  // 4. Scheduler
  const scheduler = new Scheduler();
  let jobsAtivos = 0;
  let proximaExec: string | null = null;
  let proximoJob: string | null = null;
  try {
    const jobs = await scheduler.listar(true);
    const jobsWs = jobs.filter((j) => j.workspace === ws.id || !j.workspace);
    jobsAtivos = jobsWs.length;

    const ordenados = jobsWs
      .filter((j) => !!j.proxima_exec)
      .sort((a, b) => (a.proxima_exec! > b.proxima_exec! ? 1 : -1));

    if (ordenados.length > 0 && ordenados[0]) {
      proximaExec = ordenados[0].proxima_exec;
      proximoJob = ordenados[0].nome;
    }
  } catch {}

  // 5. Última Execução
  let ultimaExec: StatusInfo["ultima_execucao"] = null;
  try {
    const sessionManager = new SessionManager();
    const execucoes = await sessionManager.listarExecucoes(ws.path);
    if (execucoes.length > 0 && execucoes[0]) {
      ultimaExec = {
        id: execucoes[0].id,
        agente: execucoes[0].agente,
        status: execucoes[0].status,
        data: execucoes[0].inicio,
      };
    }
  } catch {}

  // 6. Motores, Contas & Limites
  let infoMotores: StatusInfo["motores"] = undefined;
  try {
    const accts = new EngineAccountStore({ homeDir: home });
    const limitesMotores = await accts.obterLimitesMotores();
    const contas = await accts.listar();
    const rawMotores = await engineRegistry.listSummaries(home, false);
    const tokensAoVivo: Record<string, any> = await engineRegistry.fetchAllLiveTokens(home).catch(() => ({}));
    const rPath = join(home, ".opencorp", "runner.json");
    let runner: any = { engine: "opencode", timeout_min: 20 };
    if (existsSync(rPath)) {
      try { runner = JSON.parse(readFileSync(rPath, "utf8")); } catch {}
    }

    infoMotores = {
      motor_ativo: runner.engine || "opencode",
      harness_fallback: runner.harness_fallback || ["antigravity", "copilot", "opencode"],
      lista: rawMotores.map((m) => {
        const lim = limitesMotores[m.id] || {
          timeout_min: 20,
          max_turns: 40,
          rate_limit_rpm: 30,
          daily_cost_usd: 10.0,
          status_cota: "normal",
        };
        const contasDoMotor = contas.filter((c) => c.motorId === m.id);
        const contaAtiva = contasDoMotor.find((c) => c.ativa) || null;
        const liveTok = tokensAoVivo[m.id];
        return {
          id: m.id,
          nome: m.name,
          instalado: m.installed,
          ativo: m.id === (runner.engine || "opencode"),
          timeout_min: lim.timeout_min,
          max_turns: lim.max_turns,
          rate_limit_rpm: lim.rate_limit_rpm,
          daily_cost_usd: lim.daily_cost_usd,
          status_cota: lim.status_cota,
          contas_total: contasDoMotor.length,
          conta_ativa: contaAtiva ? contaAtiva.nome : null,
          contas: contasDoMotor.map((c) => ({
            id: c.id,
            nome: c.nome,
            ativa: c.ativa,
            status_cota: c.limits.status_cota,
          })),
          tokens: liveTok ? {
            tokensDisponiveis: liveTok.tokensDisponiveis,
            saldoUsd: liveTok.saldoUsd,
            statusCota: liveTok.statusCota,
            mensagem: liveTok.mensagem,
            source: liveTok.source,
            provedor: liveTok.provedor,
          } : undefined,
        };
      }),
    };
  } catch {}

  return {
    workspace: {
      id: ws.id,
      path: ws.path,
    },
    servicos: {
      daemon: { ativo: daemonAtivo, pid: daemonAtivo ? (daemonInfo?.pid ?? null) : null },
      serve: { ativo: serveAtivo, pid: serveAtivo ? (serveInfo?.pid ?? null) : null, porta: serveInfo?.porta ?? 4100 },
      scheduler: { ativo: schedAtivo, pid: schedAtivo ? (schedInfo?.pid ?? null) : null },
      opencode: { ativo: ocServerAtivo, pid: ocServerAtivo ? (ocServerInfo?.pid ?? null) : null, porta: ocServerInfo?.porta ?? null },
    },
    tasks: {
      total: todasTasks.length,
      por_coluna: porColuna,
      fazendo: fazendoTasks,
      travadas: travadasTasks,
    },
    approvals: {
      total_pendentes: pendencias.length,
      pendencias: pendencias.map((p) => ({
        id: p.id,
        acao: p.acao,
        agente: p.agente,
        descricao: p.descricao,
      })),
    },
    scheduler: {
      total_ativos: jobsAtivos,
      proxima_exec: proximaExec,
      proximo_job: proximoJob,
    },
    ultima_execucao: ultimaExec,
    motores: infoMotores,
  };
}

export function registerStatusCommand(program: Command): void {
  function wsDe(opts: { workspace?: string }): string | undefined {
    return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
  }

  program
    .command("status")
    .description("painel consolidado do workspace ativo: serviços, tasks em andamento, approvals e scheduler")
    .option("--json", "imprime a saída em formato JSON estruturado")
    .action((opts: { json?: boolean; workspace?: string }) =>
      comErros(async () => {
        const info = await coletarStatus(wsDe(opts));

        if (opts.json) {
          console.log(JSON.stringify(info, null, 2));
          return;
        }

        console.log(`\n━━━ OpenCorp Status: ${info.workspace.id} ━━━━━━━━━━━━━━━━━━━━━━━━`);

        // Serviços
        const s = info.servicos;
        console.log("\n● Serviços");
        console.log(`  daemon:    ${s.daemon.ativo ? `ativo (pid ${s.daemon.pid})` : "parado"}`);
        console.log(`  serve:     ${s.serve.ativo ? `vivo (pid ${s.serve.pid}, porta ${s.serve.porta})` : "parado"}`);
        console.log(`  scheduler: ${s.scheduler.ativo ? `vivo (pid ${s.scheduler.pid})` : "morto"}`);
        console.log(`  opencode:  ${s.opencode.ativo ? `conectado (pid ${s.opencode.pid}${s.opencode.porta ? `, porta ${s.opencode.porta}` : ""})` : "parado"}`);

        // Tasks
        console.log("\n● Quadro de Tasks");
        const cols = Object.entries(info.tasks.por_coluna)
          .map(([col, n]) => `${col}:${n}`)
          .join("  ");
        console.log(`  total: ${info.tasks.total} tasks ${cols ? `(${cols})` : ""}`);

        if (info.tasks.fazendo.length > 0) {
          console.log("  tasks em andamento:");
          for (const t of info.tasks.fazendo) {
            console.log(`    → ${t.id} [${t.prioridade}] ${t.titulo} (responsável: ${t.responsavel})`);
          }
        } else {
          console.log("  tasks em andamento: nenhuma");
        }

        if (info.tasks.travadas.length > 0) {
          console.log("  tasks bloqueadas/com erro:");
          for (const t of info.tasks.travadas) {
            console.log(`    ✗ ${t.id}: ${t.titulo} (responsável: ${t.responsavel})`);
          }
        }

        // Approvals (HITL)
        console.log("\n● HITL (Aprovações Humanas)");
        if (info.approvals.total_pendentes === 0) {
          console.log("  0 pendência(s) de aprovação (nenhuma ação travada no painel)");
        } else {
          console.log(`  [Aviso] ${info.approvals.total_pendentes} pendência(s) aguardando aprovação humana:`);
          for (const p of info.approvals.pendencias) {
            console.log(`    - [${p.id}] ${p.acao}${p.agente ? ` (${p.agente})` : ""}${p.descricao ? `: ${p.descricao}` : ""}`);
          }
        }

        // Scheduler
        console.log("\n● Scheduler");
        if (info.scheduler.total_ativos === 0) {
          console.log("  nenhum job ativo para este workspace");
        } else {
          const prox = info.scheduler.proxima_exec
            ? `próxima: ${info.scheduler.proxima_exec}${info.scheduler.proximo_job ? ` (${info.scheduler.proximo_job})` : ""}`
            : "sem próxima execução agendada";
          console.log(`  ${info.scheduler.total_ativos} job(s) ativo(s) · ${prox}`);
        }

        // Última Execução
        if (info.ultima_execucao) {
          const u = info.ultima_execucao;
          console.log("\n● Última Execução");
          console.log(`  ${u.id} · agente: ${u.agente} · status: ${u.status} (${u.data})`);
        }

        // Motores, Contas & Limites
        if (info.motores) {
          console.log("\n● Motores, Contas & Limites");
          console.log(`  motor padrão: ${info.motores.motor_ativo} · fallback: ${info.motores.harness_fallback.join(" → ")}`);
          for (const m of info.motores.lista) {
            const statusTag = m.ativo ? "ativo (padrão)" : m.instalado ? "disponível" : "não instalado";
            const contasDesc = m.contas_total > 0
              ? `${m.contas_total} conta(s) [ativa: ${m.conta_ativa || "nenhuma"}]`
              : "sem contas configuradas";
            const liveCota = m.tokens && m.tokens.source !== "unconfigured"
              ? ` · tokens: ${m.tokens.mensagem} [Consulta Real ao Vivo]`
              : ` · cota: ${m.status_cota} ($${m.daily_cost_usd.toFixed(2)}/dia)`;
            console.log(`  - ${m.id.padEnd(12)}: ${statusTag.padEnd(16)} · timeout: ${m.timeout_min}m · max_turns: ${m.max_turns}${liveCota} · ${contasDesc}`);
            for (const c of m.contas) {
              console.log(`      * [${c.ativa ? "ATIVA" : "SECUNDÁRIA"}] ${c.nome} (cota: ${c.status_cota})`);
            }
          }
        }

        console.log("");
      }),
    );
}
