import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import { WorkspaceError, WorkspaceManager } from "../../core/workspace-manager.js";
import { formatarValor } from "../../core/settings-store.js";

async function comErros(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (erro) {
    if (erro instanceof WorkspaceError) {
      console.error(`erro: ${erro.message}`);
      process.exitCode = erro.exitCode;
      return;
    }
    console.error(`erro inesperado: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exitCode = 1;
  }
}

async function confirmar(questao: string): Promise<"sim" | "nao" | "eof"> {
  const rl = createInterface({ input: process.stdin });
  try {
    const resposta = (await rl.question(questao)).trim().toLowerCase();
    return ["s", "sim", "y", "yes"].includes(resposta) ? "sim" : "nao";
  } catch {
    return "eof";
  } finally {
    rl.close();
  }
}

export function registerWorkspaceCommands(program: Command): void {
  const manager = new WorkspaceManager();

  const grupo = program.command("workspace").description("workspaces (corps) isolados");

  grupo
    .command("create")
    .argument("<id>", "id do workspace (kebab-case)")
    .option("--template <tpl>", "template base (padrão: default)", "default")
    .description("cria um workspace a partir de um template")
    .action((id: string, opts: { template?: string }) =>
      comErros(async () => {
        const info = await manager.criar(id, { template: opts.template ?? "default" });
        console.log(`ok: workspace "${info.id}" criado em ${info.path}`);
        if (info.ativo) {
          console.log(`ok: "${info.id}" agora é o workspace ativo`);
        } else {
          console.log(`para usá-lo: opencorp use ${info.id}`);
        }
      }),
    );

  grupo
    .command("list")
    .description("lista os workspaces conhecidos (● = ativo)")
    .action(() =>
      comErros(async () => {
        const lista = await manager.listar();
        if (lista.length === 0) {
          console.log("nenhum workspace — crie com: opencorp workspace create <id>");
          return;
        }
        const largura = Math.max(...lista.map((w) => w.id.length), 2);
        console.log(`id${" ".repeat(largura - 2)}  ativo  estado   criado_em`);
        for (const w of lista) {
          const estado = w.existe ? "ok" : "ausente";
          console.log(
            `${w.id}${" ".repeat(largura - w.id.length)}  ${w.ativo ? "●" : " "}      ${estado.padEnd(7)} ${w.criado_em.slice(0, 10)}`,
          );
        }
      }),
    );

  grupo
    .command("show")
    .argument("[id]", "id do workspace (padrão: ativo)")
    .description("mostra config resumida, agentes e orçamento")
    .action((id: string | undefined) =>
      comErros(async () => {
        const d = await manager.detalhar(id);
        console.log(`id:         ${d.id}`);
        console.log(`caminho:    ${d.path}`);
        console.log(`criado_em:  ${d.criado_em}`);
        console.log(`ativo:      ${d.ativo ? "sim" : "não"}`);
        console.log(`estado:     ${d.existe ? "ok" : "PASTA AUSENTE"}`);
        if (d.agentes.length > 0) {
          console.log(`agentes:    ${d.agentes.map((a) => `${a.id} (${a.category ?? "?"})`).join(", ")}`);
        } else {
          console.log("agentes:    (nenhum)");
        }
        const o = d.orcamento;
        console.log(
          `orçamento:  daily_usd ${formatarValor(o.daily_usd.valor)} (${o.daily_usd.origem}) · per_agent_usd ${formatarValor(o.per_agent_usd.valor)} (${o.per_agent_usd.origem})`,
        );
        console.log(`segurança:  ${d.seguranca ?? "(security_policy.json não encontrado)"}`);
      }),
    );

  grupo
    .command("delete")
    .argument("<id>", "id do workspace a remover")
    .description("remove o workspace (pede confirmação; use -y/--force para pular)")
    .option("-y, --yes", "pula a confirmação")
    .option("--force", "alias de -y")
    .action((id: string, opts: { yes?: boolean; force?: boolean }) =>
      comErros(async () => {
        const alvo = await manager.resolver(id);
        if (!opts.yes && !opts.force) {
          const aviso = alvo.ativo ? ' (workspace ATIVO — o campo "ativo" ficará vazio)' : "";
          const resposta = await confirmar(`confirmar exclusão de "${id}"${aviso}? (s/N) `);
          if (resposta === "eof") {
            console.error("confirmação não recebida — nada foi feito");
            process.exitCode = 1;
            return;
          }
          if (resposta === "nao") {
            console.log("cancelado — nada foi feito");
            return;
          }
        }
        const r = await manager.deletar(id, { sim: true });
        if (r.removidoPasta) {
          console.log(`ok: workspace "${id}" removido (pasta ${r.path} excluída)`);
        } else {
          console.log(`ok: registro de "${id}" removido (pasta não foi encontrada)`);
        }
        if (r.eraAtivo) {
          console.log('nenhum workspace ativo agora — use "opencorp use <id>" para escolher outro');
        }
      }),
    );

  grupo
    .command("current")
    .description("mostra o workspace ativo")
    .action(() =>
      comErros(async () => {
        const atual = await manager.atual();
        if (!atual) {
          console.log('nenhum workspace ativo — use "opencorp use <id>"');
          return;
        }
        console.log(atual.id);
      }),
    );

  program
    .command("use")
    .argument("<id>", "id do workspace ativo (kebab-case)")
    .description("define o workspace ativo")
    .action((id: string) =>
      comErros(async () => {
        const info = await manager.usar(id);
        console.log(`ok: workspace ativo agora é "${info.id}" (${info.path})`);
      }),
    );
}
