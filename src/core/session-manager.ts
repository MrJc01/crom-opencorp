import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execa } from "execa";
import type { Agente } from "../schemas/agent.js";
import { AgentStore } from "./agent-store.js";
import { SessionError } from "./errors.js";
import { OpenCodeBridge } from "./opencode-bridge.js";
import { WorkspaceManager } from "./workspace-manager.js";
import { mkdirRecursive, writeFileAtomic } from "../utils/fs-safe.js";

export type StatusExecucao = "executando" | "concluido" | "falhou" | "cancelado";

export interface OpcoesRun {
  agente: string;
  ordem?: string;
  file?: string;
  model?: string;
  session?: string;
  title?: string;
  workspaceId?: string;
}

export interface RegistroExecucao {
  id: string;
  agente: string;
  modelo: string;
  ordem: string;
  inicio: string;
  fim: string | null;
  status: StatusExecucao;
  exit_code: number | null;
  duracao_ms: number | null;
  pid: number | null;
  log: string;
}

export interface ResumoExecucao {
  id: string;
  agente: string;
  modelo: string;
  status: StatusExecucao;
  inicio: string;
  duracao_ms: number | null;
  exit_code: number | null;
}

interface MetaExecucao {
  id: string;
  categoria: "execucoes";
  descricao: string;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
  permissoes: { leitura: string[]; escrita: string[]; modificacao_meta: string[] };
  tags: string[];
  referencias: string[];
  extras: {
    status: StatusExecucao;
    modelo: string;
    ordem: string;
    pid: number | null;
    fim: string | null;
    exit_code: number | null;
    duracao_ms: number | null;
    log: string;
  };
}

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function gerarId(prefixo: string): string {
  const agora = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const ts = `${agora.getFullYear()}${p2(agora.getMonth() + 1)}${p2(agora.getDate())}-${p2(agora.getHours())}${p2(agora.getMinutes())}${p2(agora.getSeconds())}`;
  return `${prefixo}-${ts}-${randomUUID().slice(0, 4)}`;
}

export class SessionManager {
  private readonly workspaces: WorkspaceManager;
  private readonly agentes: AgentStore;
  private readonly bridge = new OpenCodeBridge();

  constructor(opts: { homeDir?: string; cwd?: string; templatesDir?: string } = {}) {
    this.workspaces = new WorkspaceManager(opts);
    this.agentes = new AgentStore({ templatesDir: opts.templatesDir });
  }

  async workspaceDe(workspaceId?: string) {
    return this.workspaces.resolver(workspaceId);
  }

