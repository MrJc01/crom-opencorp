import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { execa } from "execa";
import type { Agente } from "../schemas/agent.js";
import { AgentStore } from "./agent-store.js";
import { SessionError } from "./errors.js";
import { OpenCodeBridge } from "./opencode-bridge.js";
import { RegistryStore, type MetaRegistro } from "./registry-store.js";
import { eventBus } from "./event-bus.js";
import { WorkspaceManager } from "./workspace-manager.js";
import { ApprovalsStore } from "./approvals-store.js";
import { BudgetManager } from "./budget-manager.js";
import { avaliar, casaPadrao } from "./security-guard.js";
import { parseSecurityPolicyTexto } from "../schemas/security-policy.js";
import { mkdirRecursive } from "../utils/fs-safe.js";
import { opencorpHome, resolvePath } from "../utils/paths.js";

export type StatusExecucao = "executando" | "concluido" | "falhou" | "cancelado" | "hitl_pendente";

export interface OpcoesRun {
  agente: string;
  ordem?: string;
  file?: string;
  model?: string;
  session?: string;
  title?: string;
  workspaceId?: string;
  workspaceDir?: string;
  pularGuard?: boolean;
  tags?: string[];
  referencias?: string[];
  tipo?: string;
  execId?: string;
}

export interface ResultadoRun extends RegistroExecucao {
  captura: string;
  custo_usd: number | null;
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

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export function gerarIdExecucao(prefixo = "exec"): string {
  return gerarId(prefixo);
}

function gerarId(prefixo: string): string {
  const agora = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const ts = `${agora.getFullYear()}${p2(agora.getMonth() + 1)}${p2(agora.getDate())}-${p2(agora.getHours())}${p2(agora.getMinutes())}${p2(agora.getSeconds())}`;
  return `${prefixo}-${ts}-${randomUUID().slice(0, 4)}`;
}

export class SessionManager {
  private readonly homeDir: string;
  private readonly workspaces: WorkspaceManager;
  private readonly agentes: AgentStore;
  private readonly registros = new RegistryStore();
  private readonly approvals = new ApprovalsStore();
  private readonly bridge = new OpenCodeBridge();

  constructor(opts: { homeDir?: string; cwd?: string; templatesDir?: string } = {}) {
    this.homeDir = opts.homeDir ?? opencorpHome();
    this.workspaces = new WorkspaceManager(opts);
    this.agentes = new AgentStore({ templatesDir: opts.templatesDir });
  }

  private carregarPolicy(wsPath: string) {
    const path = join(wsPath, ".opencorp", "security_policy.json");
    if (!existsSync(path)) {
      return parseSecurityPolicyTexto("{}", path);
    }
    return parseSecurityPolicyTexto(readFileSync(path, "utf8"), path);
  }

  async workspaceDe(workspaceId?: string) {
    return this.workspaces.resolver(workspaceId);
  }

