import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SubcorpError } from "./errors.js";
import { CATEGORIAS_PADRAO } from "./registry-store.js";
import { writeFileAtomic } from "../utils/fs-safe.js";
import { validarIdAgente } from "../schemas/agent.js";
import { opencorpHome } from "../utils/paths.js";

export type PermissaoSubcorp = "read" | "ask" | "write";

export interface SubcorpEntry {
  id: string;
  source: string;
  permissions: PermissaoSubcorp;
  exposed_agents: string[];
  exposed_registries: string[];
}

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export class SubcorpStore {
  private readonly homeDir: string;
  private readonly projectTemplatesDir: string;

  constructor(opts: { homeDir?: string; projectTemplatesDir?: string } = {}) {
    this.homeDir = opts.homeDir ?? opencorpHome();
    this.projectTemplatesDir =
      opts.projectTemplatesDir ??
      join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates");
  }

  private configPath(wsPath: string): string {
    return join(wsPath, ".opencorp", "config.json");
  }

  private lerBruto(wsPath: string): Record<string, unknown> {
    const path = this.configPath(wsPath);
    if (!existsSync(path)) return {};
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch (erro) {
      throw new SubcorpError(`config.json inválido em ${path}: ${msg(erro)}`, { exitCode: 2 });
    }
  }

  private async gravarBruto(wsPath: string, dados: Record<string, unknown>): Promise<void> {
    await writeFileAtomic(this.configPath(wsPath), `${JSON.stringify(dados, null, 2)}\n`);
  }

  async listar(wsPath: string): Promise<SubcorpEntry[]> {
    const bruto = this.lerBruto(wsPath);
    if (!Array.isArray(bruto.subcorps)) return [];
    return bruto.subcorps as SubcorpEntry[];
  }

  async obter(wsPath: string, id: string): Promise<SubcorpEntry> {
    const entrada = (await this.listar(wsPath)).find((s) => s.id === id);
    if (!entrada) {
      throw new SubcorpError(
        `subcorp "${id}" não encontrado no config do workspace — veja "opencorp subcorp list"`,
      );
    }
    return entrada;
  }

  async adicionar(
    wsPath: string,
    opts: { fonte: string; id: string; perm: PermissaoSubcorp },
  ): Promise<SubcorpEntry> {
    const id = validarIdAgente(opts.id);
    if (!["read", "ask", "write"].includes(opts.perm)) {
      throw new SubcorpError(`permissão inválida: "${opts.perm}" — use read | ask | write`);
    }
    const source = this.resolverSource(opts.fonte);
    const agentes = this.agentesDe(source);
    const dirRegistries = join(source, ".opencorp", "registries");
    const registries = existsSync(dirRegistries)
      ? [...new Set([...readdirSync(dirRegistries, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)])]
      : [...CATEGORIAS_PADRAO];
    if (registries.length === 0) registries.push(...CATEGORIAS_PADRAO);

    const entrada: SubcorpEntry = {
      id,
      source,
      permissions: opts.perm,
      exposed_agents: agentes,
      exposed_registries: registries,
    };
    const bruto = this.lerBruto(wsPath);
    const atuais = Array.isArray(bruto.subcorps) ? (bruto.subcorps as SubcorpEntry[]) : [];
    if (atuais.some((s) => s.id === id)) {
      throw new SubcorpError(`subcorp "${id}" já existe — remova antes ou use outro id`);
    }
    atuais.push(entrada);
    await this.gravarBruto(wsPath, { ...bruto, subcorps: atuais });
    return entrada;
  }

  async remover(wsPath: string, id: string): Promise<SubcorpEntry> {
    const bruto = this.lerBruto(wsPath);
    const atuais = Array.isArray(bruto.subcorps) ? (bruto.subcorps as SubcorpEntry[]) : [];
    const entrada = atuais.find((s) => s.id === id);
    if (!entrada) {
      throw new SubcorpError(`subcorp "${id}" não encontrado — veja "opencorp subcorp list"`);
    }
    await this.gravarBruto(wsPath, {
      ...bruto,
      subcorps: atuais.filter((s) => s.id !== id),
    });
    return entrada;
  }

  async resolverParaRun(
    wsPathPai: string,
    subcorpId: string,
    agenteId: string,
  ): Promise<{ source: string; agenteId: string }> {
    const entrada = await this.obter(wsPathPai, subcorpId);
    if (entrada.permissions === "read") {
      throw new SubcorpError(
        `bloqueado: subcorp "${subcorpId}" tem permissão "read" — só permite consultar (list/show); use --perm ask para invocar agentes`,
        { exitCode: 3 },
      );
    }
    if (!entrada.exposed_agents.includes(agenteId)) {
      throw new SubcorpError(
        `bloqueado: agente "${agenteId}" não está exposto pelo subcorp "${subcorpId}" (expostos: ${entrada.exposed_agents.join(", ") || "nenhum"})`,
        { exitCode: 3 },
      );
    }
    return { source: entrada.source, agenteId };
  }

  async resolverParaConsulta(
    wsPathPai: string,
    subcorpId: string,
    agenteId: string,
  ): Promise<{ source: string; agenteId: string; entrada: SubcorpEntry }> {
    const entrada = await this.obter(wsPathPai, subcorpId);
    if (!entrada.exposed_agents.includes(agenteId)) {
      throw new SubcorpError(
        `agente "${agenteId}" não está exposto pelo subcorp "${subcorpId}" (expostos: ${entrada.exposed_agents.join(", ") || "nenhum"})`,
      );
    }
    return { source: entrada.source, agenteId, entrada };
  }

  private resolverSource(fonte: string): string {
    let dir: string;
    if (fonte.includes("/") || fonte.includes("\\")) {
      dir = resolve(fonte);
    } else {
      const usuario = join(this.homeDir, ".opencorp", "templates", fonte);
      const projeto = join(this.projectTemplatesDir, fonte);
      dir = existsSync(usuario) ? usuario : projeto;
    }
    if (!existsSync(dir)) {
      throw new SubcorpError(`fonte do subcorp não existe: ${fonte} (${dir})`);
    }
    if (!existsSync(join(dir, ".opencorp", "agents"))) {
      throw new SubcorpError(
        `"${dir}" não é um workspace instanciado (falta .opencorp/agents) — crie um workspace com --template e use o caminho dele`,
      );
    }
    return dir;
  }

  private agentesDe(source: string): string[] {
    const dir = join(source, ".opencorp", "agents");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => basename(f, ".md"))
      .sort();
  }
}
