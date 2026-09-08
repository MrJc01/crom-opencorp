import type { Command } from "commander";
import os from "node:os";
import { engineRegistry, EngineAccountStore } from "../../core/engines/index.js";
import type { EngineTokenUsage } from "../../core/engines/types.js";

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

export function registerTokensCommand(program: Command): void {
  program
    .command("tokens")
    .alias("cotas")
    .argument("[motor]", "ID do motor (ex: copilot, opencode, antigravity, crom-agente) ou omita para todos")
    .option("--json", "exibe a saída em formato JSON bruto")
    .option("--conta <id>", "consulta com as credenciais de uma conta conectada específica")
    .description("consulta quotas reais, tokens e limites ao vivo através dos adaptadores dos motores")
    .action(async (motorArg: string | undefined, opts: { json?: boolean; conta?: string }) => {
      const home = os.homedir();

      try {
        if (motorArg) {
          // Consulta motor específico
          const motorId = motorArg.toLowerCase().trim();
          let credenciais: { tokenOuChave?: string; authType?: string } | undefined;

          if (opts.conta) {
            const accStore = new EngineAccountStore({ homeDir: home });
            const todas = await accStore.listar(motorId);
            const conta = todas.find((c: any) => c.id === opts.conta || c.nome === opts.conta);
            if (!conta) {
              console.error(`erro: conta "${opts.conta}" não encontrada para o motor "${motorId}".`);
              process.exitCode = 1;
              return;
            }
            credenciais = { tokenOuChave: conta.tokenOuChave, authType: conta.authType };
          }

          const usage: EngineTokenUsage = await engineRegistry.fetchLiveTokens(motorId, home, credenciais);

          if (opts.json) {
            console.log(JSON.stringify(usage, null, 2));
            return;
          }

          console.log("");
          console.log(colorize(`━━━ Quota Real: ${usage.motorName} (${usage.motorId}) ━━━━━━━━━━━━━━━━━━━━`, "bold"));
          console.log(`  • Origem da Consulta : ${formatSource(usage.source)}`);
          console.log(`  • Provedor Consultado: ${colorize(usage.provedor, "cyan")}`);

          const disp = usage.tokensDisponiveis != null
            ? typeof usage.tokensDisponiveis === "number"
              ? Number(usage.tokensDisponiveis).toLocaleString("pt-BR")
              : String(usage.tokensDisponiveis).toUpperCase()
            : "N/D";
          console.log(`  • Tokens/Reqs Livres : ${formatDisponiveis(disp, usage.statusCota)}`);

          if (usage.requestsRestantes != null && usage.requestsLimite != null) {
            console.log(`  • Requisições Rest.  : ${usage.requestsRestantes} / ${usage.requestsLimite}`);
          }
          if (usage.saldoUsd != null) {
            console.log(`  • Saldo em Créditos  : US$ ${usage.saldoUsd.toFixed(2)}`);
          }
          if (usage.consumoUsd != null) {
            console.log(`  • Consumo Acumulado  : US$ ${usage.consumoUsd.toFixed(2)}`);
          }
          if (usage.rateLimitRpm) {
            console.log(`  • Rate Limit         : ${usage.rateLimitRpm} RPM`);
          }

          console.log(`  • Status da Cota     : ${formatCotaBadge(usage.statusCota)}`);
          if (usage.resetaEm) {
            console.log(`  • Cota Reseta Em     : ${new Date(usage.resetaEm).toLocaleString("pt-BR")}`);
          }
          console.log(`  • Mensagem Adaptador : ${usage.mensagem}`);
          console.log(`  • Data da Consulta   : ${new Date(usage.consultadoEm).toLocaleString("pt-BR")}`);

          if (usage.detalhes && Object.keys(usage.detalhes).length > 0) {
            console.log(`  • Metadados Detalhes : ${JSON.stringify(usage.detalhes)}`);
          }
          console.log("");
          return;
        }

        // Consulta consolidada de todos os motores
        const todos = await engineRegistry.fetchAllLiveTokens(home);

        if (opts.json) {
          console.log(JSON.stringify(todos, null, 2));
          return;
        }

        console.log("");
        console.log(colorize("━━━ OpenCorp Quotas Reais & Tokens Disponíveis ━━━━━━━━━━━━━━━━━━━━━━━━", "bold"));
        console.log(colorize("  Consulta direta aos adaptadores dos motores sem cálculos cegos", "gray"));
        console.log("");

        // Cabeçalho da tabela
        const colMotor = "Motor".padEnd(14);
        const colOrigem = "Origem".padEnd(14);
        const colProv = "Provedor".padEnd(20);
        const colDisp = "Disponíveis".padEnd(16);
        const colSaldo = "Saldo / RPM".padEnd(14);
        const colCota = "Cota".padEnd(12);

        console.log(colorize(`  ${colMotor} ${colOrigem} ${colProv} ${colDisp} ${colSaldo} ${colCota}`, "bold"));
        console.log(colorize(`  ${"─".repeat(14)} ${"─".repeat(14)} ${"─".repeat(20)} ${"─".repeat(16)} ${"─".repeat(14)} ${"─".repeat(12)}`, "gray"));

        for (const [id, u] of Object.entries(todos)) {
          const mName = padColor(id, 14, "bold");
          const origColor = getSourceColor(u.source);
          const orig = padColor(u.source, 14, origColor);
          const prov = padColor((u.provedor || "-").slice(0, 19), 20);

          let dispVal = "N/D";
          if (u.tokensDisponiveis != null) {
            dispVal = typeof u.tokensDisponiveis === "number"
              ? Number(u.tokensDisponiveis).toLocaleString("pt-BR")
              : String(u.tokensDisponiveis);
          }
          const dispColor = (u.statusCota === "esgotado" || dispVal === "0") ? "red" : (dispVal === "ilimitado" ? "cyan" : "green");
          const disp = padColor(dispVal, 16, dispColor);

          let saldoVal = "-";
          if (u.saldoUsd != null) {
            saldoVal = `$${u.saldoUsd.toFixed(2)} USD`;
          } else if (u.rateLimitRpm) {
            saldoVal = `${u.rateLimitRpm} RPM`;
          }
          const saldo = padColor(saldoVal, 14);

          const cotaColor = u.statusCota === "normal" ? "green" : (u.statusCota === "alerta_80" ? "yellow" : "red");
          const cota = padColor(u.statusCota.toUpperCase(), 12, cotaColor);

          console.log(`  ${mName} ${orig} ${prov} ${disp} ${saldo} ${cota}`);
        }

        console.log("");
        console.log(colorize("● Detalhes e Diagnósticos dos Adaptadores:", "bold"));
        for (const [id, u] of Object.entries(todos)) {
          const icone = u.statusCota === "normal"
            ? colorize("✓", "green")
            : u.statusCota === "alerta_80"
            ? colorize("!", "yellow")
            : colorize("×", "red");
          console.log(`  ${icone} ${colorize(id.padEnd(12), "bold")} : ${u.mensagem}`);
        }
        console.log("");
        console.log(colorize(`  Dica: execute "opencorp tokens <motor>" para inspecionar um motor individualmente.`, "gray"));
        console.log("");
      } catch (err: any) {
        console.error(`erro ao consultar quotas: ${err.message}`);
        process.exitCode = 1;
      }
    });
}

