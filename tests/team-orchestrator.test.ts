import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TeamStore } from "../src/core/team-store.js";
import { TaskStore } from "../src/core/task-store.js";
import { OrquestradorDeTeams, ExecutoresOrquestrador } from "../src/core/team-orchestrator.js";

const raizes: string[] = [];

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

let relogio = 0;
let wsPath = "";
let store: TaskStore;
let teamStore: TeamStore;

function criarExecutorFake(respostas: Record<string, () => string | Promise<string>>): ExecutoresOrquestrador {
  const chamadas: { agente: string; ordem: string }[] = [];
  return {
    rodar: async (agente: string, ordem: string) => {
      chamadas.push({ agente, ordem });
      const fn = respostas[agente];
      const captura = fn ? await fn() : "ok";
      return { id: `sess-${chamadas.length}`, captura };
    },
    _chamadas: chamadas,
  } as ExecutoresOrquestrador & { _chamadas: { agente: string; ordem: string }[] };
}

beforeEach(async () => {
  const home = await mkdtemp(join(tmpdir(), "opencorp-team-"));
  raizes.push(home);
  const { WorkspaceManager } = await import("../src/core/workspace-manager.js");
  const ws = await new WorkspaceManager({ homeDir: home, cwd: home }).criar("corp-teams");
  wsPath = ws.path;
  relogio = Date.now();
  store = new TaskStore({ agora: () => new Date((relogio += 60_000)) });
  teamStore = new TeamStore();
});

describe("OrquestradorDeTeams — pipeline", () => {
  it("executa 2 passos em ordem; 2ª chamada recebe {{anterior}} = captura do 1º; task raiz em 'feito'; chat tem 2 handoffs + sistemas", async () => {
    const spec = await teamStore.criar(wsPath, {
      id: "pipe-2",
      titulo: "Pipeline teste",
      padrao: "pipeline",
      passos: [
        { agente: "a", ordem: "faça A com {{entrada}}" },
        { agente: "b", ordem: "faça B após {{anterior}}" },
      ],
    });

    const exec = criarExecutorFake({
      a: () => "captura A concluída",
      b: () => "captura B concluída",
    });

    const orq = new OrquestradorDeTeams({ executores: exec, agora: () => new Date((relogio += 60_000)) });
    const res = await orq.executar(wsPath, "pipe-2", "entrada inicial");

    expect(res.task_id).toMatch(/^tsk-/);
    expect(res.padrao).toBe("pipeline");
    expect(res.status_final).toBe("feito");
    expect(res.passos).toHaveLength(2);
    expect(res.passos[0].agente).toBe("a");
    expect(res.passos[0].ok).toBe(true);
    expect(res.passos[1].agente).toBe("b");
    expect(res.passos[1].ok).toBe(true);

    const chamadas = exec._chamadas;
    expect(chamadas).toHaveLength(2);
    expect(chamadas[0].agente).toBe("a");
    expect(chamadas[0].ordem).toBe("faça A com entrada inicial");
    expect(chamadas[1].agente).toBe("b");
    expect(chamadas[1].ordem).toContain("captura A concluída");

    const raiz = await store.obter(wsPath, res.task_id);
    expect(raiz.coluna).toBe("feito");

    const chat = await store.chat(wsPath, res.task_id);
    const sistemas = chat.filter((m) => m.tipo === "sistema");
    const handoffs = chat.filter((m) => m.tipo === "handoff");
    expect(sistemas.length).toBeGreaterThanOrEqual(2);
    expect(handoffs.length).toBe(2);
  });

  it("falha no 2º passo → status 'bloqueado'; task em bloqueado; mensagem contendo 'falhou' e 'escala humano'", async () => {
    const spec = await teamStore.criar(wsPath, {
      id: "pipe-fail",
      titulo: "Pipeline com falha",
      padrao: "pipeline",
      passos: [
        { agente: "a", ordem: "faça A" },
        { agente: "b", ordem: "faça B" },
      ],
    });

    const exec = criarExecutorFake({
      a: () => "ok A",
      b: () => { throw new Error("erro no B"); },
    });

    const orq = new OrquestradorDeTeams({ executores: exec, agora: () => new Date((relogio += 60_000)) });
    const res = await orq.executar(wsPath, "pipe-fail", "entrada");

    expect(res.status_final).toBe("bloqueado");
    expect(res.passos[0].ok).toBe(true);
    expect(res.passos[1].ok).toBe(false);

    const raiz = await store.obter(wsPath, res.task_id);
    expect(raiz.coluna).toBe("bloqueado");

    const chat = await store.chat(wsPath, res.task_id);
    const msgFalhou = chat.find((m) => m.corpo.includes("falhou") && m.tipo === "sistema");
    const msgEscala = chat.find((m) => m.corpo.includes("escala humano") && m.tipo === "sistema");
    expect(msgFalhou).toBeDefined();
    expect(msgEscala).toBeDefined();
  });
});

