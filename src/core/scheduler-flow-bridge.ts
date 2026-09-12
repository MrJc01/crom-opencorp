import Database from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { opencorpHome } from "../utils/paths.js";
import { mkdirRecursive, writeFileAtomic } from "../utils/fs-safe.js";
import { validarCron, proximoCron, extrairFlowRunDeArgs } from "./scheduler.js";
import type { Flow } from "./flow-store.js";

export interface SincronizacaoResultado {
  totalJobs: number;
  criados: number;
  atualizados: number;
  workspacesAfetados: string[];
}

/** Abre o scheduler.db garantindo diretório e tabelas (mesmo DDL do Scheduler). */
async function garantirBanco(homeDir: string): Promise<Database.Database> {
  const caminho = resolve(homeDir, ".opencorp", "scheduler.db");
  await mkdirRecursive(join(homeDir, ".opencorp"));
  const db = new Database(caminho);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      agenda_tipo TEXT NOT NULL,
      agenda_valor TEXT NOT NULL,
      args TEXT NOT NULL,
      workspace TEXT NOT NULL DEFAULT '',
      ativo INTEGER NOT NULL DEFAULT 1,
      graca_min INTEGER NOT NULL DEFAULT 5,
      ultima_exec TEXT,
      proxima_exec TEXT,
      criado_em TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      job_nome TEXT NOT NULL DEFAULT '',
      workspace TEXT NOT NULL DEFAULT '',
      iniciado_em TEXT NOT NULL,
      fim_em TEXT,
      resultado TEXT NOT NULL DEFAULT '',
      erro TEXT,
      pulado INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_job_runs_job ON job_runs (job_id, iniciado_em);
  `);
  return db;
}

function normalizarId(nome: string): string {  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Converte jobs do scheduler.db para Flows em cada workspace correspondente,
 * garantindo que toda automação/rotina periódica apareça como Fluxo visual no Studio.
 */
export async function sincronizarJobsParaFluxos(homeDir: string = opencorpHome()): Promise<SincronizacaoResultado> {
  const dbPath = resolve(homeDir, ".opencorp", "scheduler.db");
  if (!existsSync(dbPath)) {
    return { totalJobs: 0, criados: 0, atualizados: 0, workspacesAfetados: [] };
  }

  let db: Database.Database;
  try {
    db = new Database(dbPath);
  } catch {
    return { totalJobs: 0, criados: 0, atualizados: 0, workspacesAfetados: [] };
  }

  let jobs: any[] = [];
  try {
    jobs = db.prepare("SELECT * FROM jobs WHERE ativo = 1").all();
  } catch {
    db.close();
    return { totalJobs: 0, criados: 0, atualizados: 0, workspacesAfetados: [] };
  }
  db.close();

  let criados = 0;
  let atualizados = 0;
  const workspacesSet = new Set<string>();

  for (const job of jobs) {
    if (!job.workspace) continue;
    const wsDir = resolve(homeDir, ".opencorp", "workspaces", job.workspace);
    if (!existsSync(wsDir)) continue;

    workspacesSet.add(job.workspace);
    const flowsDir = join(wsDir, ".opencorp", "flows");
    await mkdirRecursive(flowsDir);

    const flowId = normalizarId(job.nome || job.id);
    const flowPath = join(flowsDir, `${flowId}.json`);

    // Parse args
    let args: string[] = [];
    try {
      args = JSON.parse(job.args);
    } catch {
      args = [String(job.args)];
    }

    // Jobs de flow ("flow run <id>") já são a fonte agendada — não geram espelho
    if (extrairFlowRunDeArgs(args)) continue;

    // Cron expression
    const cronExpr = job.agenda_tipo === "cron" ? job.agenda_valor : "* * * * *";

    // Detectar tipo de execução
    let noExec: any;
    if (args[0] === "agent" && args[1] === "run") {
      const agente = args[2] || "executor-padrao";
      const ordem = args.slice(3).join(" ") || "Executar ciclo periódico do agente";
      noExec = {
        id: "executar-agente",
        tipo: "agente",
        config: {
          agente,
          ordem,
        },
        pos: { x: 300, y: 120 },
      };
    } else if (args[0] === "meeting" && args[1] === "iniciar") {
      let pauta = "Reunião Periódica Agendada";
      const pautaIdx = args.indexOf("--pauta");
      if (pautaIdx !== -1 && args[pautaIdx + 1]) {
        pauta = args[pautaIdx + 1];
      }
      noExec = {
        id: "executar-reuniao",
        tipo: "reuniao",
        config: {
          pauta,
          agentes: ["ceo-documentos", "editor", "executor-padrao"],
        },
        pos: { x: 300, y: 120 },
      };
    } else {
      const comando = args.join(" ");
      noExec = {
        id: "executar-script",
        tipo: "script",
        config: {
          comando,
          timeout_ms: 120000,
        },
        pos: { x: 300, y: 120 },
      };
    }

    const flowObj: Flow = {
      id: flowId,
      nome: job.nome || flowId,
      auto_agendar: false,
      nos: [
        {
          id: "gatilho-cron",
          tipo: "cron",
          config: {
            expressao_cron: cronExpr,
            job_id: job.id,
            job_nome: job.nome,
          },
          pos: { x: 60, y: 120 },
        },
        noExec,
        {
          id: "saida",
          tipo: "saida",
          config: {
            registro: "resultados/resultado",
          },
          pos: { x: 540, y: 120 },
        },
      ],
      arestas: [
        { de: "gatilho-cron", para: noExec.id },
        { de: noExec.id, para: "saida" },
      ],
    };

    if (existsSync(flowPath)) {
      try {
        const existente = JSON.parse(readFileSync(flowPath, "utf-8"));
        const temCron = existente.nos?.some((n: any) => n.tipo === "cron");
        const saidaValida = existente.nos?.some((n: any) => n.tipo === "saida" && typeof n.config?.registro === "string" && n.config.registro.includes("/"));
        if (!temCron || !saidaValida) {
          await writeFileAtomic(flowPath, JSON.stringify(flowObj, null, 2));
          atualizados++;
        }
      } catch {
        await writeFileAtomic(flowPath, JSON.stringify(flowObj, null, 2));
        atualizados++;
      }
    } else {
      await writeFileAtomic(flowPath, JSON.stringify(flowObj, null, 2));
      criados++;
    }
  }

  return {
    totalJobs: jobs.length,
    criados,
    atualizados,
    workspacesAfetados: Array.from(workspacesSet),
  };
}

/**
 * Fonte única (Etapa 12.2): fluxo com nó `cron` + `auto_agendar:true` ⟺ 1 job
 * `flow:<id>` (args ["flow","run","<id>"], agenda do nó cron). Flag off ou sem
 * nó cron → remove o job. Idempotente.
 */
export async function sincronizarFluxoParaScheduler(
  wsPath: string,
  flow: Flow,
  homeDir: string = opencorpHome()
): Promise<void> {
  const cronNo = flow.nos.find((n) => n.tipo === "cron");
  const expressao = (cronNo?.config as { expressao_cron?: unknown } | undefined)?.expressao_cron;
  const expressaoCron = typeof expressao === "string" ? expressao.trim() : "";
  const nomeJob = `flow:${flow.id}`;
  const wsNome = basename(wsPath);
  const deveAgendar = flow.auto_agendar === true && expressaoCron.length > 0;
  if (deveAgendar) validarCron(expressaoCron);

  const db = await garantirBanco(homeDir);
  try {
    const existentes = db.prepare("SELECT id FROM jobs WHERE nome = ? AND workspace = ? ORDER BY id").all(nomeJob, wsNome) as { id: string }[];
    if (!deveAgendar) {
      if (existentes.length > 0) {
        db.prepare("DELETE FROM jobs WHERE nome = ? AND workspace = ?").run(nomeJob, wsNome);
      }
      return;
    }
    const args = JSON.stringify(["flow", "run", flow.id]);
    let proxima: string;
    try {
      proxima = proximoCron(expressaoCron, new Date()).toISOString();
    } catch {
      proxima = new Date().toISOString();
    }
    if (existentes.length === 0) {
      const agora = new Date().toISOString();
      db.prepare(
        `INSERT INTO jobs (id, nome, agenda_tipo, agenda_valor, args, workspace, ativo, graca_min, ultima_exec, proxima_exec, criado_em)
         VALUES (@id, @nome, 'cron', @agenda_valor, @args, @workspace, 1, 5, null, @proxima_exec, @criado_em)`
      ).run({
        id: nomeJob,
        nome: nomeJob,
        agenda_valor: expressaoCron,
        args,
        workspace: wsNome,
        proxima_exec: proxima,
        criado_em: agora,
      });
      return;
    }
    const [mantido, ...sobras] = existentes;
    for (const s of sobras) db.prepare("DELETE FROM jobs WHERE id = ?").run(s.id);
    db.prepare("UPDATE jobs SET agenda_tipo = 'cron', agenda_valor = ?, args = ?, ativo = 1 WHERE id = ?").run(
      expressaoCron, args, mantido!.id
    );
  } finally {
    db.close();
  }
}

/**
 * Remove o job `flow:<id>` (e o legado `sch-<id>`) ao excluir o flow.
 * O histórico em job_runs é preservado.
 */
export async function removerJobDoScheduler(
  wsPath: string,
  flowId: string,
  homeDir: string = opencorpHome()
): Promise<void> {
  const dbPath = resolve(homeDir, ".opencorp", "scheduler.db");
  if (!existsSync(dbPath)) return;
  try {
    const db = new Database(dbPath);
    try {
      db.prepare("DELETE FROM jobs WHERE (nome = ? OR id = ?) AND workspace = ?").run(`flow:${flowId}`, `sch-${flowId}`, basename(wsPath));
    } finally {
      db.close();
    }
  } catch {
    // Silencioso em cleanup
  }
}

/**
 * Bridge legado (Etapa 12.3): converte um job do scheduler em flow de 1 nó
 * (gatilho manual, auto_agendar:false). Puro — não toca no job original.
 */
export function converterJobParaFlow(job: { id: string; nome: string; args: string[] }): Flow {
  const id = `convertido-${job.id}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "convertido-job";
  return {
    id,
    nome: `convertido-${job.id}`,
    auto_agendar: false,
    nos: [
      {
        id: "gatilho",
        tipo: "manual",
        config: { origem: `schedule:${job.id}`, comando: job.args.join(" ") },
      },
    ],
    arestas: [],
  };
}
