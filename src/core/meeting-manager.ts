import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AgentStore } from "./agent-store.js";
import { BudgetManager } from "./budget-manager.js";
import { MeetingError } from "./errors.js";
import { SessionManager } from "./session-manager.js";
import { RegistryStore, type MetaRegistro } from "./registry-store.js";
import { SettingsStore } from "./settings-store.js";
import { eventBus } from "./event-bus.js";
import { WorkspaceManager } from "./workspace-manager.js";
import type { OpcoesRun, ResultadoRun } from "./session-manager.js";
import type { AgenteArquivo } from "../schemas/agent.js";
import { opencorpHome } from "../utils/paths.js";

export type StatusReuniao = "em-andamento" | "encerrada" | "encerrada-partial";
export type Moderacao = "moderador" | "rotacao-fixa";

export const PARTICIPANTES_PADRAO = ["ceo-documentos", "ceo-estrategia", "secretario"];

export interface ConfigMeeting {
  max_turnos: number;
  max_minutes: number;
  per_agent_usd: number;
  moderator: string;
  ata_model_rotation: string[];
}

export interface SalaInfo {
  id: string;
  pauta: string;
  participantes: string[];
  moderator: string;
  moderacao: Moderacao;
  modelo: string;
  max_turnos: number;
  turno: number;
  status: StatusReuniao;
  motivo_fim: string | null;
  criado_em: string;
  encerrada_em: string | null;
  ata: string | null;
}

export interface SessaoLike {
  rodar(opcoes: OpcoesRun): Promise<ResultadoRun>;
}

export type DecisaoModerador =
  | { tipo: "encerrar" }
  | { tipo: "proximo"; agente: string; instrucao: string }
  | { tipo: "indecifrado" };

export function parseDecisaoModerador(texto: string): DecisaoModerador {
  const t = texto.trim();
  if (/\bENCERRAR\b/i.test(t)) return { tipo: "encerrar" };
  const m = /pr[óo]ximo:\s*([a-z0-9-]+)\s*(?:—|–|-|:)\s*instrução:\s*(.+)/i.exec(t);
  if (m) {
    return { tipo: "proximo", agente: m[1]!.toLowerCase(), instrucao: m[2]!.trim() };
  }
  return { tipo: "indecifrado" };
}

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function gerarIdReuniao(): string {
  const agora = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const ts = `${agora.getFullYear()}${p2(agora.getMonth() + 1)}${p2(agora.getDate())}-${p2(agora.getHours())}${p2(agora.getMinutes())}${p2(agora.getSeconds())}`;
  return `reuniao-${ts}-${randomUUID().slice(0, 4)}`;
}

export interface MeetingManagerOptions {
  homeDir?: string;
  cwd?: string;
  templatesDir?: string;
  sessoes?: SessaoLike;
  budget?: BudgetManager;
  agora?: () => Date;
}

export interface OpcoesIniciar {
  pauta: string;
  agentes?: string;
  model?: string;
  workspaceId?: string;
  workspaceDir?: string;
  id?: string;
}

const MODELO_POR_AGENTE = "(modelo de cada agente)";

export class MeetingManager {
  private readonly homeDir: string;
  private readonly workspaces: WorkspaceManager;
  private readonly agentes: AgentStore;
  private readonly registros = new RegistryStore();
  private readonly store: SettingsStore;
  private readonly sessoes: SessaoLike;
  private readonly budget: BudgetManager;
  private readonly agora: () => Date;
  private sinalInterrupcao = false;

  constructor(opts: MeetingManagerOptions = {}) {
    this.homeDir = opts.homeDir ?? opencorpHome();
    this.workspaces = new WorkspaceManager(opts);
    this.agentes = new AgentStore({ templatesDir: opts.templatesDir });
    this.store = new SettingsStore({ homeDir: this.homeDir, cwd: opts.cwd });
    this.sessoes = opts.sessoes ?? new SessionManager(opts);
    this.budget = opts.budget ?? new BudgetManager({ homeDir: this.homeDir, cwd: opts.cwd });
    this.agora = opts.agora ?? (() => new Date());
  }

  solicitarInterrupcao(): void {
    this.sinalInterrupcao = true;
  }

