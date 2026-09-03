import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export interface LinhaRegistro {
  id: string;
  categoria: string;
  descricao: string;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
  tags: string;
  conteudo: string;
}

export interface LinhaEvento {
  registro_id: string;
  categoria: string;
  ts: string;
  por: string;
  evento: string;
  resumo: string;
}

export interface LinhaSessao {
  id: string;
  agente: string;
  modelo: string;
  inicio: string;
  fim: string | null;
  custo_usd: number | null;
  status: string;
}

export interface LinhaMensagem {
  id: string;
  sessao_id: string;
  agente: string;
  role: string;
  conteudo: string;
  criado_em: string | null;
}

/** Linha do ledger unificado de execuções (PLANO-UNIFICACAO) — toda ativação de agente, de qualquer motor. */
export interface LinhaExecucao {
  id: string;
  agente: string;
  modelo: string;
  gatilho_tipo: string;
  gatilho_origem: string;
  status: string;
  inicio: string;
  fim: string | null;
  duracao_ms: number | null;
  custo_usd: number | null;
  exit_code: number | null;
  erro?: string | null;
}

export interface FiltroExecucoes {
  agente?: string;
  gatilho_tipo?: string;
  gatilho_origem?: string;
  status?: string;
  limite?: number;
}

export class CorpDb {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrar();
  }

  static caminho(wsPath: string): string {
    return join(wsPath, ".opencorp", "corp.db");
  }

  private migrar(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS registros (
        id TEXT NOT NULL,
        categoria TEXT NOT NULL,
        descricao TEXT NOT NULL DEFAULT '',
        criado_por TEXT NOT NULL DEFAULT '',
        criado_em TEXT NOT NULL DEFAULT '',
        atualizado_em TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '',
        conteudo TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (categoria, id)
      );
      CREATE TABLE IF NOT EXISTS journal (
        registro_id TEXT NOT NULL,
        categoria TEXT NOT NULL,
        ts TEXT NOT NULL,
        por TEXT NOT NULL,
        evento TEXT NOT NULL,
        resumo TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessoes (
        id TEXT PRIMARY KEY,
        agente TEXT NOT NULL DEFAULT '',
        modelo TEXT NOT NULL DEFAULT '',
        inicio TEXT NOT NULL DEFAULT '',
        fim TEXT,
        custo_usd REAL,
        status TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS mensagens (
        id TEXT PRIMARY KEY,
        sessao_id TEXT NOT NULL,
        agente TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL,
        conteudo TEXT NOT NULL DEFAULT '',
        criado_em TEXT
      );
      CREATE TABLE IF NOT EXISTS execucoes (
        id TEXT PRIMARY KEY,
        agente TEXT NOT NULL DEFAULT '',
        modelo TEXT NOT NULL DEFAULT '',
        gatilho_tipo TEXT NOT NULL DEFAULT 'manual',
        gatilho_origem TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'executando',
        inicio TEXT NOT NULL DEFAULT '',
        fim TEXT,
        duracao_ms INTEGER,
        custo_usd REAL,
        exit_code INTEGER,
        erro TEXT
      );
      try { this.db.exec("ALTER TABLE execucoes ADD COLUMN erro TEXT"); } catch {}
      CREATE INDEX IF NOT EXISTS idx_journal_registro ON journal (categoria, registro_id);
      CREATE INDEX IF NOT EXISTS idx_mensagens_sessao ON mensagens (sessao_id, criado_em);
      CREATE INDEX IF NOT EXISTS idx_execucoes_gatilho ON execucoes (gatilho_tipo, gatilho_origem);
      CREATE INDEX IF NOT EXISTS idx_execucoes_agente ON execucoes (agente, inicio);
    `);
  }

  limpar(): void {
    this.db.exec(
      "DELETE FROM registros; DELETE FROM journal; DELETE FROM sessoes; DELETE FROM mensagens; DELETE FROM execucoes;",
    );
  }

  upsertRegistro(r: LinhaRegistro): void {
    this.db
      .prepare(
        `INSERT INTO registros (id, categoria, descricao, criado_por, criado_em, atualizado_em, tags, conteudo)
         VALUES (@id, @categoria, @descricao, @criado_por, @criado_em, @atualizado_em, @tags, @conteudo)
         ON CONFLICT (categoria, id) DO UPDATE SET
           descricao = excluded.descricao,
           criado_por = excluded.criado_por,
           criado_em = excluded.criado_em,
           atualizado_em = excluded.atualizado_em,
           tags = excluded.tags,
           conteudo = excluded.conteudo`,
      )
      .run(r);
  }

  removerRegistro(categoria: string, id: string): void {
    this.db
      .prepare("DELETE FROM registros WHERE categoria = ? AND id = ?")
      .run(categoria, id);
    this.db
      .prepare("DELETE FROM journal WHERE categoria = ? AND registro_id = ?")
      .run(categoria, id);
  }

  inserirEvento(e: LinhaEvento): void {
    this.db.prepare(
      "INSERT INTO journal (registro_id, categoria, ts, por, evento, resumo) VALUES (@registro_id, @categoria, @ts, @por, @evento, @resumo)",
    ).run(e);
  }

  upsertSessao(s: LinhaSessao): void {
    this.db
      .prepare(
        `INSERT INTO sessoes (id, agente, modelo, inicio, fim, custo_usd, status)
         VALUES (@id, @agente, @modelo, @inicio, @fim, @custo_usd, @status)
         ON CONFLICT (id) DO UPDATE SET
           agente = excluded.agente,
           modelo = excluded.modelo,
           inicio = excluded.inicio,
           fim = excluded.fim,
           custo_usd = excluded.custo_usd,
           status = excluded.status`,
      )
      .run(s);
  }

  inserirMensagem(m: LinhaMensagem): void {
    this.db.prepare(
      `INSERT INTO mensagens (id, sessao_id, agente, role, conteudo, criado_em)
       VALUES (@id, @sessao_id, @agente, @role, @conteudo, @criado_em)
       ON CONFLICT (id) DO NOTHING`,
    ).run(m);
  }

  mensagensDaSessao(sessaoId: string): LinhaMensagem[] {
    return this.db
      .prepare("SELECT * FROM mensagens WHERE sessao_id = ? ORDER BY criado_em, rowid")
      .all(sessaoId) as LinhaMensagem[];
  }

  /** Fallback local: lista sessões gravadas no espelho SQLite (quando opencode está offline) */
  listarSessoesLocal(limite = 30): Array<{ id: string; agente: string; modelo: string; inicio: string; fim: string | null; status: string; titulo_real?: string }> {
    const sessoes = this.db
      .prepare(`SELECT * FROM sessoes ORDER BY inicio DESC LIMIT ?`)
      .all(limite) as Array<{ id: string; agente: string; modelo: string; inicio: string; fim: string | null; status: string }>;
    // Enriquecer com título real (1ª msg do usuário)
    const ids = sessoes.map((s) => s.id);
    if (ids.length) {
      const primeiras = this.primeirasMensagensUsuario(ids);
      const mapa = new Map<string, string>();
      for (const p of primeiras) {
        if (!mapa.has(p.sessao_id)) mapa.set(p.sessao_id, p.conteudo);
      }
      return sessoes.map((s) => ({
        ...s,
        titulo_real: mapa.get(s.id)?.slice(0, 70) || undefined,
      }));
    }
    return sessoes;
  }

  listarSessoes(filtro?: { agentePrefixo?: string; limite?: number }): LinhaSessao[] {
    const sql = `SELECT * FROM sessoes ${filtro?.agentePrefixo ? "WHERE agente LIKE ?" : ""}
                 ORDER BY COALESCE(NULLIF(inicio,''), '0000') DESC ${filtro?.limite ? "LIMIT " + Math.floor(filtro.limite) : ""}`;
    const rows = filtro?.agentePrefixo
      ? this.db.prepare(sql).all(filtro.agentePrefixo + "%")
      : this.db.prepare(sql).all();
    return rows as LinhaSessao[];
  }

  /** Grava/atualiza uma execução no ledger unificado (início: status "executando"; fim: status final). */
  upsertExecucao(e: LinhaExecucao): void {
    this.db
      .prepare(
        `INSERT INTO execucoes (id, agente, modelo, gatilho_tipo, gatilho_origem, status, inicio, fim, duracao_ms, custo_usd, exit_code, erro)
         VALUES (@id, @agente, @modelo, @gatilho_tipo, @gatilho_origem, @status, @inicio, @fim, @duracao_ms, @custo_usd, @exit_code, @erro)
         ON CONFLICT (id) DO UPDATE SET
           agente = excluded.agente,
           modelo = excluded.modelo,
           gatilho_tipo = excluded.gatilho_tipo,
           gatilho_origem = excluded.gatilho_origem,
           status = excluded.status,
           fim = excluded.fim,
           duracao_ms = excluded.duracao_ms,
           custo_usd = excluded.custo_usd,
           exit_code = excluded.exit_code,
           erro = excluded.erro`,
      )
      .run({ ...e, erro: e.erro ?? null });
  }

  /** Atualiza apenas status e fim de uma execução existente */
  atualizarStatusExecucao(id: string, status: string, fim?: string): void {
    try {
      this.db
        .prepare(`UPDATE execucoes SET status = @status, fim = COALESCE(@fim, datetime('now')) WHERE id = @id`)
        .run({ id, status, fim: fim ?? new Date().toISOString() });
    } catch {}
  }

  /** Consulta cross-motor do ledger: "o que rodou, por que rodou (gatilho), como terminou". */
  listarExecucoes(filtro?: FiltroExecucoes): LinhaExecucao[] {
    const condicoes: string[] = [];
    const params: Record<string, string | number> = {};
    if (filtro?.agente) {
      condicoes.push("agente = @agente");
      params.agente = filtro.agente;
    }
    if (filtro?.gatilho_tipo) {
      condicoes.push("gatilho_tipo = @gatilho_tipo");
      params.gatilho_tipo = filtro.gatilho_tipo;
    }
    if (filtro?.gatilho_origem) {
      condicoes.push("gatilho_origem = @gatilho_origem");
      params.gatilho_origem = filtro.gatilho_origem;
    }
    if (filtro?.status) {
      condicoes.push("status = @status");
      params.status = filtro.status;
    }
    const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
    const limite = filtro?.limite ? Math.max(1, Math.floor(filtro.limite)) : 100;
    return this.db
      .prepare(`SELECT * FROM execucoes ${where} ORDER BY COALESCE(NULLIF(inicio,''), '0000') DESC LIMIT ${limite}`)
      .all(params) as LinhaExecucao[];
  }

  /** Primeira mensagem do usuário por sessão (fonte de título real na lista de conversas) */
  primeirasMensagensUsuario(ids: string[]): Array<{ sessao_id: string; conteudo: string; criado_em: string | null }> {
    if (!ids.length) return [];
    const ph = ids.map(() => "?").join(",");
    return this.db
      .prepare(
        `SELECT sessao_id, conteudo, criado_em FROM mensagens
         WHERE role = 'user' AND sessao_id IN (${ph})
         ORDER BY criado_em ASC, rowid ASC`,
      )
      .all(...ids) as Array<{ sessao_id: string; conteudo: string; criado_em: string | null }>;
  }

  buscar(termo: string): { categoria: string; id: string; descricao: string }[] {
    const padrao = `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return this.db
      .prepare(
        `SELECT categoria, id, descricao FROM registros
         WHERE descricao LIKE @padrao ESCAPE '\\'
            OR conteudo LIKE @padrao ESCAPE '\\'
            OR tags LIKE @padrao ESCAPE '\\'
         ORDER BY categoria, id`,
      )
      .all({ padrao }) as { categoria: string; id: string; descricao: string }[];
  }

  fechar(): void {
    this.db.close();
  }
}
