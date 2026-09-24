import type { Command } from "commander";
import { SessionManager } from "../../core/contexts/execution/session-manager.js";
import { WorkspaceManager } from "../../core/contexts/workspace/workspace-manager.js";
import { RegistryStore } from "../../core/contexts/storage/registry-store.js";
import type { LinhaAcaoAgente } from "../../core/contexts/storage/corp-db.js";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

function formatarStatusAcao(status: string): string {
  if (status === "sucesso") return `${c.green}✓ sucesso${c.reset}`;
  if (status === "falhou") return `${c.red}✗ falhou${c.reset}`;
  if (status === "timeout") return `${c.yellow}⏱ timeout${c.reset}`;
  return `${c.gray}? ${status}${c.reset}`;
}

function renderizarTimelineAcoes(acoes: LinhaAcaoAgente[]): void {
  if (acoes.length === 0) {
    console.log(`  ${c.dim}(nenhuma ação registrada para esta sessão)${c.reset}`);
    return;
  }
  console.log(`\n${c.bold}── Linha do Tempo de Telemetria (${acoes.length} ações) ──${c.reset}`);
  acoes.forEach((a, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    const hora = (a.criado_em || "").slice(11, 19);
    const tipo = a.tipo_acao === "tool" ? `⚙ ${a.ferramenta || "tool"}` : a.tipo_acao === "pensamento" ? `💭 pensamento` : `💬 resposta`;
    const resumo = a.comando_resumo ? ` "${a.comando_resumo.slice(0, 50).replace(/\n/g, " ")}"` : "";
    const status = formatarStatusAcao(a.status);
    const dur = a.duracao_ms ? ` (${a.duracao_ms}ms)` : "";
    console.log(` ${c.dim}[${num}]${c.reset} ${c.gray}${hora}${c.reset}  ${c.cyan}${tipo.padEnd(22)}${c.reset} ${status}${c.dim}${dur}${c.reset}${resumo}`);
    if (a.erro) {
      console.log(`       ${c.red}↳ erro: ${a.erro.slice(0, 120)}${c.reset}`);
    }
  });
}

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

        console.log(`Redisparando execução "${id}":`);
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

  historico
    .command("show <id>")
    .description("mostra detalhes de uma execução com sua linha do tempo de telemetria")
    .option("--acoes", "exibe a linha do tempo completa de ações do agente")
    .option("--json", "saída em JSON estruturado")
    .action((id: string, opts: { acoes?: boolean; json?: boolean; workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts);
        const db = registros.corpDb(ws.path);
        const linhas = db.listarExecucoes({ limite: 500 });
        const alvo = linhas.find((l) => l.id === id);
        const acoes = db.listarAcoesSessao(id);

        if (!alvo && acoes.length === 0) {
          console.error(`erro: execução ou sessão "${id}" não encontrada`);
          process.exitCode = 1;
          return;
        }

        if (opts.json) {
          console.log(JSON.stringify({ execucao: alvo ?? null, acoes }, null, 2));
          return;
        }

        console.log(`\n${c.bold}=== Detalhes da Execução: ${id} ===${c.reset}`);
        if (alvo) {
          console.log(`Agente:   @${alvo.agente}`);
          console.log(`Modelo:   ${alvo.modelo}`);
          console.log(`Status:   ${alvo.status === "sucesso" ? `${c.green}SUCESSO${c.reset}` : `${c.red}${alvo.status.toUpperCase()}${c.reset}`}`);
          console.log(`Início:   ${alvo.inicio}`);
          console.log(`Duração:  ${formatarDuracao(alvo.duracao_ms)}`);
          if (alvo.erro) {
            console.log(`Erro:     ${c.red}${alvo.erro}${c.reset}`);
          }
        }
        renderizarTimelineAcoes(acoes);
        console.log("");
      }),
    );

  historico
    .command("acoes [id]")
    .aliases(["actions", "spans"])
    .description("inspeciona ações e passos detalhados executados por agentes")
    .option("--trace", "interpreta o ID como trace_id em vez de sessao_id")
    .option("--agente <id>", "filtra por agente")
    .option("--ferramenta <nome>", "filtra por ferramenta")
    .option("--falhas", "mostra apenas ações que falharam")
    .option("--limite <n>", "quantidade máxima de registros (padrão: 50)", "50")
    .option("--json", "saída em JSON estruturado")
    .action((id: string | undefined, opts: { trace?: boolean; agente?: string; ferramenta?: string; falhas?: boolean; limite?: string; json?: boolean; workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts);
        const db = registros.corpDb(ws.path);
        const limite = parseInt(opts.limite || "50", 10) || 50;

        let acoes: LinhaAcaoAgente[] = [];
        if (id && opts.trace) {
          acoes = db.listarAcoesPorTrace(id);
        } else if (id) {
          acoes = db.listarAcoesSessao(id, limite);
        } else {
          acoes = db.listarAcoes({
            agente: opts.agente,
            ferramenta: opts.ferramenta,
            status: opts.falhas ? "falhou" : undefined,
            limite,
          });
        }

        if (opts.json) {
          console.log(JSON.stringify(acoes, null, 2));
          return;
        }

        if (acoes.length === 0) {
          console.log(`nenhuma ação encontrada com os filtros especificados`);
          return;
        }

        renderizarTimelineAcoes(acoes);
        console.log("");
      }),
    );

  historico
    .command("telemetria")
    .description("resumo agregado de telemetria: taxa de falhas, ferramentas e latências")
    .option("--hoje", "analisa apenas dados de hoje")
    .option("--agente <id>", "filtra por agente")
    .option("--ferramenta <nome>", "filtra por ferramenta")
    .option("--json", "saída em JSON estruturado")
    .action((opts: { hoje?: boolean; agente?: string; ferramenta?: string; json?: boolean; workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvo(opts);
        const db = registros.corpDb(ws.path);
        const desde = opts.hoje ? `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z` : undefined;

        const resumo = db.resumoTelemetria({
          agente: opts.agente,
          ferramenta: opts.ferramenta,
          desde,
        });

        if (opts.json) {
          console.log(JSON.stringify(resumo, null, 2));
          return;
        }

        console.log(`\n${c.bold}=== Resumo de Telemetria de Agentes (${opts.hoje ? "Hoje" : "Geral"}) ===${c.reset}`);
        const taxaSucesso = resumo.total_acoes > 0
          ? (((resumo.total_acoes - resumo.total_falhas) / resumo.total_acoes) * 100).toFixed(1)
          : "100.0";
        console.log(`Total de Ações:  ${c.bold}${resumo.total_acoes}${c.reset}`);
        console.log(`Falhas:          ${resumo.total_falhas > 0 ? `${c.red}${resumo.total_falhas}${c.reset}` : `${c.green}0${c.reset}`}`);
        console.log(`Taxa de Sucesso: ${Number(taxaSucesso) >= 90 ? c.green : c.yellow}${taxaSucesso}%${c.reset}`);

        if (resumo.ferramentas.length > 0) {
          console.log(`\n${c.bold}Uso por Ferramenta:${c.reset}`);
          console.log("ferramenta           total    falhas   taxa     tempo médio   custo");
          for (const f of resumo.ferramentas) {
            const taxa = f.total > 0 ? `${(((f.total - f.falhas) / f.total) * 100).toFixed(0)}%` : "100%";
            console.log(
              `${f.ferramenta.padEnd(20)} ${String(f.total).padEnd(8)} ${String(f.falhas).padEnd(8)} ${taxa.padEnd(8)} ${(f.media_ms + "ms").padEnd(13)} $${f.custo_usd.toFixed(4)}`,
            );
          }
        }

        if (resumo.agentes.length > 0) {
          console.log(`\n${c.bold}Atividade por Agente:${c.reset}`);
          console.log("agente               total    falhas   taxa     tempo médio   custo");
          for (const a of resumo.agentes) {
            const taxa = a.total > 0 ? `${(((a.total - a.falhas) / a.total) * 100).toFixed(0)}%` : "100%";
            console.log(
              `@${a.agente.padEnd(19)} ${String(a.total).padEnd(8)} ${String(a.falhas).padEnd(8)} ${taxa.padEnd(8)} ${(a.media_ms + "ms").padEnd(13)} $${a.custo_usd.toFixed(4)}`,
            );
          }
        }
        console.log("");
      }),
    );
}
