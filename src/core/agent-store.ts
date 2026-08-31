import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentSchemaError,
  parseAgenteMd,
  validarIdAgente,
  type Agente,
  type AgenteArquivo,
} from "../schemas/agent.js";
import { AgentError } from "./errors.js";
import { OpenCodeBridge } from "./opencode-bridge.js";
import { RegistryStore } from "./registry-store.js";
import { unlink } from "node:fs/promises";
import { writeFileAtomic } from "../utils/fs-safe.js";
import { agentSchema } from "../schemas/agent.js";

export interface AgenteResumo {
  id: string;
  role: string;
  category: string;
  model: string;
  permissions: string;
  budget_daily_usd: number;
}

export interface EventoAgente {
  evento: "criado" | "clonado" | "modificado";
  agente: string;
  resumo: string;
}

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function linhaFrontmatter(chave: string, valor: string): string {
  return `${chave}: ${valor}\n`;
}

function listaInline(valores: string[]): string {
  return `[${valores.join(", ")}]`;
}

export function serializarFrontmatter(ag: Agente): string {
  let saida = "";
  saida += linhaFrontmatter("id", ag.id);
  saida += linhaFrontmatter("role", ag.role);
  saida += linhaFrontmatter("category", ag.category);
  saida += linhaFrontmatter("model", ag.model);
  if (ag.inherits) saida += linhaFrontmatter("inherits", ag.inherits);
  saida += linhaFrontmatter("tools", listaInline(ag.tools));
  saida += linhaFrontmatter("permissions", ag.permissions);
  saida += "budget:\n";
  saida += `  daily_usd: ${ag.budget.daily_usd.toFixed(2)}\n`;
  saida += `  max_turns: ${ag.budget.max_turns}\n`;
  saida += "memory:\n";
  saida += `  reads: ${listaInline(ag.memory.reads)}\n`;
  saida += `  writes: ${listaInline(ag.memory.writes)}\n`;
  return saida;
}

export function serializarAgenteMd(agente: Agente, corpo: string): string {
  return `---\n${serializarFrontmatter(agente)}---\n\n${corpo.trimStart()}`;
}

export class AgentStore {
  private readonly templatesDir: string;
  private readonly bridge = new OpenCodeBridge();
  private readonly registros = new RegistryStore();

  constructor(opts: { templatesDir?: string } = {}) {
    this.templatesDir =
      opts.templatesDir ??
      join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates");
  }

  dirAgentes(wsPath: string): string {
    return join(wsPath, ".opencorp", "agents");
  }

  caminho(wsPath: string, id: string): string {
    return join(this.dirAgentes(wsPath), `${id}.md`);
  }

