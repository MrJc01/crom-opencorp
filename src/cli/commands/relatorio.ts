import type { Command } from "commander";
import Database from "better-sqlite3";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WorkspaceManager } from "../../core/workspace-manager.js";

interface ExecucaoRegistro {
  id: string;
  agente: string;
  modelo?: string;
  status: string;
  exit_code?: number | null;
  duracao_ms?: number | null;
  inicio: string;
  fim?: string | null;
  erro?: string | null;
}

interface RelatorioResultado {
  periodo: string;
  workspace: string;
  total_execucoes: number;
  concluidas: number;
  falhas: number;
  outros: number;
  taxa_sucesso_pct: number;
  duracao_media_s: number;
  agentes: Array<{ agente: string; total: number; concluidas: number; falhas: number }>;
  modelos: Array<{ modelo: string; total: number }>;
  top_erros: Array<{ erro: string; ocorrencias: number }>;
  kanban?: {
    total: number;
    colunas: Record<string, number>;
  };
}

function carregarExecucoes(wsPath: string, hoje: boolean): ExecucaoRegistro[] {
  const registros: ExecucaoRegistro[] = [];
  const dbPath = join(wsPath, ".opencorp", "corp.db");
  const dataHoje = new Date().toISOString().slice(0, 10);

  if (existsSync(dbPath)) {
    try {
      const db = new Database(dbPath, { readonly: true });
      let query = "SELECT id, agente, modelo, status, exit_code, duracao_ms, inicio, fim, erro FROM execucoes";
      const params: any[] = [];
      if (hoje) {
        query += " WHERE inicio LIKE ?";
        params.push(`${dataHoje}%`);
      }
      query += " ORDER BY inicio DESC";
      const rows = db.prepare(query).all(...params) as ExecucaoRegistro[];
      db.close();
      return rows;
    } catch {}
  }

  // Fallback para registries/execucoes
  const execDir = join(wsPath, ".opencorp", "registries", "execucoes");
  if (existsSync(execDir)) {
    try {
      const arquivos = readdirSync(execDir).filter((f) => f.endsWith(".json"));
      for (const arq of arquivos) {
        try {
          const dados = JSON.parse(readFileSync(join(execDir, arq), "utf8"));
          if (hoje && (!dados.inicio || !dados.inicio.startsWith(dataHoje))) {
            continue;
          }
          registros.push(dados);
        } catch {}
      }
    } catch {}
  }

  return registros;
}

function carregarKanbanResumo(wsPath: string): { total: number; colunas: Record<string, number> } {
  const colunas: Record<string, number> = {
    backlog: 0,
    a_fazer: 0,
    fazendo: 0,
    revisao: 0,
    concluido: 0,
    bloqueado: 0,
  };
  let total = 0;

  const dbPath = join(wsPath, ".opencorp", "corp.db");
  if (existsSync(dbPath)) {
    try {
      const db = new Database(dbPath, { readonly: true });
      const rows = db.prepare("SELECT coluna, count(*) as qtd FROM tasks GROUP BY coluna").all() as Array<{ coluna: string; qtd: number }>;
      db.close();
      for (const r of rows) {
        colunas[r.coluna] = r.qtd;
        total += r.qtd;
      }
      return { total, colunas };
    } catch {}
  }

  return { total, colunas };
}

