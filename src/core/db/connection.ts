/**
 * @module core/db/connection — Factory de Conexão SQLite Padronizada
 *
 * Garante:
 * - Singleton por caminho absoluto em memória (Map<string, Database>)
 * - PRAGMA journal_mode = WAL (leituras não travam escritas)
 * - PRAGMA foreign_keys = ON (integridade referencial estrita)
 * - PRAGMA busy_timeout = 5000 (elimina SQLITE_BUSY instantâneo esperando liberação de lock)
 * - PRAGMA synchronous = NORMAL (máxima performance no modo WAL com resiliência total a crashes)
 *
 * @see docs/PADRONIZACAO_ARQUITETURAL_OPENCORP.md (Passo 5)
 */

import Database from "better-sqlite3";
import { resolve, dirname } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

export interface DatabaseConnectionOptions {
  readonly?: boolean;
  timeout?: number;
}

const conexoes = new Map<string, Database.Database>();

/**
 * Retorna uma instância ativa do SQLite para o caminho especificado.
 * Conexões para o mesmo caminho absoluto reutilizam a mesma instância do pool in-process.
 */
export function getDatabaseConnection(
  dbPath: string,
  options?: DatabaseConnectionOptions,
): Database.Database {
  const chave = dbPath === ":memory:" ? ":memory:" : resolve(dbPath);

  // Se já existe no cache e a conexão ainda está aberta, reutiliza
  if (conexoes.has(chave)) {
    const existente = conexoes.get(chave)!;
    if (existente.open) {
      return existente;
    }
    conexoes.delete(chave);
  }

  // Cria diretório pai para bancos persistentes em disco
  if (dbPath !== ":memory:") {
    const dir = dirname(chave);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath === ":memory:" ? ":memory:" : chave, {
    readonly: options?.readonly ?? false,
    timeout: options?.timeout ?? 5000,
  });

  // Aplicação estrita dos PRAGMAs padronizados
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  if (!options?.readonly) {
    if (dbPath !== ":memory:") {
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = NORMAL");
    }
  }

  conexoes.set(chave, db);
  return db;
}

/**
 * Fecha uma conexão específica do cache se estiver aberta.
 */
export function fecharConexao(dbPath: string): void {
  const chave = dbPath === ":memory:" ? dbPath : resolve(dbPath);
  const db = conexoes.get(chave);
  if (db) {
    if (db.open) {
      try {
        db.close();
      } catch {}
    }
    conexoes.delete(chave);
  }
}

/**
 * Fecha todas as conexões ativas do pool in-process.
 * Essencial para isolamento de testes e graceful shutdown do servidor.
 */
export function fecharConexoes(): void {
  for (const [, db] of conexoes.entries()) {
    if (db.open) {
      try {
        db.close();
      } catch {}
    }
  }
  conexoes.clear();
}