describe("OrquestradorDeTeams — fanout", () => {
  it("2 paralelos + síntese → 3 chamadas; subtasks em 'feito' com task_pai = raiz; raiz.bloqueado_por contém os 2 ids; raiz em 'feito'; ordem da síntese contém as duas capturas", async () => {
    const spec = await teamStore.criar(wsPath, {
      id: "fanout-2",
      titulo: "Fanout teste",
      padrao: "fanout",
      paralelos: [
        { agente: "x", ordem: "analise X para {{entrada}}" },
        { agente: "y", ordem: "analise Y para {{entrada}}" },
      ],
      sintese: { agente: "sint", ordem: "sintetize: {{anterior}}" },
    });

    const exec = criarExecutorFake({
      x: () => "resultado X detalhado",
      y: () => "resultado Y detalhado",
      sint: () => "síntese final",
    });

    const orq = new OrquestradorDeTeams({ executores: exec, agora: () => new Date((relogio += 60_000)) });
    const res = await orq.executar(wsPath, "fanout-2", "entrada fanout");

    expect(res.status_final).toBe("feito");
    expect(res.passos).toHaveLength(3);

    const chamadas = exec._chamadas;
    expect(chamadas).toHaveLength(3);
    expect(chamadas[0].agente).toBe("x");
    expect(chamadas[1].agente).toBe("y");
    expect(chamadas[2].agente).toBe("sint");
    expect(chamadas[2].ordem).toContain("resultado X detalhado");
    expect(chamadas[2].ordem).toContain("resultado Y detalhado");

    const raiz = await store.obter(wsPath, res.task_id);
    expect(raiz.coluna).toBe("feito");
    // raiz.bloqueado_por should contain the subtask IDs
    const subtasksAll = await store.listar(wsPath);
    const filhasIds = subtasksAll.filter((t) => t.task_pai === raiz.id).map((t) => t.id).sort();
    expect(raiz.bloqueado_por.sort()).toEqual(filhasIds);

    const subtasks = await store.listar(wsPath);
    const filhas = subtasks.filter((t) => t.task_pai === raiz.id);
    expect(filhas.length).toBe(2);
    for (const f of filhas) {
      expect(f.coluna).toBe("feito");
      expect(f.task_pai).toBe(raiz.id);
    }
  });

  it("falha em um paralelo → raiz 'bloqueado'; subtask ok vai para 'feito'; falha permanece 'fazendo' com mensagem sistema", async () => {
    const spec = await teamStore.criar(wsPath, {
      id: "fanout-fail",
      titulo: "Fanout com falha",
      padrao: "fanout",
      paralelos: [
        { agente: "ok", ordem: "faça OK" },
        { agente: "fail", ordem: "faça FAIL" },
      ],
    });

    const exec = criarExecutorFake({
      ok: () => "sucesso",
      fail: () => { throw new Error("boom"); },
    });

    const orq = new OrquestradorDeTeams({ executores: exec, agora: () => new Date((relogio += 60_000)) });
    const res = await orq.executar(wsPath, "fanout-fail", "entrada");

    expect(res.status_final).toBe("bloqueado");

    const raiz = await store.obter(wsPath, res.task_id);
    expect(raiz.coluna).toBe("bloqueado");

    const subtasks = await store.listar(wsPath);
    const filhas = subtasks.filter((t) => t.task_pai === raiz.id);
    expect(filhas.length).toBe(2);
    const okTask = filhas.find((f) => f.responsavel === "agente:ok");
    const failTask = filhas.find((f) => f.responsavel === "agente:fail");
    expect(okTask?.coluna).toBe("feito");
    expect(failTask?.coluna).toBe("fazendo");

    const chatFail = await store.chat(wsPath, failTask!.id);
    const msgSistema = chatFail.find((m) => m.tipo === "sistema" && m.corpo.includes("subtask falhou"));
    expect(msgSistema).toBeDefined();
  });
});

