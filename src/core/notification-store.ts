import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdirRecursive, writeFileAtomic } from "../utils/fs-safe.js";
import { NotificationError } from "./errors.js";
import { eventBus } from "./event-bus.js";

export type TipoNotificacao = "resumo" | "aviso" | "erro" | "info";

export interface AcaoNotificacao {
  label: string;
  tipo?: "link" | "api" | "hitl";
  url?: string;
  endpoint?: string;
  metodo?: "GET" | "POST";
  corpo?: Record<string, unknown>;
}

export interface Notificacao {
  id: string;
  titulo: string;
  corpo: string;
  tipo: TipoNotificacao;
  origem: string;
  lida: boolean;
  criado_em: string;
  atualizado_em?: string;
  acoes?: AcaoNotificacao[];
  repeticoes?: number;
}

export interface EntradaNotificacao {
  titulo: string;
  corpo: string;
  tipo?: TipoNotificacao;
  origem?: string;
  acoes?: AcaoNotificacao[];
}

export interface OpcoesNotificacaoStore {
  agora?: () => Date;
}

const TIPOS: TipoNotificacao[] = ["resumo", "aviso", "erro", "info"];

/** Cap FIFO: mantém as 100 notificações mais recentes por workspace */
export const CAP_NOTIFICACOES = 100;

/** Store de notificações do painel — um JSON por workspace
 *  (`<ws>/.opencorp/notifications.json`, array, cap 100 FIFO, write atômico). */
export class NotificationStore {
  private readonly agora: () => Date;

  constructor(opcoes: OpcoesNotificacaoStore = {}) {
    this.agora = opcoes.agora ?? (() => new Date());
  }

  caminho(wsPath: string): string {
    return join(wsPath, ".opencorp", "notifications.json");
  }

  private ler(wsPath: string): Notificacao[] {
    const path = this.caminho(wsPath);
    if (!existsSync(path)) return [];
    try {
      const dados = JSON.parse(readFileSync(path, "utf8")) as unknown;
      if (!Array.isArray(dados)) return [];
      return dados.filter(
        (n): n is Notificacao =>
          !!n && typeof n === "object" && typeof (n as Notificacao).id === "string",
      );
    } catch {
      return [];
    }
  }

  private async salvar(wsPath: string, lista: Notificacao[]): Promise<void> {
    await mkdirRecursive(join(wsPath, ".opencorp"));
    await writeFileAtomic(this.caminho(wsPath), `${JSON.stringify(lista, null, 2)}\n`);
  }

  /** Lista em ordem cronológica DECRESCENTE (mais recentes primeiro). */
  listar(wsPath: string, opcoes: { apenasNaoLidas?: boolean } = {}): Notificacao[] {
    const lista = this.ler(wsPath);
    const filtradas = opcoes.apenasNaoLidas ? lista.filter((n) => !n.lida) : lista;
    return filtradas.slice().reverse();
  }

  naoLidas(wsPath: string): number {
    return this.ler(wsPath).filter((n) => !n.lida).length;
  }

  async adicionar(wsPath: string, entrada: EntradaNotificacao): Promise<Notificacao> {
    const titulo = String(entrada.titulo ?? "").trim();
    const corpo = String(entrada.corpo ?? "").trim();
    if (!titulo) throw new NotificationError("notificação precisa de título", { status: 422 });
    if (!corpo) throw new NotificationError("notificação precisa de corpo", { status: 422 });
    const tipo = entrada.tipo ?? "info";
    if (!TIPOS.includes(tipo)) {
      throw new NotificationError(`tipo inválido: "${String(tipo)}" — use resumo|aviso|erro|info`, { status: 422 });
    }
    const lista = this.ler(wsPath);
    const agoraStr = this.agora().toISOString();
    const origem = String(entrada.origem ?? "painel");

    // Deduplicação inteligente: Se a última notificação tiver o mesmo título e mesma origem nos últimos 10min
    const repetida = lista.slice(-5).reverse().find((item) => item.titulo === titulo && item.origem === origem);
    if (repetida) {
      repetida.repeticoes = (repetida.repeticoes ?? 1) + 1;
      repetida.corpo = corpo;
      repetida.atualizado_em = agoraStr;
      repetida.lida = false; // Reabre como não lida
      if (entrada.acoes) repetida.acoes = entrada.acoes;
      await this.salvar(wsPath, lista);
      eventBus.emit("notificacao.nova", {
        id: repetida.id,
        titulo: repetida.titulo,
        tipo: repetida.tipo,
        origem: repetida.origem,
        workspace: wsPath,
      });
      return repetida;
    }

    const n: Notificacao = {
      id: `not-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`,
      titulo,
      corpo,
      tipo,
      origem,
      lida: false,
      criado_em: agoraStr,
      ...(entrada.acoes && entrada.acoes.length > 0 ? { acoes: entrada.acoes } : {}),
      repeticoes: 1,
    };
    lista.push(n);
    // FIFO: estourou o cap → descarta as mais antigas
    await this.salvar(wsPath, lista.slice(-CAP_NOTIFICACOES));
    eventBus.emit("notificacao.nova", {
      id: n.id,
      titulo: n.titulo,
      tipo: n.tipo,
      origem: n.origem,
      workspace: wsPath,
    });
    return n;
  }

  async marcarLida(wsPath: string, id: string): Promise<Notificacao> {
    const lista = this.ler(wsPath);
    const n = lista.find((x) => x.id === id);
    if (!n) {
      throw new NotificationError(`notificação "${id}" não encontrada`, { status: 404 });
    }
    if (!n.lida) {
      n.lida = true;
      await this.salvar(wsPath, lista);
    }
    return n;
  }

  /** Marca todas como lidas. @returns quantas foram alteradas. */
  async marcarTodasLidas(wsPath: string): Promise<number> {
    const lista = this.ler(wsPath);
    let marcadas = 0;
    for (const n of lista) {
      if (!n.lida) {
        n.lida = true;
        marcadas++;
      }
    }
    if (marcadas > 0) await this.salvar(wsPath, lista);
    return marcadas;
  }

  async limpar(wsPath: string): Promise<void> {
    await this.salvar(wsPath, []);
  }
}
