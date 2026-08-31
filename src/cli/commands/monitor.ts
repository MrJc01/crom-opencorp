import type { Command } from "commander";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { TaskStore } from "../../core/task-store.js";
import { SessionManager } from "../../core/session-manager.js";
import { ApprovalsStore } from "../../core/approvals-store.js";
import { BudgetManager } from "../../core/budget-manager.js";
import { RegistryStore } from "../../core/registry-store.js";
import { Scheduler, type Job } from "../../core/scheduler.js";

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

const COLUNAS = ["backlog", "fazendo", "feito"];

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Resumo {
  id: string;
  inicio: string;
  status: string;
  agente: string;
}

export function registerMonitorCommand(program: Command): void {
  const monitor = program
    .command("monitor")
    .description("pulso da(s) empresa(s): tasks, execuções, custos, approvals e crescimento do dia");

  monitor
    .option("--workspace <id>", "workspace alvo (padrão: todos)")
    .option("--watch [segundos]", "atualiza a cada N segundos (padrão: 15)")
    .option("--horas <n>", "janela de execuções analisada em horas (padrão: 24)", "24")
    .action(async (opts) => {
      try {
        const watchSeg = opts.watch === undefined ? 0 : (opts.watch === "" ? 15 : Number(opts.watch) || 15);
        const horas = Number(opts.horas) || 24;
        if (watchSeg > 0) {
          for (;;) {
            process.stdout.write("\x1b[2J\x1b[H");
            await imprimir(opts.workspace, horas);
            await new Promise((r) => setTimeout(r, watchSeg * 1000));
          }
        }
        await imprimir(opts.workspace, horas);
      } catch (erro) {
        reportar(erro);
      }
    });
}

async function imprimir(wsId: string | undefined, horas: number): Promise<void> {
  const manager = new WorkspaceManager();
  const tasks = new TaskStore();
  const sessoes = new SessionManager();
  const approvals = new ApprovalsStore();
  const budget = new BudgetManager();
  const registros = new RegistryStore();

  const alvos = wsId ? [await manager.resolver(wsId)] : (await manager.listar()).filter((w) => w.existe);
  const hoje = hojeISO();
  const limite = new Date(Date.now() - horas * 3600_000).toISOString();

  for (const ws of alvos) {
    if (!ws.existe) continue;
    console.log(`\n━━━ ${ws.id} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // ── Task board ──
    const todasTasks = await tasks.listar(ws.path);
    const porColuna = COLUNAS.map((c) => `${c}:${todasTasks.filter((t) => t.coluna === c).length}`).join("  ");
    const criadasHoje = todasTasks.filter((t) => t.criado_em.startsWith(hoje)).length;
    const avancadasHoje = todasTasks.filter((t) => t.coluna === "feito").length;
    const travadas = todasTasks.filter((t) => t.lock_por).length;
    console.log(`tasks        ${porColuna}   (criadas hoje: ${criadasHoje} · feitas: ${avancadasHoje} · travadas: ${travadas})`);
    const fazendo = todasTasks.filter((t) => t.coluna === "fazendo").slice(0, 4);
    for (const t of fazendo) {
      console.log(`  ▶ ${t.id} ${t.titulo.slice(0, 60)}${t.responsavel ? ` · ${t.responsavel}` : ""}`);
    }

    // ── Execuções (janela) ──
    let execs: Resumo[] = [];
    try {
      execs = (await sessoes.listarExecucoes(ws.path)) as Resumo[];
    } catch {
      execs = [];
    }
    const janela = execs.filter((e) => e.inicio >= limite);
    const porStatus = new Map<string, number>();
    const porAgente = new Map<string, number>();
    for (const e of janela) {
      porStatus.set(e.status, (porStatus.get(e.status) ?? 0) + 1);
      porAgente.set(e.agente, (porAgente.get(e.agente) ?? 0) + 1);
    }
    const statusStr = [...porStatus.entries()].map(([k, v]) => `${k}:${v}`).join("  ") || "nenhuma";
    const taxaOk = janela.length > 0 ? Math.round(((porStatus.get("concluido") ?? 0) / janela.length) * 100) : 0;
    console.log(`execuções    (${horas}h)  ${statusStr}  ·  taxa ok: ${taxaOk}%`);
    const agentesStr = [...porAgente.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  ") || "—";
    console.log(`  agentes     ${agentesStr}`);
    const falhas = janela.filter((e) => e.status === "falhou").slice(0, 3);
    for (const f of falhas) {
      console.log(`  ✗ ${f.id} ${f.agente} · ${f.inicio.slice(5, 16).replace("T", " ")}`);
    }

    // ── Custos hoje ──
    try {
      const estado = await budget.carregar(ws.path);
      const agentesCusto = Object.entries(estado.por_agente ?? {}).filter(([, v]) => v > 0);
      const detalhe = agentesCusto.map(([k, v]) => `${k}:$${v.toFixed(3)}`).join("  ");
      console.log(`custo hoje   $${estado.workspace_usd_hoje.toFixed(4)}${detalhe ? `  (${detalhe})` : ""}`);
    } catch {
      console.log("custo hoje   —");
    }

    // ── Approvals pendentes ──
    const pend = await approvals.pendentes(ws.path);
    console.log(`approvals    ${pend.length} pendente(s)${pend.length ? ` — use "opencorp approvals list"` : ""}`);

    // ── Scheduler ──
    try {
      const jobs = await new Scheduler().listar(true);
      const doWs = jobs.filter((j: Job) => !j.workspace || j.workspace === ws.id);
      if (doWs.length) {
        const proximos = doWs
          .map((j: Job) => j.proxima_exec ?? "")
          .filter(Boolean)
          .sort()[0];
        console.log(`scheduler    ${doWs.length} job(s) ativo(s)${proximos ? ` · próxima: ${proximos.slice(5, 16).replace("T", " ")}` : ""}`);
      }
    } catch {
      // scheduler store indisponível — silencioso
    }

    // ── Registros (crescimento acúmulo) ──
    const docs = await listarContagem(registros, ws.path, "documentos");
    const chats = await listarContagem(registros, ws.path, "chats");
    // OUTPUT (7d): coisas que mudaram de estado — tasks fechadas + pareceres novos
    const dias7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const feitas7d = todasTasks.filter((t) => t.coluna === "feito" && t.atualizado_em >= dias7d).length;
    let novosDocs = 0;
    try {
      novosDocs = (await registros.listar(ws.path, "documentos")).filter((d) => d.criado_em >= dias7d).length;
    } catch {
      novosDocs = 0;
    }
    console.log(`outputs 7d   ${feitas7d} task(s) fechada(s) · ${novosDocs} documento(s) novo(s)`);
    console.log(`registries   documentos:${docs}  chats:${chats}  execucoes:${execs.length}`);
  }
  console.log("");
}

async function listarContagem(registros: RegistryStore, wsPath: string, categoria: string): Promise<number> {
  try {
    return (await registros.listar(wsPath, categoria)).length;
  } catch {
    return 0;
  }
}
