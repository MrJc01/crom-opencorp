/**
 * @module core/db/migrations — Catálogo Central de Migrações Versionadas
 */

import type { Migration } from "../migrator.js";
import { migration001CoreInit } from "./001_core_init.js";

export const coreMigrations: Migration[] = [
  migration001CoreInit,
];

export { migration001CoreInit };