  private async cfgMeeting(workspaceDir: string): Promise<ConfigMeeting> {
    const maxTurns = await this.store.get("meeting.max_turns", { workspaceDir });
    const maxMinutes = await this.store.get("meeting.max_minutes", { workspaceDir });
    const perAgent = await this.store.get("meeting.per_agent_usd", { workspaceDir });
    const moderator = await this.store.get("meeting.moderator", { workspaceDir });
    const ataRotation = await this.store.get("meeting.ata_model_rotation", { workspaceDir });
    return {
      max_turnos: Number(maxTurns.valor),
      max_minutes: Number(maxMinutes.valor),
      per_agent_usd: Number(perAgent.valor),
      moderator: String(moderator.valor),
      ata_model_rotation: (ataRotation.valor as unknown as string[]) ?? [],
    };
  }

  private salaDeMeta(meta: MetaRegistro): SalaInfo {
    const e = (meta.extras ?? {}) as Record<string, unknown>;
    return {
      id: meta.id,
      pauta: String(e.pauta ?? meta.descricao),
      participantes: (e.participantes as string[]) ?? [],
      moderator: String(e.moderator ?? ""),
      moderacao: (e.moderacao as Moderacao) ?? "rotacao-fixa",
      modelo: String(e.modelo ?? MODELO_POR_AGENTE),
      max_turnos: Number(e.max_turnos ?? 0),
      turno: Number(e.turno ?? 0),
      status: (e.status as StatusReuniao) ?? "em-andamento",
      motivo_fim: (e.motivo_fim as string | null) ?? null,
      criado_em: meta.criado_em,
      encerrada_em: (e.encerrada_em as string | null) ?? null,
      ata: (e.ata as string | null) ?? null,
    };
  }

  private async lerSala(wsPath: string, id: string): Promise<{ sala: SalaInfo; meta: MetaRegistro }> {
    const meta = await this.registros.lerMeta(wsPath, "chats", id);
    const sala = this.salaDeMeta(meta);
    if (sala.participantes.length === 0 && !(meta.extras as Record<string, unknown> | undefined)?.tipo) {
      throw new MeetingError(`registro "${id}" não é uma reunião`);
    }
    return { sala, meta };
  }

  private async salvarSala(wsPath: string, sala: SalaInfo): Promise<void> {
    const meta = await this.registros.lerMeta(wsPath, "chats", sala.id);
    meta.extras = {
      ...(meta.extras ?? {}),
      pauta: sala.pauta,
      participantes: sala.participantes,
      moderator: sala.moderator,
      moderacao: sala.moderacao,
      modelo: sala.modelo,
      max_turnos: sala.max_turnos,
      turno: sala.turno,
      status: sala.status,
      motivo_fim: sala.motivo_fim,
      encerrada_em: sala.encerrada_em,
      ata: sala.ata,
    };
    await this.registros.salvarMeta(wsPath, "chats", sala.id, meta);
  }

  async iniciar(opcoes: OpcoesIniciar): Promise<SalaInfo> {
    let ws: { path: string; id: string };
    if (opcoes.workspaceDir) {
      ws = { path: opcoes.workspaceDir, id: "workspace" };
    } else {
      const info = await this.workspaces.resolver(opcoes.workspaceId);
      ws = { path: info.path, id: info.id };
    }
    if (opcoes.pauta.trim().length === 0) {
      throw new MeetingError('pauta vazia — informe a pauta: opencorp meeting start "<pauta>"');
    }
    const cfg = await this.cfgMeeting(ws.path);
    const participantes = (opcoes.agentes ?? PARTICIPANTES_PADRAO.join(","))
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a.length > 0);
    if (participantes.length === 0) {
      throw new MeetingError("lista de participantes vazia");
    }
    const carregados = new Map<string, AgenteArquivo>();
    for (const p of participantes) {
      try {
        carregados.set(p, await this.agentes.carregar(ws.path, p));
      } catch {
        throw new MeetingError(
          `participante "${p}" não existe no workspace "${ws.id}" — veja "opencorp agent list" ou crie com "opencorp agent create ${p}"`,
        );
      }
    }
    if (participantes.length < 2) {
      throw new MeetingError("uma reunião precisa de pelo menos 2 participantes (--agentes a,b)");
    }

