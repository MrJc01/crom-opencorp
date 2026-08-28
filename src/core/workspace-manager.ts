import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { AgentStore, type AgenteResumo } from "./agent-store.js";
import { WorkspaceError } from "./errors.js";
import { RegistryStore } from "./registry-store.js";
import { SettingsStore } from "./settings-store.js";
import { writeFileAtomic } from "../utils/fs-safe.js";
import { expandTilde, opencorpHome } from "../utils/paths.js";

export { WorkspaceError };

export interface RegistroWorkspace {
  id: string;
  criado_em: string;
}

export interface EstadoWorkspaces {
  version: number;
  ativo: string | null;
  workspaces: RegistroWorkspace[];
}

export interface InfoWorkspace extends RegistroWorkspace {
  path: string;
  ativo: boolean;
  existe: boolean;
}

export interface OrigemValor {
  valor: unknown;
  origem: string;
}

export interface DetalhesWorkspace extends InfoWorkspace {
  agentes: AgenteResumo[];
  orcamento: { daily_usd: OrigemValor; per_agent_usd: OrigemValor };
  seguranca: string | null;
}

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const estadoSchema = z.object({
  version: z.number().int().default(1),
  ativo: z.string().nullable().default(null),
  workspaces: z
    .array(z.object({ id: z.string().min(1), criado_em: z.string().min(1) }))
    .default([]),
});

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export interface ManagerOptions {
  homeDir?: string;
  cwd?: string;
  templatesDir?: string;
  workspacesRoot?: string;
}

export class WorkspaceManager {
  private readonly homeDir: string;
  private readonly cwd: string;
  private readonly templatesDir: string;
  private readonly workspacesRootOverride?: string;
  private readonly store: SettingsStore;
  private readonly agentes: AgentStore;
  private readonly registros = new RegistryStore();

  constructor(opts: ManagerOptions = {}) {
    this.homeDir = opts.homeDir ?? opencorpHome();
    this.cwd = opts.cwd ?? process.cwd();
    this.templatesDir =
      opts.templatesDir ??
      join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates");
    this.workspacesRootOverride = opts.workspacesRoot;
    this.store = new SettingsStore({ homeDir: this.homeDir, cwd: this.cwd });
    this.agentes = new AgentStore({ templatesDir: this.templatesDir });
  }

  estadoPath(): string {
    return join(this.homeDir, ".opencorp", "workspaces.json");
  }

  private async raiz(): Promise<string> {
    if (this.workspacesRootOverride) return this.workspacesRootOverride;
    const r = await this.store.get("paths.workspaces_root");
    return expandTilde(String(r.valor), this.homeDir);
  }

