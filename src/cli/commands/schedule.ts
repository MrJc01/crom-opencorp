import { join } from "node:path";
import type { Command } from "commander";
import {
  Scheduler,
  validarCron,
  type Agenda,
  type Job,
} from "../../core/scheduler.js";
import { SchedulerError } from "../../core/errors.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { spawnDaemon, pidVivo } from "../../core/supervisor.js";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { opencorpHome } from "../../utils/paths.js";

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

function dividirArgs(texto: string): string[] {
  const saida: string[] = [];
  for (const m of texto.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) {
    saida.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return saida;
}

function agendaDe(opts: { cron?: string; intervaloMin?: number; as?: string }): Agenda {
  if (opts.cron) return { tipo: "cron", valor: opts.cron };
  if (opts.intervaloMin) return { tipo: "intervalo_min", valor: opts.intervaloMin };
  if (opts.as) return { tipo: "data_unica", valor: opts.as };
  throw new SchedulerError("informe a agenda: --cron \"...\" | --intervalo-min N | --as <ISO>");
}

function linhaJob(j: Job): string {
  const agenda =
    j.agenda.tipo === "cron"
      ? `cron "${j.agenda.valor}"`
      : j.agenda.tipo === "intervalo_min"
        ? `cada ${j.agenda.valor} min`
        : `em ${j.agenda.valor}`;
  const status = j.ativo ? "ativo" : "pausado";
  const proxima = j.proxima_exec ? j.proxima_exec.slice(0, 16).replace("T", " ") : "-";
  return `${j.id}  ${status.padEnd(8)}${agenda.padEnd(22)}próxima: ${proxima}  ${j.nome} [${j.args.join(" ")}]`;
}

function pidPathScheduler(): string {
  return join(opencorpHome(), ".opencorp", "scheduler.pid");
}

async function lerPid(): Promise<{ pid: number } | null> {
  const path = pidPathScheduler();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as { pid: number };
  } catch {
    return null;
  }
}

