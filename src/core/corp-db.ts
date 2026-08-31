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
      CREATE INDEX IF NOT EXISTS idx_journal_registro ON journal (categoria, registro_id);
      CREATE INDEX IF NOT EXISTS idx_mensagens_sessao ON mensagens (sessao_id, criado_em);
    `);
  }

  limpar(): void {
    this.db.exec("DELETE FROM registros; DELETE FROM journal; DELETE FROM sessoes; DELETE FROM mensagens;");
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

  listarSessoes(filtro?: { agentePrefixo?: string; limite?: number }): LinhaSessao[] {
    const sql = `SELECT * FROM sessoes ${filtro?.agentePrefixo ? "WHERE agente LIKE ?" : ""}
                 ORDER BY COALESCE(NULLIF(inicio,''), '0000') DESC ${filtro?.limite ? "LIMIT " + Math.floor(filtro.limite) : ""}`;
    const rows = filtro?.agentePrefixo
      ? this.db.prepare(sql).all(filtro.agentePrefixo + "%")
      : this.db.prepare(sql).all();
    return rows as LinhaSessao[];
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
