/**
 * Migração 001: Inicialização do Schema Consolidado OpenCorp
 *
 * Cria todas as tabelas, índices e views compatíveis da Tríade OpenCorp:
 * Trigger -> Flow -> Session -> Message -> Span -> Tasks -> Notifications
 */

import type Database from "better-sqlite3";
import type { Migration } from "../migrator.js";
import { SCHEMA_CONSOLIDADO_DDL } from "../schema.js";

export const migration001CoreInit: Migration = {
  version: 1,
  name: "001_core_init",
  up: (db: Database.Database): void => {
    db.exec(SCHEMA_CONSOLIDADO_DDL);
  },
};
