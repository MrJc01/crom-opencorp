import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { Command } from "commander";
import { AgentError } from "../../core/errors.js";
import { SessionManager } from "../../core/session-manager.js";
import { AgentStore } from "../../core/agent-store.js";
import { SubcorpStore } from "../../core/subcorp-store.js";
import { BudgetManager } from "../../core/budget-manager.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { parseGatilho } from "../../schemas/gatilho.js";

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

function wsDe(program: Command, opts: { workspace?: string }): string | undefined {
  return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
}

async function comErros(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (erro) {
    reportar(erro);
  }
}

function dividirRefSubcorp(ref: string): { subcorpId: string; agenteId: string } {
  const partes = ref.split("/");
  if (partes.length !== 2 || partes[0]!.length === 0 || partes[1]!.length === 0) {
    throw new AgentError(`referência inválida "${ref}" — use <subcorp>/<agente>`);
  }
  return { subcorpId: partes[0]!, agenteId: partes[1]! };
}

function usd(valor: number): string {
  return `US$ ${valor.toFixed(4)}`;
}

function formatarDuracao(ms: number | null): string {
  if (ms === null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

export function registerAgentCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const store = new AgentStore();
  const sessoes = new SessionManager();
  const subcorps = new SubcorpStore();

  function workspaceAlvoId(opts: { workspace?: string }) {
    return manager.resolver(wsDe(program, opts));
  }

  async function workspaceAlvo(workspaceId?: string) {
    const ws = await manager.resolver(workspaceId);
    if (!ws.existe) {
      throw new AgentError(
        `a pasta do workspace "${ws.id}" não existe (${ws.path}) — recrie com "opencorp workspace create ${ws.id}"`,
      );
    }
    return ws;
  }

  const agent = program.command("agent").description("CRUD e execução de agentes");

  agent
    .command("create")
    .argument("<id>", "id do agente (kebab-case)")
    .option("--from <agente>", "clona a estrutura de outro agente (padrão: executor-padrao)")
    .option("--model <provider/model>", "modelo padrão do agente")
    .description("cria um agente (.md com frontmatter) a partir de outro")
    .action((id: string, opts: { from?: string; model?: string; workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvoId(opts);
        const r = await store.criar(ws.path, id, { de: opts.from, model: opts.model });
        console.log(`ok: agente "${r.frontmatter.id}" criado em ${r.path}`);
        console.log(`ok: agente opencode gerado em ${ws.path}/.opencorp/opencode/agent/${r.frontmatter.id}.md`);
      }),
    );

  agent
    .command("list")
    .option("--categoria <categoria>", "ceo | secretario | operario | custom")
    .description("lista os agentes do workspace ativo")
    .action((opts: { categoria?: string; workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvoId(opts);
        const agentes = [...(await store.listar(ws.path))];
        for (const entrada of await subcorps.listar(ws.path)) {
          for (const agenteId of entrada.exposed_agents) {
            try {
              const ag = await store.carregar(entrada.source, agenteId);
              agentes.push({
                id: `${entrada.id}/${ag.frontmatter.id}`,
                role: ag.frontmatter.role,
                category: ag.frontmatter.category,
                model: ag.frontmatter.model,
                permissions: ag.frontmatter.permissions,
                budget_daily_usd: ag.frontmatter.budget.daily_usd,
                ativo: ag.frontmatter.ativo,
              });
            } catch {
              continue;
            }
          }
        }
        const filtrados = opts.categoria
          ? agentes.filter((a) => a.category === opts.categoria)
          : agentes;
        if (filtrados.length === 0) {
          console.log(`nenhum agente em ${store.dirAgentes(ws.path)} (workspace: "${ws.id}")`);
          return;
        }
        const wId = Math.max(...agentes.map((a) => a.id.length), 2);
        const wCat = Math.max(...agentes.map((a) => a.category.length), 9);
        const wModel = Math.max(...agentes.map((a) => a.model.length), 6);
        console.log(
          `id${" ".repeat(wId - 2)}  categoria${" ".repeat(wCat - 9)}  modelo${" ".repeat(wModel - 6)}  permissões  daily_usd`,
        );
        for (const a of agentes) {
          console.log(
            `${a.id}${" ".repeat(wId - a.id.length)}  ${a.category}${" ".repeat(wCat - a.category.length)}  ${a.model}${" ".repeat(wModel - a.model.length)}  ${a.permissions.padEnd(9)}  ${a.budget_daily_usd.toFixed(2)}`,
          );
        }
      }),
    );

  agent
    .command("show")
    .argument("<id>", "id do agente")
    .description("mostra a definição completa do agente")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvoId(opts);
        let carregado;
        if (id.includes("/")) {
          const { subcorpId, agenteId } = dividirRefSubcorp(id);
          const alvo = await subcorps.resolverParaConsulta(ws.path, subcorpId, agenteId);
          carregado = await store.carregar(alvo.source, agenteId);
        } else {
          carregado = await store.carregar(ws.path, id);
        }
        const r = carregado;
        console.log(`arquivo:      ${r.path}`);
        console.log(`id:           ${r.frontmatter.id}`);
        console.log(`role:         ${r.frontmatter.role}`);
        console.log(`categoria:    ${r.frontmatter.category}`);
        console.log(`modelo:       ${r.frontmatter.model}`);
        if (r.frontmatter.inherits) console.log(`inherits:     ${r.frontmatter.inherits}`);
        console.log(`tools:        ${r.frontmatter.tools.join(", ")}`);
        console.log(`permissões:   ${r.frontmatter.permissions}`);
        console.log(`orçamento:    daily_usd ${r.frontmatter.budget.daily_usd.toFixed(2)} · max_turns ${r.frontmatter.budget.max_turns}`);
        console.log(`memória:      lê [${r.frontmatter.memory.reads.join(", ")}] · escreve [${r.frontmatter.memory.writes.join(", ")}]`);
        console.log("");
        console.log(r.corpo.trimEnd());
      }),
    );

  agent
    .command("edit")
    .argument("<id>", "id do agente")
    .description("abre $EDITOR no .md do agente")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvoId(opts);
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
          throw new AgentError('"agent edit" precisa de um terminal (TTY) para abrir o $EDITOR');
        }
        const editor = process.env.EDITOR || process.env.VISUAL;
        if (!editor) {
          throw new AgentError("defina $EDITOR (ex.: export EDITOR=vim) para usar agent edit");
        }
        const path = await store.preEditar(ws.path, id);
        const antes = readFileSync(path, "utf8");
        const res = spawnSync(`${editor} "${path}"`, { shell: true, stdio: "inherit" });
        if (res.error) {
          throw new AgentError(`não foi possível abrir o editor "${editor}": ${res.error.message}`);
        }
        if (res.status !== 0) {
          throw new AgentError(`editor saiu com código ${res.status ?? "?"} — arquivo não revalidado`);
        }
        const mudou = readFileSync(path, "utf8") !== antes;
        await store.posEditar(ws.path, id, mudou);
        if (mudou) {
          console.log(`ok: agente "${id}" atualizado e re-sincronizado no bridge opencode`);
        } else {
          console.log(`ok: agente "${id}" sem alterações`);
        }
      }),
    );

  agent
    .command("clone")
    .argument("<origem>", "agente de origem")
    .argument("<destino>", "id do novo agente")
    .description("clona um agente existente do workspace")
    .action((origem: string, destino: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvoId(opts);
        const r = await store.clonar(ws.path, origem, destino);
        console.log(`ok: agente "${origem}" clonado como "${r.frontmatter.id}" em ${r.path}`);
      }),
    );

  agent
    .command("sync")
    .option("--workspace <id>", "workspace alvo (padrão: ativo)")
    .description("ressincroniza todos os agentes para o formato opencode (após mudar .md/modelos)")
    .action((opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvoId(opts);
        await store.sincronizarTodos(ws.path);
        console.log(`ok: agentes sincronizados em ${ws.path}/.opencorp/opencode/agent/`);
      }),
    );

  agent
    .command("run")
    .argument("<id>", "id do agente")
    .argument("<ordem>", "instrução para o agente")
    .option("--model <provider/model>", "sobrepõe o modelo do agente")
    .option("--session <id>", "continua uma sessão opencode existente")
    .option("--file <arquivo>", "lê a ordem de um arquivo (sobrepõe o texto posicional)")
    .option("--title <titulo>", "título da sessão opencode")
    .option("--gatilho <tipo:origem>", "declara quem ativa esta execução (cron, mencao, flow...) — ledger unificado")
    .description("executa uma ordem em uma sessão OpenCode dentro do workspace")
    .action(
      (
        id: string,
        ordem: string,
        opts: {
          model?: string;
          session?: string;
          file?: string;
          title?: string;
          gatilho?: string;
          workspace?: string;
        },
      ) =>
        comErros(async () => {
          const gatilho = opts.gatilho ? parseGatilho(opts.gatilho) : undefined;
          let agenteId = id;
          let workspaceDir: string | undefined;
          if (id.includes("/")) {
            const { subcorpId, agenteId: subAgenteId } = dividirRefSubcorp(id);
            const wsPai = await workspaceAlvo(wsDe(program, opts));
            const alvo = await subcorps.resolverParaRun(wsPai.path, subcorpId, subAgenteId);
            agenteId = alvo.agenteId;
            workspaceDir = alvo.source;
          }
          const r = await sessoes.rodar({
            agente: agenteId,
            ordem,
            model: opts.model,
            session: opts.session,
            file: opts.file,
            title: opts.title,
            gatilho,
            workspaceId: workspaceDir ? undefined : wsDe(program, opts),
            workspaceDir,
          });
          console.log(
            `\n[opencorp] sessão ${r.id} — status: ${r.status} · exit: ${r.exit_code ?? "?"} · duração: ${formatarDuracao(r.duracao_ms)} · log: ${r.log}`,
          );
          process.exitCode = r.exit_code === null ? 1 : r.exit_code;
        }),
    );

  agent
    .command("history")
    .argument("<id>", "id do agente")
    .description("últimas execuções do agente (registries/execucoes)")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvoId(opts);
        const registros = await sessoes.listarExecucoes(ws.path, { agente: id });
        if (registros.length === 0) {
          console.log(`nenhuma execução registrada para "${id}" (workspace: "${ws.id}")`);
          return;
        }
        console.log("id                            status       exit  duração  início");
        for (const r of registros) {
          console.log(
            `${r.id}  ${r.status.padEnd(12)} ${String(r.exit_code ?? "-").padEnd(5)} ${formatarDuracao(r.duracao_ms).padEnd(8)} ${r.inicio.slice(0, 19).replace("T", " ")}`,
          );
        }
      }),
    );

  agent
    .command("cost")
    .argument("<id>", "id do agente")
    .description("gasto estimado acumulado do agente (registries/custos)")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await workspaceAlvoId(opts);
        const budget = new BudgetManager();
        const acumulado = await budget.acumuladoPorAgente(ws.path, id);
        console.log(`agente:      ${id}`);
        console.log(`hoje:        ${usd(acumulado.hoje)}`);
        console.log(`acumulado:   ${usd(acumulado.total)} em ${acumulado.dias} dia(s) com consumo`);
        console.log(`média/dia:   ${usd(acumulado.media)}`);
        if (acumulado.total === 0) {
          console.log("(custos são estimados por turnos × preço do modelo — ver budget status)");
        }
      }),
    );
}
