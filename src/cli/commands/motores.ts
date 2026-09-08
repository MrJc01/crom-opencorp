import type { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { engineRegistry, EngineAccountStore } from "../../core/engines/index.js";

function colorize(text: string, color: "green" | "red" | "yellow" | "cyan" | "magenta" | "gray" | "bold"): string {
  const codes: Record<string, string> = {
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    gray: "\x1b[90m",
    bold: "\x1b[1m",
  };
  const reset = "\x1b[0m";
  return `${codes[color] || ""}${text}${reset}`;
}

function obterRunnerConfig(home: string): { engine: string; timeout_min: number; harness_fallback: string[] } {
  const rPath = join(home, ".opencorp", "runner.json");
  let runner: any = {
    engine: "opencode",
    timeout_min: 20,
    harness_fallback: ["antigravity", "copilot", "opencode"],
  };
  if (existsSync(rPath)) {
    try {
      runner = JSON.parse(readFileSync(rPath, "utf8"));
    } catch {}
  }
  return runner;
}

function salvarRunnerConfig(home: string, cfg: any): void {
  const rPath = join(home, ".opencorp", "runner.json");
  writeFileSync(rPath, JSON.stringify(cfg, null, 2), "utf8");
}

export function registerMotoresCommand(program: Command): void {
  const motoresCmd = program
    .command("motores")
    .alias("motor")
    .description("gerenciamento, diagnóstico e seleção de motores de IA (OpenCode, Copilot, Antigravity, etc.)");

  motoresCmd
    .command("list")
    .alias("ls")
    .description("lista todos os motores, status de instalação, contas e motor padrão")
    .option("--json", "saída em JSON bruto")
    .action(async (opts: { json?: boolean }) => {
      const home = os.homedir();
      const summaries = await engineRegistry.listSummaries(home, false);
      const accStore = new EngineAccountStore({ homeDir: home });
      const runner = obterRunnerConfig(home);
      const activeId = runner.engine || "opencode";
      const limits = await accStore.obterLimitesMotores();
      const todasContas = await accStore.listar();

      if (opts.json) {
        console.log(JSON.stringify({ active: activeId, fallback: runner.harness_fallback, motores: summaries }, null, 2));
        return;
      }

      console.log("");
      console.log(colorize("━━━ Motores de IA & Runtimes de Execução ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "bold"));
      console.log(`  Motor Padrão Ativo: ${colorize(activeId, "cyan")} ${colorize("[PADRÃO]", "bold")}`);
      console.log(`  Harness Fallback  : ${(runner.harness_fallback || []).join(" → ")}`);
      console.log("");

      for (const s of summaries) {
        const isAtivo = s.id === activeId;
        const contasMotor = todasContas.filter((c) => c.motorId === s.id);
        const contaAtiva = contasMotor.find((c) => c.ativa);
        const lim = limits[s.id] || { timeout_min: 20, max_turns: 40, rate_limit_rpm: 30, daily_cost_usd: 10 };

        const statusTag = isAtivo
          ? colorize("● ATIVO (PADRÃO)", "green")
          : s.installed
          ? colorize("○ INSTALADO", "cyan")
          : colorize("× NÃO INSTALADO", "gray");

        console.log(`  ${colorize(s.name, "bold")} (${colorize(s.id, "cyan")})  ${statusTag}`);
        console.log(`    • Mantenedor : ${s.maintainer} · Categoria: ${s.category}`);
        console.log(`    • Binário    : ${s.path || "não detectado"} ${s.version ? `(${s.version})` : ""}`);
        console.log(`    • Guardrails : timeout ${lim.timeout_min}m · max turns ${lim.max_turns} · ${lim.rate_limit_rpm} RPM · cota US$ ${lim.daily_cost_usd}/dia`);

        if (contasMotor.length > 0) {
          const ativaNome = contaAtiva ? contaAtiva.nome : "nenhuma ativa";
          console.log(`    • Contas (${contasMotor.length}): ativa: ${colorize(ativaNome, "green")}`);
        } else {
          console.log(`    • Contas     : nenhuma credencial personalizada (usa credencial padrão do sistema)`);
        }
        console.log("");
      }

      console.log(colorize(`  Comandos úteis:`, "gray"));
      console.log(colorize(`    opencorp tokens              → consulta quotas reais de tokens de todos os motores`, "gray"));
      console.log(colorize(`    opencorp motores set <id>    → altera o motor de execução padrão`, "gray"));
      console.log(colorize(`    opencorp motores test <id>   → executa health check no motor`, "gray"));
      console.log("");
    });

  motoresCmd
    .command("set <id>")
    .description("define o motor padrão do sistema (ex: opencode, copilot, antigravity, crom-agente)")
    .action(async (id: string) => {
      const home = os.homedir();
      try {
        const driver = engineRegistry.resolveDriver(id.toLowerCase().trim());
        const runner = obterRunnerConfig(home);
        runner.engine = driver.id;
        salvarRunnerConfig(home, runner);
        console.log(colorize(`✓ Motor padrão atualizado para "${driver.name}" (${driver.id})`, "green"));
      } catch (err: any) {
        console.error(`erro: ${err.message}`);
        process.exitCode = 1;
      }
    });

  motoresCmd
    .command("test <id>")
    .description("executa verificação de saúde e conectividade do motor")
    .action(async (id: string) => {
      const home = os.homedir();
      try {
        const driver = engineRegistry.resolveDriver(id.toLowerCase().trim());
        console.log(`Testando saúde do motor "${driver.name}" (${driver.id})...`);
        const health = await driver.checkHealth(home);
        if (health.healthy) {
          console.log(colorize(`✓ Motor saudável: ${health.statusText}`, "green"));
        } else {
          console.log(colorize(`! Motor com avisos: ${health.statusText}`, "yellow"));
        }
      } catch (err: any) {
        console.error(`erro: ${err.message}`);
        process.exitCode = 1;
      }
    });

  // Se o usuário digitar apenas "opencorp motores" sem subcomando, roda a listagem
  motoresCmd.action(async () => {
    const home = os.homedir();
    const summaries = await engineRegistry.listSummaries(home, false);
    const accStore = new EngineAccountStore({ homeDir: home });
    const runner = obterRunnerConfig(home);
    const activeId = runner.engine || "opencode";
    const limits = await accStore.obterLimitesMotores();
    const todasContas = await accStore.listar();

    console.log("");
    console.log(colorize("━━━ Motores de IA & Runtimes de Execução ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "bold"));
    console.log(`  Motor Padrão Ativo: ${colorize(activeId, "cyan")} ${colorize("[PADRÃO]", "bold")}`);
    console.log(`  Harness Fallback  : ${(runner.harness_fallback || []).join(" → ")}`);
    console.log("");

    for (const s of summaries) {
      const isAtivo = s.id === activeId;
      const contasMotor = todasContas.filter((c) => c.motorId === s.id);
      const contaAtiva = contasMotor.find((c) => c.ativa);
      const lim = limits[s.id] || { timeout_min: 20, max_turns: 40, rate_limit_rpm: 30, daily_cost_usd: 10 };

      const statusTag = isAtivo
        ? colorize("● ATIVO (PADRÃO)", "green")
        : s.installed
        ? colorize("○ INSTALADO", "cyan")
        : colorize("× NÃO INSTALADO", "gray");

      console.log(`  ${colorize(s.name, "bold")} (${colorize(s.id, "cyan")})  ${statusTag}`);
      console.log(`    • Mantenedor : ${s.maintainer} · Categoria: ${s.category}`);
      console.log(`    • Binário    : ${s.path || "não detectado"} ${s.version ? `(${s.version})` : ""}`);
      console.log(`    • Guardrails : timeout ${lim.timeout_min}m · max turns ${lim.max_turns} · ${lim.rate_limit_rpm} RPM · cota US$ ${lim.daily_cost_usd}/dia`);

      if (contasMotor.length > 0) {
        const ativaNome = contaAtiva ? contaAtiva.nome : "nenhuma ativa";
        console.log(`    • Contas (${contasMotor.length}): ativa: ${colorize(ativaNome, "green")}`);
      } else {
        console.log(`    • Contas     : nenhuma credencial personalizada (usa credencial padrão do sistema)`);
      }
      console.log("");
    }

    console.log(colorize(`  Comandos úteis:`, "gray"));
    console.log(colorize(`    opencorp tokens              → consulta quotas reais de tokens de todos os motores`, "gray"));
    console.log(colorize(`    opencorp motores set <id>    → altera o motor de execução padrão`, "gray"));
    console.log(colorize(`    opencorp motores test <id>   → executa health check no motor`, "gray"));
    console.log("");
  });
}