    const moderador = cfg.moderator;
    const moderacao: Moderacao = participantes.includes(moderador) ? "moderador" : "rotacao-fixa";
    const modelo = opcoes.model ?? MODELO_POR_AGENTE;
    const id = opcoes.id ?? gerarIdReuniao();
    eventBus.emit("reuniao-inicio", { reuniao_id: id, pauta: opcoes.pauta.slice(0, 120), participantes });
    const abertura = this.agora();
    await this.registros.garantirCategorias(ws.path);

    const sala: SalaInfo = {
      id,
      pauta: opcoes.pauta.trim(),
      participantes,
      moderator: moderador,
      moderacao,
      modelo,
      max_turnos: cfg.max_turnos,
      turno: 0,
      status: "em-andamento",
      motivo_fim: null,
      criado_em: abertura.toISOString(),
      encerrada_em: null,
      ata: null,
    };
    await this.registros.criar(ws.path, {
      categoria: "chats",
      id,
      descricao: `Reunião: ${sala.pauta}`,
      criadoPor: "opencorp",
      tags: ["reuniao"],
      conteudo: this.cabecalhoTranscript(sala),
      extras: {
        tipo: "reuniao",
        pauta: sala.pauta,
        participantes: sala.participantes,
        moderator: sala.moderator,
        moderacao: sala.moderacao,
        modelo: sala.modelo,
        max_turnos: sala.max_turnos,
        turno: 0,
        status: sala.status,
        motivo_fim: null,
        encerrada_em: null,
        ata: null,
      },
    });
    console.log(
      `[reunião ${id}] aberta — pauta: "${sala.pauta}" · participantes: ${participantes.join(", ")} · moderação: ${moderacao === "moderador" ? `moderador (${moderador})` : "rotação fixa (moderador fora da lista)"} · modelo: ${sala.modelo}`,
    );

    let falante = participantes[0]!;
    let instrucao = "abertura: apresente sua visão sobre a pauta";
    let falhasConsecutivas = 0;
    let statusFinal: StatusReuniao = "encerrada";
    let motivoFim: string | null = null;
    const sigintHandler = () => {
      this.sinalInterrupcao = true;
      console.log("\n[reunião] SIGINT — encerrando após o turno em curso (transcript preservado)...");
    };
    process.on("SIGINT", sigintHandler);

