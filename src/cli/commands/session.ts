import type { Command } from "commander";
import { SessionManager } from "../../core/session-manager.js";
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

function formatarDuracao(ms: number | null): string {
  if (ms === null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

export function registerSessionCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const sessoes = new SessionManager();

  function workspaceAlvo(opts: { workspace?: string }) {
    return manager.resolver(wsDe(program, opts));
  }

  const session = program.command("session").description("sessões OpenCode registradas");

  session
    .command("list")
    .option("--agent <id>", "filtra por agente")
    .option("--json", "saída em formato JSON")
    .description("lista as execuções registradas (registries/execucoes)")
    .action((opts: { agent?: string; json?: boolean; workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts);
        const registros = await sessoes.listarExecucoes(ws.path, { agente: opts.agent });
        if (opts.json) {
          console.log(JSON.stringify(registros, null, 2));
          return;
        }
        if (registros.length === 0) {
          console.log(`nenhuma sessão registrada (workspace: "${ws.id}")`);
          return;
        }
        console.log("id                               agente           status       exit  duração  início");
        for (const r of registros) {
          console.log(
            `${r.id}  ${r.agente.padEnd(16)} ${r.status.padEnd(12)} ${String(r.exit_code ?? "-").padEnd(5)} ${formatarDuracao(r.duracao_ms).padEnd(8)} ${r.inicio.slice(0, 19).replace("T", " ")}`,
          );
        }
      }),
    );

  session
    .command("log")
    .argument("<id>", "id da sessão (exec-...)")
    .description("mostra a captura de terminal da sessão")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts);
        process.stdout.write(await sessoes.logDe(ws.path, id));
      }),
    );

  session
    .command("kill")
    .argument("<id>", "id da sessão (exec-...)")
    .description("mata o processo da sessão, se estiver vivo")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts);
        await sessoes.matar(ws.path, id);
        console.log(`ok: sessão "${id}" recebeu SIGTERM`);
      }),
    );
}