function padColor(rawText: string, width: number, color?: "green" | "red" | "yellow" | "cyan" | "magenta" | "gray" | "bold"): string {
  const padded = rawText.padEnd(width);
  return color ? colorize(padded, color) : padded;
}

function getSourceColor(source: string): "cyan" | "magenta" | "gray" | "yellow" | "red" {
  switch (source) {
    case "api_live":
      return "cyan";
    case "cli_live":
      return "magenta";
    case "oauth_session":
      return "cyan";
    case "unconfigured":
      return "gray";
    default:
      return "yellow";
  }
}

function formatSource(source: string): string {
  switch (source) {
    case "api_live":
      return colorize("API ao Vivo (chamada externa em tempo real)", "cyan");
    case "cli_live":
      return colorize("CLI Runtime Isolado (execução local)", "magenta");
    case "oauth_session":
      return colorize("Sessão OAuth Ativa (tokens no sistema)", "cyan");
    case "unconfigured":
      return colorize("Não Configurado / Sem Autenticação", "gray");
    default:
      return colorize(source, "yellow");
  }
}

function formatCotaBadge(cota: string): string {
  switch (cota) {
    case "normal":
      return colorize("NORMAL (Operacional)", "green");
    case "alerta_80":
      return colorize("ALERTA (80% atingido)", "yellow");
    case "esgotado":
      return colorize("ESGOTADO (Aciona fallback)", "red");
    default:
      return colorize("DESCONHECIDO", "gray");
  }
}

function formatDisponiveis(val: string, status: string): string {
  if (status === "esgotado" || val.trim() === "0") {
    return colorize(val, "red");
  }
  if (val.trim() === "ilimitado") {
    return colorize(val, "cyan");
  }
  return colorize(val, "green");
}