describe("OrquestradorDeTeams — review", () => {
  it("aprovado no 1º turno — revisor responde 'APROVADO\\nok'; exatamente 2 chamadas; raiz 'feito'", async () => {
    const spec = await teamStore.criar(wsPath, {
      id: "review-1",
      titulo: "Review teste",
      padrao: "review",
      executor: { agente: "exec", ordem: "produza para {{entrada}}" },
      revisor: { agente: "rev", ordem: "revise {{anterior}}" },
      turnos: 2,
    });

    const exec = criarExecutorFake({
      exec: () => "produção feita",
      rev: () => "APROVADO\nok",
    });

    const orq = new OrquestradorDeTeams({ executores: exec, agora: () => new Date((relogio += 60_000)) });
    const res = await orq.executar(wsPath, "review-1", "entrada review");

    expect(res.status_final).toBe("feito");
    expect(res.passos).toHaveLength(2);
    expect(res.passos[0].agente).toBe("exec");
    expect(res.passos[1].agente).toBe("rev");
    expect(exec._chamadas).toHaveLength(2);

    const raiz = await store.obter(wsPath, res.task_id);
    expect(raiz.coluna).toBe("feito");

    const chat = await store.chat(wsPath, res.task_id);
    const msgAprovado = chat.find((m) => m.tipo === "sistema" && m.corpo.includes("revisão aprovada"));
    expect(msgAprovado).toBeDefined();
  });

  it("1º turno 'AJUSTES: faltou X', executor recebe {{ajustes}} contendo 'faltou X' na rodada 2; 2º turno aprovado — 4 chamadas; raiz 'feito'", async () => {
    const spec = await teamStore.criar(wsPath, {
      id: "review-ajustes",
      titulo: "Review com ajustes",
      padrao: "review",
      executor: { agente: "exec", ordem: "produza {{ajustes}} para {{entrada}}" },
      revisor: { agente: "rev", ordem: "revise {{anterior}}" },
      turnos: 2,
    });

    let turno = 0;
    const exec = criarExecutorFake({
      exec: () => {
        turno++;
        return `produção turno ${turno}`;
      },
      rev: () => {
        if (turno === 1) return "AJUSTES: faltou X";
        return "APROVADO\nok";
      },
    });

    const orq = new OrquestradorDeTeams({ executores: exec, agora: () => new Date((relogio += 60_000)) });
    const res = await orq.executar(wsPath, "review-ajustes", "entrada");

    expect(res.status_final).toBe("feito");
    expect(res.passos).toHaveLength(4);
    expect(exec._chamadas).toHaveLength(4);

    const ordem2 = exec._chamadas[2].ordem;
    expect(ordem2).toContain("faltou X");

    const raiz = await store.obter(wsPath, res.task_id);
    expect(raiz.coluna).toBe("feito");
  });

  it("turnos esgotados (sempre AJUSTES, turnos: 2) — 4 chamadas; raiz 'bloqueado'; mensagem contém 'escala humano'", async () => {
    const spec = await teamStore.criar(wsPath, {
      id: "review-esgotado",
      titulo: "Review esgotado",
      padrao: "review",
      executor: { agente: "exec", ordem: "produza" },
      revisor: { agente: "rev", ordem: "revise" },
      turnos: 2,
    });

    let turno = 0;
    const exec = criarExecutorFake({
      exec: () => { turno++; return `produção ${turno}`; },
      rev: () => "AJUSTES: ainda não",
    });

    const orq = new OrquestradorDeTeams({ executores: exec, agora: () => new Date((relogio += 60_000)) });
    const res = await orq.executar(wsPath, "review-esgotado", "entrada");

    expect(res.status_final).toBe("bloqueado");
    expect(exec._chamadas).toHaveLength(4);

    const raiz = await store.obter(wsPath, res.task_id);
    expect(raiz.coluna).toBe("bloqueado");

    const chat = await store.chat(wsPath, res.task_id);
    const msgEscala = chat.find((m) => m.tipo === "sistema" && m.corpo.includes("escala humano"));
    expect(msgEscala).toBeDefined();
  });
});

describe("OrquestradorDeTeams — debate", () => {
  it("2 proponentes + moderador; ordem do moderador contém '1. (a)' e '2. (b)'; mensagem tipo 'decisao' no chat; raiz 'feito'", async () => {
    const spec = await teamStore.criar(wsPath, {
      id: "debate-1",
      titulo: "Debate teste",
      padrao: "debate",
      proponentes: [
        { agente: "a", ordem: "proposta A para {{entrada}}" },
        { agente: "b", ordem: "proposta B para {{entrada}}" },
      ],
      moderador: { agente: "mod", ordem: "decida" },
    });

    const exec = criarExecutorFake({
      a: () => "proposta A longa e detalhada",
      b: () => "proposta B longa e detalhada",
      mod: () => "DECISÃO: A\nporque é melhor",
    });

    const orq = new OrquestradorDeTeams({ executores: exec, agora: () => new Date((relogio += 60_000)) });
    const res = await orq.executar(wsPath, "debate-1", "pergunta do debate");

    expect(res.status_final).toBe("feito");
    expect(res.passos).toHaveLength(3);
    expect(exec._chamadas).toHaveLength(3);

    const ordemMod = exec._chamadas[2].ordem;
    expect(ordemMod).toContain("1. (a)");
    expect(ordemMod).toContain("2. (b)");

    const chat = await store.chat(wsPath, res.task_id);
    const msgDecisao = chat.find((m) => m.tipo === "decisao");
    expect(msgDecisao).toBeDefined();
    expect(msgDecisao?.autor).toBe("agente:mod");

    const raiz = await store.obter(wsPath, res.task_id);
    expect(raiz.coluna).toBe("feito");
  });
});