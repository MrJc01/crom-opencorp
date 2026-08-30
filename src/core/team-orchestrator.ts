import { TeamStore, type TeamSpec, type Passo } from "./team-store.js";
import { TaskStore } from "./task-store.js";
import { TeamError } from "./errors.js";

export interface ExecutoresOrquestrador {
  rodar(agente: string, ordem: string, wsPath: string): Promise<{ id: string; captura: string }>;
}

export interface ResultadoOrquestracao {
  task_id: string;
  padrao: string;
  status_final: "feito" | "bloqueado";
  passos: { agente: string; sessao: string | null; ok: boolean; resumo: string }[];
}

interface OpcoesOrquestrador {
  executores?: ExecutoresOrquestrador;
  agora?: () => Date;
  maxMsgsHora?: number;
}

function limparAnsi(texto: string): string {
  return texto.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "").replace(/\x1B\][^\x07]*\x07/g, "");
}

function primeiraLinha(texto: string, max = 200): string {
  const linhas = limparAnsi(texto).trim().split("\n");
  for (const l of linhas) {
    const t = l.trim();
    if (t.length > 0) return t.slice(0, max);
  }
  return "";
}

function template(ordem: string, vars: { entrada: string; anterior?: string; ajustes?: string }): string {
  let r = ordem;
  r = r.replace(/\{\{entrada\}\}/g, vars.entrada ?? "");
  r = r.replace(/\{\{anterior\}\}/g, vars.anterior ?? "");
  r = r.replace(/\{\{ajustes\}\}/g, vars.ajustes ?? "");
  return r;
}

export class OrquestradorDeTeams {
  private readonly executores?: ExecutoresOrquestrador;
  private readonly tasks: TaskStore;
  private readonly teamStore = new TeamStore();

  constructor(opcoes: OpcoesOrquestrador = {}) {
    this.executores = opcoes.executores;
    this.tasks = new TaskStore({ agora: opcoes.agora, max_mensagens_hora: opcoes.maxMsgsHora });
  }

  private async getExecutor(): Promise<ExecutoresOrquestrador> {
    if (this.executores) return this.executores;
    const { SessionManager } = await import("./session-manager.js");
    return {
      rodar: async (agente: string, ordem: string, wsPath: string) => {
        const r = await new SessionManager({ cwd: wsPath }).rodar({ agente, ordem, workspaceDir: wsPath });
        return { id: r.id, captura: r.captura };
      },
    };
  }

  async executar(wsPath: string, teamId: string, entrada: string): Promise<ResultadoOrquestracao> {
    const spec = this.teamStore.obter(wsPath, teamId);
    const primeiroAgente = this.primeiroAgente(spec);

    const raiz = await this.tasks.criar(
      wsPath,
      { titulo: spec.titulo, descricao: entrada, responsavel: primeiroAgente },
      "orquestrador"
    );

    await this.tasks.mover(wsPath, raiz.id, "fazendo");
    await this.tasks.mensagem(wsPath, raiz.id, {
      autor: "orquestrador",
      corpo: `orquestração "${spec.padrao}" iniciada (team ${teamId}) — entrada: ${primeiraLinha(entrada, 120)}`,
      tipo: "sistema",
    });

    let resultado: ResultadoOrquestracao;

    switch (spec.padrao) {
      case "pipeline":
        resultado = await this.pipeline(spec, wsPath, raiz, entrada);
        break;
      case "fanout":
        resultado = await this.fanout(spec, wsPath, raiz, entrada);
        break;
      case "review":
        resultado = await this.review(spec, wsPath, raiz, entrada);
        break;
      case "debate":
        resultado = await this.debate(spec, wsPath, raiz, entrada);
        break;
      default:
        throw new TeamError(`padrão desconhecido: ${spec.padrao}`);
    }

    return resultado;
  }

  private primeiroAgente(spec: TeamSpec): string {
    switch (spec.padrao) {
      case "pipeline":
        return spec.passos?.[0]?.agente ?? "agente:executor-padrao";
      case "fanout":
        return spec.paralelos?.[0]?.agente ?? "agente:executor-padrao";
      case "review":
        return spec.executor?.agente ?? "agente:executor-padrao";
      case "debate":
        return spec.proponentes?.[0]?.agente ?? "agente:executor-padrao";
    }
  }

