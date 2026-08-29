import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { FlowError } from "./errors.js";
import { RegistryStore } from "./registry-store.js";
import { SessionManager, type OpcoesRun, type ResultadoRun } from "./session-manager.js";
import { mkdirRecursive, writeFileAtomic } from "../utils/fs-safe.js";
import { opencorpHome } from "../utils/paths.js";

export const nosFlowSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "use kebab-case para o id do nó"),
  tipo: z.enum(["manual", "agente", "saida", "condicao"]),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const flowSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "use kebab-case para o id do flow"),
  nome: z.string().min(1),
  nos: z.array(nosFlowSchema).min(1),
  arestas: z
    .array(
      z.object({
        de: z.string().min(1),
        para: z.string().min(1),
      }),
    )
    .default([]),
});

export type NoFlow = z.infer<typeof nosFlowSchema>;
export type Flow = z.infer<typeof flowSchema>;

export interface NoExecInfo {
  id: string;
  tipo: string;
  status: "ok" | "falhou" | "nao-executado";
  exec_id: string | null;
}

export interface SessaoFlow {
  rodar(opcoes: OpcoesRun): Promise<ResultadoRun>;
}

export interface FlowStoreOptions {
  homeDir?: string;
  cwd?: string;
  sessoes?: SessaoFlow;
  agora?: () => Date;
}

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function gerarId(prefixo: string): string {
  return `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export class FlowStore {
  private readonly homeDir: string;
  private readonly sessoes: SessaoFlow;
  private readonly registros = new RegistryStore();
  private readonly agora: () => Date;

  constructor(opts: FlowStoreOptions = {}) {
    this.homeDir = opts.homeDir ?? opencorpHome();
    this.sessoes = opts.sessoes ?? new SessionManager({ homeDir: this.homeDir, cwd: opts.cwd });
    this.agora = opts.agora ?? (() => new Date());
  }

  dir(wsPath: string): string {
    return join(wsPath, ".opencorp", "flows");
  }

  caminho(wsPath: string, id: string): string {
    return join(this.dir(wsPath), `${id}.json`);
  }

  async criar(wsPath: string, idBruto: string, nome: string): Promise<Flow> {
    const id = validarIdFlow(idBruto);
    const destino = this.caminho(wsPath, id);
    if (existsSync(destino)) {
      throw new FlowError(`flow "${id}" já existe (${destino})`);
    }
    if (nome.trim().length === 0) {
      throw new FlowError("nome obrigatório: use --nome \"<nome do flow>\"");
    }
    const flow: Flow = {
      id,
      nome: nome.trim(),
      nos: [{ id: "gatilho", tipo: "manual", config: {} }],
      arestas: [],
    };
    await this.salvar(wsPath, flow);
    return flow;
  }

  async listar(wsPath: string): Promise<{ id: string; nome: string; nos: number; arestas: number }[]> {
    const dir = this.dir(wsPath);
    if (!existsSync(dir)) return [];
    const saida: { id: string; nome: string; nos: number; arestas: number }[] = [];
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        const flow = this.validarTexto(readFileSync(join(dir, f), "utf8"), join(dir, f));
        saida.push({ id: flow.id, nome: flow.nome, nos: flow.nos.length, arestas: flow.arestas.length });
      } catch {
        continue;
      }
    }
    return saida.sort((a, b) => a.id.localeCompare(b.id));
  }

  async obter(wsPath: string, id: string): Promise<Flow> {
    const path = this.caminho(wsPath, id);
    if (!existsSync(path)) {
      throw new FlowError(`flow "${id}" não encontrado — veja "opencorp flow list"`);
    }
    return this.validarTexto(readFileSync(path, "utf8"), path);
  }

  validarTexto(texto: string, origem?: string): Flow {
    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch (erro) {
      throw new FlowError(`JSON inválido${origem ? ` em ${origem}` : ""}: ${msg(erro)}`);
    }
    const parsed = flowSchema.safeParse(json);
    if (!parsed.success) {
      const iss = parsed.error.issues[0]!;
      const campo = iss.path.join(".") || "(raiz)";
      throw new FlowError(`flow inválido${origem ? ` (${origem})` : ""} → campo "${campo}": ${iss.message}`);
    }
    const flow = parsed.data;
    this.validarSemantica(flow, origem);
    return flow;
  }

  private validarSemantica(flow: Flow, origem?: string): void {
    const onde = (_d: string) => (origem ? ` (${origem})` : ` (flow "${flow.id}")`);
    const ids = flow.nos.map((n) => n.id);
    if (new Set(ids).size !== ids.length) {
      throw new FlowError(`flow inválido${onde("")}: ids de nó duplicados`);
    }
    const porId = new Map(flow.nos.map((n) => [n.id, n]));
    for (const a of flow.arestas) {
      if (!porId.has(a.de)) {
        throw new FlowError(`flow inválido${onde("")}: aresta parte de nó inexistente "${a.de}"`);
      }
      if (!porId.has(a.para)) {
        throw new FlowError(`flow inválido${onde("")}: aresta aponta para nó inexistente "${a.para}"`);
      }
    }
    const manuais = flow.nos.filter((n) => n.tipo === "manual");
    if (manuais.length !== 1) {
      throw new FlowError(
        `flow inválido${onde("")}: v1 exige exatamente 1 nó "manual" (gatilho) — encontrados ${manuais.length}`,
      );
    }
    for (const no of flow.nos) {
      const config = (no.config ?? {}) as Record<string, unknown>;
      if (no.tipo === "agente") {
        if (typeof config.agente !== "string" || config.agente.length === 0) {
          throw new FlowError(`flow inválido${onde("")}: nó "agente" "${no.id}" precisa de config.agente`);
        }
        if (typeof config.ordem !== "string" || config.ordem.length === 0) {
          throw new FlowError(`flow inválido${onde("")}: nó "agente" "${no.id}" precisa de config.ordem`);
        }
      }
      if (no.tipo === "saida") {
        const registro = config.registro;
        if (typeof registro !== "string" || registro.split("/").length !== 2 || registro.split("/")[0]!.length === 0 || registro.split("/")[1]!.length === 0) {
          throw new FlowError(
            `flow inválido${onde("")}: nó "saida" "${no.id}" precisa de config.registro no formato "categoria/id" (ex.: "documentos/relatorios")`,
          );
        }
      }
      if (no.tipo === "condicao") {
        for (const campo of ["chave", "entao", "senao"] as const) {
          if (typeof config[campo] !== "string" || (config[campo] as string).length === 0) {
            throw new FlowError(
              `flow inválido${onde("")}: nó "condicao" "${no.id}" precisa de config.${campo}${campo === "chave" ? "" : " (id de nó)"}`,
            );
          }
        }
        for (const campo of ["entao", "senao"] as const) {
          if (!porId.has(config[campo] as string)) {
            throw new FlowError(
              `flow inválido${onde("")}: nó "condicao" "${no.id}" → config.${campo} aponta para nó inexistente "${config[campo]}"`,
            );
          }
        }
      }
    }
    for (const no of flow.nos) {
      if (no.tipo === "condicao") continue;
      const saidas = flow.arestas.filter((a) => a.de === no.id);
      if (saidas.length > 1) {
        throw new FlowError(
          `flow inválido${onde("")}: nó "${no.id}" tem ${saidas.length} arestas de saída — v1 é linear; use um nó "condicao" para ramificar`,
        );
      }
    }
    const adjacentes = new Map<string, string[]>();
    for (const no of flow.nos) {
      const lista: string[] = flow.arestas.filter((a) => a.de === no.id).map((a) => a.para);
      if (no.tipo === "condicao") {
        lista.push((no.config.entao as string) ?? "", (no.config.senao as string) ?? "");
      }
      adjacentes.set(no.id, lista.filter((x) => x.length > 0));
    }
    const emVisita = new Set<string>();
    const visitados = new Set<string>();
    const caminho: string[] = [];
    const dfs = (noId: string): void => {
      if (emVisita.has(noId)) {
        const inicio = caminho.indexOf(noId);
        const ciclo = [...caminho.slice(inicio), noId].join(" → ");
        throw new FlowError(`flow inválido${onde("")}: ciclo detectado — ${ciclo}`);
      }
      if (visitados.has(noId)) return;
      emVisita.add(noId);
      caminho.push(noId);
      for (const prox of adjacentes.get(noId) ?? []) dfs(prox);
      emVisita.delete(noId);
      caminho.pop();
      visitados.add(noId);
    };
    dfs(flow.nos[0]!.id);
  }

  async salvar(wsPath: string, flow: Flow): Promise<void> {
    this.validarTexto(JSON.stringify(flow), `flow "${flow.id}" (salvar)`);
    await mkdirRecursive(this.dir(wsPath));
    await writeFileAtomic(
      this.caminho(wsPath, flow.id),
      `${JSON.stringify(flow, null, 2)}\n`,
    );
  }

  async deletar(wsPath: string, id: string): Promise<void> {
    const path = this.caminho(wsPath, id);
    if (!existsSync(path)) {
      throw new FlowError(`flow "${id}" não encontrado`);
    }
    const { rm } = await import("node:fs/promises");
    await rm(path, { force: true });
  }

  textoAtual(wsPath: string, id: string): string {
    const path = this.caminho(wsPath, id);
    if (!existsSync(path)) {
      throw new FlowError(`flow "${id}" não encontrado`);
    }
    return readFileSync(path, "utf8");
  }

  async executar(
    wsPath: string,
    flowId: string,
    opts: { entrada?: string; model?: string } = {},
  ): Promise<{ execId: string; status: "concluido" | "falhou"; nos: NoExecInfo[]; contextoFinal: string }> {
    const flow = await this.obter(wsPath, flowId);
    await this.registros.garantirCategorias(wsPath);
    const entrada = opts.entrada ?? "";
    const execId = gerarId("exec");
    const nosInfo: NoExecInfo[] = flow.nos.map((n) => ({
      id: n.id,
      tipo: n.tipo,
      status: "nao-executado",
      exec_id: null,
    }));
    const marcarNo = async (noId: string, status: NoExecInfo["status"], exec_id: string | null = null): Promise<void> => {
      const info = nosInfo.find((n) => n.id === noId)!;
      info.status = status;
      info.exec_id = exec_id;
      const meta = await this.registros.lerMeta(wsPath, "execucoes", execId);
      const extras = (meta.extras ?? {}) as Record<string, unknown>;
      extras.nos = nosInfo;
      meta.extras = extras;
      await this.registros.salvarMeta(wsPath, "execucoes", execId, meta);
    };

    await this.registros.criar(wsPath, {
      categoria: "execucoes",
      id: execId,
      descricao: `Flow "${flowId}" (${flow.nome}) — entrada: ${entrada.slice(0, 120)}`,
      criadoPor: `flow:${flowId}`,
      tags: ["flow", `flow:${flowId}`],
      tipo: "flow",
      eventoInicial: {
        evento: "iniciado",
        resumo: `flow ${flowId} · ${flow.nos.length} nó(s) · entrada: ${entrada.slice(0, 120)}`,
      },
      extras: {
        status: "executando",
        tipo: "flow",
        flow: flowId,
        nome: flow.nome,
        entrada,
        nos: nosInfo,
        contexto_final: "",
      },
    });

    let contexto = entrada;
    let atual: NoFlow | undefined = flow.nos.find((n) => n.tipo === "manual");
    let status: "concluido" | "falhou" = "concluido";
    let motivo: string | null = null;
    let noFalha: string | null = null;

    try {
      while (atual) {
        const no = atual;
        if (no.tipo === "manual") {
          contexto = entrada;
          await marcarNo(no.id, "ok");
        } else if (no.tipo === "agente") {
          const config = no.config as { agente: string; ordem: string };
          const ordem = config.ordem.replaceAll("{{entrada}}", contexto);
          let resultado: ResultadoRun;
          try {
            resultado = await this.sessoes.rodar({
              agente: config.agente,
              ordem,
              model: opts.model,
              workspaceDir: wsPath,
              referencias: [execId],
              tipo: "flow-no",
              tags: [`flow:${flowId}`, `no:${no.id}`],
            });
          } catch (erro) {
            await marcarNo(no.id, "falhou", null);
            throw new FlowError(`nó "${no.id}" (agente) falhou: ${msg(erro)}`);
          }
          if (resultado.exit_code !== 0) {
            await marcarNo(no.id, "falhou", resultado.id);
            throw new FlowError(
              `nó "${no.id}" (agente ${config.agente}) falhou — exec ${resultado.id}, exit ${resultado.exit_code}`,
            );
          }
          contexto = resultado.captura?.trim() ?? "";
          await marcarNo(no.id, "ok", resultado.id);
        } else if (no.tipo === "saida") {
          const config = no.config as { registro: string };
          const [categoria, registroId] = config.registro.split("/") as [string, string];
          await this.registros.garantirRegistro(wsPath, {
            categoria,
            id: registroId,
            descricao: `saída do flow "${flowId}" (${flow.nome})`,
            criadoPor: `flow:${flowId}`,
          });
          await this.registros.appendConteudo(
            wsPath,
            categoria,
            registroId,
            `[${this.agora().toISOString()}] contexto do nó de saída:\n${contexto}\n\n`,
          );
          await marcarNo(no.id, "ok");
        } else if (no.tipo === "condicao") {
          const config = no.config as { chave: string; entao: string; senao: string };
          const casou = contexto.includes(config.chave);
          await marcarNo(no.id, "ok");
          atual = porId(flow, casou ? config.entao : config.senao);
          continue;
        }
        const saidas = flow.arestas.filter((a) => a.de === no.id);
        atual = saidas.length > 0 ? porId(flow, saidas[0]!.para) : undefined;
      }
    } catch (erro) {
      status = "falhou";
      motivo = msg(erro);
      if (erro instanceof FlowError) noFalha = null;
    }

    if (motivo !== null) {
      const meta = await this.registros.lerMeta(wsPath, "execucoes", execId);
      const extras = (meta.extras ?? {}) as Record<string, unknown>;
      extras.status = status;
      extras.nos = nosInfo;
      extras.contexto_final = contexto;
      extras.motivo = motivo;
      extras.no_falha = noFalha;
      meta.extras = extras;
      await this.registros.salvarMeta(wsPath, "execucoes", execId, meta);
    } else {
      const meta = await this.registros.lerMeta(wsPath, "execucoes", execId);
      const extras = (meta.extras ?? {}) as Record<string, unknown>;
      extras.status = status;
      extras.nos = nosInfo;
      extras.contexto_final = contexto;
      meta.extras = extras;
      await this.registros.salvarMeta(wsPath, "execucoes", execId, meta);
    }

    await this.registros.garantirRegistro(wsPath, {
      categoria: "flows",
      id: flowId,
      descricao: `execuções do flow "${flowId}" (${flow.nome})`,
      criadoPor: `flow:${flowId}`,
    });
    await this.registros.anexarEvento(wsPath, "flows", flowId, {
      ts: this.agora().toISOString(),
      por: `flow:${flowId}`,
      evento: "execucao",
      exec_id: execId,
      status,
      entrada: entrada.slice(0, 200),
      nos: nosInfo,
      contexto_final: contexto.slice(0, 500),
      motivo,
      resumo: `flow ${flowId} ${status}${motivo ? ` (${motivo})` : ""}`,
    });

    if (status === "falhou") {
      const noAlvo = nosInfo.find((n) => n.status === "falhou");
      throw new FlowError(
        `flow "${flowId}" interrompido no nó "${noAlvo?.id ?? "?"}" (${noAlvo?.tipo ?? "?"}): ${motivo ?? "falha"} — nós seguintes não executaram (exec ${execId})`,
      );
    }
    return { execId, status, nos: nosInfo, contextoFinal: contexto };
  }

  async ultimaExecucao(wsPath: string, flowId: string): Promise<{ execId: string; status: string; nos: NoExecInfo[]; contextoFinal: string; em: string } | null> {
    const registros = await this.registros.listar(wsPath, "execucoes");
    for (const meta of [...registros].sort((a, b) => b.criado_em.localeCompare(a.criado_em))) {
      const extras = (meta.extras ?? {}) as Record<string, unknown>;
      if (extras.tipo !== "flow" || extras.flow !== flowId) continue;
      return {
        execId: meta.id,
        status: String(extras.status ?? "?"),
        nos: (extras.nos as NoExecInfo[]) ?? [],
        contextoFinal: String(extras.contexto_final ?? ""),
        em: meta.atualizado_em,
      };
    }
    return null;
  }
}

function porId(flow: Flow, id: string): NoFlow | undefined {
  return flow.nos.find((n) => n.id === id);
}

function validarIdFlow(id: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 64) {
    throw new FlowError(
      `id de flow inválido: "${id}" — use kebab-case (letras minúsculas, números e hífens; máx 64)`,
    );
  }
  return id;
}
