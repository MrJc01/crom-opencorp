import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskStore } from "../src/core/task-store.js";
import { instalarMencoes, pendentesMencoes } from "../src/core/mention-runner.js";
import { eventBus } from "../src/core/event-bus.js";

const raizes: string[] = [];

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

let relogio = 0;
let wsPath = "";
let store: TaskStore;
let cleanupListener: (() => void) | null = null;

// Fake executor compartilhado
const fakeExecutor = {
  rodar: vi.fn(async (agente: string, ordem: string) => {
    fakeExecutor.chamadas.push({ agente, ordem, timestamp: Date.now() });
    return { id: `exec-${agente}-${Date.now()}`, captura: "resposta" };
  }),
  chamadas: [] as { agente: string; ordem: string; timestamp: number }[],
};

beforeEach(async () => {
  const home = await mkdtemp(join(tmpdir(), "opencorp-mention-"));
  raizes.push(home);
  const { WorkspaceManager } = await import("../src/core/workspace-manager.js");
  const ws = await new WorkspaceManager({ homeDir: home, cwd: home }).criar("corp-mention");
  wsPath = ws.path;
  relogio = Date.now();
  const agora = () => new Date((relogio += 60_000));
  store = new TaskStore({ agora });

  // Limpa chamadas anteriores para isolamento
  fakeExecutor.chamadas.length = 0;

  // Remove listener anterior se existir
  if (cleanupListener) {
    cleanupListener();
  }

  // Instala o mention-runner com o clock mockado
  cleanupListener = instalarMencoes({
    executores: fakeExecutor as any,
    max_mensagens_auto_h: 20,
    agora,
  });

  // Aguarda um tick para garantir que o listener está pronto
  await new Promise((r) => setTimeout(r, 10));
});

afterEach(() => {
  if (cleanupListener) {
    cleanupListener();
    cleanupListener = null;
  }
});

async function postarMsg(taskId: string, autor: string, corpo: string, tipo = "comentario") {
  await store.mensagem(wsPath, taskId, { autor, corpo, tipo });
  // Aguarda processamento das menções
  await Promise.all(pendentesMencoes());
  // Pequeno atraso para processamento assíncrono
  await new Promise((r) => setTimeout(r, 10));
}

function obterChamadasNovas(desde: number) {
  return fakeExecutor.chamadas.slice(desde);
}

function ultimaMsgSistema(taskId: string) {
  return store.chat(wsPath, taskId).then((msgs) => msgs.filter((m) => m.tipo === "sistema").pop());
}

