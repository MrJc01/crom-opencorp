import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  getDatabaseConnection,
  fecharConexoes,
} from "../../../src/core/db/connection.js";
import {
  SchemaMigrator,
  executarMigracoes,
  type Migration,
} from "../../../src/core/db/migrator.js";

describe("Persistência & Migrator — Factory de Conexão e Schema Migrations", () => {
  let tempDir: string;

  beforeEach(() => {
    fecharConexoes();
    tempDir = mkdtempSync(join(tmpdir(), "opencorp-db-test-"));
  });

  afterEach(() => {
    fecharConexoes();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // ── 1. Pragmas e Factory de Conexão ───────────────────────────────────────

  describe("1. getDatabaseConnection (Connection Factory)", () => {
    it("aplica estritamente os pragmas foreign_keys e busy_timeout", () => {
      const db = getDatabaseConnection(":memory:");

      const fk = db.pragma("foreign_keys", { simple: true });
      expect(fk).toBe(1);

      const timeout = db.pragma("busy_timeout", { simple: true });
      expect(timeout).toBe(5000);
    });

    it("aplica journal_mode = WAL e synchronous = NORMAL em banco em disco", () => {
      const dbPath = join(tempDir, "test-wal.db");
      const db = getDatabaseConnection(dbPath);

      const journal = db.pragma("journal_mode", { simple: true });
      expect(journal).toBe("wal");

      // PRAGMA synchronous = 1 equivale a NORMAL
      const sync = db.pragma("synchronous", { simple: true });
      expect(sync).toBe(1);
    });

    it("reutiliza a mesma instância de conexão para o mesmo arquivo (singleton por path)", () => {
      const dbPath = join(tempDir, "singleton.db");
      const conn1 = getDatabaseConnection(dbPath);
      const conn2 = getDatabaseConnection(dbPath);

      expect(conn1).toBe(conn2);
    });

    it("fecharConexoes fecha todas as instâncias ativas do cache", () => {
      const dbPath = join(tempDir, "fechar.db");
      const conn = getDatabaseConnection(dbPath);
      expect(conn.open).toBe(true);

      fecharConexoes();
      expect(conn.open).toBe(false);
    });
  });

  // ── 2. Execução Sequencial de Migrações ────────────────────────────────────

  describe("2. Execução Sequencial de Migrações", () => {
    it("executa 3 migrações ordenadas por versão e registra em _schema_migrations", () => {
      const db = getDatabaseConnection(join(tempDir, "seq.db"));
      const migrator = new SchemaMigrator();

      const migracoes: Migration[] = [
        {
          version: 1,
          name: "001_cria_autores",
          up: (database) => {
            database.exec(`
              CREATE TABLE autores (
                id INTEGER PRIMARY KEY,
                nome TEXT NOT NULL
              );
            `);
          },
        },
        {
          version: 2,
          name: "002_cria_livros",
          up: (database) => {
            database.exec(`
              CREATE TABLE livros (
                id INTEGER PRIMARY KEY,
                titulo TEXT NOT NULL,
                autor_id INTEGER REFERENCES autores(id) ON DELETE CASCADE
              );
            `);
          },
        },
        {
          version: 3,
          name: "003_adiciona_email_autor",
          up: (database) => {
            database.exec(`
              ALTER TABLE autores ADD COLUMN email TEXT;
            `);
          },
        },
      ];

      // Passa fora de ordem para validar ordenação automática
      const resultado = migrator.executarMigracoes(db, [migracoes[2]!, migracoes[0]!, migracoes[1]!]);

      expect(resultado.aplicadas).toBe(3);
      expect(resultado.versoes).toEqual([1, 2, 3]);

      // Versão atual é 3
      expect(migrator.getVersaoAtual(db)).toBe(3);

      // Valida histórico de migrações
      const historico = migrator.listarVersoesAplicadas(db);
      expect(historico).toHaveLength(3);
      expect(historico[0]!.name).toBe("001_cria_autores");
      expect(historico[1]!.name).toBe("002_cria_livros");
      expect(historico[2]!.name).toBe("003_adiciona_email_autor");

      // Testa integridade das tabelas criadas
      db.prepare("INSERT INTO autores (id, nome, email) VALUES (?, ?, ?)").run(
        1,
        "Machado de Assis",
        "machado@academia.org.br",
      );
      db.prepare("INSERT INTO livros (id, titulo, autor_id) VALUES (?, ?, ?)").run(
        10,
        "Dom Casmurro",
        1,
      );

      const autor = db.prepare("SELECT * FROM autores WHERE id = 1").get() as any;
      expect(autor.nome).toBe("Machado de Assis");
      expect(autor.email).toBe("machado@academia.org.br");

      const livro = db.prepare("SELECT * FROM livros WHERE id = 10").get() as any;
      expect(livro.titulo).toBe("Dom Casmurro");
    });
  });

  // ── 3. Idempotência de Execução ───────────────────────────────────────────

  describe("3. Idempotência", () => {
    it("não reaplica migrações quando executado múltiplas vezes", () => {
      const db = getDatabaseConnection(join(tempDir, "idemp.db"));
      const migrator = new SchemaMigrator();

      let execucoesUp = 0;
      const migracoes: Migration[] = [
        {
          version: 1,
          name: "001_tabela_teste",
          up: (database) => {
            execucoesUp++;
            database.exec("CREATE TABLE teste (id INT);");
          },
        },
      ];

      const res1 = migrator.executarMigracoes(db, migracoes);
      expect(res1.aplicadas).toBe(1);
      expect(res1.versoes).toEqual([1]);
      expect(execucoesUp).toBe(1);

      // Segunda execução consecutiva
      const res2 = migrator.executarMigracoes(db, migracoes);
      expect(res2.aplicadas).toBe(0);
      expect(res2.versoes).toEqual([]);
      expect(execucoesUp).toBe(1); // Função up NÃO foi chamada novamente
      expect(migrator.getVersaoAtual(db)).toBe(1);
    });
  });

  // ── 4. Rollback Transacional em Falhas ─────────────────────────────────────

  describe("4. Rollback Transacional", () => {
    it("reverte atomicamente a migração se a instrução up() falhar", () => {
      const db = getDatabaseConnection(join(tempDir, "rollback.db"));
      const migrator = new SchemaMigrator();

      // Aplica v1 com sucesso
      migrator.executarMigracoes(db, [
        {
          version: 1,
          name: "001_inicial",
          up: (database) => {
            database.exec("CREATE TABLE valida (id INT PRIMARY KEY);");
          },
        },
      ]);

      expect(migrator.getVersaoAtual(db)).toBe(1);

      // Tenta aplicar v2 que falha no meio
      const migracaoComErro: Migration = {
        version: 2,
        name: "002_quebra_proposital",
        up: (database) => {
          database.exec("CREATE TABLE fantasma (id INT PRIMARY KEY);");
          // Erro proposital de sintaxe SQL
          database.exec("SINTAXE TOTALMENTE INVALIDA SQL QUE DEVE FALHAR;");
        },
      };

      expect(() => {
        migrator.executarMigracoes(db, [migracaoComErro]);
      }).toThrow(/Falha ao aplicar migração 2/);

      // Garante que o banco continua na versão 1
      expect(migrator.getVersaoAtual(db)).toBe(1);

      // Garante que a tabela criada antes do erro foi revertida pelo ROLLBACK
      const tabelaFantasma = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fantasma'")
        .get();
      expect(tabelaFantasma).toBeUndefined();

      // Garante que a versão 2 não foi gravada em _schema_migrations
      const aplicadas = migrator.listarVersoesAplicadas(db);
      expect(aplicadas).toHaveLength(1);
      expect(aplicadas[0]!.version).toBe(1);
    });
  });

  // ── 5. Catálogo de Migrações Core ─────────────────────────────────────────

  describe("5. coreMigrations", () => {
    it("aplica com sucesso a migração inicial coreMigrations (001_core_init)", async () => {
      const { coreMigrations } = await import("../../../src/core/db/migrations/index.js");
      const db = getDatabaseConnection(join(tempDir, "core.db"));
      const migrator = new SchemaMigrator();

      const res = migrator.executarMigracoes(db, coreMigrations);
      expect(res.aplicadas).toBeGreaterThanOrEqual(1);
      expect(migrator.getVersaoAtual(db)).toBe(1);

      // Tabelas da Tríade devem existir
      const sessionsTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'")
        .get();
      expect(sessionsTable).toBeDefined();

      const triggersTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'triggers'")
        .get();
      expect(triggersTable).toBeDefined();

      const messagesTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages'")
        .get();
      expect(messagesTable).toBeDefined();
    });
  });
});