    try {
      while (sala.turno < sala.max_turnos && motivoFim === null) {
        const decorridoMin = (this.agora().getTime() - abertura.getTime()) / 60000;
        if (decorridoMin >= cfg.max_minutes) {
          statusFinal = "encerrada";
          motivoFim = `tempo máximo (${cfg.max_minutes} min) atingido`;
          break;
        }
        if (this.sinalInterrupcao) {
          statusFinal = "encerrada-partial";
          motivoFim = "interrompida pelo humano (SIGINT)";
          break;
        }
        const estadoAtual = await this.lerSala(ws.path, id);
        if (estadoAtual.sala.status !== "em-andamento") {
          statusFinal = estadoAtual.sala.status;
          motivoFim = estadoAtual.sala.motivo_fim ?? "encerrada externamente (meeting end)";
          break;
        }

        if (moderacao === "moderador") {
          const decisao = await this.turnoModerador(ws, sala, instrucao);
          if (decisao.acao === "encerrar") {
            motivoFim = `consenso declarado pelo moderador (${moderador})`;
            break;
          }
          if (
            decisao.acao === "proximo" &&
            decisao.agente !== undefined &&
            participantes.includes(decisao.agente)
          ) {
            falante = decisao.agente;
            instrucao = decisao.instrucao ?? "prossiga com a pauta no seu papel";
          } else {
            falante = participantes[sala.turno % participantes.length]!;
            instrucao = "prossiga com a pauta no seu papel";
            await this.registros.appendConteudo(
              ws.path,
              "chats",
              id,
              `> [sistema] decisão do moderador indecifrável ou participante inválido — fallback para rotação fixa\n`,
            );
          }
        } else {
          falante = participantes[sala.turno % participantes.length]!;
        }

        const pode = await this.budget.podeExecutar(ws.path, falante, {
          per_agent_usd: cfg.per_agent_usd,
        });
        if (!pode.ok) {
          statusFinal = "encerrada";
          motivoFim = `orçamento da reunião esgotado antes do turno de "${falante}" — ${pode.motivo}`;
          break;
        }

        const arquivo = carregados.get(falante)!;
        const transcript = await this.registros.obter(ws.path, "chats", id);
        const prompt = await this.promptParticipante(
          ws.path,
          arquivo,
          sala.pauta,
          instrucao,
          transcript.conteudo ?? "",
        );
        console.log(`[reunião ${id}] turno ${sala.turno + 1}/${sala.max_turnos} — falante: ${falante} · foco: ${instrucao}`);
        const restanteMs = Math.max(30_000, Math.round(cfg.max_minutes * 60_000 - decorridoMin * 60_000));
        let resultado: ResultadoRun;
        try {
          resultado = await this.sessoes.rodar({
            agente: falante,
            ordem: prompt,
            model: sala.modelo === MODELO_POR_AGENTE ? undefined : sala.modelo,
            workspaceDir: ws.path,
            tags: [`reuniao:${id}`],
            timeoutMs: restanteMs,
          });
        } catch (erro) {
          falhasConsecutivas += 1;
          const codigo = (erro as { exitCode?: number }).exitCode;
          await this.registros.appendConteudo(
            ws.path,
            "chats",
            id,
            `## Turno ${sala.turno + 1} — ${falante} (FALHA)\n\n${msg(erro)}\n\n`,
          );
          sala.turno += 1;
          await this.salvarSala(ws.path, sala);
          if (codigo === 4) {
            statusFinal = "encerrada";
            motivoFim = "orçamento esgotado durante a reunião";
            break;
          }
          if (codigo === 5) {
            statusFinal = "encerrada-partial";
            motivoFim = `turno de "${falante}" pendente de HITL — reunião pausada para revisão humana`;
            break;
          }
          if (falhasConsecutivas >= 2) {
            statusFinal = "encerrada-partial";
            motivoFim = "2 falhas consecutivas de turno";
            break;
          }
          console.log(`[reunião ${id}] turno falhou — seguindo com o próximo participante`);
          continue;
        }
        falhasConsecutivas = 0;
        sala.turno += 1;
        await this.registros.appendConteudo(
          ws.path,
          "chats",
          id,
          `## Turno ${sala.turno} — ${falante}\n\n${resultado.captura.trim()}\n\n`,
        );
        await this.salvarSala(ws.path, sala);
        eventBus.emit("reuniao-turno", { reuniao_id: id, turno: sala.turno, falante });
        console.log(
          `[reunião ${id}] fala registrada (exec ${resultado.id} · ${(resultado.duracao_ms ?? 0) / 1000}s · custo estimado US$ ${resultado.custo_usd?.toFixed(6) ?? "?"})`,
        );
        if (this.sinalInterrupcao) {
          statusFinal = "encerrada-partial";
          motivoFim = "interrompida pelo humano (SIGINT)";
          break;
        }
        if (sala.turno >= sala.max_turnos) {
          motivoFim = `max_turnos (${sala.max_turnos}) atingido`;
          break;
        }
        if (moderacao === "rotacao-fixa" || falante === moderador) {
          instrucao = "prossiga com a pauta no seu papel";
        }
      }
      if (motivoFim === null && sala.turno >= sala.max_turnos) {
        motivoFim = `max_turnos (${sala.max_turnos}) atingido`;
      }
    } finally {
      process.off("SIGINT", sigintHandler);
    }

    sala.status = statusFinal;
    sala.motivo_fim = motivoFim ?? "encerrada";
    sala.encerrada_em = new Date().toISOString();
    await this.registros.appendConteudo(
      ws.path,
      "chats",
      id,
      `---\n**Status final: ${sala.status}** — motivo: ${sala.motivo_fim} · turnos: ${sala.turno}/${sala.max_turnos}\n`,
    );
    await this.salvarSala(ws.path, sala);
    console.log(`[reunião ${id}] encerrada (${sala.status}) — ${sala.motivo_fim}`);
    eventBus.emit("reuniao-fim", { reuniao_id: id, status: sala.status, motivo: sala.motivo_fim, turnos: sala.turno });

