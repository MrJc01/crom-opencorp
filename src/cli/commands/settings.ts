import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { Command } from "commander";
import { opencorpHome } from "../../utils/paths.js";
import { SettingsError, SettingsStore, formatarValor, type Scope } from "../../core/settings-store.js";
import { settingsSchema } from "../../schemas/settings.js";
import { writeFileAtomic } from "../../utils/fs-safe.js";
import { abrirPainelSettings } from "./settings-tui.js";

function escopoValido(escopo: string | undefined): Scope | undefined {
  if (escopo === undefined) return undefined;
  if (escopo === "global" || escopo === "workspace") return escopo;
  throw new SettingsError(`escopo inválido: "${escopo}" (use global | workspace)`, { exitCode: 1 });
}

async function comErros(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (erro) {
    if (erro instanceof SettingsError) {
      console.error(`erro: ${erro.message}`);
      process.exitCode = erro.exitCode;
      return;
    }
    console.error(`erro inesperado: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exitCode = 1;
  }
}

interface OpcoesEscopo {
  scope?: string;
  workspace?: string;
}

export function registerSettingsCommand(program: Command): void {
  const store = new SettingsStore({ homeDir: opencorpHome(), cwd: process.cwd() });

  const grupo = program
    .command("settings")
    .description("painel de configurações (global e workspace)");

  grupo.action(() =>
    comErros(async () => {
      await abrirPainelSettings(store);
    }),
  );

  grupo
    .command("list")
    .description("dump completo com a origem de cada chave")
    .option("--scope <escopo>", "global | workspace (sem flag: merge workspace+global)")
    .option("--json", "imprime as entradas em JSON")
    .action((opts: OpcoesEscopo & { json?: boolean }) =>
      comErros(async () => {
        const escopo = escopoValido(opts.scope);
        const entradas = await store.list({ scope: escopo, workspaceId: opts.workspace });
        if (opts.json) {
          console.log(JSON.stringify(entradas, null, 2));
          return;
        }
        for (const e of entradas) {
          console.log(`${e.chave} = ${formatarValor(e.valor)} (${e.origem})`);
        }
      }),
    );

  grupo
    .command("get")
    .argument("<chave>", "chave (ex.: budget.daily_usd)")
    .description("lê uma chave resolvendo o merge dos níveis")
    .option("--scope <escopo>", "global | workspace (sem flag: merge)")
    .option("--verbose", "indica também a origem do valor")
    .option("--json", "imprime o valor em JSON")
    .action((chave: string, opts: OpcoesEscopo & { verbose?: boolean; json?: boolean }) =>
      comErros(async () => {
        const escopo = escopoValido(opts.scope);
        const r = await store.get(chave, { scope: escopo, workspaceId: opts.workspace });
        if (opts.json) {
          console.log(JSON.stringify(r.valor ?? null, null, 2));
        } else if (opts.verbose) {
          console.log(`${r.chave} = ${formatarValor(r.valor)}`);
          console.log(`origem: ${r.origem}`);
        } else {
          console.log(formatarValor(r.valor));
        }
      }),
    );

  grupo
    .command("set")
    .argument("<chave>", "chave a alterar")
    .argument("<valor>", "novo valor (aceita true/false, número ou JSON)")
    .description("grava uma chave no escopo indicado (padrão: global)")
    .option("--scope <escopo>", "global | workspace (padrão: global)")
    .action((chave: string, valor: string, opts: OpcoesEscopo) =>
      comErros(async () => {
        const escopo = escopoValido(opts.scope);
        const r = await store.set(chave, valor, { scope: escopo, workspaceId: opts.workspace });
        console.log(`ok: ${chave} = ${formatarValor(r.depois)} — salvo em ${r.path}`);
      }),
    );

  grupo
    .command("edit")
    .description("abre $EDITOR no JSON do escopo (exige terminal)")
    .option("--scope <escopo>", "global | workspace (padrão: global)")
    .action((opts: OpcoesEscopo) =>
      comErros(async () => {
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
          throw new SettingsError('"settings edit" precisa de um terminal (TTY) para abrir o $EDITOR', {
            exitCode: 1,
          });
        }
        const editor = process.env.EDITOR || process.env.VISUAL;
        if (!editor) {
          throw new SettingsError("defina $EDITOR (ex.: export EDITOR=vim) para usar settings edit", {
            exitCode: 1,
          });
        }
        const escopo = escopoValido(opts.scope);
        const alvo = await store.caminhoDoEscopo({ scope: escopo, workspaceId: opts.workspace });
        if (!existsSync(alvo.path)) {
          const defaults = settingsSchema.parse({});
          await writeFileAtomic(alvo.path, `${JSON.stringify(defaults, null, 2)}\n`);
        }
        const res = spawnSync(`${editor} "${alvo.path}"`, { shell: true, stdio: "inherit" });
        if (res.error) {
          throw new SettingsError(`não foi possível abrir o editor "${editor}": ${res.error.message}`, {
            exitCode: 1,
          });
        }
        if (res.status !== 0) {
          throw new SettingsError(`editor saiu com código ${res.status ?? "?"} — arquivo não revalidado`, {
            exitCode: res.status ?? 1,
          });
        }
        await store.revalidar({ scope: escopo, workspaceId: opts.workspace });
        console.log(`ok: ${alvo.rotulo} (${alvo.path}) é válido`);
      }),
    );

  grupo
    .command("path")
    .description("imprime os caminhos dos arquivos de settings")
    .option("--scope <escopo>", "global | workspace (padrão: ambos)")
    .action((opts: OpcoesEscopo) =>
      comErros(async () => {
        const escopo = escopoValido(opts.scope);
        const caminhos = await store.paths({ scope: escopo, workspaceId: opts.workspace });
        if (escopo !== "workspace") {
          console.log(`global: ${caminhos.global}`);
        }
        if (escopo !== "global") {
          if (caminhos.workspace) {
            console.log(`workspace: ${caminhos.workspace}`);
          } else {
            console.log("workspace: — (nenhum workspace resolvido; use --workspace <id>)");
          }
        }
      }),
    );

  grupo
    .command("reset")
    .argument("<chave>", "chave ou seção a restaurar para o default")
    .description("remove a chave do escopo (o default/volta ao nível inferior entra em vigor)")
    .option("--scope <escopo>", "global | workspace (padrão: global)")
    .action((chave: string, opts: OpcoesEscopo) =>
      comErros(async () => {
        const escopo = escopoValido(opts.scope);
        const r = await store.reset(chave, { scope: escopo, workspaceId: opts.workspace });
        if (r.changed) {
          console.log(
            `ok: "${chave}" removida de ${r.path} — valor em vigor: ${formatarValor(r.valor)} (${r.origem})`,
          );
        } else {
          console.log(
            `nada a fazer: "${chave}" não está definida nesse escopo — valor em vigor: ${formatarValor(r.valor)} (${r.origem})`,
          );
        }
      }),
    );
}