  async rodar(opcoes: OpcoesRun): Promise<RegistroExecucao> {
    const ws = await this.workspaces.resolver(opcoes.workspaceId);
    if (!ws.existe) {
      throw new SessionError(`a pasta do workspace "${ws.id}" não existe (${ws.path})`);
    }
    const ag = await this.agentes.carregar(ws.path, opcoes.agente);
    let ordem = opcoes.ordem ?? "";
    if (opcoes.file) {
      try {
        ordem = (await readFile(opcoes.file, "utf8")).trim();
      } catch (erro) {
        throw new SessionError(`não foi possível ler --file "${opcoes.file}": ${msg(erro)}`);
      }
    }
    if (ordem.trim().length === 0) {
      throw new SessionError("ordem vazia — informe a instrução (ou use --file)");
    }
    const modelo = opcoes.model ?? ag.frontmatter.model;
    await this.validarOrcamentoStub(ws.path, ag.frontmatter);

    const id = gerarId("exec");
    const logRelativo = `logs/${id}.log`;
    const logPath = join(ws.path, logRelativo);
    await mkdirRecursive(join(ws.path, "logs"));
    const inicio = new Date();
    const registro: RegistroExecucao = {
      id,
      agente: ag.frontmatter.id,
      modelo,
      ordem,
      inicio: inicio.toISOString(),
      fim: null,
      status: "executando",
      exit_code: null,
      duracao_ms: null,
      pid: null,
      log: logRelativo,
    };

    await mkdirRecursive(this.dirExecucoes(ws.path));
    await this.journalizar(ws.path, id, {
      ts: new Date().toISOString(),
      por: ag.frontmatter.id,
      evento: "iniciado",
      resumo: `ordem: ${ordem.slice(0, 160)}`,
      modelo,
      workspace: ws.id,
    });
    await this.gravarMeta(ws.path, registro);

    await this.bridge.sincronizarAgente(ws.path, ag.frontmatter, ag.corpo);

    const args = [
      "run",
      "--auto",
      "--agent",
      ag.frontmatter.id,
      "--model",
      modelo,
      "--dir",
      ws.path,
    ];
    if (opcoes.session) args.push("--session", opcoes.session);
    if (opcoes.title) args.push("--title", opcoes.title);
    args.push(ordem);

    let child: ReturnType<typeof execa>;
    try {
      child = execa("opencode", args, {
        cwd: ws.path,
        buffer: false,
        reject: false,
        stdin: "ignore",
      });
    } catch (erro) {
      const falha = `não foi possível iniciar o opencode: ${msg(erro)} — ele está no PATH? (rode "opencorp doctor")`;
      await this.finalizar(ws.path, registro, "falhou", null, Date.now() - inicio.getTime(), falha);
      throw new SessionError(falha);
    }
    if (child.pid) {
      registro.pid = child.pid;
      await this.gravarMeta(ws.path, registro);
    }

    const logStream = createWriteStream(logPath, { flags: "a" });
    logStream.write(
      `# sessão ${id}\n# agente: ${registro.agente} · modelo: ${modelo} · workspace: ${ws.id}\n# ordem: ${ordem}\n\n`,
    );
    const captura: string[] = [];
    const teeing = async (stream: AsyncIterable<unknown> | null | undefined) => {
      if (!stream) return;
      for await (const chunk of stream) {
        const texto = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        captura.push(texto);
        logStream.write(texto);
        process.stdout.write(texto);
      }
    };
    let resultado;
    try {
      await Promise.all([teeing(child.stdout), teeing(child.stderr)]);
      resultado = await child;
    } catch (erro) {
      logStream.end();
      const falha = `não foi possível executar o opencode: ${msg(erro)} — ele está no PATH? (rode "opencorp doctor")`;
      await this.finalizar(ws.path, registro, "falhou", null, Date.now() - inicio.getTime(), falha);
      throw new SessionError(falha);
    }
    logStream.end();

    const fim = new Date();
    const duracao = fim.getTime() - inicio.getTime();
    const res = resultado as unknown as { exitCode?: number | null; killed?: boolean };
    const status: StatusExecucao = res.killed
      ? "cancelado"
      : res.exitCode === 0
        ? "concluido"
        : "falhou";
    registro.fim = fim.toISOString();
    registro.status = status;
    registro.exit_code = res.exitCode ?? null;
    registro.duracao_ms = duracao;
    await this.finalizar(ws.path, registro, status, registro.exit_code, duracao, captura.join("").slice(0, 400));
    return registro;
  }

