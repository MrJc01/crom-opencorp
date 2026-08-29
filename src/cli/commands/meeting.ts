import type { Command } from "commander";
import { MeetingManager } from "../../core/meeting-manager.js";
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

function wsDe(program: Command, opts: { workspace?: string }): string | undefined {
  return opts.workspace ?? (program.opts() as { workspace?: string }).workspace;
}

export function registerMeetingCommand(program: Command): void {
  const manager = new WorkspaceManager();
  const meeting = program.command("meeting").description("reunião geral multi-agente (boardroom)");

  meeting
    .command("start")
    .argument("<pauta>", "pauta da reunião")
    .option("--agentes <lista>", "participantes separados por vírgula (padrão: ceo-documentos,ceo-estrategia,secretario)")
    .option("--model <provider/model>", "modelo usado por todos os participantes (padrão: o de cada agente)")
    .description("abre a sala, executa os turnos e gera a ata automática")
    .action((pauta: string, opts: { agentes?: string; model?: string; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(program, opts));
        const sala = await new MeetingManager().iniciar({
          pauta,
          agentes: opts.agentes,
          model: opts.model,
          workspaceDir: ws.path,
        });
        console.log(
          `[opencorp] reunião ${sala.id} — status: ${sala.status} · turnos: ${sala.turno}/${sala.max_turnos} · motivo: ${sala.motivo_fim} · ata: ${sala.ata ?? "não gerada"}`,
        );
      }),
    );

  meeting
    .command("list")
    .description("lista as reuniões do workspace ativo")
    .action((opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(program, opts));
        const salas = await new MeetingManager().listar(ws.path);
        if (salas.length === 0) {
          console.log('nenhuma reunião — abra uma com: opencorp meeting start "<pauta>"');
          return;
        }
        console.log("id                                   status              turnos  pauta");
        for (const s of salas) {
          console.log(
            `${s.id}  ${s.status.padEnd(19)} ${`${s.turno}/${s.max_turnos}`.padEnd(7)} ${s.pauta.slice(0, 60)}`,
          );
        }
      }),
    );

  meeting
    .command("show")
    .argument("<id>", "id da reunião (reuniao-...)")
    .description("mostra meta e transcrição completa da reunião")
    .action((id: string, opts: { workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(program, opts));
        const { sala, transcript } = await new MeetingManager().mostrar(ws.path, id);
        console.log(`id:            ${sala.id}`);
        console.log(`pauta:         ${sala.pauta}`);
        console.log(`participantes: ${sala.participantes.join(", ")}`);
        console.log(`moderador:     ${sala.moderator} (${sala.moderacao === "moderador" ? "modera os turnos" : "fora da lista — rotação fixa"})`);
        console.log(`modelo:        ${sala.modelo}`);
        console.log(`status:        ${sala.status} — ${sala.motivo_fim ?? "em andamento"}`);
        console.log(`turnos:        ${sala.turno}/${sala.max_turnos}`);
        console.log(`aberta em:     ${sala.criado_em}`);
        if (sala.encerrada_em) console.log(`encerrada em:  ${sala.encerrada_em}`);
        if (sala.ata) console.log(`ata:           ${sala.ata}`);
        console.log("\n----- transcrição -----");
        console.log(transcript.trimEnd());
      }),
    );

  meeting
    .command("end")
    .argument("<id>", "id da reunião em andamento")
    .option("--motivo <texto>", "motivo do encerramento", "encerrada pelo humano (meeting end)")
    .description("encerra de forma controlada e gera a ata")
    .action((id: string, opts: { motivo: string; workspace?: string }) =>
      comErros(async () => {
        const ws = await manager.resolver(wsDe(program, opts));
        const sala = await new MeetingManager().encerrar(ws.path, id, opts.motivo);
        console.log(
          `ok: reunião ${sala.id} encerrada (${sala.status}) — turnos: ${sala.turno}/${sala.max_turnos} · ata: ${sala.ata ?? "não gerada"}`,
        );
      }),
    );
}
