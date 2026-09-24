import type { Command } from "commander";
import { SessionManager } from "../../core/session-manager.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { getSdkClient } from "../client.js";
import { ProblemDetailsError } from "../../sdk/index.js";
import { limparTagsPensamento } from "../ui/stream-renderer.js";

function reportar(erro: unknown): void {
  if (erro instanceof ProblemDetailsError) {
    console.error(erro.formatarParaCli());
    process.exitCode = 1;
    return;
  }
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
    .option("--historico [sessaoId]", "exibe o histórico de mensagens de uma sessão")
    .option("--stop", "para o serviço do secretário")
    .option("--agent <id>", "agente a ser executado (padrão: secretario-exec)")
    .option("--model <modelo>", "modelo de IA a ser utilizado")
    .option("--no-think", "desabilita blocos de raciocínio (<think>) na resposta")
    .option("--json", "saída em JSON estruturado")
    .action(
      (
        msgArgs: string[],
        opts: {
          status?: boolean;
          sessoes?: boolean;
          historico?: string | boolean;
          stop?: boolean;
          agent?: string;
          model?: string;
          think?: boolean;
          json?: boolean;
          workspace?: string;
        },
      ) =>
        comErros(async () => {
          const ws = await workspaceAlvo(opts);
          const client = getSdkClient();
          const agenteAlvo = opts.agent || "secretario-exec";
          const noThink = opts.think === false;

          const querParar = opts.stop || (msgArgs.length === 1 && msgArgs[0]?.toLowerCase() === "stop");
          if (querParar) {
            try {
              const res = await client.secretary.parar();
              if (opts.json) {
                console.log(JSON.stringify({ ok: true, resultado: res }, null, 2));
              } else {
                console.log("Secretário parado com sucesso.");
              }
            } catch (err) {
              if (opts.json) {
                console.log(JSON.stringify({ ok: false, erro: String(err) }, null, 2));
              } else {
                console.log(
                  `Secretário não pôde ser parado ou já estava parado: ${err instanceof Error ? err.message : String(err)}`,
                );
              }
            }
            return;
          }

          if (opts.status) {
            try {
              const status = await client.secretary.getStatus();
              if (opts.json) {
                console.log(JSON.stringify(status, null, 2));
                return;
              }
              console.log("\n=== Status do Secretário ===");
              console.log(`Rodando:     ${status.rodando ? "sim" : "não"}`);
              console.log(`Porta:       ${status.porta ?? "-"}`);
              console.log(`PID:         ${status.pid ?? "-"}`);
              console.log(`Iniciado em: ${status.iniciado_em ?? "-"}`);
            } catch {
              if (opts.json) {
                console.log(JSON.stringify({ rodando: false, disponivel: false }, null, 2));
                return;
              }
              console.log(`Secretário não está respondendo na API HTTP (${client.http.baseUrl}/secretario/status).`);
              console.log("Dica: inicie com 'opencorp serve' ou execute diretamente.");
            }
            return;
          }

          if (opts.sessoes) {
            try {
              const sessoesLista = await client.secretary.getSessoes();
              if (opts.json) {
                console.log(JSON.stringify(sessoesLista, null, 2));
                return;
              }
              console.log(`\n=== Conversas Recentes (${sessoesLista.length}) ===`);
              for (const s of sessoesLista.slice(0, 15)) {
                console.log(`${s.id}  ${(s.title || "(sem título)").slice(0, 45)}`);
              }
            } catch {
              if (opts.json) {
                console.log(JSON.stringify([], null, 2));
                return;
              }
              console.log("Nenhuma sessão retornada ou API HTTP indisponível.");
            }
            return;
          }

          if (opts.historico) {
            const sessaoId = typeof opts.historico === "string" ? opts.historico : msgArgs[0];
            if (!sessaoId) {
              console.error("erro: informe o ID da sessão para visualizar o histórico (--historico <sessaoId>)");
              process.exitCode = 1;
              return;
            }
            try {
              const hist = await client.secretary.getHistorico(sessaoId);
              if (opts.json) {
                console.log(JSON.stringify(hist, null, 2));
                return;
              }
              console.log(`\n=== Histórico da Sessão: ${sessaoId} ===\n`);
              const msgs = hist.messages ?? [];
              for (const m of msgs) {
                const papel = m.role === "user" ? "Usuário" : "Secretário";
                console.log(`[${papel}]:\n${m.content}\n`);
              }
            } catch (err) {
              if (opts.json) {
                console.log(JSON.stringify({ erro: "Sessão não encontrada" }, null, 2));
              } else {
                console.error(
                  `erro ao obter histórico da sessão ${sessaoId}: ${err instanceof Error ? err.message : String(err)}`,
                );
              }
              process.exitCode = 1;
            }
            return;
          }

          const mensagem = msgArgs.join(" ").trim();
          if (!mensagem) {
            console.log('Uso: oc secretario "sua pergunta ou instrução aqui"');
            console.log("     oc secretario --status");
            console.log("     oc secretario --sessoes");
            console.log("     oc secretario --historico <sessaoId>");
            return;
          }

          if (!opts.json) {
            console.log(`Enviando ao Secretário: "${mensagem}"...`);
          }

          // Tenta enviar via API HTTP do SDK
          try {
            const apiRes = await client.secretary.enviarMensagem({
              mensagem,
              agente: agenteAlvo,
              modelo: opts.model,
              workspace: ws.id,
              no_think: noThink,
            });

            if (apiRes && apiRes.resposta) {
              let resposta = apiRes.resposta;
              if (noThink) {
                resposta = limparTagsPensamento(resposta);
              }

              if (opts.json) {
                console.log(JSON.stringify({ ok: true, resposta, sessao_id: apiRes.sessao_id }, null, 2));
              } else {
                console.log(`\nSecretário (@${agenteAlvo}):\n`);
                console.log(resposta);
              }
              return;
            }
          } catch {
            // Continua para o fallback in-process se o servidor HTTP estiver offline
          }

          // Fallback: executa via SessionManager com o agente selecionado
          if (!opts.json) {
            console.log("   (API em segundo plano indisponível, processando execução direta)...");
          }
          const res = await sessoes.rodar({
            agente: agenteAlvo,
            ordem: mensagem,
            workspaceId: ws.id,
            gatilho: { tipo: "manual", origem: "cli:secretario" },
          });

          let captura = res.captura.trim();
          if (noThink) {
            captura = limparTagsPensamento(captura);
          }

          if (opts.json) {
            console.log(
              JSON.stringify(
                {
                  ok: res.status === "concluido",
                  sessao_id: res.id,
                  agente: agenteAlvo,
                  status: res.status,
                  resposta: captura || null,
                },
                null,
                2,
              ),
            );
          } else {
            console.log(`\nSecretário (@${agenteAlvo}) [sessão ${res.id}]:\n`);
            console.log(captura || `Concluído com status ${res.status}`);
          }
        }),
    );
}
