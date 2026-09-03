/**
 * oc secrets — CLI para agentes e operadores consultarem os segredos disponíveis no workspace.
 *
 * Subcomandos:
 *   list   — lista nomes, tipo e origem (NUNCA valores)
 *   set    — define um segredo (global ou workspace)
 *   delete — remove um segredo
 *   get    — obtém o VALOR de um segredo (só para uso programático do agente)
 *
 * O agente pode rodar:
 *   oc secrets list                    # segredos efetivos (merge workspace + global)
 *   oc secrets list --scope workspace  # só os do workspace
 *   oc secrets list --scope global     # só os globais
 *   oc secrets get wp_pulso_diario_user  # valor em stdout (para scripting)
 *   oc secrets set minha_api_key "abc" --scope workspace
 *   oc secrets delete minha_api_key --scope workspace
 */
import type { Command } from "commander";
import { opencorpHome } from "../../utils/paths.js";
import { SecretsStore, type SecretOrigem } from "../../core/secrets-store.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";

function escopoValido(escopo: string | undefined): SecretOrigem | undefined {
  if (!escopo) return undefined;
  if (escopo === "global" || escopo === "workspace") return escopo;
  console.error(`erro: escopo inválido "${escopo}" — use global | workspace`);
  process.exitCode = 1;
  return undefined;
}

async function resolverWsPath(program: Command, opts: { workspace?: string }): Promise<string | undefined> {
  const wsId = opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
  try {
    const wm = new WorkspaceManager({ homeDir: opencorpHome() });
    const ws = await wm.resolver(wsId);
    return ws.path;
  } catch {
    return undefined;
  }
}

