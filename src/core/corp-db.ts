import Database from "better-sqlite3";
import { mkdirRecursive } from "../utils/fs-safe.js";
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

export class CorpDb {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirRecursive(dirname(dbPath));
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
      CREATE INDEX IF NOT EXISTS idx_journal_registro ON journal (categoria, registro_id);
    `);
  }

  limpar(): void {
    this.db.exec("DELETE FROM registros; DELETE FROM journal; DELETE FROM sessoes;");
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
