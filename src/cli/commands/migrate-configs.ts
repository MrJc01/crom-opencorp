import type { Command } from "commander";
import { opencorpHome } from "../../utils/paths.js";
import { WorkspaceManager } from "../../core/contexts/workspace/workspace-manager.js";
import {
  applyMigration,
  listBackups,
  MIGRATE_EXIT,
  MigrationValidationError,
  planMigration,
  rollbackMigration,
  type MigrationChange,
} from "../../core/config/config-migrator.js";
import { readFirstDeprecationNotice } from "../../core/config/run-engine-config.js";
import {
  DEPRECATION_NOT_BEFORE_REMOVAL_AT,
  DEPRECATION_REMOVE_IN_VERSION,
} from "../../core/engines/legacy-config-translator.js";

async function caminhosWorkspaces(homeDir: string, somente?: string): Promise<string[]> {
  const manager = new WorkspaceManager({ homeDir });
  const lista = await manager.listar().catch(() => []);
  return lista.filter((w) => !somente || w.id === somente).map((w) => w.path).filter((p): p is string => Boolean(p));
}

function imprimir(change: MigrationChange): void {
  const acao = change.action === "delete" ? "remover (vai para o backup)" : change.action === "create" ? "criar" : "atualizar";
  console.log(`\n• ${change.path}  [${acao}]`);
  if (change.fields.length) console.log(`  campos: ${change.fields.join(", ")}`);
  for (const t of change.transformations) console.log(`  → ${t}`);
  for (const w of change.warnings) console.log(`  ⚠ ${w}`);
}

export function registerMigrateConfigsCommand(program: Command): void {
  program
    .command("migrate-configs")
    .description("migra configurações legadas (runner.json, campos antigos de agentes) para o formato novo, com backup e rollback")
    .option("--dry-run", "apenas mostra o que mudaria (padrão)")
    .option("--apply", "aplica a migração (cria backup antes)")
    .option("--rollback [backup]", "restaura o backup indicado (padrão: o mais recente)")
    .option("--list-backups", "lista os backups de migração")
    .option("--check", "sai com código 3 se houver migração pendente")
    .option("--workspace <id>", "limita aos agentes de um workspace")
    .option("--json", "saída em JSON")
    .addHelpText(
      "after",
      `\nCódigos de saída: ${MIGRATE_EXIT.OK} ok · ${MIGRATE_EXIT.ERROR} erro · ${MIGRATE_EXIT.INVALID_RESULT} resultado inválido (nada alterado) · ${MIGRATE_EXIT.PENDING} migração pendente (--check) · ${MIGRATE_EXIT.ROLLBACK_FAILED} rollback falhou.\n` +
        `O formato antigo continua aceito até, no mínimo, ${DEPRECATION_NOT_BEFORE_REMOVAL_AT} e a versão ${DEPRECATION_REMOVE_IN_VERSION}.`,
    )
    .action(async (opts: { dryRun?: boolean; apply?: boolean; rollback?: string | boolean; listBackups?: boolean; check?: boolean; workspace?: string; json?: boolean }) => {
      const home = opencorpHome();
      try {
        if (opts.listBackups) {
          const backups = listBackups(home);
          if (opts.json) console.log(JSON.stringify(backups, null, 2));
          else if (backups.length === 0) console.log("Nenhum backup de migração.");
          else for (const b of backups) console.log(`${b.id}  ${b.createdAt}  (${b.entries.length} arquivo(s))`);
          process.exitCode = MIGRATE_EXIT.OK;
          return;
        }
        if (opts.rollback) {
          try {
            const m = await rollbackMigration(home, typeof opts.rollback === "string" ? opts.rollback : undefined);
            if (opts.json) console.log(JSON.stringify({ ok: true, backup: m.id }, null, 2));
            else console.log(`✓ Restaurado a partir de ${m.id} (${m.entries.length} arquivo(s)).`);
            process.exitCode = MIGRATE_EXIT.OK;
          } catch (error) {
            console.error(`erro: ${error instanceof Error ? error.message : String(error)}`);
            process.exitCode = MIGRATE_EXIT.ROLLBACK_FAILED;
          }
          return;
        }
        const workspacePaths = await caminhosWorkspaces(home, opts.workspace);
        if (opts.apply) {
          const r = await applyMigration(home, { workspacePaths });
          if (opts.json) console.log(JSON.stringify({ ok: true, backup: r.backup?.id ?? null, aplicados: r.applied.map((c) => c.path), avisos: r.warnings }, null, 2));
          else if (r.applied.length === 0) console.log("Nada a migrar: as configurações já estão no formato novo.");
          else {
            for (const c of r.applied) imprimir(c);
            console.log(`\n✓ Migração aplicada. Backup: ${r.backup!.id}`);
            console.log(`  Para desfazer: opencorp migrate-configs --rollback ${r.backup!.id}`);
          }
          for (const w of r.warnings) console.log(`⚠ ${w}`);
          process.exitCode = MIGRATE_EXIT.OK;
          return;
        }
        const plan = planMigration(home, { workspacePaths });
        const primeiroAviso = readFirstDeprecationNotice(home);
        if (opts.json) {
          console.log(JSON.stringify({ pendente: plan.pending, primeiroAviso: primeiroAviso ?? null, mudancas: plan.changes.map(({ before, after, ...c }) => ({ ...c, depois: after })), avisos: plan.warnings }, null, 2));
        } else if (!plan.pending) {
          console.log("Nada a migrar: as configurações já estão no formato novo.");
        } else {
          console.log("Prévia da migração (nada foi alterado):");
          for (const c of plan.changes) imprimir(c);
          console.log("\nPara aplicar: opencorp migrate-configs --apply");
        }
        for (const w of plan.warnings) if (!opts.json) console.log(`⚠ ${w}`);
        process.exitCode = opts.check && plan.pending ? MIGRATE_EXIT.PENDING : MIGRATE_EXIT.OK;
      } catch (error) {
        console.error(`erro: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = error instanceof MigrationValidationError ? MIGRATE_EXIT.INVALID_RESULT : MIGRATE_EXIT.ERROR;
      }
    });
}
