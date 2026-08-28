import type { Command } from "commander";
import { BudgetManager } from "../../core/budget-manager.js";
import { SettingsStore } from "../../core/settings-store.js";
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

function usd(valor: number): string {
  return `US$ ${valor.toFixed(4)}`;
}

export function registerBudgetCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const budget = new BudgetManager();

  function wsDe(opts: { workspace?: string }): string | undefined {
    return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
  }

  const budgetCmd = program.command("budget").description("orçamento e consumo");

  budgetCmd
    .command("status")
    .description("mostra consumo do dia vs limites (por workspace e por agente)")
    .action((opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const estado = await budget.carregar(ws.path);
        const limites = await budget.limites(ws.path);
        console.log(`dia:             ${estado.dia}`);
        console.log(`workspace:       ${usd(estado.workspace_usd_hoje)} / ${usd(limites.daily_usd)} (${((estado.workspace_usd_hoje / Math.max(limites.daily_usd, 1e-9)) * 100).toFixed(1)}%)`);
        console.log(`pause_on_exceed: ${limites.pause_on_exceed ? "sim" : "não"}`);
        const agentes = Object.entries(estado.por_agente);
        if (agentes.length === 0) {
          console.log("por agente:      (nenhum consumo hoje)");
        } else {
          console.log("por agente:");
          for (const [agente, consumo] of agentes.sort()) {
            console.log(
              `  ${agente.padEnd(20)} ${usd(consumo)} / ${usd(limites.per_agent_usd)} (${((consumo / Math.max(limites.per_agent_usd, 1e-9)) * 100).toFixed(1)}%)`,
            );
          }
        }
      }),
    );

  budgetCmd
    .command("set")
    .option("--daily-usd <valor>", "teto diário do workspace em USD")
    .option("--per-agent-usd <valor>", "teto diário por agente em USD")
    .description("grava os tetos de orçamento no config.json do workspace")
    .action((opts: { dailyUsd?: string; perAgentUsd?: string; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        if (!opts.dailyUsd && !opts.perAgentUsd) {
          console.error('erro: informe --daily-usd e/ou --per-agent-usd');
          process.exitCode = 1;
          return;
        }
        const store = new SettingsStore();
        if (opts.dailyUsd !== undefined) {
          const r = await store.set("budget.daily_usd", opts.dailyUsd, { scope: "workspace", workspaceDir: ws.path });
          console.log(`ok: budget.daily_usd = ${r.depois} — salvo em ${r.path}`);
        }
        if (opts.perAgentUsd !== undefined) {
          const r = await store.set("budget.per_agent_usd", opts.perAgentUsd, { scope: "workspace", workspaceDir: ws.path });
          console.log(`ok: budget.per_agent_usd = ${r.depois} — salvo em ${r.path}`);
        }
      }),
    );
}
