import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { opencorpHome } from "../../../utils/paths.js";
import { writeFileAtomic } from "../../../utils/fs-safe.js";
import { SettingsStore } from "../../settings-store.js";
import { AgentError } from "../../errors.js";

/**
 * F3-T02 / Fase 4 — prompts.json central.
 *
 * Decisão D1: prompts por workspace em `.opencorp/prompts.json`, isolado por
 * empresa. NÃO puxa o global (`~/.opencorp/prompts.json`) em runtime por padrão —
 * apenas seed na CRIAÇÃO do workspace (ver `semear`). O settings pode ativar o
 * fallback global em runtime (`prompts.fallback_global`, default OFF).
 *
 * Formato do arquivo: `{ "chave": "texto com {{vars}}" }`.
 */

export interface Prompt {
  chave: string;
  texto: string;
}

export interface PromptStoreOptions {
  homeDir?: string;
  cwd?: string;
}

/** Chave de prompt: letras/números com separadores (._-). */
export const CHAVE_PROMPT_RE = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;

const RE_VAR = /\{\{[ \t]*([A-Za-z0-9_.-]+)[ \t]*\}\}/g;
const RE_PROMPT_REF = /\{\{[ \t]*prompt:([A-Za-z0-9._-]+)[ \t]*\}\}/g;

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function ehObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Substitui `{{var}}` pelos valores passados. Variável referenciada mas não
 *  fornecida gera erro legível (nunca deixa o literal `{{var}}` vazar). */
export function interpolarPrompt(texto: string, vars?: Record<string, string>, contexto?: string): string {
  if (!texto || !texto.includes("{{")) return texto;
  const valores = vars ?? {};
  return texto.replace(RE_VAR, (_bruto, nome: string) => {
    if (Object.prototype.hasOwnProperty.call(valores, nome)) {
      return valores[nome]!;
    }
    const rotulo = contexto ? ` do prompt "${contexto}"` : "";
    throw new AgentError(
      `variável "{{${nome}}}" não fornecida${rotulo} — passe { ${nome}: "valor" } em vars`,
    );
  });
}

export class PromptStore {
  private readonly homeDir: string;
  private readonly settings: SettingsStore;

  constructor(opts: PromptStoreOptions = {}) {
    this.homeDir = opts.homeDir ?? opencorpHome();
    this.settings = new SettingsStore({ homeDir: this.homeDir, cwd: opts.cwd ?? process.cwd() });
  }

  /** Caminho do prompts.json do workspace. */
  caminho(wsPath: string): string {
    return join(wsPath, ".opencorp", "prompts.json");
  }

  /** Caminho do prompts.json global (~/.opencorp/prompts.json). */
  caminhoGlobal(): string {
    return join(this.homeDir, ".opencorp", "prompts.json");
  }

  /** Lê somente o prompts.json do workspace (sem fallback). */
  carregar(wsPath: string): Record<string, string> {
    return this.lerArquivo(this.caminho(wsPath));
  }

  /** Lê o prompts.json global (sem fallback). */
  carregarGlobal(): Record<string, string> {
    return this.lerArquivo(this.caminhoGlobal());
  }