    await this.gerarAta(ws, sala);
    return sala;
  }

  private turnoModerador(
    ws: { path: string; id: string },
    sala: SalaInfo,
    instrucaoAnterior: string,
  ): Promise<{ acao: "encerrar" | "proximo" | "fallback"; agente?: string; instrucao?: string }> {
    const prompt = [
      "Você é o MODERADOR desta reunião do workspace.",
      "",
      `Pauta: ${sala.pauta}`,
      `Participantes: ${sala.participantes.join(", ")}`,
      `Instrução dada ao falante anterior: ${instrucaoAnterior}`,
      "",
      "Decida quem deve falar agora e com qual foco, ou encerre se houver consenso.",
      "Responda EXATAMENTE com UMA linha no formato:",
      "próximo: <agente-id> — instrução: <foco do turno>",
      "Ou, se houver consenso e a reunião puder terminar, responda apenas:",
      "ENCERRAR",
      "",
      "=== TRANSCRIÇÃO ATÉ AGORA ===",
      "",
    ].join("\n");
    return this.chamarEExtrair(ws, sala, prompt, "(moderação)");
  }

  private async chamarEExtrair(
    ws: { path: string; id: string },
    sala: SalaInfo,
    prompt: string,
    rotulo: string,
  ): Promise<{ acao: "encerrar" | "proximo" | "fallback"; agente?: string; instrucao?: string }> {
    try {
      const r = await this.sessoes.rodar({
        agente: sala.moderator,
        ordem: prompt,
        model: sala.modelo === MODELO_POR_AGENTE ? undefined : sala.modelo,
        workspaceDir: ws.path,
        tags: [`reuniao:${sala.id}`, "moderacao"],
      });
      const decisao = parseDecisaoModerador(r.captura);
      await this.registros.appendConteudo(
        ws.path,
        "chats",
        sala.id,
        `## Moderação — ${sala.moderator} ${rotulo}\n\n${r.captura.trim()}\n\n`,
      );
      if (decisao.tipo === "encerrar") return { acao: "encerrar" };
      if (decisao.tipo === "proximo") return { acao: "proximo", agente: decisao.agente, instrucao: decisao.instrucao };
      return { acao: "fallback" };
    } catch (erro) {
      console.log(`[reunião ${sala.id}] turno de moderação falhou (${msg(erro)}) — fallback para rotação fixa`);
      await this.registros.appendConteudo(
        ws.path,
        "chats",
        sala.id,
        `## Moderação — ${sala.moderator} ${rotulo} (FALHA)\n\n${msg(erro)}\n\n`,
      );
      return { acao: "fallback" };
    }
  }

  private cabecalhoTranscript(sala: SalaInfo): string {
    return [
      `# Reunião ${sala.id}`,
      "",
      `- Pauta: ${sala.pauta}`,
      `- Participantes: ${sala.participantes.join(", ")}`,
      `- Moderador: ${sala.moderator} (moderação: ${sala.moderacao === "moderador" ? "moderador decide" : "rotação fixa — moderador fora da lista"})`,
      `- Modelo: ${sala.modelo}`,
      `- Máximo de turnos: ${sala.max_turnos}`,
      `- Aberta em: ${sala.criado_em}`,
      "",
    ].join("\n");
  }

  private async promptParticipante(
    wsPath: string,
    arquivo: AgenteArquivo,
    pauta: string,
    instrucao: string,
    transcript: string,
  ): Promise<string> {
    const agente = arquivo.frontmatter;
    const memoria = (
      await Promise.all(
        agente.memory.reads.map(async (cat) => {
          const registros = (await this.registros.listar(wsPath, cat)).slice(0, 20);
          const linhas = registros.map((m) => `  - ${cat}/${m.id} — ${m.descricao}`);
          return `- ${cat}: ${linhas.length > 0 ? "\n" + linhas.join("\n") : "(vazia)"}`;
        }),
      )
    ).join("\n");
    return [
      `Você está participando de uma REUNIÃO do workspace como ${agente.role} (${agente.id}).`,
      "",
      arquivo.corpo,
      "",
      "=== REUNIÃO ===",
      `Pauta: ${pauta}`,
      `Instrução para o seu turno: ${instrucao}`,
      "",
      "=== TRANSCRIÇÃO DA REUNIÃO ATÉ AGORA (memória de sessão) ===",
      "",
      transcript,
      "",
      "=== MEMÓRIA PRIVADA — registros que você pode consultar (memory.reads) ===",
      memoria || "- (nenhuma categoria em memory.reads)",
      "Se precisar de detalhes, use as ferramentas do opencode para ler os arquivos em .opencorp/registries/ do workspace (acesso ao fs do workspace — consulte sob demanda, não despeje tudo).",
      "",
      "=== SUA FALA ===",
      "Contribua com a reunião: curto, objetivo, em português. Não repita o que já foi dito; avance a discussão.",
    ].join("\n");
  }

  async listar(wsPath: string): Promise<SalaInfo[]> {
    const metas = await this.registros.listar(wsPath, "chats");
    return metas
      .filter((m) => (m.extras as Record<string, unknown> | undefined)?.tipo === "reuniao")
      .map((m) => this.salaDeMeta(m))
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  }

  async mostrar(wsPath: string, id: string): Promise<{ sala: SalaInfo; transcript: string }> {
    const { sala } = await this.lerSala(wsPath, id);
    const registro = await this.registros.obter(wsPath, "chats", id);
    return { sala, transcript: registro.conteudo ?? "" };
  }

  async encerrar(wsPath: string, id: string, motivo?: string): Promise<SalaInfo> {
    const { sala } = await this.lerSala(wsPath, id);
    if (sala.status !== "em-andamento") {
      throw new MeetingError(`reunião "${id}" não está em andamento (status: ${sala.status})`);
    }
    sala.status = "encerrada-partial";
    sala.motivo_fim = motivo ?? "encerrada pelo humano (meeting end)";
    sala.encerrada_em = new Date().toISOString();
    await this.registros.appendConteudo(
      wsPath,
      "chats",
      id,
      `---\n**Status final: ${sala.status}** — motivo: ${sala.motivo_fim} · turnos: ${sala.turno}/${sala.max_turnos}\n`,
    );
    await this.salvarSala(wsPath, sala);
    await this.gerarAta({ path: wsPath, id: "workspace" }, sala);
    return sala;
  }

  private async gerarAta(ws: { path: string; id: string }, sala: SalaInfo): Promise<void> {
    const data = sala.criado_em.slice(0, 10);
    const arquivoAta = `.opencorp/registries/documentos/atas/ATA-${data}-${sala.id}.md`;
    let transcript = "";
    try {
      transcript = (await this.registros.obter(ws.path, "chats", sala.id)).conteudo ?? "";
    } catch {
      transcript = "";
    }
    let corpoCeo = "";
    try {
      corpoCeo = (await this.agentes.carregar(ws.path, "ceo-documentos")).corpo;
    } catch (erro) {
      sala.ata = "falhou";
      await this.salvarSala(ws.path, sala);
      await this.registros.eventoAuditoria(ws.path, {
        por: "opencorp",
        evento: "ata_falhou",
        resumo: `ata da reunião ${sala.id} não gerada: ceo-documentos ausente no workspace (${msg(erro)})`,
      });
      console.log(`[reunião ${sala.id}] ata não gerada — ceo-documentos ausente`);
      return;
    }
    const ordem = [
      corpoCeo,
      "",
      "TAREFA INTERNA DO SISTEMA: sintetize a ATA da reunião a seguir.",
      `- Escreva o arquivo exatamente neste caminho: ${arquivoAta} (use a ferramenta de escrita; NÃO use bash).`,
      "- Estrutura obrigatória do arquivo:",
      `  # ATA — Reunião ${sala.id}`,
      "  ## Pauta",
      "  ## Participantes",
      "  ## Decisões",
      "  ## Tarefas delegadas",
      "  ## Status da reunião",
      "- Na seção '## Tarefas delegadas', cada tarefa deve ser uma linha no formato exato:",
      "  - @<agente-id>: <tarefa>",
      "- Baseie-se EXCLUSIVAMENTE na transcrição abaixo.",
      "",
      "=== TRANSCRIÇÃO DA REUNIÃO ===",
      "",
      transcript,
    ].join("\n");

    // Rotação de modelos para a ata: se o modelo da reunião (ou o do agente)
    // estiver indisponível, tenta os fallbacks free antes de declarar falha.
    const cfg = await this.cfgMeeting(ws.path);
    const candidatos: (string | undefined)[] = [
      sala.modelo === MODELO_POR_AGENTE ? undefined : sala.modelo,
      ...cfg.ata_model_rotation,
    ];
    const vistos = new Set<string>();
    const modelosTentados = candidatos.filter(m => {
      const k = m ?? "(por-agente)";
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });

    const pathAta = join(ws.path, arquivoAta);
    let recusa: Error | null = null;
    for (const modelo of modelosTentados) {
      try {
        await this.sessoes.rodar({
          agente: "ceo-documentos",
          ordem,
          model: modelo,
          workspaceDir: ws.path,
          pularGuard: true,
          tags: [`reuniao:${sala.id}`, "ata"],
          timeoutMs: 5 * 60_000,
        });
      } catch (erro) {
        const m = msg(erro);
        if (/BudgetManager|SecurityGuard|HITL|bloqueado|recusada/i.test(m)) {
          recusa = erro instanceof Error ? erro : new Error(m);
          break;
        }
        await this.registros.eventoAuditoria(ws.path, {
          por: "opencorp",
          evento: "ata_falhou",
          resumo: `ata da reunião ${sala.id} falhou com modelo ${modelo ?? "(por-agente)"}: ${m}`,
        });
        continue;
      }
      if (existsSync(pathAta)) break;
    }

    if (recusa) {
      sala.ata = "falhou";
      await this.salvarSala(ws.path, sala);
      await this.registros.eventoAuditoria(ws.path, {
        por: "opencorp",
        evento: "ata_falhou",
        resumo: `ata da reunião ${sala.id} falhou: ${msg(recusa)}`,
      });
      console.log(`[reunião ${sala.id}] ata não gerada (${msg(recusa)})`);
      return;
    }

    if (!existsSync(pathAta)) {
      sala.ata = "falhou";
      await this.salvarSala(ws.path, sala);
      await this.registros.eventoAuditoria(ws.path, {
        por: "opencorp",
        evento: "ata_falhou",
        resumo: `o agente não criou o arquivo ${arquivoAta} (modelos tentados: ${modelosTentados.map(m => m ?? "(por-agente)").join(", ")})`,
      });
      console.log(`[reunião ${sala.id}] ata não encontrada em ${arquivoAta}`);
      return;
    }
    sala.ata = arquivoAta;
    await this.salvarSala(ws.path, sala);
    const conteudoAta = await readFile(pathAta, "utf8");
    await this.registros.garantirRegistro(ws.path, {
      categoria: "documentos",
      id: `ata-${data}-${sala.id}`,
      descricao: `ATA da reunião ${sala.id} — ${sala.pauta}`,
      criadoPor: "ceo-documentos",
      tags: ["ata", `reuniao:${sala.id}`],
      conteudo: conteudoAta,
    });
    await this.registros.garantirRegistro(ws.path, {
      categoria: "documentos",
      id: "atas-indice",
      descricao: "índice de atas de reuniões",
      criadoPor: "opencorp",
    });
    await this.registros.appendConteudo(
      ws.path,
      "documentos",
      "atas-indice",
      `- ${data} — ${arquivoAta} (reunião ${sala.id} · status: ${sala.status})\n`,
    );
    for (const m of conteudoAta.matchAll(/^\s*-\s*@([a-z0-9-]+):\s*(.+)$/gmi)) {
      await this.registros.eventoAuditoria(ws.path, {
        por: "opencorp",
        evento: "tarefa_delegada",
        resumo: m[2]!.trim(),
        dono: m[1]!,
        origem: `reuniao:${sala.id}`,
      });
    }
    console.log(`[reunião ${sala.id}] ata gerada em ${arquivoAta} (registro documentos/ata-${data}-${sala.id})`);
  }
}