export function gerarRelatorio(wsPath: string, wsId: string, hoje: boolean): RelatorioResultado {
  const execucoes = carregarExecucoes(wsPath, hoje);
  const total = execucoes.length;
  let concluidas = 0;
  let falhas = 0;
  let outros = 0;
  let somaDuracaoMs = 0;
  let qtdComDuracao = 0;

  const contagemAgentes: Record<string, { total: number; concluidas: number; falhas: number }> = {};
  const contagemModelos: Record<string, number> = {};
  const contagemErros: Record<string, number> = {};

  for (const ex of execucoes) {
    if (ex.status === "concluido") {
      concluidas++;
    } else if (ex.status === "falhou") {
      falhas++;
    } else {
      outros++;
    }

    if (ex.duracao_ms && ex.duracao_ms > 0) {
      somaDuracaoMs += ex.duracao_ms;
      qtdComDuracao++;
    }

    // Agentes
    const ag = ex.agente || "desconhecido";
    if (!contagemAgentes[ag]) contagemAgentes[ag] = { total: 0, concluidas: 0, falhas: 0 };
    contagemAgentes[ag].total++;
    if (ex.status === "concluido") contagemAgentes[ag].concluidas++;
    if (ex.status === "falhou") contagemAgentes[ag].falhas++;

    // Modelos
    const mod = ex.modelo || "padrão";
    contagemModelos[mod] = (contagemModelos[mod] || 0) + 1;

    // Erros
    if (ex.status === "falhou" && ex.erro) {
      const resumoErro = ex.erro.split("\n")[0]?.slice(0, 100).trim() || "erro desconhecido";
      contagemErros[resumoErro] = (contagemErros[resumoErro] || 0) + 1;
    }
  }

  const taxaSucesso = total > 0 ? (concluidas / total) * 100 : 0;
  const duracaoMedia = qtdComDuracao > 0 ? somaDuracaoMs / qtdComDuracao / 1000 : 0;

  const listaAgentes = Object.entries(contagemAgentes)
    .map(([agente, v]) => ({ agente, ...v }))
    .sort((a, b) => b.total - a.total);

  const listaModelos = Object.entries(contagemModelos)
    .map(([modelo, total]) => ({ modelo, total }))
    .sort((a, b) => b.total - a.total);

  const listaErros = Object.entries(contagemErros)
    .map(([erro, ocorrencias]) => ({ erro, ocorrencias }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias)
    .slice(0, 5);

  const kanban = carregarKanbanResumo(wsPath);

  return {
    periodo: hoje ? `Hoje (${new Date().toISOString().slice(0, 10)})` : "Todo o Histórico",
    workspace: wsId,
    total_execucoes: total,
    concluidas,
    falhas,
    outros,
    taxa_sucesso_pct: Number(taxaSucesso.toFixed(1)),
    duracao_media_s: Number(duracaoMedia.toFixed(1)),
    agentes: listaAgentes,
    modelos: listaModelos,
    top_erros: listaErros,
    kanban,
  };
}

export function registerRelatorioCommand(program: Command): void {
  const manager = new WorkspaceManager();

  program
    .command("relatorio")
    .alias("report")
    .description("relatório analítico e consolidado de execuções do workspace")
    .option("--hoje", "analisa somente as execuções de hoje")
    .option("--json", "saída em formato JSON estruturado")
    .option("-w, --workspace <id>", "workspace alvo (padrão: ativo)")
    .action(async (opts: { hoje?: boolean; json?: boolean; workspace?: string }) => {
      let wsPath = process.cwd();
      let wsId = "padrao";
      try {
        const ws = await manager.resolver(opts.workspace);
        wsPath = ws.path;
        wsId = ws.id;
      } catch {
        const ativo = await manager.atual();
        if (ativo) {
          wsPath = ativo.path;
          wsId = ativo.id;
        }
      }

      const relatorio = gerarRelatorio(wsPath, wsId, Boolean(opts.hoje));

      if (opts.json) {
        console.log(JSON.stringify(relatorio, null, 2));
        return;
      }

      console.log(`\n📊 ══════ Relatório OpenCorp — ${wsId} ══════`);
      console.log(`Período:           ${relatorio.periodo}`);
      console.log(`Total Execuções:   ${relatorio.total_execucoes}`);
      console.log(`✅ Concluídas:     ${relatorio.concluidas}`);
      console.log(`❌ Falhas:         ${relatorio.falhas}`);
      console.log(`Taxa de Sucesso:   ${relatorio.taxa_sucesso_pct}%`);
      console.log(`Duração Média:     ${relatorio.duracao_media_s}s`);

      if (relatorio.agentes.length > 0) {
        console.log("\n── Top Agentes Mais Ativos ──");
        for (const a of relatorio.agentes.slice(0, 8)) {
          const taxa = a.total > 0 ? ((a.concluidas / a.total) * 100).toFixed(0) : "0";
          console.log(`  • @${a.agente.padEnd(20)} ${String(a.total).padStart(3)} execuções (${a.concluidas} ok, ${a.falhas} erro, ${taxa}% sucesso)`);
        }
      }

      if (relatorio.modelos.length > 0) {
        console.log("\n── Modelos Utilizados ──");
        for (const m of relatorio.modelos) {
          console.log(`  • ${m.modelo.padEnd(45)} ${m.total} execuções`);
        }
      }

      if (relatorio.top_erros.length > 0) {
        console.log("\n── Principais Motivos de Falha ──");
        for (const e of relatorio.top_erros) {
          console.log(`  • [${e.ocorrencias}x] ${e.erro}`);
        }
      }

      if (relatorio.kanban && relatorio.kanban.total > 0) {
        console.log("\n── Status do Kanban ──");
        console.log(`  Total: ${relatorio.kanban.total} tarefas`);
        const c = relatorio.kanban.colunas;
        console.log(`  A Fazer: ${c.a_fazer || 0} | Fazendo: ${c.fazendo || 0} | Revisão: ${c.revisao || 0} | Concluído: ${c.concluido || 0} | Bloqueado: ${c.bloqueado || 0}`);
      }
      console.log("");
    });
}
