import { randomBytes, createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic, mkdirRecursive } from "../utils/fs-safe.js";
import { HookError } from "./errors.js";
import { TaskStore } from "./task-store.js";
import { eventBus } from "./event-bus.js";

export type AlvoHook =
  | { tipo: "task_create"; titulo: string; responsavel?: string }
  | { tipo: "agent_run"; agente: string; ordem: string }
  | { tipo: "flow_run"; flow: string; entrada: string }
  | { tipo: "webhook_out"; url: string; metodo?: string; corpo?: string; headers?: Record<string, string> };

export interface Hook {
  id: string;
  nome: string;
  token: string;
  metodos: string[];
  respond: "imediato" | "final";
  dedup_seg: number;
  ativo: boolean;
  alvo: AlvoHook;
  workspace: string;
  criado_em: string;
}

export interface PayloadHook {
  corpo: Record<string, unknown>;
  query: Record<string, string>;
}

export interface ExecutoresHook {
  agentRun?: (agente: string, ordem: string, wsPath: string) => Promise<{ id: string; captura?: string }>;
  flowRun?: (flow: string, entrada: string, wsPath: string) => Promise<{ id: string; captura?: string }>;
}

export interface OpcoesHookStore {
  agora?: () => Date;
  executores?: ExecutoresHook;
}

interface TriggerDef {
  id: string;
  quando: { evento: string };
  filtro?: { campo: string; valor: string };
  alvo: AlvoHook;
  workspace?: string;
}

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/** Substitui {{caminho.ponto}} pelo valor no payload; {{payload}} = JSON completo */
export function substituirTemplate(texto: string, payload: PayloadHook): string {
  const get = (caminho: string): string => {
    if (caminho === "payload") return JSON.stringify(payload.corpo);
    let no: unknown = payload.corpo;
    for (const parte of caminho.split(".")) {
      if (no && typeof no === "object" && parte in (no as Record<string, unknown>)) {
        no = (no as Record<string, unknown>)[parte];
      } else {
        const q = payload.query[caminho];
        return q ?? "";
      }
    }
    return no === undefined || no === null ? "" : String(no);
  };
  return texto.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, caminho: string) => get(caminho));
}

export class HookStore {
  private readonly agora: () => Date;
  private readonly executores: ExecutoresHook;
  private readonly ultimosHashes = new Map<string, { hash: string; em: number }>();

  constructor(opcoes: OpcoesHookStore = {}) {
    this.agora = opcoes.agora ?? (() => new Date());
    this.executores = opcoes.executores ?? {};
  }

  dir(wsPath: string): string {
    return join(wsPath, ".opencorp", "hooks");
  }

  caminho(wsPath: string, id: string): string {
    return join(this.dir(wsPath), `${id}.json`);
  }

  private validarAlvo(alvo: AlvoHook): void {
    if (!alvo || typeof alvo !== "object") throw new HookError("alvo obrigatório");
    switch (alvo.tipo) {
      case "task_create":
        if (typeof alvo.titulo !== "string" || alvo.titulo.length === 0) {
          throw new HookError('alvo task_create precisa de --titulo (aceita {{campo}})');
        }
        break;
      case "agent_run":
        if (!alvo.agente) throw new HookError("alvo agent_run precisa de --agente");
        if (!alvo.ordem) throw new HookError("alvo agent_run precisa de --ordem (aceita {{campo}})");
        break;
      case "flow_run":
        if (!alvo.flow) throw new HookError("alvo flow_run precisa de --flow");
        break;
      case "webhook_out":
        if (!alvo.url) throw new HookError("alvo webhook_out precisa de --url");
        break;
      default:
        throw new HookError(`tipo de alvo inválido: ${(alvo as { tipo?: string }).tipo}`);
    }
  }