  private async executarPasso(
    wsPath: string,
    task: { id: string },
    passo: Passo,
    ordem: string,
    rotulo: string
  ): Promise<{ ok: boolean; sessao: string | null; resumo: string }> {
    const exec = await this.getExecutor();
    try {
      const r = await exec.rodar(passo.agente, ordem, wsPath);
      const resumo = primeiraLinha(r.captura);
      await this.tasks.mensagem(wsPath, task.id, {
        autor: `agente:${passo.agente}`,
        corpo: resumo,
        tipo: "handoff",
      });
      return { ok: true, sessao: r.id, resumo };
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      await this.tasks.mensagem(wsPath, task.id, {
        autor: "orquestrador",
        corpo: `passo "${rotulo}" falhou (agente ${passo.agente}): ${msg}`,
        tipo: "sistema",
      });
      return { ok: false, sessao: null, resumo: msg };
    }
  }

  private async pipeline(
    spec: TeamSpec,
    wsPath: string,
    raiz: { id: string },
    entrada: string
  ): Promise<ResultadoOrquestracao> {
    const passos = spec.passos ?? [];
    const passosResultado: ResultadoOrquestracao["passos"] = [];
    let anterior = "";

    for (let i = 0; i < passos.length; i++) {
      const passo = passos[i];
      const ordem = template(passo.ordem, { entrada, anterior });
      const rotulo = `${i + 1}/${passos.length}:${passo.agente}`;
      const r = await this.executarPasso(wsPath, raiz, passo, ordem, rotulo);
      passosResultado.push({ agente: passo.agente, ...r });
      if (!r.ok) {
        await this.tasks.mover(wsPath, raiz.id, "bloqueado");
        await this.tasks.mensagem(wsPath, raiz.id, {
          autor: "orquestrador",
          corpo: "pipeline interrompido — escala humano",
          tipo: "sistema",
        });
        return { task_id: raiz.id, padrao: "pipeline", status_final: "bloqueado", passos: passosResultado };
      }
      anterior = r.resumo;
    }

    await this.tasks.mover(wsPath, raiz.id, "feito");
    await this.tasks.mensagem(wsPath, raiz.id, {
      autor: "orquestrador",
      corpo: `pipeline concluído (${passos.length} passos)`,
      tipo: "sistema",
    });
    return { task_id: raiz.id, padrao: "pipeline", status_final: "feito", passos: passosResultado };
  }

