import type { Command } from "commander";
import { SessionManager } from "../../core/session-manager.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { RegistryStore } from "../../core/registry-store.js";

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

interface LinhaHistorico {
  id: string;
  agente: string;
  modelo: string;
  status: string;
  exit_code: number | null;
  duracao_ms: number | null;
  inicio: string;
  fim: string | null;
  erro?: string | null;
}

export function registerHistoricoCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const sessoes = new SessionManager();
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

  const historico = program
    .command("historico")
    .aliases(["runs", "history"])
    .description("histórico detalhado de execuções com diagnóstico de erros e retry");

  historico
    .command("list", { isDefault: true })
    .description("lista execuções recentes com filtro de falhas, agentes e formato JSON")
    .option("--falhas", "mostra apenas execuções que falharam")
    .option("--agent <id>", "filtra por agente")
    .option("--agente <id>", "filtra por agente (alias em português)")
    .option("--model <id>", "filtra por modelo")
    .option("--modelo <id>", "filtra por modelo (alias em português)")
    .option("--hoje", "mostra apenas execuções iniciadas hoje")
    .option("--limite <n>", "quantidade máxima de execuções (padrão: 25)", "25")
    .option("--json", "saída em formato JSON estruturado")
    .action(
      (opts: {
        falhas?: boolean;
        agent?: string;
        agente?: string;
        model?: string;
        modelo?: string;
        hoje?: boolean;
        limite?: string;
        json?: boolean;
        workspace?: string;
      }) =>
        comErros(async () => {
          const ws = await workspaceAlvo(opts);
          const db = registros.corpDb(ws.path);
          const limite = parseInt(opts.limite || "25", 10) || 25;
          const agenteAlvo = opts.agente || opts.agent;
          const modeloAlvo = opts.modelo || opts.model;

          let linhas: LinhaHistorico[] = [];
          try {
            linhas = db.listarExecucoes({
              agente: agenteAlvo,
              status: opts.falhas ? "falhou" : undefined,
              limite: Math.max(limite * 2, 100),
            }) as LinhaHistorico[];
          } catch {
            const legadas = await sessoes.listarExecucoes(ws.path, { agente: agenteAlvo });
            linhas = legadas.map((l) => ({
              id: l.id,
              agente: l.agente,
              modelo: "-",
              status: l.status,
              exit_code: l.exit_code,
              duracao_ms: l.duracao_ms,
              inicio: l.inicio,
              fim: null,
            }));
          }

          if (modeloAlvo) {
            linhas = linhas.filter((l) => (l.modelo || "").includes(modeloAlvo));
          }

          if (opts.hoje) {
            const dataHoje = new Date().toISOString().slice(0, 10);
            linhas = linhas.filter((l) => (l.inicio || "").startsWith(dataHoje));
          }

          if (opts.falhas) {
            linhas = linhas.filter((l) => l.status === "falhou");
          }

          linhas = linhas.slice(0, limite);

          if (opts.json) {
            console.log(JSON.stringify(linhas, null, 2));
            return;
          }

          if (linhas.length === 0) {
            console.log(`nenhuma execução encontrada (workspace: "${ws.id}")`);
            return;
          }

          console.log(
            "id                               agente           modelo                         status       exit   dur     início",
          );
          for (const r of linhas) {
            const mod = (r.modelo || "-").split("/").slice(-1)[0] || "-";
            console.log(
              `${r.id}  ${r.agente.padEnd(16)} ${mod.padEnd(30).slice(0, 30)} ${(r.status || "-").padEnd(12)} ${String(r.exit_code ?? "-").padEnd(6)} ${formatarDuracao(r.duracao_ms).padEnd(7)} ${r.inicio.slice(0, 19).replace("T", " ")}`,
            );
            if (r.status === "falhou" && r.erro) {
              console.log(`   ↳ erro: ${r.erro.slice(0, 120)}`);
            }
          }
        }),
    );

  historico
    .command("erro <id>")
    .description("mostra o diagnóstico de erro de uma execução que falhou")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts);
        const db = registros.corpDb(ws.path);
        const linhas = db.listarExecucoes({ limite: 500 });
        const alvo = linhas.find((l) => l.id === id);
        if (!alvo) {
          console.error(`erro: execução "${id}" não encontrada em corp.db`);
          process.exitCode = 1;
          return;
        }
        console.log(`\n=== Diagnóstico de Falha: ${id} ===`);
        console.log(`Agente:   @${alvo.agente}`);
        console.log(`Modelo:   ${alvo.modelo}`);
        console.log(`Status:   ${alvo.status} (exit code: ${alvo.exit_code ?? "-"})`);
        console.log(`Início:   ${alvo.inicio}`);
        console.log(`Duração:  ${formatarDuracao(alvo.duracao_ms)}`);
        console.log(`\nMotivo do Erro:\n${alvo.erro || "nenhum erro específico registrado no ledger."}\n`);
      }),
    );

  historico
    .command("log <id>")
    .description("mostra a captura de terminal da sessão")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts);
        process.stdout.write(await sessoes.logDe(ws.path, id));
      }),
    );

  historico
    .command("retry <id>")
    .description("redispara uma execução existente com o mesmo agente e ordem")
    .option("--model <modelo>", "sobrescreve o modelo para a nova execução")
    .option("--modelo <modelo>", "sobrescreve o modelo para a nova execução (alias)")
    .action((id: string, opts: { model?: string; modelo?: string; workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts);
        const meta = await registros.lerMeta(ws.path, "execucoes", id);
        const extras = (meta.extras ?? {}) as Record<string, unknown>;
        const agente = meta.criado_por;
        const ordem = (extras.ordem as string) || (extras.descricao as string) || meta.descricao || "";
        const modeloEscolhido = opts.modelo || opts.model || (extras.modelo as string);

        if (!agente) {
          console.error(`erro: não foi possível identificar o agente da execução "${id}"`);
          process.exitCode = 1;
          return;
        }

        console.log(`⚡ Redisparando execução "${id}":`);
        console.log(`   Agente: @${agente}`);
        console.log(`   Modelo: ${modeloEscolhido || "(padrão do agente)"}`);
        console.log(`   Ordem:  ${ordem.slice(0, 100)}...`);

        const res = await sessoes.rodar({
          agente,
          ordem,
          model: modeloEscolhido,
          workspaceId: ws.id,
          tags: ["retry_manual", `de_${id}`],
          gatilho: { tipo: "manual", origem: `retry:${id}` },
        });

        console.log(`\nResultado: ${res.status.toUpperCase()} (nova sessão: ${res.id})`);
        if (res.status === "falhou" && (res as any).erro) {
          console.log(`Motivo: ${(res as any).erro}`);
        }
      }),
    );
}