  private lerArquivo(path: string): Record<string, string> {
    if (!existsSync(path)) return {};
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(path, "utf8"));
    } catch (erro) {
      throw new AgentError(`JSON inválido em ${path}: ${msg(erro)}`);
    }
    if (!ehObjetoPlano(json)) {
      throw new AgentError(`formato inválido em ${path}: esperado um objeto { "chave": "texto" }`);
    }
    const saida: Record<string, string> = {};
    for (const [chave, valor] of Object.entries(json)) {
      if (typeof valor !== "string") {
        throw new AgentError(`prompt "${chave}" em ${path} deve ser texto (string), não ${typeof valor}`);
      }
      saida[chave] = valor;
    }
    return saida;
  }

  /** Lê `prompts.fallback_global` do settings (workspace + global mesclados). */
  async fallbackAtivo(wsPath: string): Promise<boolean> {
    const r = await this.settings.resolve({ workspaceDir: wsPath });
    return r.settings.prompts.fallback_global === true;
  }

  /** Mapa efetivo: workspace; com fallback ativo, global é a base (workspace vence). */
  async carregarEfetivo(wsPath: string): Promise<Record<string, string>> {
    const local = this.carregar(wsPath);
    if (!(await this.fallbackAtivo(wsPath))) return local;
    return { ...this.carregarGlobal(), ...local };
  }

  async listar(wsPath: string): Promise<Prompt[]> {
    const mapa = await this.carregarEfetivo(wsPath);
    return Object.entries(mapa)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([chave, texto]) => ({ chave, texto }));
  }

  /** Resolve uma chave com interpolação de `{{vars}}`. Chave desconhecida = erro legível. */
  async get(wsPath: string, chave: string, vars?: Record<string, string>): Promise<string> {
    const mapa = await this.carregarEfetivo(wsPath);
    const texto = mapa[chave];
    if (texto === undefined) {
      const fallback = await this.fallbackAtivo(wsPath);
      const onde = fallback
        ? `no workspace (${this.caminho(wsPath)}) nem no global (${this.caminhoGlobal()})`
        : `em ${this.caminho(wsPath)}`;
      throw new AgentError(
        `prompt "${chave}" não encontrado ${onde} — veja "oc prompt listar" ou crie com "oc prompt set ${chave} <texto>"`,
      );
    }
    return interpolarPrompt(texto, vars, chave);
  }

  async set(wsPath: string, chaveBruta: string, texto: string): Promise<void> {
    const chave = this.validarChave(chaveBruta);
    const mapa = this.carregar(wsPath);
    mapa[chave] = texto;
    await this.gravar(wsPath, mapa);
  }

  async remover(wsPath: string, chave: string): Promise<void> {
    const mapa = this.carregar(wsPath);
    if (!(chave in mapa)) {
      throw new AgentError(
        `prompt "${chave}" não encontrado em ${this.caminho(wsPath)} — nada foi removido`,
      );
    }
    delete mapa[chave];
    await this.gravar(wsPath, mapa);
  }

  private validarChave(chaveBruta: string): string {
    const chave = chaveBruta.trim();
    if (chave.length === 0 || !CHAVE_PROMPT_RE.test(chave) || chave.length > 128) {
      throw new AgentError(
        `chave de prompt inválida: "${chaveBruta}" — use letras, números e separadores . _ - (ex.: saudacao-inicial, no máximo 128 caracteres)`,
      );
    }
    return chave;
  }

  private async gravar(wsPath: string, mapa: Record<string, string>): Promise<void> {
    const ordenado: Record<string, string> = {};
    for (const chave of Object.keys(mapa).sort((a, b) => a.localeCompare(b))) {
      ordenado[chave] = mapa[chave]!;
    }
    await writeFileAtomic(this.caminho(wsPath), `${JSON.stringify(ordenado, null, 2)}\n`);
  }

  /**
   * Seed na CRIAÇÃO do workspace (D1): copia `~/.opencorp/prompts.json` para
   * `.opencorp/prompts.json` do workspace se o global existir e o workspace ainda
   * não tiver prompts (não sobrescreve template/pacote). Nunca lança.
   */
  async semear(wsPath: string): Promise<boolean> {
    try {
      const origem = this.caminhoGlobal();
      if (!existsSync(origem)) return false;
      const destino = this.caminho(wsPath);
      if (existsSync(destino)) return false;
      const conteudo = readFileSync(origem, "utf8");
      // valida antes de copiar para não propagar um global corrompido
      JSON.parse(conteudo);
      await writeFileAtomic(destino, conteudo);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve referências `{{prompt:chave}}` num texto (corpo de agente, ordem de nó,
   * etc.). Sem a sintaxe, devolve o texto inalterado (compatibilidade total).
   * A chave é puxada em runtime (respeitando o fallback global) e inserida crua
   * (sem interpolar as variáveis do prompt referenciado).
   */
  async resolverReferencias(wsPath: string, texto: string): Promise<string> {
    if (!texto || !texto.includes("{{prompt:")) return texto;
    let saida = texto;
    for (const m of texto.matchAll(RE_PROMPT_REF)) {
      const chave = m[1]!.trim();
      const resolvido = await this.get(wsPath, chave);
      saida = saida.replace(m[0], resolvido);
    }
    return saida;
  }
}

/**
 * TODO(F3-T02) — ponto de injeção no nó de fluxo (ARQUIVO OCUPADO, não tocar):
 * em `src/core/flow-store.ts`, no ramo `no.tipo === "agente"`, após montar
 * `ordemBase` (a interpolação `{{entrada}}`/`{{$input}}`/`{{$node[...]}}`, em
 * torno da linha ~1076-1103), resolver as referências `{{prompt:chave}}` com:
 *
 *   ordemBase = await new PromptStore({ homeDir: ... }).resolverReferencias(wsPath, ordemBase);
 *
 * O mesmo vale para `config.prompt_sistema` inline (nó ad-hoc F6-T01). Mantenha a
 * compatibilidade: sem `{{prompt:` nada muda. O fluxo já tem `wsPath` no escopo.
 */
