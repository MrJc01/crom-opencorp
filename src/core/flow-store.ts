import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { FlowError } from "./errors.js";
import { RegistryStore } from "./registry-store.js";
import { eventBus } from "./event-bus.js";
import { SessionManager, type OpcoesRun, type ResultadoRun } from "./session-manager.js";
import { mkdirRecursive, writeFileAtomic } from "../utils/fs-safe.js";
import { opencorpHome } from "../utils/paths.js";

export const nosFlowSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "use kebab-case para o id do nó"),
  tipo: z.enum(["manual", "agente", "saida", "condicao", "webhook", "task_create", "registro", "decisao"]),
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
      if (no.tipo === "webhook") {
        if (typeof config.url !== "string" || config.url.length === 0) {
          throw new FlowError(`flow inválido${onde("")}: nó "webhook" "${no.id}" precisa de config.url`);
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
      if (no.tipo === "task_create") {
        if (typeof config.titulo !== "string" || config.titulo.length === 0) {
          throw new FlowError(`flow inválido${onde("")}: nó "task_create" "${no.id}" precisa de config.titulo`);
        }
        const coluna = config.coluna as string | undefined;
        if (coluna !== undefined && !/^[a-z0-9][a-z0-9_-]*$/.test(coluna)) {
          throw new FlowError(`flow inválido${onde("")}: nó "task_create" "${no.id}" — coluna inválida "${coluna}"`);
        }
      }
      if (no.tipo === "registro") {
        const categoria = config.categoria as string | undefined;
        if (typeof categoria !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(categoria)) {
          throw new FlowError(
            `flow inválido${onde("")}: nó "registro" "${no.id}" precisa de config.categoria (ex.: "documentos")`,
          );
        }
        if (config.id !== undefined && typeof config.id !== "string") {
          throw new FlowError(`flow inválido${onde("")}: nó "registro" "${no.id}" — config.id deve ser string`);
        }
      }
      if (no.tipo === "decisao") {
        if (typeof config.agente !== "string" || config.agente.length === 0) {
          throw new FlowError(`flow inválido${onde("")}: nó "decisao" "${no.id}" precisa de config.agente`);
        }
        if (typeof config.pergunta !== "string" || config.pergunta.length === 0) {
          throw new FlowError(`flow inválido${onde("")}: nó "decisao" "${no.id}" precisa de config.pergunta`);
        }
        const opcoes = config.opcoes;
        if (
          !Array.isArray(opcoes) ||
          opcoes.length < 2 ||
          !opcoes.every((o) => typeof (o as { rotulo?: unknown }).rotulo === "string" && typeof (o as { proximo?: unknown }).proximo === "string")
        ) {
          throw new FlowError(
            `flow inválido${onde("")}: nó "decisao" "${no.id}" precisa de config.opcoes = [{rotulo, proximo}] (≥2)`,
          );
        }
        for (const o of opcoes as { rotulo: string; proximo: string }[]) {
          if (!porId.has(o.proximo)) {
            throw new FlowError(
              `flow inválido${onde("")}: nó "decisao" "${no.id}" → opção "${o.rotulo}" aponta para nó inexistente "${o.proximo}"`,
            );
          }
        }
      }
    }
    for (const no of flow.nos) {
      if (no.tipo === "condicao" || no.tipo === "decisao") continue;
      const saidas = flow.arestas.filter((a) => a.de === no.id);
      if (saidas.length > 1) {
        throw new FlowError(
          `flow inválido${onde("")}: nó "${no.id}" tem ${saidas.length} arestas de saída — v1 é linear; use um nó "condicao"/"decisao" para ramificar`,
        );
      }
    }
    const adjacentes = new Map<string, string[]>();
    for (const no of flow.nos) {
      const lista: string[] = flow.arestas.filter((a) => a.de === no.id).map((a) => a.para);
      if (no.tipo === "condicao") {
        lista.push((no.config.entao as string) ?? "", (no.config.senao as string) ?? "");
      }
      if (no.tipo === "decisao") {
        for (const o of (no.config.opcoes as { proximo: string }[] | undefined) ?? []) {
          lista.push(o.proximo);
        }
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
    this.validarSemantica(flow, " (salvar)");
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
    opts: { entrada?: string; model?: string; execId?: string } = {},
  ): Promise<{ execId: string; status: "concluido" | "falhou"; nos: NoExecInfo[]; contextoFinal: string }> {
    const flow = await this.obter(wsPath, flowId);
    await this.registros.garantirCategorias(wsPath);
    const entrada = opts.entrada ?? "";
    const execId = opts.execId ?? gerarId("exec");
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
    eventBus.emit("flow-inicio", { flow: flowId, exec_id: execId, entrada });

    let contexto = stripAnsi(entrada);
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
          const config = no.config as { agente: string; ordem: string; resposta_arquivo?: string };
          const ordemBase = config.ordem.replaceAll("{{entrada}}", contexto);
          // contrato de resposta por ARQUIVO: a resposta limpa fica no sandbox
          // (o terminal do agent run carrega transcript/ANSI — não é canal confiável)
          const arquivoResposta = config.resposta_arquivo ?? "";
          const ordem = arquivoResposta
            ? `${ordemBase}\n\n[contrato de resposta] Salve sua resposta final completa em sandbox/${arquivoResposta} e responda no terminal apenas "ok".`
            : ordemBase;
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
            eventBus.emit("flow-no", { flow: flowId, no: no.id, status: "falhou", exec_id: resultado.id });
            await marcarNo(no.id, "falhou", resultado.id);
            throw new FlowError(
              `nó "${no.id}" (agente ${config.agente}) falhou — exec ${resultado.id}, exit ${resultado.exit_code}`,
            );
          }
          let contextoNovo = limparCaptura(resultado.captura ?? "");
          if (arquivoResposta) {
            const caminhoResposta = join(wsPath, "sandbox", arquivoResposta);
            if (existsSync(caminhoResposta)) {
              const doArquivo = readFileSync(caminhoResposta, "utf8").trim();
              if (doArquivo.length > 0) contextoNovo = stripAnsi(doArquivo);
            }
          }
          contexto = contextoNovo;
          eventBus.emit("flow-no", { flow: flowId, no: no.id, status: "ok", exec_id: resultado.id });
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
        } else if (no.tipo === "webhook") {
          const config = no.config as { url: string; metodo?: string; corpo?: string; headers?: Record<string, string> };
          const metodo = (config.metodo ?? "POST").toUpperCase();
          const corpo = metodo === "GET" || metodo === "HEAD" ? undefined : (config.corpo ?? "").replaceAll("{{entrada}}", contexto);
          let resposta = "";
          let ultimoErro: unknown = null;
          let sucesso = false;
          for (let tentativa = 0; tentativa < 3; tentativa++) {
            try {
              const resp = await fetch(config.url, {
                method: metodo,
                headers: { "content-type": "application/json", ...(config.headers ?? {}) },
                body: corpo,
              });
              resposta = (await resp.text()).slice(0, 4096);
              ultimoErro = null;
              sucesso = resp.ok;
              if (!resp.ok) ultimoErro = new FlowError(`HTTP ${resp.status}: ${resposta.slice(0, 120)}`);
              break;
            } catch (erro) {
              ultimoErro = erro;
              if (tentativa < 2) await new Promise((r) => setTimeout(r, 1000 * 2 ** tentativa));
            }
          }
          if (!sucesso) {
            await marcarNo(no.id, "falhou", null);
            throw new FlowError(`nó "${no.id}" (webhook) falhou: ${msg(ultimoErro)}`);
          }
          contexto = resposta;
          eventBus.emit("flow-no", { flow: flowId, no: no.id, status: "ok" });
          await marcarNo(no.id, "ok", null);
        } else if (no.tipo === "condicao") {
          const config = no.config as { chave: string; entao: string; senao: string };
          const casou = contexto.includes(config.chave);
          await marcarNo(no.id, "ok");
          atual = porId(flow, casou ? config.entao : config.senao);
          continue;
        } else if (no.tipo === "task_create") {
          const config = no.config as { titulo: string; descricao?: string; prioridade?: string; responsavel?: string; coluna?: string };
          const { TaskStore } = await import("./task-store.js");
          const board = new TaskStore({ agora: this.agora });
          const prioridade = (config.prioridade === "alta" || config.prioridade === "baixa" ? config.prioridade : "media") as "alta" | "media" | "baixa";
          const tituloInterpolado = stripAnsi(config.titulo.replaceAll("{{entrada}}", contexto));
          // título curto: primeira linha significativa (títulos longos quebram o board)
          const tituloLimpo = tituloInterpolado.length > 90
            ? (tituloInterpolado.split("\n").map((l) => l.trim()).find((l) => l.length > 12) ?? tituloInterpolado).slice(0, 90)
            : tituloInterpolado;
          const task = await board.criar(
            wsPath,
            {
              titulo: tituloLimpo,
              descricao: stripAnsi((config.descricao ?? "").replaceAll("{{entrada}}", contexto)).slice(0, 600),
              prioridade,
              ...(config.responsavel ? { responsavel: config.responsavel } : {}),
              ...(config.coluna ? { coluna: config.coluna } : {}),
            },
            `flow:${flowId}`,
          );
          contexto = `${task.id} — ${task.titulo}`;
          eventBus.emit("flow-no", { flow: flowId, no: no.id, status: "ok", task: task.id });
          await marcarNo(no.id, "ok");
        } else if (no.tipo === "registro") {
          const config = no.config as { categoria: string; id?: string; titulo?: string };
          const categoria = config.categoria;
          const base = (config.id ?? `${flowId}-${no.id}`).replaceAll("{{entrada}}", "").slice(0, 80);
          const ts = this.agora().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
          const registroId = `${base.toLowerCase().replace(/[^a-z0-9._-]/g, "-")}-${ts}`;
          const titulo = (config.titulo ?? `registro do flow "${flowId}"`).replaceAll("{{entrada}}", contexto).slice(0, 140);
          await this.registros.garantirCategorias(wsPath);
          await this.registros.criar(wsPath, {
            categoria,
            id: registroId,
            descricao: titulo,
            criadoPor: `flow:${flowId}`,
            eventoInicial: { evento: "criado", resumo: `registro gerado pelo flow "${flowId}" (nó ${no.id})` },
          });
          await this.registros.appendConteudo(wsPath, categoria, registroId, `${contexto}\n`);
          // anexa o caminho ao contexto — nós seguintes sabem onde ficou o registro
          contexto = `${contexto}\n\n[registrado em]: ${categoria}/${registroId}`;
          eventBus.emit("flow-no", { flow: flowId, no: no.id, status: "ok", registro: registroId });
          await marcarNo(no.id, "ok");
        } else if (no.tipo === "decisao") {
          const config = no.config as { agente: string; pergunta: string; opcoes: { rotulo: string; proximo: string }[] };
          const rotulos = config.opcoes.map((o) => o.rotulo);
          const ordem = `${config.pergunta.replaceAll("{{entrada}}", contexto)}

[contexto]
${contexto.slice(0, 2000)}

[contrato — RÍGIDO]
Responda APENAS uma linha com o rótulo exato da sua decisão, sem nada além dele. Rótulos válidos (copie literal, sem aspas):
${rotulos.map((r) => `- ${r}`).join("\n")}`;
          let escolha: string | null = null;
          try {
            const resultado = await this.sessoes.rodar({
              agente: config.agente,
              ordem,
              model: opts.model,
              workspaceDir: wsPath,
              referencias: [execId],
              tipo: "flow-decisao",
              tags: [`flow:${flowId}`, `no:${no.id}`, "decisao"],
            });
            if (resultado.exit_code !== 0) {
              throw new FlowError(`exit ${resultado.exit_code}`);
            }
            const captura = limparCaptura(resultado.captura ?? "");
            escolha = rotulos.find((r) => captura.includes(r)) ?? null;
          } catch (erro) {
            await marcarNo(no.id, "falhou", null);
            throw new FlowError(`nó "${no.id}" (decisao) falhou: ${msg(erro)}`);
          }
          if (!escolha) {
            await marcarNo(no.id, "falhou", null);
            throw new FlowError(
              `nó "${no.id}" (decisao): resposta não correspondeu a nenhum rótulo válido (${rotulos.join(", ")})`,
            );
          }
          const proximo = config.opcoes.find((o) => o.rotulo === escolha)!.proximo;
          // decisão ANEXA ao contexto (não sobrescreve) — nós seguintes
          // (registro/saída) precisam da substância, não só do rótulo
          contexto = `${contexto}\n\n[decisão (${no.id})]: ${escolha}`;
          eventBus.emit("flow-no", { flow: flowId, no: no.id, status: "ok", decisao: escolha });
          await marcarNo(no.id, "ok");
          atual = porId(flow, proximo);
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

    eventBus.emit("flow-fim", { flow: flowId, exec_id: execId, status, motivo });
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

/** Remove códigos ANSI/escape de terminal (transcripts de exec chegam coloridos) */
function stripAnsi(texto: string): string {
  return texto
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001f]/g, "");
}

/**
 * Limpa a captura de terminal de um `agent run`: remove linhas de status
 * (prompts, setas, erros de tool, rodapés do opencorp) e devolve o corpo
 * textual que o agente produziu — usado como contexto entre nós.
 */
function limparCaptura(texto: string): string {
  const limpas = stripAnsi(texto)
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      if (t.length === 0) return true;
      if (/^(> |✗ |→ |← |\$ |Index:|\[opencorp\]|\[flow |node:|Error:|at |err_|^---$|^\+\+\+$|^@@ )/.test(t)) return false;
      if (/^((Invalid Tool|File not found|The arguments provided)|[0-9]+ \||\.\.\.)/.test(t)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return limpas.length > 0 ? limpas : stripAnsi(texto).trim().slice(0, 2000);
}

function validarIdFlow(id: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 64) {
    throw new FlowError(
      `id de flow inválido: "${id}" — use kebab-case (letras minúsculas, números e hífens; máx 64)`,
    );
  }
  return id;
}