  private async fanout(
    spec: TeamSpec,
    wsPath: string,
    raiz: { id: string },
    entrada: string
  ): Promise<ResultadoOrquestracao> {
    const paralelos = spec.paralelos ?? [];
    const passosResultado: ResultadoOrquestracao["passos"] = [];
    const subtaskIds: string[] = [];

    for (const p of paralelos) {
      const subtask = await this.tasks.criar(
        wsPath,
        { titulo: `${spec.titulo} — ${p.agente}`, responsavel: `agente:${p.agente}`, task_pai: raiz.id },
        "orquestrador"
      );
      await this.tasks.mover(wsPath, subtask.id, "fazendo");
      subtaskIds.push(subtask.id);
    }

    await this.tasks.definirDependencias(wsPath, raiz.id, subtaskIds);

    const resultados = await Promise.allSettled(
      paralelos.map(async (p, idx) => {
        await this.tasks.travar(wsPath, subtaskIds[idx], "orquestrador");
        try {
          const ordem = template(p.ordem, { entrada });
          const rotulo = `fanout/${p.agente}`;
          const r = await this.executarPasso(wsPath, { id: subtaskIds[idx] }, p, ordem, rotulo);
          passosResultado.push({ agente: p.agente, ...r });
          return { idx, ok: r.ok };
        } finally {
          await this.tasks.liberar(wsPath, subtaskIds[idx], "orquestrador");
        }
      })
    );

    const falhas = resultados.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok));

    if (falhas.length > 0) {
      await this.tasks.mover(wsPath, raiz.id, "bloqueado");
      await this.tasks.mensagem(wsPath, raiz.id, {
        autor: "orquestrador",
        corpo: `fanout com falhas (${falhas.length}/${paralelos.length}) — escala humano`,
        tipo: "sistema",
      });
      for (const r of resultados) {
        if (r.status === "fulfilled" && r.value.ok) {
          await this.tasks.mover(wsPath, subtaskIds[r.value.idx], "feito");
        } else {
          await this.tasks.mensagem(wsPath, subtaskIds[resultados.indexOf(r)], {
            autor: "orquestrador",
            corpo: "subtask falhou — mantida em fazendo para inspeção",
            tipo: "sistema",
          });
        }
      }
      return { task_id: raiz.id, padrao: "fanout", status_final: "bloqueado", passos: passosResultado };
    }

    for (const sid of subtaskIds) {
      await this.tasks.mover(wsPath, sid, "feito");
    }

    await this.tasks.mensagem(wsPath, raiz.id, {
      autor: "orquestrador",
      corpo: `barreira liberada: todas as ${paralelos.length} subtasks concluídas`,
      tipo: "sistema",
    });

    if (spec.sintese) {
      const capturas = passosResultado.map((pr) => `## ${pr.agente}\n${pr.resumo.slice(0, 600)}\n\n`).join("");
      const ordem = template(spec.sintese.ordem, { entrada, anterior: capturas });
      const r = await this.executarPasso(wsPath, raiz, spec.sintese, ordem, "síntese");
      passosResultado.push({ agente: spec.sintese.agente, ...r });
    }

    await this.tasks.mover(wsPath, raiz.id, "feito");
    return { task_id: raiz.id, padrao: "fanout", status_final: "feito", passos: passosResultado };
  }

  private async review(
    spec: TeamSpec,
    wsPath: string,
    raiz: { id: string },
    entrada: string
  ): Promise<ResultadoOrquestracao> {
    const turnos = spec.turnos ?? 2;
    const executor = spec.executor!;
    const revisor = spec.revisor!;
    const passosResultado: ResultadoOrquestracao["passos"] = [];
    let ajustes = "";
    let capturaExecutor = "";

    for (let t = 1; t <= turnos; t++) {
      const ordemExecutor = template(executor.ordem, { entrada, ajustes });
      const rExec = await this.executarPasso(wsPath, raiz, executor, ordemExecutor, `review/turno${t}/executor`);
      passosResultado.push({ agente: executor.agente, ...rExec });
      if (!rExec.ok) {
        await this.tasks.mover(wsPath, raiz.id, "bloqueado");
        await this.tasks.mensagem(wsPath, raiz.id, {
          autor: "orquestrador",
          corpo: "review interrompido: executor falhou — escala humano",
          tipo: "sistema",
        });
        return { task_id: raiz.id, padrao: "review", status_final: "bloqueado", passos: passosResultado };
      }
      capturaExecutor = rExec.resumo;

      const ordemRevisor = template(revisor.ordem, { entrada, anterior: capturaExecutor }) +
        "\n\nPROTOCOL: responda na PRIMEIRA linha exatamente 'APROVADO' ou 'AJUSTES: <motivo>'.";
      const rRev = await this.executarPasso(wsPath, raiz, revisor, ordemRevisor, `review/turno${t}/revisor`);
      passosResultado.push({ agente: revisor.agente, ...rRev });
      if (!rRev.ok) {
        await this.tasks.mover(wsPath, raiz.id, "bloqueado");
        await this.tasks.mensagem(wsPath, raiz.id, {
          autor: "orquestrador",
          corpo: "review interrompido: revisor falhou — escala humano",
          tipo: "sistema",
        });
        return { task_id: raiz.id, padrao: "review", status_final: "bloqueado", passos: passosResultado };
      }

      const primeiraOriginal = primeiraLinha(rRev.resumo).trim();
      const primeira = primeiraOriginal.toLowerCase();
      if (primeira.startsWith("aprovado")) {
        await this.tasks.mover(wsPath, raiz.id, "feito");
        await this.tasks.mensagem(wsPath, raiz.id, {
          autor: "orquestrador",
          corpo: `revisão aprovada em ${t} turno(s)`,
          tipo: "sistema",
        });
        return { task_id: raiz.id, padrao: "review", status_final: "feito", passos: passosResultado };
      }

      const motivo = primeira.startsWith("ajustes:") ? primeiraOriginal.slice("ajustes:".length).trim() : primeiraOriginal;
      ajustes = motivo;
      await this.tasks.mensagem(wsPath, raiz.id, {
        autor: `agente:${revisor.agente}`,
        corpo: `ajustes pedidos: ${motivo}`,
        tipo: "comentario",
      });
    }

    await this.tasks.mover(wsPath, raiz.id, "bloqueado");
    await this.tasks.mensagem(wsPath, raiz.id, {
      autor: "orquestrador",
      corpo: `revisão não aprovada após ${turnos} turnos — escala humano`,
      tipo: "sistema",
    });
    return { task_id: raiz.id, padrao: "review", status_final: "bloqueado", passos: passosResultado };
  }

  private async debate(
    spec: TeamSpec,
    wsPath: string,
    raiz: { id: string },
    entrada: string
  ): Promise<ResultadoOrquestracao> {
    const proponentes = spec.proponentes ?? [];
    const moderador = spec.moderador!;
    const passosResultado: ResultadoOrquestracao["passos"] = [];
    const capturas: { agente: string; captura: string }[] = [];

    const resultados = await Promise.allSettled(
      proponentes.map(async (p) => {
        const ordem = template(p.ordem, { entrada });
        const exec = await this.getExecutor();
        const r = await exec.rodar(p.agente, ordem, wsPath);
        const resumo = primeiraLinha(r.captura);
        await this.tasks.mensagem(wsPath, raiz.id, {
          autor: `agente:${p.agente}`,
          corpo: resumo,
          tipo: "comentario",
        });
        capturas.push({ agente: p.agente, captura: r.captura });
        passosResultado.push({ agente: p.agente, sessao: r.id, ok: true, resumo });
        return { agente: p.agente, captura: r.captura };
      })
    );

    const proponentesOk = resultados
      .filter((r): r is PromiseFulfilledResult<{ agente: string; captura: string }> => r.status === "fulfilled")
      .map((r) => r.value);

    if (proponentesOk.length === 0) {
      await this.tasks.mover(wsPath, raiz.id, "bloqueado");
      await this.tasks.mensagem(wsPath, raiz.id, {
        autor: "orquestrador",
        corpo: "debate: todos os proponentes falharam — escala humano",
        tipo: "sistema",
      });
      for (const r of resultados) {
        if (r.status === "rejected") {
          passosResultado.push({ agente: "desconhecido", sessao: null, ok: false, resumo: r.reason instanceof Error ? r.reason.message : String(r.reason) });
        }
      }
      return { task_id: raiz.id, padrao: "debate", status_final: "bloqueado", passos: passosResultado };
    }

    const propostasTexto = proponentesOk
      .map((p, i) => `${i + 1}. (${p.agente}) ${primeiraLinha(p.captura, 600)}`)
      .join("\n");
    const ordemModerador = `Pergunta: ${entrada}\n\nPropostas:\n${propostasTexto}\n\nResponda na PRIMEIRA linha 'DECISÃO: <escolha>' e justifique.`;

    const exec = await this.getExecutor();
    const rMod = await exec.rodar(moderador.agente, ordemModerador, wsPath);
    const resumoMod = primeiraLinha(rMod.captura);
    await this.tasks.mensagem(wsPath, raiz.id, {
      autor: `agente:${moderador.agente}`,
      corpo: limparAnsi(rMod.captura).trim(),
      tipo: "decisao",
    });
    passosResultado.push({ agente: moderador.agente, sessao: rMod.id, ok: true, resumo: resumoMod });

    await this.tasks.mover(wsPath, raiz.id, "feito");
    await this.tasks.mensagem(wsPath, raiz.id, {
      autor: "orquestrador",
      corpo: `debate concluído (${proponentesOk.length} propostas)`,
      tipo: "sistema",
    });
    return { task_id: raiz.id, padrao: "debate", status_final: "feito", passos: passosResultado };
  }
}