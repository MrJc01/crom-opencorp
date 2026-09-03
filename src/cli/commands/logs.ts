import type { Command } from "commander";
import { openSync, readSync, statSync } from "node:fs";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { eventLogger, type LogEntry } from "../../core/event-logger.js";

function corNivel(nivel: string): string {
  switch (nivel) {
    case "erro":
      return "\x1b[31m[ERRO]\x1b[0m ";
    case "aviso":
      return "\x1b[33m[AVISO]\x1b[0m";
    case "info":
    default:
      return "\x1b[36m[INFO]\x1b[0m ";
  }
}

function formatarLinha(entry: LogEntry): string {
  const hora = entry.ts ? entry.ts.slice(11, 19) : "--:--:--";
  const ws = entry.workspace ? `\x1b[90m(${entry.workspace})\x1b[0m` : "";
  const tipo = `\x1b[35m${entry.tipo.padEnd(16)}\x1b[0m`;
  return `${hora} ${corNivel(entry.nivel)} ${ws} ${tipo} ${entry.resumo}`;
}

export function registerLogsCommand(program: Command): void {
  const manager = new WorkspaceManager();

  program
    .command("logs")
    .description("visualiza os logs contínuos e estruturados de eventos (events.jsonl)")
    .option("-f, --tail", "segue os logs em tempo real (streaming contínuo)")
    .option("--nivel <nivel>", "filtra por nível: info | aviso | erro")
    .option("--tipo <tipo>", "filtra por tipo de evento (ex: sessao-fim, task, hook)")
    .option("-n, --limite <n>", "quantidade de eventos para exibir", "50")
    .option("--json", "saída em JSON Lines puro para pipes e automação")
    .option("-w, --workspace <id>", "workspace alvo")
    .action(async (opts: {
      tail?: boolean;
      nivel?: string;
      tipo?: string;
      limite: string;
      json?: boolean;
      workspace?: string;
    }) => {
      let wsPath: string | null = null;
      try {
        const ws = await manager.resolver(opts.workspace);
        wsPath = ws.path;
      } catch {
        const ativo = await manager.atual();
        if (ativo) wsPath = ativo.path;
      }

      const limiteNum = Math.max(1, parseInt(opts.limite, 10) || 50);
      const entradas = eventLogger.lerLogs(wsPath, {
        limite: limiteNum,
        nivel: opts.nivel,
        tipo: opts.tipo,
      });

      if (entradas.length === 0 && !opts.tail) {
        console.log("nenhum evento registrado nos logs até o momento.");
        return;
      }

      for (const entry of entradas) {
        if (opts.json) {
          console.log(JSON.stringify(entry));
        } else {
          console.log(formatarLinha(entry));
        }
      }

      if (!opts.tail) return;

      // Modo streaming (--tail)
      const caminho = eventLogger.obterCaminhoLog(wsPath);
      let posicao = 0;
      try {
        posicao = statSync(caminho).size;
      } catch {}

      console.log(`\x1b[90m── acompanhando novos eventos em tempo real (${caminho}) [Ctrl+C para sair] ──\x1b[0m`);

      const checarNovosBytes = () => {
        try {
          const st = statSync(caminho);
          if (st.size > posicao) {
            const fd = openSync(caminho, "r");
            const tamanho = st.size - posicao;
            const buffer = Buffer.alloc(tamanho);
            readSync(fd, buffer, 0, tamanho, posicao);
            posicao = st.size;

            const linhas = buffer.toString("utf8").split("\n").filter(Boolean);
            for (const l of linhas) {
              try {
                const entry = JSON.parse(l) as LogEntry;
                if (opts.nivel && entry.nivel !== opts.nivel.toLowerCase()) continue;
                if (opts.tipo && !entry.tipo.toLowerCase().includes(opts.tipo.toLowerCase())) continue;

                if (opts.json) {
                  console.log(JSON.stringify(entry));
                } else {
                  console.log(formatarLinha(entry));
                }
              } catch {}
            }
          }
        } catch {}
      };

      // Polling de 500ms seguro com fallback
      const intervalo = setInterval(checarNovosBytes, 500);

      process.on("SIGINT", () => {
        clearInterval(intervalo);
        process.exit(0);
      });
    });
}
