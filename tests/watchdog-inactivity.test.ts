import { describe, it, expect, vi } from "vitest";
import { WatchdogRun, obterListaRotacaoCompleta } from "../src/core/session-manager.js";

describe("WatchdogRun - Inatividade e Timeout", () => {
  it("dispara por inatividade se não receber nenhuma atividade em inatividadeMs", async () => {
    let tempoVirtual = 1_000_000;
    const agora = () => tempoVirtual;
    const sinais: string[] = [];
    let motivoEstouro: string | undefined;

    const watchdog = new WatchdogRun({
      tetoMs: 600_000,
      inatividadeMs: 60_000, // 60s
      intervaloMs: 5_000,
      gracaKillMs: 0,
      agora,
      dormir: async () => {},
      matar: (sinal) => {
        sinais.push(sinal);
      },
      aoEstourar: async (_decorrido, motivo) => {
        motivoEstouro = motivo;
      },
    });

    // Passo 1: 30s se passaram com status executando -> não deve disparar
    tempoVirtual += 30_000;
    const d1 = await watchdog.verificar();
    expect(d1).toBe(false);
    expect(watchdog.estourou).toBe(false);

    // Passo 2: Mais 31s (total 61s de inatividade) -> deve disparar!
    tempoVirtual += 31_000;
    const d2 = await watchdog.verificar();
    expect(d2).toBe(true);
    expect(watchdog.estourou).toBe(true);
    expect(sinais).toEqual(["SIGTERM", "SIGKILL"]);
    expect(motivoEstouro).toContain("inatividade: nenhuma resposta do modelo por 60s");
  });

  it("reseta timer de inatividade quando registrarAtividade() é chamado", async () => {
    let tempoVirtual = 1_000_000;
    const agora = () => tempoVirtual;
    let estourou = false;

    const watchdog = new WatchdogRun({
      tetoMs: 600_000,
      inatividadeMs: 60_000,
      agora,
      dormir: async () => {},
      matar: () => {},
      aoEstourar: async () => {
        estourou = true;
      },
    });

    // 40 segundos se passam
    tempoVirtual += 40_000;
    expect(await watchdog.verificar()).toBe(false);

    // Chega um chunk de streaming do modelo!
    watchdog.registrarAtividade();

    // Mais 40 segundos se passam (total 80s desde o início, mas apenas 40s desde o último chunk)
    tempoVirtual += 40_000;
    expect(await watchdog.verificar()).toBe(false);
    expect(estourou).toBe(false);

    // Mais 25 segundos sem chunks (65s de silêncio) -> agora sim deve estourar
    tempoVirtual += 25_000;
    expect(await watchdog.verificar()).toBe(true);
    expect(estourou).toBe(true);
  });
});

describe("obterListaRotacaoCompleta", () => {
  it("inclui modelo do agente, rotação própria e fallback global do workspace quando habilitado", async () => {
    const mockAgentStore = {
      carregar: async () => ({
        frontmatter: {
          id: "agente-teste",
          role: "Testador",
          category: "operario",
          model: "meu-provider/modelo-agente",
          rotation: ["meu-provider/fallback-1", "meu-provider/fallback-2"],
          workspace_rotation_fallback: true,
          tools: ["read"],
          permissions: "level-1" as const,
          budget: { daily_usd: 1, max_turns: 10 },
          ativo: true,
        },
        corpo: "teste",
      }),
    };

    const lista = await obterListaRotacaoCompleta(mockAgentStore as any, "/caminho/ws", "agente-teste");
    expect(lista[0]).toBe("meu-provider/modelo-agente");
    expect(lista[1]).toBe("meu-provider/fallback-1");
    expect(lista[2]).toBe("meu-provider/fallback-2");
    // Deve incluir contingência/workspace no final
    expect(lista).toContain("opencode/nemotron-3-ultra-free");
  });

  it("não inclui rotação do workspace quando workspace_rotation_fallback é false", async () => {
    const mockAgentStore = {
      carregar: async () => ({
        frontmatter: {
          id: "agente-estrito",
          role: "Testador Estrito",
          category: "operario",
          model: "estrito/modelo-1",
          rotation: ["estrito/modelo-2"],
          workspace_rotation_fallback: false,
          tools: ["read"],
          permissions: "level-1" as const,
          budget: { daily_usd: 1, max_turns: 10 },
          ativo: true,
        },
        corpo: "teste",
      }),
    };

    const lista = await obterListaRotacaoCompleta(mockAgentStore as any, "/caminho/ws", "agente-estrito");
    expect(lista[0]).toBe("estrito/modelo-1");
    expect(lista[1]).toBe("estrito/modelo-2");
  });
});

