import type { Command } from "commander";
import { ApprovalsStore } from "../../core/approvals-store.js";
import { SessionManager } from "../../core/session-manager.js";
import { WorkspaceManager } from "../../core/workspace-manager.js";
import { RegistryStore } from "../../core/registry-store.js";

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

export function registerApprovalsCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const store = new ApprovalsStore();
  const sessoes = new SessionManager();
  const registros = new RegistryStore();

  function wsDe(opts: { workspace?: string }): string | undefined {
    return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
  }

  const approvals = program.command("approvals").description("fila HITL (humano no loop)");

  approvals
    .command("list")
    .option("--todas", "inclui pendências já resolvidas")
    .description("lista pendências de aprovação humana")
    .action((opts: { todas?: boolean; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const lista = await store.listar(ws.path);
        const visiveis = opts.todas ? lista : lista.filter((p) => p.status === "pendente");
        if (visiveis.length === 0) {
          console.log("nenhuma pendência de aprovação");
          return;
        }
        console.log("id                            status     agente           origem    padrão        ordem");
        for (const p of visiveis) {
          console.log(
            `${p.id}  ${p.status.padEnd(10)} ${p.agente.padEnd(16)} ${p.origem.padEnd(9)} ${p.padrao.padEnd(13)} ${p.ordem.slice(0, 60)}`,
          );
        }
      }),
    );

  approvals
    .command("approve")
    .argument("<id>", "id da pendência")
    .description("aprova a pendência e re-executa a ordem original")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const pendencia = await store.aprovar(ws.path, id);
        console.log(`ok: pendência ${id} aprovada — re-executando a ordem original...`);
        const r = await sessoes.rodar({
          agente: pendencia.agente,
          ordem: pendencia.ordem,
          model: pendencia.modelo,
          workspaceDir: pendencia.workspace_path,
          pularGuard: true,
        });
        await registros.anexarEvento(ws.path, "execucoes", pendencia.exec_id, {
          ts: new Date().toISOString(),
          por: "humano",
          evento: "aprovado",
          resumo: `re-executada como ${r.id} (status: ${r.status})`,
        });
        console.log(
          `[opencorp] sessão ${r.id} — status: ${r.status} · exit: ${r.exit_code ?? "?"} · log: ${r.log}`,
        );
        process.exitCode = r.exit_code === null ? 1 : r.exit_code;
      }),
    );

  approvals
    .command("reject")
    .argument("<id>", "id da pendência")
    .option("--motivo <texto>", "motivo da rejeição", "")
    .description("rejeita a pendência registrando o motivo em execucoes/logs")
    .action((id: string, opts: { motivo: string; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(opts));
        const pendencia = await store.rejeitar(ws.path, id, opts.motivo);
        await registros.anexarEvento(ws.path, "execucoes", pendencia.exec_id, {
          ts: new Date().toISOString(),
          por: "humano",
          evento: "rejeitado",
          motivo: pendencia.motivo_rejeicao,
          resumo: `pendência ${id} rejeitada pelo humano: ${pendencia.motivo_rejeicao}`,
        });
        await registros.eventoAuditoria(ws.path, {
          por: "humano",
          evento: "hitl_rejeitado",
          resumo: `pendência ${id} rejeitada — motivo: ${pendencia.motivo_rejeicao}`,
          ordem: pendencia.ordem.slice(0, 160),
        });
        console.log(`ok: pendência ${id} rejeitada — motivo registrado em execucoes e logs`);
      }),
    );
}
