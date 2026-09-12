import type { Command } from "commander";
import { AssetStore, KINDS_ASSET, type KindAsset } from "../../core/asset-store.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";

function reportar(erro: unknown): void {
  if (erro instanceof Error) {
    const exitCode = (erro as { exitCode?: number }).exitCode;
    console.error(`erro: ${erro.message}`);
    process.exitCode = exitCode ?? 1;
    return;
  }
  console.error(`erro inesperado: ${String(erro)}`);
  process.exitCode = 1;
}

async function comErros(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (erro) {
    reportar(erro);
  }
}

function dividirLista(bruto: string | undefined): string[] {
  return (bruto ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function registerAssetCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const store = new AssetStore();

  function wsDe(opts: { workspace?: string }): string | undefined {
    return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
  }

  const asset = program
    .command("asset")
    .description("loja de assets locais (agente|skill|prompt|task|flow|pack|workspace-parcial)");

  asset
    .command("exportar")
    .requiredOption("--tipo <kind>", `tipo de asset (${KINDS_ASSET.join("|")})`)
    .option("--somente <lista>", "ids/nomes separados por vírgula; para pack use kind:id; para workspace-parcial, tipos")
    .option("-o, --out <destino>", "arquivo .corp (tar.gz) ou pasta de destino")
    .option("--nome <nome>", "nome do asset no manifest (padrão: derivado do id/tipo)")
    .option("--versao <semver>", "versão semver do asset (padrão: 1.0.0)")
    .option("--autor <autor>", "autor do asset")
    .description("exporta um asset (ou vários) para um pack .corp — segredos nunca entram")
    .action(
      (opts: {
        tipo: string;
        somente?: string;
        out?: string;
        nome?: string;
        versao?: string;
        autor?: string;
        workspace?: string;
      }) =>
        comErros(async () => {
          const ws = await manager.resolver(wsDe(opts));
          if (!KINDS_ASSET.includes(opts.tipo as KindAsset)) {
            console.error(`erro: tipo inválido "${opts.tipo}" — use ${KINDS_ASSET.join("|")}`);
            process.exitCode = 1;
            return;
          }
          const destino = opts.out ?? `${opts.tipo}.corp`;
          const r = await store.exportar(ws.path, opts.tipo as KindAsset, destino, {
            somente: dividirLista(opts.somente),
            nome: opts.nome,
            versao: opts.versao,
            autor: opts.autor,
          });
          console.log(`ok: asset "${r.manifest.nome}" (${r.manifest.kind} v${r.manifest.versao}) exportado para ${r.destino}`);
          if (r.excluidos.length > 0) {
            console.log(`ok: ${r.excluidos.length} item(ns) excluído(s) por padrão de segredo`);
            for (const item of r.excluidos) console.log(`  excluído: ${item}`);
          }
        }),
    );

  asset
    .command("importar")
    .argument("<fonte>", "pasta | arquivo.corp | url git https")
    .option("--dry-run", "lista arquivos e dependências sem gravar nada")
    .option("--para <ws>", "workspace destino (padrão: ativo)")
    .option("--como <novo-id>", "importa com outro id (renomeia um único asset)")
    .option("-f, --sobrescrever", "sobrescreve se já existir")
    .description("importa um asset (.corp, pasta ou url) para um workspace")
    .action(
      (fonte: string, opts: { dryRun?: boolean; para?: string; como?: string; sobrescrever?: boolean; workspace?: string }) =>
        comErros(async () => {
          const alvo = opts.para
            ? await manager.resolver(opts.para)
            : await manager.resolver(wsDe(opts));
          const r = await store.importar(fonte, {
            dryRun: Boolean(opts.dryRun),
            paraWorkspace: alvo.path,
            como: opts.como,
            sobrescrever: Boolean(opts.sobrescrever),
          });

          if (opts.dryRun) {
            console.log(`dry-run: asset "${r.manifest.nome}" (${r.manifest.kind} v${r.manifest.versao}) em ${alvo.id}`);
            if (r.dependencias.length > 0) {
              console.log("dependências:");
              for (const d of r.dependencias) {
                console.log(`  - ${d.kind}:${d.nome}${d.versaoMin ? ` (>= ${d.versaoMin})` : ""}`);
              }
            }
            console.log("arquivos:");
            for (const a of r.arquivos) console.log(`  ${a}`);
            return;
          }

          for (const item of r.itens) {
            console.log(`ok: ${item.kind} "${item.id}" ${item.acao} em ${alvo.id}`);
          }
        }),
    );
}