  async listarExecucoes(wsPath: string, filtro?: { agente?: string }): Promise<ResumoExecucao[]> {
    const dir = this.dirExecucoes(wsPath);
    if (!existsSync(dir)) return [];
    const saida: ResumoExecucao[] = [];
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      if (!entrada.isDirectory() || !entrada.name.startsWith("exec-")) continue;
      const metaPath = join(dir, entrada.name, "meta.json");
      if (!existsSync(metaPath)) continue;
      try {
        const meta = JSON.parse(await readFile(metaPath, "utf8")) as MetaExecucao;
        if (filtro?.agente && meta.criado_por !== filtro.agente) continue;
        saida.push({
          id: meta.id,
          agente: meta.criado_por,
          modelo: meta.extras?.modelo ?? "-",
          status: meta.extras?.status ?? "executando",
          inicio: meta.criado_em,
          duracao_ms: meta.extras?.duracao_ms ?? null,
          exit_code: meta.extras?.exit_code ?? null,
        });
      } catch {
        continue;
      }
    }
    return saida.sort((a, b) => b.inicio.localeCompare(a.inicio));
  }

  async caminhoLog(wsPath: string, id: string): Promise<string> {
    const logPath = join(wsPath, "logs", `${id}.log`);
    if (!existsSync(logPath)) {
      throw new SessionError(`log não encontrado para a sessão "${id}" (${logPath})`);
    }
    return logPath;
  }

  async logDe(wsPath: string, id: string): Promise<string> {
    return readFile(await this.caminhoLog(wsPath, id), "utf8");
  }

  async matar(wsPath: string, id: string): Promise<void> {
    const meta = await this.lerMeta(wsPath, id);
    const extras = meta.extras;
    if (!extras || extras.status !== "executando") {
      throw new SessionError(
        `sessão "${id}" não está em execução (status: ${extras?.status ?? "desconhecido"})`,
      );
    }
    if (!extras.pid) {
      throw new SessionError(`sessão "${id}" não tem pid registrado — não é possível matar`);
    }
    let viva = true;
    try {
      process.kill(extras.pid, 0);
    } catch {
      viva = false;
    }
    if (!viva) {
      throw new SessionError(`o processo da sessão "${id}" (pid ${extras.pid}) não está mais vivo`);
    }
    try {
      process.kill(extras.pid, "SIGTERM");
    } catch (erro) {
      throw new SessionError(`não foi possível matar o pid ${extras.pid}: ${msg(erro)}`);
    }
    const registro = await this.registroDeMeta(meta);
    registro.status = "cancelado";
    registro.fim = new Date().toISOString();
    registro.duracao_ms = Date.now() - Date.parse(registro.inicio);
    await this.finalizar(wsPath, registro, "cancelado", null, registro.duracao_ms, "cancelada via session kill");
  }

  private dirExecucoes(wsPath: string): string {
    return join(wsPath, ".opencorp", "registries", "execucoes");
  }

  private dirDe(wsPath: string, id: string): string {
    return join(this.dirExecucoes(wsPath), id);
  }

  private async validarOrcamentoStub(_wsPath: string, _agente: Agente): Promise<void> {}

  private async gravarMeta(wsPath: string, registro: RegistroExecucao): Promise<void> {
    const dir = this.dirDe(wsPath, registro.id);
    mkdirSync(dir, { recursive: true });
    const agora = new Date().toISOString();
    const anterior = existsSync(join(dir, "meta.json"))
      ? (JSON.parse(await readFile(join(dir, "meta.json"), "utf8")) as MetaExecucao)
      : null;
    const meta: MetaExecucao = {
      id: registro.id,
      categoria: "execucoes",
      descricao: `Ordem: ${registro.ordem.slice(0, 160)}`,
      criado_por: registro.agente,
      criado_em: anterior?.criado_em ?? registro.inicio,
      atualizado_em: agora,
      permissoes: { leitura: ["*"], escrita: [registro.agente], modificacao_meta: [] },
      tags: ["execucao"],
      referencias: [],
      extras: {
        status: registro.status,
        modelo: registro.modelo,
        ordem: registro.ordem,
        pid: registro.pid,
        fim: registro.fim,
        exit_code: registro.exit_code,
        duracao_ms: registro.duracao_ms,
        log: registro.log,
      },
    };
    await writeFileAtomic(join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  }

  private async lerMeta(wsPath: string, id: string): Promise<MetaExecucao> {
    const metaPath = join(this.dirDe(wsPath, id), "meta.json");
    if (!existsSync(metaPath)) {
      throw new SessionError(`sessão "${id}" não encontrada em ${this.dirExecucoes(wsPath)}`);
    }
    return JSON.parse(await readFile(metaPath, "utf8")) as MetaExecucao;
  }

  private async registroDeMeta(meta: MetaExecucao): Promise<RegistroExecucao> {
    return {
      id: meta.id,
      agente: meta.criado_por,
      modelo: meta.extras?.modelo ?? "-",
      ordem: meta.extras?.ordem ?? "",
      inicio: meta.criado_em,
      fim: meta.extras?.fim ?? null,
      status: meta.extras?.status ?? "executando",
      exit_code: meta.extras?.exit_code ?? null,
      duracao_ms: meta.extras?.duracao_ms ?? null,
      pid: meta.extras?.pid ?? null,
      log: meta.extras?.log ?? `logs/${meta.id}.log`,
    };
  }

  private async journalizar(
    wsPath: string,
    id: string,
    evento: Record<string, unknown>,
  ): Promise<void> {
    const dir = this.dirDe(wsPath, id);
    mkdirSync(dir, { recursive: true });
    await appendFile(join(dir, "journal.jsonl"), `${JSON.stringify(evento)}\n`, "utf8");
  }

  private async finalizar(
    wsPath: string,
    registro: RegistroExecucao,
    status: StatusExecucao,
    exitCode: number | null,
    duracaoMs: number,
    resumo: string,
  ): Promise<void> {
    registro.status = status;
    registro.exit_code = exitCode;
    registro.duracao_ms = duracaoMs;
    registro.fim = registro.fim ?? new Date().toISOString();
    await this.journalizar(wsPath, registro.id, {
      ts: new Date().toISOString(),
      por: "opencorp",
      evento: "finalizado",
      status,
      exit_code: exitCode,
      duracao_ms: duracaoMs,
      resumo,
    });
    await this.gravarMeta(wsPath, registro);
  }
}
