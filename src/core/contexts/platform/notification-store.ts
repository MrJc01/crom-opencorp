/**
 * NotificationStore: Camada de Negócio de Notificações sobre OpencorpDb
 *
 * Persiste notificações no banco consolidado `opencorp.db` gerenciado pelo OpencorpDb,
 * garantindo integridade ACID, consultas indexadas por workspace/status e mantendo
 * sincronização em disco com o espelho de compatibilidade.
 */

import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { mkdirRecursive, writeFileAtomic } from "../../../utils/fs-safe.js";
import { NotificationError } from "../../errors.js";
import { eventBus } from "../../event-bus.js";
import { OpencorpDb } from "../../db/opencorp-db.js";
import type { NotificationRow } from "../../db/schema.js";

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

export class NotificationStore {
  private readonly agora: () => Date;

  constructor(opcoes: OpcoesNotificacaoStore = {}) {
    this.agora = opcoes.agora ?? (() => new Date());
  }

  caminho(wsPath: string): string {
    return join(wsPath, ".opencorp", "notifications.json");
  }

  private notificationRowParaNotificacao(r: NotificationRow): Notificacao {
    let acoes: AcaoNotificacao[] | undefined;
    try {
      const parsed = JSON.parse(r.acoes_json);
      if (Array.isArray(parsed) && parsed.length > 0) acoes = parsed;
    } catch {}

    return {
      id: r.id,
      titulo: r.titulo,
      corpo: r.mensagem,
      tipo: r.tipo as TipoNotificacao,
      origem: r.origem || "painel",
      lida: r.lida === 1,
      criado_em: new Date(r.criado_em_ms).toISOString(),
      ...(r.atualizado_em_ms ? { atualizado_em: new Date(r.atualizado_em_ms).toISOString() } : {}),
      ...(acoes ? { acoes } : {}),
      repeticoes: r.repeticoes || 1,
    };
  }

  /**
   * Sincroniza espelho atômico em disco notifications.json para manter compatibilidade
   * com ferramentas externas e testes legados.
   */
  private async sincronizarJson(wsPath: string): Promise<void> {
    const db = OpencorpDb.obter(wsPath);
    const rows = db.listarNotificacoes(db.wsId, { limite: CAP_NOTIFICACOES });
    const lista = rows.map((r) => this.notificationRowParaNotificacao(r)).reverse();
    await mkdirRecursive(join(wsPath, ".opencorp"));
    await writeFileAtomic(this.caminho(wsPath), `${JSON.stringify(lista, null, 2)}\n`);
  }

  /** Lista em ordem cronológica DECRESCENTE (mais recentes primeiro). */
  listar(wsPath: string, opcoes: { apenasNaoLidas?: boolean } = {}): Notificacao[] {
    const db = OpencorpDb.obter(wsPath);
    const rows = db.listarNotificacoes(db.wsId, {
      apenasNaoLidas: opcoes.apenasNaoLidas,
      limite: CAP_NOTIFICACOES,
    });
    return rows.map((r) => this.notificationRowParaNotificacao(r));
  }

  naoLidas(wsPath: string): number {
    const db = OpencorpDb.obter(wsPath);
    return db.contarNotificacoes(db.wsId, true);
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

    const db = OpencorpDb.obter(wsPath);
    const agora = this.agora();
    const agoraMs = agora.getTime();
    const origem = String(entrada.origem ?? "painel");

    // Deduplicação inteligente: Se a última notificação tiver o mesmo título e mesma origem
    const repetida = db.buscarNotificacaoRecente(db.wsId, titulo, origem);
    if (repetida) {
      const novasRepeticoes = (repetida.repeticoes ?? 1) + 1;
      const acoesJson = entrada.acoes && entrada.acoes.length > 0 ? JSON.stringify(entrada.acoes) : repetida.acoes_json;

      db.atualizarNotificacao(repetida.id, {
        mensagem: corpo,
        origem,
        lida: 0, // Reabre como não lida
        acoes_json: acoesJson,
        repeticoes: novasRepeticoes,
        atualizado_em_ms: agoraMs,
      });

      await this.sincronizarJson(wsPath);

      eventBus.emit("notificacao.nova", {
        id: repetida.id,
        titulo: repetida.titulo,
        tipo: repetida.tipo,
        origem: repetida.origem,
        workspace: wsPath,
      });

      const atualizada = db.obterNotificacao(repetida.id)!;
      return this.notificationRowParaNotificacao(atualizada);
    }

    const id = `not-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
    const row = db.inserirNotificacao(
      {
        id,
        workspace: db.wsId,
        tipo,
        titulo,
        mensagem: corpo,
        origem,
        lida: false,
        acoes: (entrada.acoes as unknown as Array<Record<string, unknown>>) ?? [],
        repeticoes: 1,
        criado_em_ms: agoraMs,
      },
      CAP_NOTIFICACOES,
    );

    await this.sincronizarJson(wsPath);

    eventBus.emit("notificacao.nova", {
      id: row.id,
      titulo: row.titulo,
      tipo: row.tipo,
      origem: row.origem,
      workspace: wsPath,
    });

    return this.notificationRowParaNotificacao(row);
  }

  async marcarLida(wsPath: string, id: string): Promise<Notificacao> {
    const db = OpencorpDb.obter(wsPath);
    const n = db.obterNotificacao(id);
    if (!n) {
      throw new NotificationError(`notificação "${id}" não encontrada`, { status: 404 });
    }
    if (n.lida === 0) {
      db.marcarNotificacaoComoLida(id);
      await this.sincronizarJson(wsPath);
    }
    const atualizada = db.obterNotificacao(id)!;
    return this.notificationRowParaNotificacao(atualizada);
  }

  /** Marca todas como lidas. @returns quantas foram alteradas. */
  async marcarTodasLidas(wsPath: string): Promise<number> {
    const db = OpencorpDb.obter(wsPath);
    const alteradas = db.marcarTodasNotificacoesLidas(db.wsId);
    if (alteradas > 0) {
      await this.sincronizarJson(wsPath);
    }
    return alteradas;
  }

  async limpar(wsPath: string): Promise<void> {
    const db = OpencorpDb.obter(wsPath);
    db.limparNotificacoes(db.wsId);
    await this.sincronizarJson(wsPath);
  }
}