  async criar(
    wsPath: string,
    workspace: string,
    dados: { nome: string; alvo: AlvoHook; respond?: "imediato" | "final"; dedup_seg?: number; metodos?: string[] },
  ): Promise<Hook> {
    if (dados.nome.trim().length === 0) throw new HookError('nome obrigatório: hook create --nome "..."');
    this.validarAlvo(dados.alvo);
    mkdirRecursive(this.dir(wsPath));
    const hook: Hook = {
      id: `hook-${randomBytes(4).toString("hex")}`,
      nome: dados.nome.trim(),
      token: `hk_${randomBytes(16).toString("hex")}`,
      metodos: dados.metodos ?? ["POST"],
      respond: dados.respond ?? "imediato",
      dedup_seg: dados.dedup_seg ?? 60,
      ativo: true,
      alvo: dados.alvo,
      workspace,
      criado_em: this.agora().toISOString(),
    };
    await writeFileAtomic(this.caminho(wsPath, hook.id), `${JSON.stringify(hook, null, 2)}\n`);
    return hook;
  }

  listar(wsPath: string): Hook[] {
    const dir = this.dir(wsPath);
    if (!existsSync(dir)) return [];
    const saida: Hook[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      try {
        saida.push(JSON.parse(readFileSync(join(dir, f), "utf8")) as Hook);
      } catch {
        continue;
      }
    }
    return saida.sort((a, b) => a.id.localeCompare(b.id));
  }

  obter(wsPath: string, id: string): Hook {
    const path = this.caminho(wsPath, id);
    if (!existsSync(path)) {
      const erro = new HookError(`hook "${id}" não encontrado — veja "opencorp hook list"`);
      (erro as { status?: number }).status = 404;
      throw erro;
    }
    return JSON.parse(readFileSync(path, "utf8")) as Hook;
  }

  async excluir(wsPath: string, id: string): Promise<void> {
    this.obter(wsPath, id);
    const { unlink } = await import("node:fs/promises");
    await unlink(this.caminho(wsPath, id));
  }

  private dedupChave(wsPath: string, id: string): string {
    return `${wsPath}::${id}`;
  }

  private aplicarDedup(wsPath: string, id: string, payload: PayloadHook, janelaSeg: number): void {
    if (janelaSeg <= 0) return;
    const hash = createHash("sha256").update(JSON.stringify(payload.corpo)).digest("hex");
    const chave = this.dedupChave(wsPath, id);
    const anterior = this.ultimosHashes.get(chave);
    const agoraMs = this.agora().getTime();
    if (anterior && anterior.hash === hash && agoraMs - anterior.em < janelaSeg * 1000) {
      const erro = new HookError(`payload duplicado para o hook "${id}" na janela de ${janelaSeg}s`);
      (erro as { status?: number }).status = 409;
      throw erro;
    }
    this.ultimosHashes.set(chave, { hash, em: agoraMs });
  }

