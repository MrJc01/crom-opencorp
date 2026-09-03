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

async function chamarApiSecretario(
  endpoint: string,
  method = "GET",
  body?: unknown,
): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await fetch(`http://127.0.0.1:4100${endpoint}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, data };
    }
  } catch {}
  return { ok: false, data: null };
}

export function registerSecretarioCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const sessoes = new SessionManager();

  async function workspaceAlvo(opts: { workspace?: string }) {
    try {
      return await manager.resolver(wsDe(program, opts));
    } catch {
      const atual = await manager.atual();
      if (atual) return atual;
      return { id: "default", path: process.cwd(), existe: true };
    }
  }

  program
    .command("secretario [mensagem...]")
    .description("interage com o Secretário Executivo direto da CLI")
    .option("--status", "mostra status do serviço do secretário")
    .option("--sessoes", "lista conversas recentes com o secretário")
    .action((msgArgs: string[], opts: { status?: boolean; sessoes?: boolean; workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts);

        if (opts.status) {
          const res = await chamarApiSecretario("/secretario/status");
          if (res.ok) {
            console.log("\n=== Status do Secretário ===");
            console.log(`Rodando:     ${res.data.rodando ? "sim" : "não"}`);
            console.log(`Porta:       ${res.data.porta ?? "-"}`);
            console.log(`PID:         ${res.data.pid ?? "-"}`);
            console.log(`Iniciado em: ${res.data.iniciado_em ?? "-"}`);
          } else {
            console.log("Secretário não está respondendo na API HTTP (127.0.0.1:4100/secretario/status).");
            console.log("Dica: inicie com 'opencorp serve' ou execute diretamente.");
          }
          return;
        }

        if (opts.sessoes) {
          const res = await chamarApiSecretario("/secretario/sessoes");
          if (res.ok && Array.isArray(res.data)) {
            console.log(`\n=== Conversas Recentes (${res.data.length}) ===`);
            for (const s of res.data.slice(0, 15)) {
              console.log(`${s.id}  ${(s.title || "(sem título)").slice(0, 45)}`);
            }
          } else {
            console.log("Nenhuma sessão retornada ou API HTTP indisponível.");
          }
          return;
        }

        const mensagem = msgArgs.join(" ").trim();
        if (!mensagem) {
          console.log('Uso: oc secretario "sua pergunta ou instrução aqui"');
          console.log('     oc secretario --status');
          console.log('     oc secretario --sessoes');
          return;
        }

        console.log(`💬 Enviando ao Secretário: "${mensagem}"...`);

        // Tenta enviar via API HTTP rápida
        const apiRes = await chamarApiSecretario("/secretario/conversa", "POST", {
          mensagem,
          workspace: ws.id,
        });

        if (apiRes.ok && apiRes.data?.resposta) {
          console.log(`\n🤖 Secretário (@secretario-exec):\n`);
          console.log(apiRes.data.resposta);
          return;
        }

        // Fallback: executa via SessionManager com agente secretario-exec
        console.log("   (API em segundo plano indisponível, processando execução direta)...");
        const res = await sessoes.rodar({
          agente: "secretario-exec",
          ordem: mensagem,
          workspaceId: ws.id,
          gatilho: { tipo: "manual", origem: "cli:secretario" },
        });

        console.log(`\n🤖 Secretário (@secretario-exec) [sessão ${res.id}]:\n`);
        console.log(res.captura.trim() || `Concluído com status ${res.status}`);
      }),
    );
}
