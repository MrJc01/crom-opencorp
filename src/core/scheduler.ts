import Database from "better-sqlite3";
import { spawn } from "node:child_process";
import { mkdirRecursive } from "../utils/fs-safe.js";
import { opencorpHome } from "../utils/paths.js";
import { dirname, resolve } from "node:path";
import { SchedulerError } from "./errors.js";

export type Agenda =
  | { tipo: "cron"; valor: string }
  | { tipo: "intervalo_min"; valor: number }
  | { tipo: "data_unica"; valor: string };

export interface Job {
  id: string;
  nome: string;
  agenda: Agenda;
  args: string[];
  workspace: string;
  ativo: boolean;
  graca_min: number;
  ultima_exec: string | null;
  proxima_exec: string | null;
  criado_em: string;
}

export interface OpcoesScheduler {
  homeDir?: string;
  agora?: () => Date;
  executar?: (job: Job) => Promise<string>;
  binPath?: string;
}

interface LinhaJob {
  id: string;
  nome: string;
  agenda_tipo: string;
  agenda_valor: string;
  args: string;
  workspace: string;
  ativo: number;
  graca_min: number;
  ultima_exec: string | null;
  proxima_exec: string | null;
  criado_em: string;
}

// ── parser cron (5 campos: min hora dom mês dow; suporta * , - / ) ──

function campoCron(spec: string, min: number, max: number, onde: string): (v: number) => boolean {
  if (spec === "*") return () => true;
  const valores = new Set<number>();
  for (const parte of spec.split(",")) {
    const m = /^(?:(\d+)(?:-(\d+))?|\*)(?:\/(\d+))?$/.exec(parte);
    if (!m) throw new SchedulerError(`cron inválido (${onde}): "${parte}"`);
    const passo = m[3] ? Number(m[3]) : 1;
    if (passo < 1) throw new SchedulerError(`cron inválido (${onde}): passo ${passo}`);
    const ini = m[1] === undefined ? min : Number(m[1]);
    const fim = m[1] === undefined ? max : m[2] === undefined ? ini : Number(m[2]);
    if (ini < min || fim > max || ini > fim) {
      throw new SchedulerError(`cron inválido (${onde}): faixa ${ini}-${fim} fora de ${min}-${max}`);
    }
    for (let v = ini; v <= fim; v += passo) valores.add(v);
  }
  return (v) => valores.has(v);
}

export function validarCron(expr: string): void {
  const campos = expr.trim().split(/\s+/);
  if (campos.length !== 5) throw new SchedulerError(`cron precisa de 5 campos: "${expr}"`);
  campoCron(campos[0]!, 0, 59, "minuto");
  campoCron(campos[1]!, 0, 23, "hora");
  campoCron(campos[2]!, 1, 31, "dia-do-mês");
  campoCron(campos[3]!, 1, 12, "mês");
  campoCron(campos[4]!, 0, 6, "dia-da-semana");
}

export function proximoCron(expr: string, de: Date): Date {
  validarCron(expr);
  const [mm, hh, dom, mes, dow] = expr.trim().split(/\s+/).map((s, i) => {
    const faixas: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
    return campoCron(s, faixas[i]![0], faixas[i]![1], ["minuto", "hora", "dia-do-mês", "mês", "dia-da-semana"][i]!);
  });
  const t = new Date(de.getTime());
  t.setSeconds(0, 0);
  for (let i = 0; i < 527040; i++) {
    t.setMinutes(t.getMinutes() + 1);
    if (mm(t.getMinutes()) && hh(t.getHours()) && dom(t.getDate()) && mes(t.getMonth() + 1) && dow(t.getDay())) {
      return new Date(t.getTime());
    }
  }
  throw new SchedulerError(`cron "${expr}" não tem ocorrência em ~1 ano`);
}