  /** Executa o alvo do hook. NÃO aplica dedup nem auth — quem chama decide. */
  async executar(wsPath: string, hook: Hook, payload: PayloadHook): Promise<{ exec_id: string | null; resultado: string }> {
    const alvo = hook.alvo;
    if (alvo.tipo === "task_create") {
      const titulo = substituirTemplate(alvo.titulo, payload);
      const t = await new TaskStore().criar(wsPath, {
        titulo,
        responsavel: alvo.responsavel ? substituirTemplate(alvo.responsavel, payload) : undefined,
      }, `hook:${hook.id}`);
      eventBus.emit("hook.executado", { hook: hook.id, alvo: alvo.tipo, task: t.id });
      return { exec_id: t.id, resultado: `task ${t.id} criada: ${titulo}` };
    }
    if (alvo.tipo === "agent_run") {
      if (!this.executores.agentRun) throw new HookError("execução de agente não disponível neste contexto (use o servidor)");
      const ordem = substituirTemplate(alvo.ordem, payload);
      const r = await this.executores.agentRun(alvo.agente, ordem, wsPath);
      eventBus.emit("hook.executado", { hook: hook.id, alvo: alvo.tipo, exec: r.id });
      return { exec_id: r.id, resultado: r.captura?.trim() ?? "" };
    }
    if (alvo.tipo === "flow_run") {
      if (!this.executores.flowRun) throw new HookError("execução de flow não disponível neste contexto (use o servidor)");
      const entrada = substituirTemplate(alvo.entrada ?? "", payload);
      const r = await this.executores.flowRun(alvo.flow, entrada, wsPath);
      eventBus.emit("hook.executado", { hook: hook.id, alvo: alvo.tipo, exec: r.id });
      return { exec_id: r.id, resultado: r.captura?.trim() ?? "" };
    }
    // webhook_out
    const url = substituirTemplate(alvo.url, payload);
    const metodo = (alvo.metodo ?? "POST").toUpperCase();
    const corpo = alvo.corpo === undefined ? JSON.stringify(payload.corpo) : substituirTemplate(alvo.corpo, payload);
    let ultimoErro: unknown = null;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const resp = await fetch(url, {
          method: metodo,
          headers: { "content-type": "application/json", ...(alvo.headers ?? {}) },
          body: metodo === "GET" || metodo === "HEAD" ? undefined : corpo,
        });
        const texto = (await resp.text()).slice(0, 4096);
        eventBus.emit("hook.executado", { hook: hook.id, alvo: "webhook_out", status: resp.status });
        return { exec_id: null, resultado: `HTTP ${resp.status}: ${texto}` };
      } catch (erro) {
        ultimoErro = erro;
        if (tentativa < 2) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** tentativa));
        }
      }
    }
    throw new HookError(`webhook_out falhou após 3 tentativas: ${msg(ultimoErro)}`);
  }

  /** Disparo completo: dedup + execução (auth é responsabilidade da rota pública). */
  async disparar(wsPath: string, hook: Hook, payload: PayloadHook): Promise<{ exec_id: string | null; resultado: string }> {
    if (!hook.ativo) {
      const inativo = new HookError(`hook "${hook.id}" está inativo`);
      (inativo as { status?: number }).status = 409;
      throw inativo;
    }
    this.aplicarDedup(wsPath, hook.id, payload, hook.dedup_seg);
    eventBus.emit("hook.disparo", { hook: hook.id, workspace: hook.workspace });
    return this.executar(wsPath, hook, payload);
  }
}

// ── Triggers declarativos (evento interno → alvo) ──

export type { TriggerDef };

export class TriggersStore {
  private cache: { triggers: TriggerDef[]; mtime: number } | null = null;

  dir(homeDir: string): string {
    return join(homeDir, ".opencorp", "triggers");
  }

  listar(homeDir: string, forcar = false): TriggerDef[] {
    const dir = this.dir(homeDir);
    if (!existsSync(dir)) return [];
    let mtime = 0;
    try {
      mtime = statSync(dir).mtimeMs;
    } catch {
      mtime = 0;
    }
    if (!forcar && this.cache && this.cache.mtime === mtime) return this.cache.triggers;
    const triggers: TriggerDef[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      try {
        const def = JSON.parse(readFileSync(join(dir, f), "utf8")) as TriggerDef;
        if (def.id && def.quando?.evento && def.alvo) triggers.push(def);
      } catch {
        continue;
      }
    }
    this.cache = { triggers, mtime };
    return triggers;
  }

  /** Avalia um evento contra os triggers; devolve os casados. */
  casar(homeDir: string, evento: string, dados: Record<string, unknown>): TriggerDef[] {
    return this.listar(homeDir, false).filter((t) => {
      if (t.quando.evento !== evento) return false;
      if (t.filtro) {
        const valor = String(dados[t.filtro.campo] ?? "");
        return valor === t.filtro.valor;
      }
      return true;
    });
  }

  async criar(homeDir: string, def: Omit<TriggerDef, "id"> & { id?: string }): Promise<TriggerDef> {
    if (!def.quando?.evento) throw new HookError("trigger precisa de quando.evento");
    this.validarAlvo(def.alvo);
    const completo: TriggerDef = { ...def, id: def.id ?? `trg-${randomBytes(3).toString("hex")}` };
    await mkdirRecursive(this.dir(homeDir));
    await writeFileAtomic(join(this.dir(homeDir), `${completo.id}.json`), `${JSON.stringify(completo, null, 2)}\n`);
    this.cache = null;
    return completo;
  }

  async excluir(homeDir: string, id: string): Promise<void> {
    const { unlink } = await import("node:fs/promises");
    await unlink(join(this.dir(homeDir), `${id}.json`));
    this.cache = null;
  }

  private validarAlvo(alvo: AlvoHook): void {
    if (!alvo?.tipo) throw new HookError("trigger precisa de alvo com tipo");
  }
}