  async rodar(opcoes: OpcoesRun): Promise<ResultadoRun> {
    let ws: { path: string; id: string; existe: boolean };
    if (opcoes.workspaceDir) {
      const dir = resolvePath(opcoes.workspaceDir);
      if (!existsSync(join(dir, ".opencorp"))) {
        throw new SessionError(`workspace do subcorp inválido: ${dir} não contém .opencorp/`);
      }
      ws = { path: dir, id: basename(dir), existe: true };
    } else {
      const info = await this.workspaces.resolver(opcoes.workspaceId);
      if (!info.existe) {
        throw new SessionError(`a pasta do workspace "${info.id}" não existe (${info.path})`);
      }
      ws = info;
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

    const policy = this.carregarPolicy(ws.path);
    if (!opcoes.pularGuard) {
      const pre = avaliar(ordem, policy, ag.frontmatter.permissions);
      if (pre.acao === "bloqueado") {
        const idBloqueio = gerarId("exec");
        await this.registros.garantirCategorias(ws.path);
        await this.registros.criar(ws.path, {
          categoria: "execucoes",
          id: idBloqueio,
          descricao: `Ordem: ${ordem.slice(0, 160)}`,
          criadoPor: ag.frontmatter.id,
          tags: ["sessao", "bloqueada"],
          eventoInicial: {
            evento: "bloqueado",
            resumo: `SecurityGuard: ${pre.motivo}`,
          },
          extras: {
            status: "falhou",
            modelo,
            ordem,
            pid: null,
            fim: new Date().toISOString(),
            exit_code: 3,
            duracao_ms: 0,
            log: "",
          },
        });
        await this.registros.eventoAuditoria(ws.path, {
          por: ag.frontmatter.id,
          evento: "bloqueado_pre_voo",
          resumo: pre.motivo,
          padrao: pre.padrao ?? "",
          ordem: ordem.slice(0, 160),
        });
        throw new SessionError(`bloqueado pelo SecurityGuard: ${pre.motivo}`, { exitCode: 3 });
      }
      if (pre.acao === "hitl") {
        const idHitl = gerarId("exec");
        await this.registros.garantirCategorias(ws.path);
        await this.registros.criar(ws.path, {
          categoria: "execucoes",
          id: idHitl,
          descricao: `Ordem: ${ordem.slice(0, 160)}`,
          criadoPor: ag.frontmatter.id,
          tags: ["sessao", "hitl"],
          eventoInicial: {
            evento: "hitl_pendente",
            resumo: `SecurityGuard: ${pre.motivo}`,
          },
          extras: {
            status: "hitl_pendente",
            modelo,
            ordem,
            pid: null,
            fim: null,
            exit_code: null,
            duracao_ms: null,
            log: "",
          },
        });
        const pendencia = await this.approvals.criar(ws.path, {
          ordem,
          agente: ag.frontmatter.id,
          modelo,
          padrao: pre.padrao ?? "",
          origem: "pre-voo",
          motivo_guard: pre.motivo,
          workspace_id: ws.id,
          workspace_path: ws.path,
          exec_id: idHitl,
        });
        throw new SessionError(
          `HITL: a ordem casa com "${pre.padrao}" e aguarda aprovação humana — pendência ${pendencia.id} (opencorp approvals list)`,
          { exitCode: 5 },
        );
      }
    }

    const budget = new BudgetManager({ homeDir: this.homeDir });
    const orcamento = await budget.podeExecutar(ws.path, ag.frontmatter.id);
    if (!orcamento.ok) {
      throw new SessionError(`recusada pelo BudgetManager: ${orcamento.motivo}`, { exitCode: 4 });
    }

    await this.registros.garantirCategorias(ws.path);

    const id = opcoes.execId ?? gerarId("exec");
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

    await this.registros.criar(ws.path, {
      categoria: "execucoes",
      id,
      descricao: `Ordem: ${ordem.slice(0, 160)}`,
      criadoPor: registro.agente,
      tags: ["sessao", ...(opcoes.tags ?? [])],
      referencias: opcoes.referencias,
      eventoInicial: {
        evento: "iniciado",
        resumo: `ordem: ${ordem.slice(0, 160)} · modelo: ${modelo}`,
      },
      extras: {
        status: "executando",
        modelo,
        ordem,
        pid: null,
        fim: null,
        exit_code: null,
        duracao_ms: null,
        log: logRelativo,
        ...(opcoes.tipo ? { tipo: opcoes.tipo } : {}),
      },
    });
    eventBus.emit("sessao-inicio", { exec_id: id, agente: registro.agente, modelo });

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
      await this.finalizar(ws, registro, ag.frontmatter, "falhou", null, Date.now() - inicio.getTime(), falha, "", null);
      throw new SessionError(falha);
    }
    if (child.pid) {
      registro.pid = child.pid;
      const meta = await this.registros.lerMeta(ws.path, "execucoes", id);
      await this.salvarExtras(ws.path, meta, registro);
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
      await this.finalizar(ws, registro, ag.frontmatter, "falhou", null, Date.now() - inicio.getTime(), falha, captura.join(""), null);
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

    const textoCaptura = captura.join("");
    const custo = budget.estimarCusto(
      await budget.carregar(ws.path),
      modelo,
      duracao,
      textoCaptura,
    );
    const consumo = await budget.registrarConsumo(ws.path, ag.frontmatter.id, custo, {
      modelo,
      duracao_ms: duracao,
    });
    if (consumo.aviso80) {
      console.log(
        `\n[opencorp] ⚠ aviso: consumo atingiu 80% do orçamento (${ag.frontmatter.id} ou workspace) — veja "opencorp budget status"`,
      );
    }
    await this.finalizar(
      ws,
      registro,
      ag.frontmatter,
      status,
      registro.exit_code,
      duracao,
      textoCaptura.slice(0, 400),
      textoCaptura,
      custo,
    );

    if (!opcoes.pularGuard) {
      const posHitl = policy.hitl_patterns.find((padrao) => casaPadrao(padrao, textoCaptura));
      if (posHitl) {
        const pendencia = await this.approvals.criar(ws.path, {
          ordem,
          agente: ag.frontmatter.id,
          modelo,
          padrao: posHitl,
          origem: "pos-voo",
          motivo_guard: `transcript da sessão contém o padrão de HITL "${posHitl}" — requer revisão humana`,
          workspace_id: ws.id,
          workspace_path: ws.path,
          exec_id: registro.id,
        });
        await this.registros.anexarEvento(ws.path, "execucoes", registro.id, {
          ts: new Date().toISOString(),
          por: "security-guard",
          evento: "hitl_pos_voo",
          padrao: posHitl,
          resumo: `pendência ${pendencia.id} criada para revisão humana`,
        });
        throw new SessionError(
          `HITL pós-voo: o transcript contém "${posHitl}" — pendência ${pendencia.id} criada para revisão humana (exit 5)`,
          { exitCode: 5 },
        );
      }
      const posBloq = policy.blocklist.find((padrao) => casaPadrao(padrao, textoCaptura));
      if (posBloq) {
        await this.registros.eventoAuditoria(ws.path, {
          por: ag.frontmatter.id,
          evento: "padrao_bloqueado_pos_voo",
          resumo: `transcript contém padrão da blocklist "${posBloq}" — execução já ocorreu dentro do opencode; registrada para auditoria`,
          padrao: posBloq,
          ordem: ordem.slice(0, 160),
        });
        await this.registros.anexarEvento(ws.path, "execucoes", registro.id, {
          ts: new Date().toISOString(),
          por: "security-guard",
          evento: "violacao_pos_voo",
          padrao: posBloq,
          resumo: "transcript contém padrão da blocklist — auditoria (a sessão já tinha corrido)",
        });
        console.log(
          `\n[opencorp] ⚠ auditoria: o transcript contém o padrão de blocklist "${posBloq}" — evento registrado em registries/logs/audit-log`,
        );
      }
    }
    return { ...registro, captura: textoCaptura, custo_usd: custo };
  }

  async listarExecucoes(wsPath: string, filtro?: { agente?: string }): Promise<ResumoExecucao[]> {
    const metas = await this.registros.listar(wsPath, "execucoes");
    return metas
      .filter((meta) => !filtro?.agente || meta.criado_por === filtro.agente)
      .map((meta) => this.paraResumo(meta))
      .sort((a, b) => b.inicio.localeCompare(a.inicio));
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

  async transcriptDe(wsPath: string, id: string): Promise<string> {
    const registro = await this.registros.obter(wsPath, "chats", id);
    return registro.conteudo ?? "";
  }

  async matar(wsPath: string, id: string): Promise<void> {
    let meta: MetaRegistro;
    try {
      meta = await this.registros.lerMeta(wsPath, "execucoes", id);
    } catch {
      throw new SessionError(`sessão "${id}" não encontrada (registries/execucoes)`);
    }
    const extras = (meta.extras ?? {}) as Record<string, unknown>;
    if (extras.status !== "executando") {
      throw new SessionError(
        `sessão "${id}" não está em execução (status: ${String(extras.status ?? "desconhecido")})`,
      );
    }
    const pid = extras.pid as number | null;
    if (!pid) {
      throw new SessionError(`sessão "${id}" não tem pid registrado — não é possível matar`);
    }
    let viva = true;
    try {
      process.kill(pid, 0);
    } catch {
      viva = false;
    }
    if (!viva) {
      throw new SessionError(`o processo da sessão "${id}" (pid ${pid}) não está mais vivo`);
    }
    try {
      process.kill(pid, "SIGTERM");
    } catch (erro) {
      throw new SessionError(`não foi possível matar o pid ${pid}: ${msg(erro)}`);
    }
    const registro = await this.paraRegistro(meta);
    registro.status = "cancelado";
    registro.fim = new Date().toISOString();
    registro.duracao_ms = Date.now() - Date.parse(registro.inicio);
    await this.finalizar(
      { path: wsPath, id: "" },
      registro,
      null,
      "cancelado",
      null,
      registro.duracao_ms,
      "cancelada via session kill",
      "",
      null,
    );
  }

  private paraResumo(meta: MetaRegistro): ResumoExecucao {
    const extras = (meta.extras ?? {}) as Record<string, unknown>;
    return {
      id: meta.id,
      agente: meta.criado_por,
      modelo: String(extras.modelo ?? "-"),
      status: (extras.status as StatusExecucao) ?? "executando",
      inicio: meta.criado_em,
      duracao_ms: (extras.duracao_ms as number | null) ?? null,
      exit_code: (extras.exit_code as number | null) ?? null,
    };
  }

  private async paraRegistro(meta: MetaRegistro): Promise<RegistroExecucao> {
    const extras = (meta.extras ?? {}) as Record<string, unknown>;
    return {
      id: meta.id,
      agente: meta.criado_por,
      modelo: String(extras.modelo ?? "-"),
      ordem: String(extras.ordem ?? ""),
      inicio: meta.criado_em,
      fim: (extras.fim as string | null) ?? null,
      status: (extras.status as StatusExecucao) ?? "executando",
      exit_code: (extras.exit_code as number | null) ?? null,
      duracao_ms: (extras.duracao_ms as number | null) ?? null,
      pid: (extras.pid as number | null) ?? null,
      log: String(extras.log ?? `logs/${meta.id}.log`),
    };
  }

  private async salvarExtras(wsPath: string, meta: MetaRegistro, registro: RegistroExecucao): Promise<void> {
    meta.extras = {
      ...(meta.extras ?? {}),
      status: registro.status,
      modelo: registro.modelo,
      ordem: registro.ordem,
      pid: registro.pid,
      fim: registro.fim,
      exit_code: registro.exit_code,
      duracao_ms: registro.duracao_ms,
      log: registro.log,
    };
    await this.registros.salvarMeta(wsPath, "execucoes", registro.id, meta);
  }

  private async finalizar(
    ws: { path: string; id: string },
    registro: RegistroExecucao,
    agente: Agente | null,
    status: StatusExecucao,
    exitCode: number | null,
    duracaoMs: number,
    resumo: string,
    captura: string,
    custoUsd: number | null = null,
  ): Promise<void> {
    registro.status = status;
    registro.exit_code = exitCode;
    registro.duracao_ms = duracaoMs;
    registro.fim = registro.fim ?? new Date().toISOString();
    eventBus.emit("sessao-fim", {
      exec_id: registro.id,
      agente: registro.agente,
      status,
      exit_code: exitCode,
      duracao_ms: duracaoMs,
    });
    await this.registros.anexarEvento(ws.path, "execucoes", registro.id, {
      ts: new Date().toISOString(),
      por: "opencorp",
      evento: "finalizado",
      status,
      exit_code: exitCode,
      duracao_ms: duracaoMs,
      resumo,
    });
    const meta = await this.registros.lerMeta(ws.path, "execucoes", registro.id);
    await this.salvarExtras(ws.path, meta, registro);
    await this.registros.registrarSessao(ws.path, {
      id: registro.id,
      agente: registro.agente,
      modelo: registro.modelo,
      inicio: registro.inicio,
      fim: registro.fim,
      custo_usd: custoUsd,
      status: registro.status,
    });
    if (captura !== "" || agente !== null) {
      await this.registros.garantirRegistro(ws.path, {
        categoria: "chats",
        id: registro.id,
        descricao: `transcript da sessão ${registro.id} (${registro.agente} · ${registro.modelo})`,
        criadoPor: registro.agente,
        tags: ["sessao", "transcript"],
        conteudo: captura,
      });
    }
  }

}