export function registerSecretsCommand(program: Command): void {
  const homeDir = opencorpHome();
  const store = new SecretsStore(homeDir);

  const grupo = program
    .command("secrets")
    .description("segredos do workspace (listagem segura — valores mascarados por padrão)");

  // ── list ──────────────────────────────────────────────────────────────
  grupo
    .command("list")
    .alias("ls")
    .description("lista segredos disponíveis (merge workspace + global por padrão)")
    .option("--scope <escopo>", "global | workspace (sem flag: merge de ambos)")
    .option("--json", "saída em JSON")
    .option("--workspace <id>", "workspace alvo")
    .action(async (opts: { scope?: string; json?: boolean; workspace?: string }) => {
      const escopo = opts.scope ? escopoValido(opts.scope) : undefined;
      if (opts.scope && !escopo) return; // erro já impresso

      const wsPath = await resolverWsPath(program, opts);

      const lista = escopo
        ? store.listarEscopo(escopo, wsPath)
        : store.listarMerge(wsPath);

      if (opts.json) {
        console.log(JSON.stringify(lista, null, 2));
        return;
      }

      if (lista.length === 0) {
        console.log("nenhum segredo configurado");
        if (wsPath) {
          console.log(`\ndica: use "oc secrets set <nome> <valor>" para adicionar um segredo ao workspace`);
        }
        return;
      }

      // Header
      console.log("");
      console.log(`  ${"NOME".padEnd(40)} ${"TIPO".padEnd(14)} ORIGEM`);
      console.log(`  ${"─".repeat(40)} ${"─".repeat(14)} ${"─".repeat(10)}`);

      for (const s of lista) {
        const tipo = s.tipo_app ?? "—";
        const badge = s.origem === "workspace" ? "🔒 workspace" : "🌐 global";
        console.log(`  ${s.nome.padEnd(40)} ${tipo.padEnd(14)} ${badge}`);
      }

      console.log("");
      console.log(`  total: ${lista.length} segredo(s)`);

      // Dica de uso para agentes
      console.log("");
      console.log("  como usar nas ordens:");
      console.log("    perfis de app  → referencie: OPENCORP_SECRET app:<tipo>:<id>");
      console.log("    chaves simples → referencie: OPENCORP_SECRET <nome>");
      console.log("    valor direto   → oc secrets get <nome>");
      console.log("");
    });

  // ── get ────────────────────────────────────────────────────────────────
  grupo
    .command("get")
    .argument("<nome>", "nome do segredo")
    .description("obtém o VALOR de um segredo (stdout, para scripting/agente)")
    .option("--workspace <id>", "workspace alvo")
    .action(async (nome: string, opts: { workspace?: string }) => {
      const wsPath = await resolverWsPath(program, opts);
      const resultado = store.obterValor(nome, wsPath);
      if (!resultado) {
        console.error(`erro: segredo "${nome}" não encontrado`);
        process.exitCode = 1;
        return;
      }
      // Saída limpa em stdout para pipes
      process.stdout.write(resultado.valor);
    });

  // ── set ────────────────────────────────────────────────────────────────
  grupo
    .command("set")
    .argument("<nome>", "nome do segredo (ex: minha_api_key, app:vps:servidor-1)")
    .argument("<valor>", "valor do segredo")
    .description("define ou atualiza um segredo")
    .option("--scope <escopo>", "global | workspace (padrão: workspace se houver workspace ativo)", "workspace")
    .option("--workspace <id>", "workspace alvo")
    .action(async (nome: string, valor: string, opts: { scope?: string; workspace?: string }) => {
      const escopo = escopoValido(opts.scope) ?? "workspace";
      const wsPath = await resolverWsPath(program, opts);

      if (escopo === "workspace" && !wsPath) {
        console.error("erro: nenhum workspace ativo — use --scope global ou passe --workspace <id>");
        process.exitCode = 1;
        return;
      }

      const erroPerfil = await store.definir(nome, valor, escopo, wsPath);
      if (erroPerfil) {
        console.error(`erro: ${erroPerfil}`);
        process.exitCode = 1;
        return;
      }

      const badge = escopo === "workspace" ? "🔒 workspace" : "🌐 global";
      console.log(`ok: segredo "${nome}" definido (${badge})`);
    });

  // ── delete ─────────────────────────────────────────────────────────────
  grupo
    .command("delete")
    .alias("rm")
    .argument("<nome>", "nome do segredo")
    .description("remove um segredo")
    .option("--scope <escopo>", "global | workspace (padrão: workspace)", "workspace")
    .option("--workspace <id>", "workspace alvo")
    .action(async (nome: string, opts: { scope?: string; workspace?: string }) => {
      const escopo = escopoValido(opts.scope) ?? "workspace";
      const wsPath = await resolverWsPath(program, opts);

      if (escopo === "workspace" && !wsPath) {
        console.error("erro: nenhum workspace ativo — use --scope global ou passe --workspace <id>");
        process.exitCode = 1;
        return;
      }

      await store.remover(nome, escopo, wsPath);
      console.log(`ok: segredo "${nome}" removido do escopo ${escopo}`);
    });

  // ── info ───────────────────────────────────────────────────────────────
  grupo
    .command("info")
    .description("mostra informações sobre o sistema de segredos e como usá-los")
    .action(async () => {
      const wsPath = await resolverWsPath(program, {});
      console.log(`
╭─────────────────────────────────────────────────────────╮
│              OpenCorp — Sistema de Segredos              │
╰─────────────────────────────────────────────────────────╯

  Hierarquia de resolução (maior prioridade primeiro):
    1. 🔒 Workspace: <workspace>/.opencorp/secrets.json
    2. 🌐 Global:    ~/.opencorp/secrets.json

  Quando o workspace define um segredo com o mesmo nome do
  global, o valor do workspace prevalece.

  Segredos NUNCA são exibidos pela listagem — apenas o nome,
  tipo e origem são mostrados. Para obter o valor em script:

    oc secrets get <nome>

  Perfis de app (VPS, WordPress, MercadoPago, etc.) são
  armazenados como JSON sob chaves app:<tipo>:<id>, ex.:

    oc secrets set app:vps:servidor-1 '{"rotulo":"Meu VPS",...}'

  Para listar segredos disponíveis:

    oc secrets list                     # merge (workspace + global)
    oc secrets list --scope workspace   # só workspace
    oc secrets list --scope global      # só global
    oc secrets list --json              # saída JSON

  Caminho do secrets global: ${homeDir}/.opencorp/secrets.json
  Caminho do workspace:      ${wsPath ? wsPath + "/.opencorp/secrets.json" : "(nenhum workspace ativo)"}
`);
    });
}