export function registerScheduleCommands(program: Command): void {
  const scheduler = new Scheduler();
  const manager = new WorkspaceManager();

  function wsDe(opts: { workspace?: string }): string | undefined {
    return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
  }

  const schedule = program
    .command("schedule")
    .description(
      "jobs agendados (cron de 5 campos, intervalo em minutos ou data única) que executam comandos opencorp — ex.: schedule create --nome rotina --intervalo-min 60 --args \"task create --titulo 'Checar fila'\"",
    );

  schedule
    .command("create")
    .requiredOption("--nome <nome>", "nome do job")
    .requiredOption("--args <comando>", 'comando opencorp (sem o binário), ex.: "agent run executor-padrao --ordem \'oi\'"')
    .option("--cron <expr>", "expressão cron de 5 campos (min hora dom mês dow)")
    .option("--intervalo-min <n>", "repete a cada N minutos", Number)
    .option("--as <data>", "data única (ISO) — executa uma vez e desativa")
    .option("--workspace <id>", "workspace alvo (padrão: ativo)")
    .option("--graca-min <n>", "tolerância de atraso antes de pular (padrão 5)", Number)
    .description("cria um job agendado")
    .action((opts: { nome: string; args: string; cron?: string; intervaloMin?: number; as?: string; workspace?: string; gracaMin?: number }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const j = await scheduler.criar({
          nome: opts.nome,
          agenda: agendaDe(opts),
          args: dividirArgs(opts.args),
          workspace: ws.id,
          graca_min: opts.gracaMin,
        });
        console.log(`ok: ${j.id} criado — próxima execução ${j.proxima_exec}`);
      }),
    );

  schedule
    .command("list")
    .option("--todos", "inclui pausados (padrão: todos)")
    .description("lista os jobs agendados")
    .action(() =>
      comErros(async () => {
        const jobs = await scheduler.listar();
        if (jobs.length === 0) {
          console.log('nenhum job — crie com: opencorp schedule create --nome "..." --intervalo-min 60 --args "..."');
          return;
        }
        for (const j of jobs) console.log(linhaJob(j));
      }),
    );

  schedule
    .command("show")
    .argument("<id>", "id do job")
    .description("detalhes do job")
    .action((id: string) =>
      comErros(async () => {
        const j = await scheduler.obter(id);
        console.log(JSON.stringify(j, null, 2));
      }),
    );

  schedule
    .command("pause")
    .argument("<id>", "id do job")
    .description("pausa o job")
    .action((id: string) =>
      comErros(async () => {
        const j = await scheduler.pausar(id);
        console.log(`ok: ${j.id} pausado`);
      }),
    );

  schedule
    .command("resume")
    .argument("<id>", "id do job")
    .description("retoma o job (reagenda a partir de agora)")
    .action((id: string) =>
      comErros(async () => {
        const j = await scheduler.retomar(id);
        console.log(`ok: ${j.id} ativo — próxima execução ${j.proxima_exec}`);
      }),
    );

  schedule
    .command("run-now")
    .argument("<id>", "id do job")
    .description("executa o job imediatamente (sem mudar a agenda)")
    .action((id: string) =>
      comErros(async () => {
        const { resultado } = await scheduler.runNow(id);
        console.log(`ok: executado — ${resultado}`);
      }),
    );

  schedule
    .command("delete")
    .argument("<id>", "id do job")
    .description("exclui o job")
    .action((id: string) =>
      comErros(async () => {
        await scheduler.excluir(id);
        console.log(`ok: ${id} excluído`);
      }),
    );

  const daemon = program
    .command("scheduler")
    .description("daemon do scheduler — executa os jobs agendados de todos os workspaces");

  daemon
    .command("start")
    .option("--intervalo-seg <n>", "período do tick em segundos (padrão 30)", Number, 30)
    .option("--foreground", "roda em primeiro plano (debug)")
    .description("inicia o daemon (padrão: background com logs)")
    .action((opts: { intervaloSeg: number; foreground?: boolean }) =>
      comErros(async () => {
        const home = opencorpHome();
        const pidfile = pidPathScheduler();
        const anterior = await lerPid();
        if (anterior && (await pidVivo(anterior.pid))) {
          console.log(`erro: scheduler já está rodando (pid ${anterior.pid}) — pare com "opencorp scheduler stop"`);
          process.exitCode = 1;
          return;
        }
        if (opts.foreground) {
          const s = new Scheduler({ homeDir: home });
          s.iniciar(opts.intervaloSeg, true);
          const jobs = (await s.listar(true)).length;
          console.log(`[scheduler] foreground (pid ${process.pid}) — ${jobs} job(s) ativo(s), tick ${opts.intervaloSeg}s`);
          await writeFile(pidfile, JSON.stringify({ pid: process.pid, iniciado: new Date().toISOString() }), "utf8");
          process.on("SIGINT", () => {
            console.log("\n[scheduler] encerrando...");
            s.parar();
            void unlink(pidfile).then(() => process.exit(0));
          });
          return;
        }
        const bin = process.argv[1]!;
        const logPath = join(home, ".opencorp", "logs", "scheduler-daemon.log");
        const { dirname } = await import("node:path");
        const { mkdirRecursive } = await import("../../utils/fs-safe.js");
        await mkdirRecursive(dirname(logPath));
        const pid = await spawnDaemon(
          [bin, "scheduler", "start", "--foreground", "--intervalo-seg", String(opts.intervaloSeg)],
          logPath,
        );
        console.log(`ok: scheduler iniciado em background (pid ${pid}) — logs: ${logPath}`);
      }),
    );

  daemon
    .command("stop")
    .description("envia SIGTERM ao daemon e limpa o pidfile")
    .action(() =>
      comErros(async () => {
        const pid = await lerPid();
        if (!pid) {
          console.log("scheduler não está rodando");
          return;
        }
        if (!(await pidVivo(pid.pid))) {
          await unlink(pidPathScheduler());
          console.log(`[scheduler] pidfile obsoleto (pid ${pid.pid} não está vivo) — removido`);
          return;
        }
        process.kill(pid.pid, "SIGTERM");
        await unlink(pidPathScheduler());
        console.log(`ok: sinal enviado ao pid ${pid.pid}`);
      }),
    );

  daemon
    .command("status")
    .description("mostra se o daemon está vivo e os próximos jobs")
    .action(() =>
      comErros(async () => {
        const pid = await lerPid();
        const vivo = pid ? await pidVivo(pid.pid) : false;
        console.log(`daemon: ${pid ? (vivo ? `vivo (pid ${pid.pid})` : `morto (pid ${pid.pid} obsoleto)`) : "parado"}`);
        for (const j of (await scheduler.listar(true)).slice(0, 5)) console.log(`  ${linhaJob(j)}`);
      }),
    );
}

export { validarCron };