  private async lerEstado(): Promise<EstadoWorkspaces> {
    const p = this.estadoPath();
    if (!existsSync(p)) return { version: 1, ativo: null, workspaces: [] };
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(p, "utf8"));
    } catch (erro) {
      throw new WorkspaceError(`JSON inválido em ${p}: ${msg(erro)}`, { exitCode: 2 });
    }
    const parsed = estadoSchema.safeParse(json);
    if (!parsed.success) {
      const iss = parsed.error.issues[0]!;
      const chave = iss.path.join(".");
      throw new WorkspaceError(
        `estado de workspaces inválido em ${p} → ${chave || "(raiz)"}: ${iss.message}`,
        { exitCode: 2 },
      );
    }
    return parsed.data as EstadoWorkspaces;
  }

  private async gravarEstado(estado: EstadoWorkspaces): Promise<void> {
    await writeFileAtomic(this.estadoPath(), `${JSON.stringify(estado, null, 2)}\n`);
  }

  private infoDe(estado: EstadoWorkspaces, registro: RegistroWorkspace, path: string): InfoWorkspace {
    return {
      ...registro,
      path,
      ativo: estado.ativo === registro.id,
      existe: existsSync(path),
    };
  }

  async listar(): Promise<InfoWorkspace[]> {
    const estado = await this.lerEstado();
    const raiz = await this.raiz();
    return estado.workspaces
      .map((w) => this.infoDe(estado, w, join(raiz, w.id)))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async resolver(id?: string): Promise<InfoWorkspace> {
    const estado = await this.lerEstado();
    let registro: RegistroWorkspace | undefined;
    if (id !== undefined && id.length > 0) {
      registro = estado.workspaces.find((w) => w.id === id);
      if (!registro) {
        throw new WorkspaceError(
          `workspace "${id}" não encontrado — veja "opencorp workspace list" ou crie com "opencorp workspace create ${id}"`,
        );
      }
    } else if (estado.ativo) {
      registro = estado.workspaces.find((w) => w.id === estado.ativo);
      if (!registro) {
        throw new WorkspaceError(
          `workspace ativo "${estado.ativo}" não está mais registrado — use "opencorp use <id>"`,
        );
      }
    } else {
      throw new WorkspaceError(
        'nenhum workspace ativo — use "opencorp use <id>" ou passe --workspace <id>',
      );
    }
    const raiz = await this.raiz();
    return this.infoDe(estado, registro, join(raiz, registro.id));
  }

  async atual(): Promise<InfoWorkspace | null> {
    const estado = await this.lerEstado();
    if (!estado.ativo) return null;
    const registro = estado.workspaces.find((w) => w.id === estado.ativo);
    if (!registro) return null;
    const raiz = await this.raiz();
    return this.infoDe(estado, registro, join(raiz, registro.id));
  }

  async criar(id: string, opts: { template?: string } = {}): Promise<InfoWorkspace> {
    if (!ID_RE.test(id) || id.length > 64) {
      throw new WorkspaceError(
        `id de workspace inválido: "${id}" — use kebab-case (letras minúsculas, números e hífens; ex.: corp-principal, no máximo 64 caracteres)`,
      );
    }
    const template = opts.template ?? "default";
    const templateDir = this.resolverTemplateDir(template);
    const ehPacote =
      existsSync(join(templateDir, "template.json")) || existsSync(join(templateDir, "agents"));
    const skeletonDir = ehPacote ? join(this.templatesDir, "default") : templateDir;
    const estado = await this.lerEstado();
    if (estado.workspaces.some((w) => w.id === id)) {
      throw new WorkspaceError(
        `workspace "${id}" já existe — veja "opencorp workspace list" (ids precisam ser únicos)`,
      );
    }
    const raiz = await this.raiz();
    const destino = join(raiz, id);
    if (existsSync(destino)) {
      throw new WorkspaceError(
        `já existe uma pasta em ${destino} — escolha outro id ou remova a pasta antes`,
      );
    }
    const tmp = join(raiz, `.${id}.tmp-${process.pid}-${randomUUID()}`);
    try {
      mkdirSync(raiz, { recursive: true });
      cpSync(skeletonDir, tmp, { recursive: true });
      renameSync(tmp, destino);
    } catch (erro) {
      rmSync(tmp, { recursive: true, force: true });
      throw new WorkspaceError(`não foi possível criar o workspace "${id}": ${msg(erro)}`);
    }
    const criado_em = new Date().toISOString();
    const ativo = estado.ativo ?? id;
    try {
      if (ehPacote) {
        await this.aplicarPacote(destino, templateDir);
      }
      await this.registros.garantirCategorias(destino);
      await this.registros.reindexar(destino);
      await this.gravarEstado({
        version: 1,
        ativo,
        workspaces: [...estado.workspaces, { id, criado_em }],
      });
    } catch (erro) {
      rmSync(destino, { recursive: true, force: true });
      throw erro;
    }
    return { id, criado_em, path: destino, ativo: ativo === id, existe: true };
  }

  private resolverTemplateDir(template: string): string {
    if (template.includes("/") || template.includes("\\")) {
      const abs = resolve(template);
      if (existsSync(abs) && statSync(abs).isDirectory()) return abs;
      throw new WorkspaceError(`template não encontrado no caminho "${template}" (${abs})`);
    }
    const usuario = join(this.homeDir, ".opencorp", "templates", template);
    const projeto = join(this.templatesDir, template);
    if (existsSync(projeto)) return projeto;
    if (existsSync(usuario)) return usuario;
    const disponiveis = new Set<string>();
    for (const dir of [this.templatesDir, join(this.homeDir, ".opencorp", "templates")]) {
      if (existsSync(dir)) {
        for (const d of readdirSync(dir, { withFileTypes: true })) {
          if (d.isDirectory()) disponiveis.add(d.name);
        }
      }
    }
    throw new WorkspaceError(
      `template "${template}" não encontrado (disponíveis: ${[...disponiveis].sort().join(", ") || "nenhum"})`,
    );
  }

  private async aplicarPacote(destino: string, pkgDir: string): Promise<void> {
    const origemAgents = join(pkgDir, "agents");
    const origemRegistries = join(pkgDir, "registries");
    if (existsSync(origemAgents)) {
      cpSync(origemAgents, join(destino, ".opencorp", "agents"), { recursive: true });
    }
    if (existsSync(origemRegistries)) {
      cpSync(origemRegistries, join(destino, ".opencorp", "registries"), { recursive: true });
    }
    for (const arquivo of ["config.json", "security_policy.json"]) {
      const origem = join(pkgDir, arquivo);
      if (existsSync(origem)) {
        copyFileSync(origem, join(destino, ".opencorp", arquivo));
      }
    }
    await this.agentes.sincronizarTodos(destino);
  }

  async usar(id: string): Promise<InfoWorkspace> {
    const estado = await this.lerEstado();
    const registro = estado.workspaces.find((w) => w.id === id);
    if (!registro) {
      throw new WorkspaceError(
        `workspace "${id}" não encontrado — veja "opencorp workspace list" ou crie com "opencorp workspace create ${id}"`,
      );
    }
    const raiz = await this.raiz();
    const path = join(raiz, registro.id);
    if (!existsSync(path)) {
      throw new WorkspaceError(
        `a pasta do workspace "${id}" não foi encontrada em ${path} — ele pode ter sido movido ou apagado fora do opencorp; recrie ou remova o registro`,
      );
    }
    await this.gravarEstado({ ...estado, ativo: id });
    return this.infoDe({ ...estado, ativo: id }, registro, path);
  }

  async listarAgentes(id?: string): Promise<AgenteResumo[]> {
    const info = await this.resolver(id);
    return this.agentes.listar(info.path);
  }

  async detalhar(id?: string): Promise<DetalhesWorkspace> {
    const info = await this.resolver(id);
    const agentes = await this.listarAgentes(info.id);
    const daily = await this.store.get("budget.daily_usd", { workspaceDir: info.path });
    const perAgent = await this.store.get("budget.per_agent_usd", { workspaceDir: info.path });
    const policyPath = join(info.path, ".opencorp", "security_policy.json");
    let seguranca: string | null = null;
    if (existsSync(policyPath)) {
      try {
        const policy = JSON.parse(readFileSync(policyPath, "utf8")) as { level?: unknown };
        if (typeof policy.level === "string") seguranca = policy.level;
      } catch {
        seguranca = null;
      }
    }
    return {
      ...info,
      agentes,
      orcamento: {
        daily_usd: { valor: daily.valor, origem: daily.origem },
        per_agent_usd: { valor: perAgent.valor, origem: perAgent.origem },
      },
      seguranca,
    };
  }

  async deletar(id: string, opts: { sim?: boolean } = {}): Promise<{ path: string; removidoPasta: boolean; eraAtivo: boolean }> {
    if (!opts.sim) {
      throw new WorkspaceError(
        `exclusão de "${id}" precisa de confirmação — responda ao prompt ou passe -y/--force`,
      );
    }
    const estado = await this.lerEstado();
    const registro = estado.workspaces.find((w) => w.id === id);
    if (!registro) {
      throw new WorkspaceError(
        `workspace "${id}" não encontrado — veja "opencorp workspace list"`,
      );
    }
    const eraAtivo = estado.ativo === id;
    const raiz = await this.raiz();
    const path = join(raiz, id);
    let removidoPasta = false;
    if (existsSync(path)) {
      try {
        rmSync(path, { recursive: true, force: true });
        removidoPasta = true;
      } catch (erro) {
        throw new WorkspaceError(`não foi possível remover a pasta ${path}: ${msg(erro)}`);
      }
    }
    await this.gravarEstado({
      version: 1,
      ativo: eraAtivo ? null : estado.ativo,
      workspaces: estado.workspaces.filter((w) => w.id !== id),
    });
    return { path, removidoPasta, eraAtivo };
  }
}

