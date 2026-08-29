import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { Supervisor, spawnDaemon, estaRodando, lerPidfile, gravarPidfile, removerPidfile, pidPath, pidVivo } from "../../core/supervisor.js";
import { RegistryStore } from "../../core/registry-store.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";

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

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function registerSupervisorCommand(program: Command): void {
  const manager = new WorkspaceManager();

  function wsDe(opts: { workspace?: string }): string | undefined {
    return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
  }

  const supervisor = program.command("supervisor").description("supervisor em loop (heartbeat)");

  supervisor
    .command("start")
    .option("--interval <minutos>", "intervalo entre ticks em minutos (padrão: settings supervisor.interval_minutes)")
    .option("--foreground", "roda em primeiro plano (debug) — padrão: daemonizado em background")
    .description("inicia o loop do supervisor (daemonizado; pare com opencorp supervisor stop)")
    .action((opts: { interval?: string; foreground?: boolean; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        if (!opts.foreground) {
          const logPath = join(ws.path, "logs", "supervisor-daemon.log");
          const args = [process.argv[1]!, "supervisor", "start", "--foreground"];
          if (opts.workspace) args.push("--workspace", opts.workspace);
          if (opts.interval !== undefined) args.push("--interval", opts.interval);
          const pid = await spawnDaemon(args, logPath);
          let confirmado = false;
          for (let i = 0; i < 20; i++) {
            await dormir(100);
            const info = await lerPidfile(ws.path);
            if (info && info.pid === pid) {
              confirmado = true;
              break;
            }
          }
          if (!confirmado) {
            console.log("aviso: o filho ainda não gravou o pidfile — verifique o log do daemon");
          }
          console.log(`ok: supervisor iniciado em background (pid ${pid}) — logs: ${logPath}`);
          console.log("pare com: opencorp supervisor stop");
          return;
        }
        if (await estaRodando(ws.path)) {
          const pid = await lerPidfile(ws.path);
          console.error(
            `erro: supervisor já está rodando para "${ws.id}" (pid ${pid?.pid}) — pare com "opencorp supervisor stop"`,
          );
          process.exitCode = 1;
          return;
        }
        const anterior = await lerPidfile(ws.path);
        if (anterior) {
          console.log(`[supervisor] pidfile obsoleto (pid ${anterior.pid} não está vivo) — removido`);
        }
        let intervalo: number | undefined;
        if (opts.interval !== undefined) {
          intervalo = Number(opts.interval);
          if (!Number.isFinite(intervalo) || intervalo < 1) {
            console.error("erro: --interval deve ser um número de minutos >= 1");
            process.exitCode = 1;
            return;
          }
        } else {
          const { SettingsStore } = await import("../../core/settings-store.js");
          intervalo = Number(
            (await new SettingsStore().get("supervisor.interval_minutes", { workspaceDir: ws.path })).valor,
          );
        }
        await gravarPidfile(ws.path, {
          pid: process.pid,
          workspace_id: ws.id,
          workspace_path: ws.path,
          intervalo_minutes: intervalo,
          iniciado_em: new Date().toISOString(),
          ultimo_tick: anterior?.ultimo_tick ?? null,
        });
        const sup = new Supervisor();
        const parar = () => {
          console.log("\n[supervisor] sinal recebido — encerrando após o tick em curso...");
          sup.solicitarParada();
        };
        process.on("SIGTERM", parar);
        process.on("SIGINT", parar);
        console.log(
          `[supervisor] iniciado (pid ${process.pid}) — workspace "${ws.id}" · intervalo ${intervalo} min`,
        );
        try {
          await sup.rodarLoop(ws.path, intervalo);
        } finally {
          process.off("SIGTERM", parar);
          process.off("SIGINT", parar);
          await removerPidfile(ws.path);
          console.log("[supervisor] parado (pidfile removido)");
        }
      }),
    );

  supervisor
    .command("stop")
    .description("envia SIGTERM ao supervisor e limpa o pidfile")
    .action((opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const pid = await lerPidfile(ws.path);
        if (!pid) {
          console.log("supervisor não está rodando (nenhum pidfile)");
          return;
        }
        if (!(await estaRodando(ws.path))) {
          await removerPidfile(ws.path);
          console.log(`pid ${pid.pid} obsoleto — pidfile removido (supervisor já estava parado)`);
          return;
        }
        process.kill(pid.pid, "SIGTERM");
        for (let i = 0; i < 30; i++) {
          await dormir(100);
          if (!existsSync(pidPath(ws.path))) break;
        }
        await removerPidfile(ws.path);
        console.log(`ok: SIGTERM enviado ao pid ${pid.pid} — supervisor parando`);
      }),
    );

  supervisor
    .command("status")
    .description("mostra rodando/parado, pid, intervalo e último tick")
    .action((opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const pid = await lerPidfile(ws.path);
        if (pid && (await pidVivo(pid.pid))) {
          console.log(`status:       rodando (pid ${pid.pid})`);
          console.log(`workspace:    ${pid.workspace_id}`);
          console.log(`intervalo:    ${pid.intervalo_minutes} min`);
          console.log(`iniciado_em:  ${pid.iniciado_em}`);
          console.log(`último tick:  ${pid.ultimo_tick ?? "nenhum ainda"}`);
        } else {
          if (pid) {
            await removerPidfile(ws.path);
            console.log(`status:       parado (pidfile obsoleto do pid ${pid.pid} removido)`);
          } else {
            console.log("status:       parado");
          }
          const estado = await new Supervisor().lerEstado(ws.path);
          console.log(`último tick:  ${estado.ultimo_tick ?? "nenhum"}`);
        }
      }),
    );

  supervisor
    .command("logs")
    .description("mostra os últimos eventos do supervisor-log")
    .action((opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const registros = new RegistryStore();
        let eventos: { ts?: string; evento?: string; resumo?: string }[];
        try {
          eventos = (await registros.obter(ws.path, "logs", "supervisor-log")).journal;
        } catch {
          console.log("nenhum evento do supervisor ainda (registro supervisor-log inexistente)");
          return;
        }
        const ticks = eventos.filter((ev) => ev.evento !== "criado");
        if (ticks.length === 0) {
          console.log("nenhum evento do supervisor ainda");
          return;
        }
        for (const ev of ticks.slice(-20)) {
          console.log(`${(ev.ts ?? "").slice(0, 19).replace("T", " ")} [${ev.evento}] ${ev.resumo}`);
        }
      }),
    );
}

