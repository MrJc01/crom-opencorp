/**
 * Migração team→fluxo (PLANO-WEB-CRUD F3): converte specs legados de
 * `.opencorp/teams/<id>.json` em flows do novo motor (nós fanout/review/debate
 * ou sequência de nós agente). Teams permanecem no disco como legado read-only.
 */

import type { TeamStore, TeamSpec } from "./team-store.js";
import type { FlowStore, Flow } from "./flow-store.js";
import { FlowError } from "./errors.js";

export interface ResultadoMigracao {
  criados: string[];
  pulados: Array<{ id: string; motivo: string }>;
}

/** Converte um spec de team no grafo equivalente */
export function specTeamParaFlow(team: TeamSpec): Flow {
  const nos: Flow["nos"] = [{ id: "gatilho", tipo: "manual", config: {} }];
  const arestas: Flow["arestas"] = [];

  if (team.padrao === "pipeline") {
    let anterior = "gatilho";
    (team.passos ?? []).forEach((p, i) => {
      const id = `passo-${i + 1}`;
      nos.push({ id, tipo: "agente", config: { agente: p.agente, ordem: p.ordem } });
      arestas.push({ de: anterior, para: id });
      anterior = id;
    });
  } else if (team.padrao === "fanout") {
    nos.push({
      id: "fanout",
      tipo: "fanout",
      config: {
        paralelos: team.paralelos ?? [],
        ...(team.sintese ? { sintese: team.sintese } : {}),
      },
    });
    arestas.push({ de: "gatilho", para: "fanout" });
  } else if (team.padrao === "review") {
    nos.push({
      id: "review",
      tipo: "review",
      config: {
        executor: team.executor ?? { agente: "executor-padrao", ordem: "Execute a entrada." },
        revisor: team.revisor ?? { agente: "secretario", ordem: "Revise a entrega." },
        ...(team.turnos ? { turnos: team.turnos } : {}),
      },
    });
    arestas.push({ de: "gatilho", para: "review" });
  } else {
    nos.push({
      id: "debate",
      tipo: "debate",
      config: {
        proponentes: team.proponentes ?? [],
        moderador: team.moderador ?? { agente: "secretario" },
      },
    });
    arestas.push({ de: "gatilho", para: "debate" });
  }

  return { id: team.id, nome: team.titulo || team.id, nos, arestas };
}

/** Migra TODOS os teams do workspace para flows. Idempotente: flow existente é pulado.
 *  Sucesso → o team é ARQUIVADO (renomeado para <id>.json.migrado): sai das listagens
 *  (só o novo motor executa) e o arquivo original continua no disco como legado. */
export async function migrarTeamsParaFlows(wsPath: string, teams: TeamStore, flows: FlowStore): Promise<ResultadoMigracao> {
  const resumo: ResultadoMigracao = { criados: [], pulados: [] };
  const { rename } = await import("node:fs/promises");
  for (const t of teams.listar(wsPath)) {
    try {
      const spec = teams.obter(wsPath, t.id);
      const flow = specTeamParaFlow(spec);
      const existente = await flows.obter(wsPath, flow.id).catch(() => null);
      if (existente) {
        resumo.pulados.push({ id: flow.id, motivo: "já existe um flow com este id" });
        continue;
      }
      await flows.salvar(wsPath, flow);
      try {
        await rename(teams.caminho(wsPath, t.id), teams.caminho(wsPath, t.id) + ".migrado");
      } catch {
        // flow criado, mas o team ficou listado — reportar honestamente (auditoria #9);
        // na próxima rodada o flow existente é pulado (idempotente)
        resumo.pulados.push({ id: flow.id, motivo: "flow criado, mas falhou ao arquivar o team (.json.migrado)" });
        continue;
      }
      resumo.criados.push(flow.id);
    } catch (erro) {
      resumo.pulados.push({ id: t.id, motivo: erro instanceof FlowError ? erro.message : String(erro) });
    }
  }
  return resumo;
}