  async listar(wsPath: string): Promise<AgenteResumo[]> {
    const dir = this.dirAgentes(wsPath);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const carregado = this.carregarDoArquivo(join(dir, f));
        return resumo(carregado.frontmatter);
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async carregar(wsPath: string, id: string): Promise<AgenteArquivo> {
    return this.carregarDoArquivo(this.caminhoExistente(wsPath, id));
  }

  private caminhoExistente(wsPath: string, id: string): string {
    const path = this.caminho(wsPath, id);
    if (!existsSync(path)) {
      throw new AgentError(
        `agente "${id}" não encontrado em ${this.dirAgentes(wsPath)} — veja "opencorp agent list"`,
      );
    }
    return path;
  }

  private carregarDoArquivo(path: string): AgenteArquivo {
    let conteudo: string;
    try {
      conteudo = readFileSync(path, "utf8");
    } catch (erro) {
      throw new AgentError(`não foi possível ler ${path}: ${msg(erro)}`);
    }
    try {
      return { ...parseAgenteMd(conteudo), path };
    } catch (erro) {
      if (erro instanceof AgentSchemaError) {
        throw new AgentSchemaError(`(${basename(path)}) ${erro.message}`);
      }
      throw erro;
    }
  }

  private resolverOrigem(wsPath: string, id: string): string {
    const noWorkspace = this.caminho(wsPath, id);
    if (existsSync(noWorkspace)) return noWorkspace;
    const noTemplate = join(this.templatesDir, "default", ".opencorp", "agents", `${id}.md`);
    if (existsSync(noTemplate)) return noTemplate;
    throw new AgentError(
      `agente de origem "${id}" não encontrado — procure em ${this.dirAgentes(wsPath)} e em ${dirname(noTemplate)}`,
    );
  }

  async criar(
    wsPath: string,
    idBruto: string,
    opts: { de?: string; model?: string; evento?: "criado" | "clonado" } = {},
  ): Promise<AgenteArquivo> {
    const id = validarIdAgente(idBruto);
    const destino = this.caminho(wsPath, id);
    if (existsSync(destino)) {
      throw new AgentError(
        `agente "${id}" já existe (${destino}) — ids precisam ser únicos no workspace`,
      );
    }
    const de = opts.de ?? "executor-padrao";
    const origem = this.resolverOrigem(wsPath, de);
    const fonte = this.carregarDoArquivo(origem);
    const frontmatter: Agente = {
      ...fonte.frontmatter,
      id,
      model: opts.model ?? fonte.frontmatter.model,
    };
    const conteudo = serializarAgenteMd(frontmatter, fonte.corpo);
    await writeFileAtomic(destino, conteudo);
    await this.bridge.sincronizarAgente(wsPath, frontmatter, fonte.corpo);
    const tipo = opts.evento ?? "criado";
    await this.registrarEvento(wsPath, {
      evento: tipo,
      agente: id,
      resumo: `${tipo} a partir de "${de}"${opts.model ? ` com modelo ${opts.model}` : ""}`,
    });
    return { frontmatter, corpo: fonte.corpo, path: destino };
  }

  async clonar(wsPath: string, origem: string, destinoBruto: string): Promise<AgenteArquivo> {
    const destino = validarIdAgente(destinoBruto);
    if (destino === origem) {
      throw new AgentError(`origem e destino são iguais ("${origem}")`);
    }
    return this.criar(wsPath, destino, { de: origem, evento: "clonado" });
  }

  async preEditar(wsPath: string, id: string): Promise<string> {
    return this.caminhoExistente(wsPath, id);
  }

  /**
   * Edita o frontmatter do agente preservando o prompt (corpo) — PLANO-WEB-CRUD C2.
   * Campos ausentes são preservados. Valida com o agentSchema (zod) antes de gravar,
   * sincroniza o bridge do OpenCode e registra no agentes-log.
   */
  async editar(
    wsPath: string,
    id: string,
    mudancas: {
      role?: string;
      model?: string;
      permissions?: Agente["permissions"];
      tools?: string[];
      budget_daily_usd?: number;
      budget_max_turns?: number;
    },
  ): Promise<Agente> {
    const carregado = await this.carregar(wsPath, id);
    const fundido: Agente = {
      ...carregado.frontmatter,
      role: mudancas.role?.trim() || carregado.frontmatter.role,
      model: mudancas.model?.trim() || carregado.frontmatter.model,
      permissions: mudancas.permissions ?? carregado.frontmatter.permissions,
      tools: mudancas.tools && mudancas.tools.length ? mudancas.tools : carregado.frontmatter.tools,
      budget: {
        ...carregado.frontmatter.budget,
        daily_usd: mudancas.budget_daily_usd ?? carregado.frontmatter.budget.daily_usd,
        max_turns: mudancas.budget_max_turns ?? carregado.frontmatter.budget.max_turns,
      },
    };
    const parsed = agentSchema.safeParse(fundido);
    if (!parsed.success) {
      const detalhe = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new AgentSchemaError(`spec do agente "${id}" inválido — ${detalhe}`);
    }
    const novoMd = serializarAgenteMd(parsed.data, carregado.corpo);
    await writeFileAtomic(this.caminhoExistente(wsPath, id), novoMd);
    await this.bridge.sincronizarAgente(wsPath, parsed.data, carregado.corpo);
    await this.registrarEvento(wsPath, {
      evento: "modificado",
      agente: id,
      resumo: "editado pela web",
    });
    return parsed.data;
  }

  /** Exclui o agente do workspace (e a cópia do bridge do OpenCode) — PLANO-WEB-CRUD C3. */
  async excluir(wsPath: string, id: string): Promise<void> {
    const path = this.caminhoExistente(wsPath, id);
    await unlink(path);
    const copiaBridge = join(wsPath, ".opencorp", "opencode", "agent", `${id}.md`);
    if (existsSync(copiaBridge)) await unlink(copiaBridge).catch(() => undefined);
    await this.registrarEvento(wsPath, {
      evento: "modificado",
      agente: id,
      resumo: "EXCLUÍDO pela web",
    });
  }

  async posEditar(wsPath: string, id: string, mudou: boolean): Promise<void> {
    if (!mudou) return;
    const carregado = await this.carregar(wsPath, id);
    await this.bridge.sincronizarAgente(wsPath, carregado.frontmatter, carregado.corpo);
    await this.registrarEvento(wsPath, {
      evento: "modificado",
      agente: id,
      resumo: "editado via $EDITOR",
    });
  }

  async sincronizarTodos(wsPath: string): Promise<void> {
    for (const resumo of await this.listar(wsPath)) {
      const carregado = await this.carregar(wsPath, resumo.id);
      await this.bridge.sincronizarAgente(wsPath, carregado.frontmatter, carregado.corpo);
    }
  }

  async registrarEvento(wsPath: string, ev: EventoAgente): Promise<void> {
    await this.registros.garantirRegistro(wsPath, {
      categoria: "agentes",
      id: "agentes-log",
      descricao: "histórico de criação e modificação de agentes do workspace",
      criadoPor: "opencorp",
    });
    await this.registros.anexarEvento(wsPath, "agentes", "agentes-log", {
      ts: new Date().toISOString(),
      por: "opencorp",
      ...ev,
    });
  }
}

function resumo(ag: Agente): AgenteResumo {
  return {
    id: ag.id,
    role: ag.role,
    category: ag.category,
    model: ag.model,
    permissions: ag.permissions,
    budget_daily_usd: ag.budget.daily_usd,
  };
}