describe("mention-runner — spawn por menção no chat", () => {
  it("menção @agente dispara spawn com bundle", async () => {
    const t = await store.criar(wsPath, { titulo: "Revisar documento" });
    const antes = fakeExecutor.chamadas.length;
    await postarMsg(t.id, "humano", "olha isso @revisor");
    const novas = obterChamadasNovas(antes);
    expect(novas.length).toBe(1);
    expect(novas[0].agente).toBe("revisor");
    expect(novas[0].ordem).toContain("Revisar documento");
    expect(novas[0].ordem).toContain("opencorp task chat");
    expect(novas[0].ordem).toContain("--autor agente:revisor");
  });

  it("menção própria não spawna", async () => {
    const t = await store.criar(wsPath, { titulo: "Teste" });
    const antes = fakeExecutor.chamadas.length;
    await postarMsg(t.id, "agente:a", "eu mesmo @a");
    const novas = obterChamadasNovas(antes);
    expect(novas.length).toBe(0);
  });

  it("loop guard bloqueia ping-pong", async () => {
    const t = await store.criar(wsPath, { titulo: "Ping Pong" });

    // 4 mensagens consecutivas do par {agente:a, agente:b} com menções mútuas
    await postarMsg(t.id, "agente:a", "@b faça");
    await postarMsg(t.id, "agente:b", "@a feito?");
    await postarMsg(t.id, "agente:a", "@b tá ok");
    await postarMsg(t.id, "agente:b", "@a confirma");

    // Agora agente:a menciona @b de novo — deve ser bloqueado pelo loop guard
    const antes = fakeExecutor.chamadas.length;
    await postarMsg(t.id, "agente:a", "@b mais uma");

    const novas = obterChamadasNovas(antes);
    expect(novas.length).toBe(0);

    const ultima = await ultimaMsgSistema(t.id);
    expect(ultima?.corpo).toContain("loop guard");
    expect(ultima?.corpo).toContain("ping-pong");
    expect(ultima?.corpo).toContain("pausado, escala humano");
  });

  it("lease guard: task travada → fila sem spawn", async () => {
    const t = await store.criar(wsPath, { titulo: "Travada" });
    // Trava a task por outro agente
    await store.travar(wsPath, t.id, "agente:outro", 30);

    const antes = fakeExecutor.chamadas.length;
    await postarMsg(t.id, "humano", "@revisor olha");

    const novas = obterChamadasNovas(antes);
    expect(novas.length).toBe(0);

    const ultima = await ultimaMsgSistema(t.id);
    expect(ultima?.corpo).toContain("fila");
    expect(ultima?.corpo).toContain("revisor");
    expect(ultima?.corpo).toContain("aguarda lock");
  });

  it("rate guard: orquestrador acima do limite", async () => {
    const t = await store.criar(wsPath, { titulo: "Rate" });

    // Reinstala mention-runner com limite baixo para este teste
    if (cleanupListener) cleanupListener();
    cleanupListener = instalarMencoes({
      executores: fakeExecutor as any,
      max_mensagens_auto_h: 5,
      agora: () => new Date((relogio += 60_000)),
    });
    await new Promise((r) => setTimeout(r, 10));

    // Posta 6 mensagens do orquestrador (sem menções) — limite = 5
    for (let i = 0; i < 6; i++) {
      await store.mensagem(wsPath, t.id, { autor: "orquestrador", corpo: `auto ${i}`, tipo: "sistema" });
    }
    await Promise.all(pendentesMencoes());
    await new Promise((r) => setTimeout(r, 10));

    // Próxima mensagem com menção deve ser bloqueada
    const antes = fakeExecutor.chamadas.length;
    await postarMsg(t.id, "humano", "@revisor ajuda");

    const novas = obterChamadasNovas(antes);
    expect(novas.length).toBe(0);

    const ultima = await ultimaMsgSistema(t.id);
    expect(ultima?.corpo).toContain("rate guard");
    expect(ultima?.corpo).toContain("5 mensagens automáticas/hora");
    expect(ultima?.corpo).toContain("escala humano");
  });

  it("spawn falho posta escala e libera lock", async () => {
    const t = await store.criar(wsPath, { titulo: "Falha" });

    // Substitui o executor por um que falha para este teste
    const executorOriginal = fakeExecutor.rodar;
    let erroLancado = false;
    fakeExecutor.rodar = vi.fn(async (agente: string, ordem: string) => {
      erroLancado = true;
      fakeExecutor.chamadas.push({ agente, ordem, timestamp: Date.now() });
      throw new Error("explodiu");
    });

    try {
      const antes = fakeExecutor.chamadas.length;
      await postarMsg(t.id, "humano", "@revisor ajuda");

      const novas = obterChamadasNovas(antes);
      expect(novas.length).toBe(1); // Tentou chamar
      expect(erroLancado).toBe(true);

      // Verifica que a mensagem de erro foi postada
      const ultima = await ultimaMsgSistema(t.id);
      expect(ultima?.corpo).toContain("falhou");
      expect(ultima?.corpo).toContain("explodiu");
      expect(ultima?.corpo).toContain("escala humano");

      // Verifica que o lock foi liberado (finally)
      const task = await store.obter(wsPath, t.id);
      expect(task.lock_por).toBeNull();
    } finally {
      // Restaura executor original
      fakeExecutor.rodar = executorOriginal;
    }
  });
});