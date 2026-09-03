import type { Command } from "commander";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { RegistryStore } from "../../core/registry-store.js";
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

function wsDe(program: Command, opts: { workspace?: string }): string | undefined {
  return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
}

async function comErros(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (erro) {
    reportar(erro);
  }
}

function pidVivo(pid?: number | null): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function registerSaudeCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const registros = new RegistryStore();

  async function workspaceAlvo(opts: { workspace?: string }) {
    try {
      return await manager.resolver(wsDe(program, opts));
    } catch {
      const atual = await manager.atual();
      if (atual) return atual;
      return manager.resolver(wsDe(program, opts));
    }
  }

  program
    .command("saude")
    .aliases(["health", "check"])
    .description("diagnóstico compacto de saúde do sistema e do workspace")
    .option("--json", "saída em JSON")
    .action((opts: { json?: boolean; workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts);
        const home = opencorpHome();

        // 1. Daemon
        let daemonVivo = false;
        const daemonPidPath = join(home, ".opencorp", "daemon.pid");
        if (existsSync(daemonPidPath)) {
          try {
            const d = JSON.parse(readFileSync(daemonPidPath, "utf8"));
            daemonVivo = pidVivo(d.pid);
          } catch {}
        }

        // 2. Scheduler
        let schedulerVivo = false;
        const schedPidPath = join(home, ".opencorp", "scheduler.pid");
        if (existsSync(schedPidPath)) {
          try {
            const s = JSON.parse(readFileSync(schedPidPath, "utf8"));
            schedulerVivo = pidVivo(s.pid);
          } catch {}
        }

        // 3. Serve (API)
        let serveVivo = false;
        try {
          const res = await fetch("http://127.0.0.1:4100/health", { signal: AbortSignal.timeout(1000) });
          serveVivo = res.ok;
        } catch {}

        // 4. Execuções recentes e falhas
        const db = registros.corpDb(ws.path);
        const execs = db.listarExecucoes({ limite: 100 });
        const hoje = new Date().toISOString().slice(0, 10);
        const execsHoje = execs.filter((e) => (e.inicio || "").startsWith(hoje));
        const falhasHoje = execsHoje.filter((e) => e.status === "falhou");
        const ultimasFalhas = execs.filter((e) => e.status === "falhou");
        const ultimaFalha = ultimasFalhas[0];
        const ultimaExec = execs[0];

        const dados = {
          workspace: ws.id,
          servicos: {
            daemon: daemonVivo ? "ativo" : "inativo",
            scheduler: schedulerVivo ? "ativo" : "inativo",
            serve: serveVivo ? "ativo" : "inativo",
          },
          metricas_hoje: {
            total: execsHoje.length,
            concluidas: execsHoje.filter((e) => e.status === "concluido").length,
            falhas: falhasHoje.length,
            taxa_sucesso:
              execsHoje.length > 0
                ? `${(((execsHoje.length - falhasHoje.length) / execsHoje.length) * 100).toFixed(1)}%`
                : "100%",
          },
          ultima_execucao: ultimaExec
            ? {
                id: ultimaExec.id,
                agente: ultimaExec.agente,
                status: ultimaExec.status,
                inicio: ultimaExec.inicio,
              }
            : null,
          ultima_falha: ultimaFalha
            ? {
                id: ultimaFalha.id,
                agente: ultimaFalha.agente,
                erro: ultimaFalha.erro || "Sem erro detalhado",
                inicio: ultimaFalha.inicio,
              }
            : null,
        };

        if (opts.json) {
          console.log(JSON.stringify(dados, null, 2));
          return;
        }

        console.log(`\n🏥 Saúde do Sistema — Workspace: "${ws.id}"`);
        console.log("──────────────────────────────────────────────────");
        console.log(
          `Serviços:   Daemon: ${daemonVivo ? "🟢 ATIVO" : "🔴 PARADO"} | Scheduler: ${schedulerVivo ? "🟢 ATIVO" : "🔴 PARADO"} | Serve: ${serveVivo ? "🟢 ATIVO" : "⚪ OFFLINE"}`,
        );
        console.log(
          `Hoje:       ${dados.metricas_hoje.total} execuções (${dados.metricas_hoje.concluidas} ok, ${dados.metricas_hoje.falhas} falhas — taxa de sucesso: ${dados.metricas_hoje.taxa_sucesso})`,
        );

        if (ultimaExec) {
          const statusIcon = ultimaExec.status === "concluido" ? "🟢" : ultimaExec.status === "falhou" ? "🔴" : "🟡";
          console.log(`Última:     ${statusIcon} ${ultimaExec.id} (@${ultimaExec.agente}) em ${ultimaExec.inicio.slice(0, 19).replace("T", " ")}`);
        }

        if (ultimaFalha) {
          console.log(`Última Falha: 🔴 ${ultimaFalha.id} (@${ultimaFalha.agente})`);
          console.log(`             ↳ ${String(ultimaFalha.erro || "").slice(0, 120)}`);
        } else {
          console.log("Última Falha: Nenhuma falha recente registrada 🎉");
        }
        console.log("──────────────────────────────────────────────────\n");
      }),
    );
}
