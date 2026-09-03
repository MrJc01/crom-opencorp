/**
 * SecretsStore — gerencia segredos isolados por workspace com fallback global.
 *
 * Hierarquia:
 *   1. Workspace: <workspace_path>/.opencorp/secrets.json  (maior prioridade)
 *   2. Global:    ~/.opencorp/secrets.json                  (fallback)
 *
 * Valores NUNCA são retornados pela listagem — apenas nomes, tipo_app e origem.
 * O agente obtém os valores efetivos em runtime via env vars injetadas pelo SessionManager.
 */
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { writeFileAtomic } from "../utils/fs-safe.js";
import { tipoDeNomeApp, validarPerfilApp, type TipoApp } from "../schemas/app-perfil.js";

export type SecretOrigem = "global" | "workspace";

export interface SecretInfo {
  nome: string;
  definido: boolean;
  tipo_app: TipoApp | null;
  origem: SecretOrigem;
}

export interface SecretValorInterno {
  valor: string;
  origem: SecretOrigem;
}

function lerJsonSeguro(caminho: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(caminho, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function gravarJson(caminho: string, dados: Record<string, unknown>): Promise<void> {
  const dir = dirname(caminho);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await writeFileAtomic(caminho, `${JSON.stringify(dados, null, 2)}\n`, { mode: 0o600 });
}

export class SecretsStore {
  public readonly homeDir: string;
  private readonly globalPath: string;

  constructor(homeDir: string) {
    this.homeDir = homeDir;
    this.globalPath = join(homeDir, ".opencorp", "secrets.json");
  }

  /** Caminho do secrets.json do workspace */
  private wsPath(wsPath: string): string {
    return join(wsPath, ".opencorp", "secrets.json");
  }

  // ── Listagem (NUNCA retorna valores) ─────────────────────────────────

  /** Lista segredos efetivos para um workspace (merge: workspace ⊕ global) */
  listarMerge(wsPath?: string): SecretInfo[] {
    const globais = lerJsonSeguro(this.globalPath);
    const locais = wsPath ? lerJsonSeguro(this.wsPath(wsPath)) : {};

    const todos = new Map<string, SecretOrigem>();

    // Global primeiro (menor prioridade)
    for (const nome of Object.keys(globais)) {
      todos.set(nome, "global");
    }
    // Workspace sobrescreve
    for (const nome of Object.keys(locais)) {
      todos.set(nome, "workspace");
    }

    return [...todos.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nome, origem]) => ({
        nome,
        definido: true,
        tipo_app: tipoDeNomeApp(nome),
        origem,
      }));
  }

  /** Lista SOMENTE segredos do escopo especificado */
  listarEscopo(escopo: SecretOrigem, wsPath?: string): SecretInfo[] {
    const caminho = escopo === "workspace" && wsPath
      ? this.wsPath(wsPath)
      : this.globalPath;
    const dados = lerJsonSeguro(caminho);
    return Object.keys(dados)
      .sort()
      .map((nome) => ({
        nome,
        definido: true,
        tipo_app: tipoDeNomeApp(nome),
        origem: escopo,
      }));
  }

  // ── Leitura interna (para injeção em env do agente) ──────────────────

  /** Obtém valor efetivo de um secret (workspace > global). Usado internamente pelo SessionManager. */
  obterValor(nome: string, wsPath?: string): SecretValorInterno | null {
    // Workspace primeiro
    if (wsPath) {
      const locais = lerJsonSeguro(this.wsPath(wsPath));
      if (nome in locais && typeof locais[nome] === "string") {
        return { valor: locais[nome] as string, origem: "workspace" };
      }
    }
    // Fallback global
    const globais = lerJsonSeguro(this.globalPath);
    if (nome in globais && typeof globais[nome] === "string") {
      return { valor: globais[nome] as string, origem: "global" };
    }
    return null;
  }

  /** Obtém TODOS os valores efetivos (para injetar env vars no processo do agente). */
  obterTodosValores(wsPath?: string): Record<string, string> {
    const globais = lerJsonSeguro(this.globalPath);
    const locais = wsPath ? lerJsonSeguro(this.wsPath(wsPath)) : {};

    const resultado: Record<string, string> = {};
    // Global primeiro
    for (const [nome, valor] of Object.entries(globais)) {
      if (typeof valor === "string") resultado[nome] = valor;
    }
    // Workspace sobrescreve
    for (const [nome, valor] of Object.entries(locais)) {
      if (typeof valor === "string") resultado[nome] = valor;
    }
    return resultado;
  }

  // ── Escrita ──────────────────────────────────────────────────────────

  /** Define um secret no escopo escolhido. Retorna erro de validação ou null se OK. */
  async definir(
    nome: string,
    valor: string,
    escopo: SecretOrigem,
    wsPath?: string,
  ): Promise<string | null> {
    const erroPerfil = validarPerfilApp(nome, valor);
    if (erroPerfil) return erroPerfil;

    const caminho = escopo === "workspace" && wsPath
      ? this.wsPath(wsPath)
      : this.globalPath;

    const atual = lerJsonSeguro(caminho);
    atual[nome] = valor;
    await gravarJson(caminho, atual);
    return null;
  }

  /** Remove um secret do escopo escolhido. */
  async remover(
    nome: string,
    escopo: SecretOrigem,
    wsPath?: string,
  ): Promise<void> {
    const caminho = escopo === "workspace" && wsPath
      ? this.wsPath(wsPath)
      : this.globalPath;

    const atual = lerJsonSeguro(caminho);
    delete atual[nome];
    await gravarJson(caminho, atual);
  }
}