function gerarId(): string {
  return `sch-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export class Scheduler {
  private readonly homeDir: string;
  private readonly agora: () => Date;
  private readonly executarFn: (job: Job) => Promise<string>;
  private db: Database.Database | null = null;
  private timer: NodeJS.Timeout | null = null;
  private keepAlive: NodeJS.Timeout | null = null;

  constructor(opcoes: OpcoesScheduler = {}) {
    this.homeDir = opcoes.homeDir ?? opencorpHome();
    this.agora = opcoes.agora ?? (() => new Date());
    this.executarFn =
      opcoes.executar ??
      (async (job) => this.executarSpawn(job));
  }

  private async banco(): Promise<Database.Database> {
    if (this.db) return this.db;
    const caminho = resolve(this.homeDir, ".opencorp", "scheduler.db");
    await mkdirRecursive(dirname(caminho));
    const db = new Database(caminho);
    db.pragma("journal_mode = WAL");
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
    `);
    this.db = db;
    return db;
  }

  private linhaParaJob(l: LinhaJob): Job {
    const agenda: Agenda =
      l.agenda_tipo === "cron"
        ? { tipo: "cron", valor: l.agenda_valor }
        : l.agenda_tipo === "data_unica"
          ? { tipo: "data_unica", valor: l.agenda_valor }
          : { tipo: "intervalo_min", valor: Number(l.agenda_valor) };
    return {
      id: l.id,
      nome: l.nome,
      agenda,
      args: JSON.parse(l.args) as string[],
      workspace: l.workspace,
      ativo: l.ativo === 1,
      graca_min: l.graca_min,
      ultima_exec: l.ultima_exec,
      proxima_exec: l.proxima_exec,
      criado_em: l.criado_em,
    };
  }

  private calcularProxima(agenda: Agenda, de: Date): Date {
    if (agenda.tipo === "cron") return proximoCron(agenda.valor, de);
    if (agenda.tipo === "intervalo_min") {
      if (agenda.valor < 1) throw new SchedulerError("intervalo_min deve ser >= 1");
      return new Date(de.getTime() + agenda.valor * 60_000);
    }
    const data = new Date(agenda.valor);
    if (Number.isNaN(data.getTime())) throw new SchedulerError(`data_unica inválida: "${agenda.valor}"`);
    return data;
  }

  private validarAgenda(agenda: Agenda): void {
    if (agenda.tipo === "cron") validarCron(agenda.valor);
    if (agenda.tipo === "intervalo_min" && agenda.valor < 1) throw new SchedulerError("intervalo_min deve ser >= 1");
    if (agenda.tipo === "data_unica" && Number.isNaN(new Date(agenda.valor).getTime())) {
      throw new SchedulerError(`data_unica inválida: "${agenda.valor}"`);
    }
  }

  async criar(
    dados: { nome: string; agenda: Agenda; args: string[]; workspace?: string; graca_min?: number },
  ): Promise<Job> {
    if (dados.nome.trim().length === 0) throw new SchedulerError('nome obrigatório: schedule create --nome "..."');
    if (!Array.isArray(dados.args) || dados.args.length === 0) {
      throw new SchedulerError("args obrigatório — comando opencorp a executar");
    }
    this.validarAgenda(dados.agenda);
    const agora = this.agora();
    const job: LinhaJob = {
      id: gerarId(),
      nome: dados.nome.trim(),
      agenda_tipo: dados.agenda.tipo,
      agenda_valor: String(dados.agenda.valor),
      args: JSON.stringify(dados.args),
      workspace: dados.workspace ?? "",
      ativo: 1,
      graca_min: dados.graca_min ?? 5,
      ultima_exec: null,
      proxima_exec: this.calcularProxima(dados.agenda, agora).toISOString(),
      criado_em: agora.toISOString(),
    };
    (await this.banco())
      .prepare(
        `INSERT INTO jobs (id, nome, agenda_tipo, agenda_valor, args, workspace, ativo, graca_min, ultima_exec, proxima_exec, criado_em)
         VALUES (@id, @nome, @agenda_tipo, @agenda_valor, @args, @workspace, @ativo, @graca_min, @ultima_exec, @proxima_exec, @criado_em)`,
      )
      .run(job);
    return this.linhaParaJob(job);
  }

  async listar(somenteAtivos = false): Promise<Job[]> {
    const linhas = (somenteAtivos
      ? (await this.banco()).prepare("SELECT * FROM jobs WHERE ativo = 1 ORDER BY proxima_exec").all()
      : (await this.banco()).prepare("SELECT * FROM jobs ORDER BY criado_em, id").all()) as LinhaJob[];
    return linhas.map((l) => this.linhaParaJob(l));
  }

  async obter(id: string): Promise<Job> {
    const l = (await this.banco()).prepare("SELECT * FROM jobs WHERE id = ?").get(id) as LinhaJob | undefined;
    if (!l) {
      const erro = new SchedulerError(`job "${id}" não encontrado — veja "opencorp schedule list"`);
      (erro as { status?: number }).status = 404;
      throw erro;
    }
    return this.linhaParaJob(l);
  }

  async pausar(id: string): Promise<Job> {
    (await this.banco()).prepare("UPDATE jobs SET ativo = 0 WHERE id = ?").run(id);
    return this.obter(id);
  }

  async retomar(id: string): Promise<Job> {
    (await this.banco()).prepare("UPDATE jobs SET ativo = 1 WHERE id = ?").run(id);
    const job = await this.obter(id);
    const proxima = this.calcularProxima(job.agenda, this.agora()).toISOString();
    (await this.banco()).prepare("UPDATE jobs SET proxima_exec = ? WHERE id = ?").run(proxima, id);
    return this.obter(id);
  }

  async excluir(id: string): Promise<void> {
    this.obter(id);
    (await this.banco()).prepare("DELETE FROM jobs WHERE id = ?").run(id);
  }

  private async executarSpawn(job: Job): Promise<string> {
    const bin = resolve(import.meta.dirname ?? ".", "..", "..", "bin", "opencorp.mjs");
    const args = ["--workspace", job.workspace, ...job.args].filter((a) => a.length > 0);
    const filho = spawn(process.execPath, [bin, ...args], {
      env: { ...process.env, OPENCORP_HOME: this.homeDir },
      detached: true,
      stdio: "ignore",
    });
    filho.unref();
    return `spawn pid ${filho.pid ?? 0}`;
  }

  /** Um passo do loop: executa jobs vencidos e recalcula próximas execuções. */
  async tick(): Promise<{ executados: string[]; pulados: string[] }> {
    const agora = this.agora();
    const executados: string[] = [];
    const pulados: string[] = [];
    for (const job of await this.listar(true)) {
      if (!job.proxima_exec) continue;
      const prevista = new Date(job.proxima_exec);
      if (prevista.getTime() > agora.getTime()) continue;
      const atrasoMin = (agora.getTime() - prevista.getTime()) / 60_000;
      if (atrasoMin > job.graca_min) {
        pulados.push(job.id);
        const proxima = this.calcularProxima(job.agenda, agora).toISOString();
        (await this.banco()).prepare("UPDATE jobs SET proxima_exec = ? WHERE id = ?").run(proxima, job.id);
        continue;
      }
      const resultado = await this.executarFn(job);
      void resultado;
      executados.push(job.id);
      const desativar = job.agenda.tipo === "data_unica";
      (await this.banco())
        .prepare("UPDATE jobs SET ultima_exec = ?, proxima_exec = ?, ativo = ? WHERE id = ?")
        .run(
          agora.toISOString(),
          desativar ? null : this.calcularProxima(job.agenda, agora).toISOString(),
          desativar ? 0 : 1,
          job.id,
        );
    }
    return { executados, pulados };
  }

  async runNow(id: string): Promise<{ job: Job; resultado: string }> {
    const job = await this.obter(id);
    const resultado = await this.executarFn(job);
    (await this.banco()).prepare("UPDATE jobs SET ultima_exec = ? WHERE id = ?").run(this.agora().toISOString(), id);
    return { job: await this.obter(id), resultado };
  }

  iniciar(intervaloSeg = 30, manterVivo = false): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch(() => undefined);
    }, intervaloSeg * 1000);
    if (manterVivo) {
      this.keepAlive = setInterval(() => undefined, 60_000);
    } else {
      this.timer.unref?.();
    }
  }

  parar(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.keepAlive) {
      clearInterval(this.keepAlive);
      this.keepAlive = null;
    }
  }
}
