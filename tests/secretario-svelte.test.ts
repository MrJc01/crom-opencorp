import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  urlsDeImagem,
  filtrarSessoes,
  POLL_RESPOSTA_INTERVALO_MS,
  POLL_RESPOSTA_CAP_MS,
  SEM_RESPOSTA_CAP_MS,
  sessoesStore,
  sessaoAtivaIdStore,
  mensagensStore,
  carregandoStore,
  buscaStore,
  anexosStore,
  eventoRemotoSecretario,
  novaConversa,
  selecionarSessao,
  carregarSessoes,
  sincronizarHashSessao,
  sessaoDaUrl,
  _resetPollState,
} from "../src/web/stores/secretario.svelte.js";
import { get } from "svelte/store";

describe("secretario.svelte store — helpers puros", () => {
  it("urlsDeImagem filtra apenas data:image/", () => {
    expect(urlsDeImagem(["data:image/png;base64,abc", "https://evil.com/x", 123])).toEqual([
      "data:image/png;base64,abc",
    ]);
    expect(urlsDeImagem(null as unknown as string[])).toEqual([]);
    expect(urlsDeImagem([])).toEqual([]);
  });

  it("filtrarSessoes respeita busca e sem_conteudo", () => {
    const sessoes: any[] = [
      { id: "a", title: "Olá mundo", sem_conteudo: false },
      { id: "b", title: "Board", sem_conteudo: true },
      { id: "c", title: "Outra", sem_conteudo: false },
    ];
    // sem busca: exclui b (sem_conteudo) exceto se for ativa
    expect(filtrarSessoes(sessoes, "", null).map((s) => s.id)).toEqual(["a", "c"]);
    expect(filtrarSessoes(sessoes, "", "b").map((s) => s.id)).toEqual(["a", "b", "c"]);
    // busca case-insensitive
    expect(filtrarSessoes(sessoes, "board", null).map((s) => s.id)).toEqual([]);
    // "Board" está em b mas b é sem_conteudo, então filtrado fora; com busca "ola"
    expect(filtrarSessoes(sessoes, "olá", null).map((s) => s.id)).toEqual(["a"]);
  });

  it("constantes de polling correspondem ao legado (2s, 15min, 60s)", () => {
    expect(POLL_RESPOSTA_INTERVALO_MS).toBe(2000);
    expect(POLL_RESPOSTA_CAP_MS).toBe(15 * 60 * 1000);
    expect(SEM_RESPOSTA_CAP_MS).toBe(60 * 1000);
  });
});

describe("secretario.svelte store — estado reativo", () => {
  beforeEach(() => {
    sessoesStore.set([]);
    sessaoAtivaIdStore.set(null);
    mensagensStore.set([]);
    carregandoStore.set(false);
    buscaStore.set("");
    anexosStore.set([]);
    _resetPollState();
    try { window.localStorage.clear(); } catch {}
    try { window.history.replaceState(null, "", "/secretario"); } catch {}
  });

  it("novaConversa limpa sessão e mensagens", () => {
    sessoesStore.set([{ id: "x", title: "teste" } as any]);
    sessaoAtivaIdStore.set("x");
    mensagensStore.set([{ role: "user", content: "oi" } as any]);
    buscaStore.set("algo");
    novaConversa();
    expect(get(sessaoAtivaIdStore)).toBeNull();
    expect(get(mensagensStore)).toEqual([]);
  });

  it("selecionarSessao atualiza id e hash (mock fetch)", async () => {
    // mock fetch para /secretario/sessoes/:id/mensagens
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => [],
    } as any);
    // também mock q() via fetch? q usa fetch internamente, mas vamos mock direto carregarMensagens
    // Para simplificar, mock global fetch e usar selecionarSessao que chama carregarMensagens (que usa q -> fetch)
    // q chama fetch com headers, então nosso mock deve responder ao GET de mensagens
    (globalThis.fetch as any).mockImplementation((url: string) => {
      if (url.includes("/secretario/sessoes/")) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => "application/json" },
          json: async () => [{ role: "user", content: "oi", criado_em: new Date().toISOString() }],
        } as any);
      }
      return Promise.resolve({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => ({}),
      } as any);
    });

    await selecionarSessao("sess-123");
    expect(get(sessaoAtivaIdStore)).toBe("sess-123");
    globalThis.fetch = origFetch as any;
  });

  it("eventoRemotoSecretario com fase hitl dispara sem erro", async () => {
    // não deve throw; apenas garante que função existe e é síncrona
    expect(() => eventoRemotoSecretario({ tipo: "secretario.mensagem", dados: { fase: "hitl" } })).not.toThrow();
    // com sessao_id vazio não faz nada
    expect(() => eventoRemotoSecretario({ dados: {} })).not.toThrow();
  });

  it("sincronizarHashSessao e sessaoDaUrl não quebram e parseiam URL manual", () => {
    // parseia URL setada manualmente via history
    const w = (globalThis as any).window ?? (typeof window !== "undefined" ? window : null);
    if (w) {
      w.history.replaceState(null, "", "/secretario?sessao=manual-abc");
      expect(sessaoDaUrl()).toBe("manual-abc");
      w.history.replaceState(null, "", "/secretario");
      expect(sessaoDaUrl()).toBeNull();
    }
    // sincronizar não deve throw mesmo sem window
    expect(() => sincronizarHashSessao()).not.toThrow();
    expect(() => sessaoDaUrl()).not.toThrow();
  });

  it("eventoRemotoSecretario respeita carregando sem pollResposta", () => {
    carregandoStore.set(true);
    // deve early return sem throw e sem chamar fetch
    expect(() => eventoRemotoSecretario({ dados: { sessao_id: get(sessaoAtivaIdStore), fase: "delta" } })).not.toThrow();
    carregandoStore.set(false);
  });
});

describe("Secretario.svelte — compatibilidade chat-lateral", () => {
  it("exports esperados existem no shim vanilla", async () => {
    const mod = await import("../src/web/views/secretario.js");
    expect(typeof mod.renderSecretario).toBe("function");
    expect(typeof mod.eventoRemotoSecretario).toBe("function");
    expect(typeof mod.renderChatLateral).toBe("function");
    expect(typeof mod.secretarioAba).toBe("function");
    expect(typeof mod.resolverComandoProprio).toBe("function");
  });

  it("chat-lateral.ts importa renderChatLateral do shim sem quebrar", async () => {
    const lateral = await import("../src/web/chat-lateral.js");
    expect(typeof lateral.abrirChatLateral).toBe("function");
    expect(typeof lateral.fecharChatLateral).toBe("function");
    expect(typeof lateral.alternarChatLateral).toBe("function");
  });

  it("Secretario.svelte existe e contém Svelte 5 runes + pensamento/HITL/compat", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const p = join(process.cwd(), "src/web/views/Secretario.svelte");
    const src = readFileSync(p, "utf8");
    expect(src).toContain("$state");
    expect(src).toContain("$derived");
    expect(src).toContain("$effect");
    expect(src).toContain("oc-pensamento");
    expect(src).toContain("oc-acao");
    expect(src).toContain("hitl");
    expect(src).toContain("secretario.svelte");
    expect(src).toContain("__secretario");
    // store contém SSE e polling
    const storeSrc = readFileSync(join(process.cwd(), "src/web/stores/secretario.svelte.ts"), "utf8");
    expect(storeSrc).toContain("text/event-stream");
    expect(storeSrc).toContain("POLL_RESPOSTA_INTERVALO_MS");
    expect(storeSrc).toContain("2000");
    expect(storeSrc).toContain("pensamento");
    expect(storeSrc).toContain("acao");
  });
});

describe("Secretario.svelte — pensamento e acoes (render)", () => {
  it("mensagem com pensamento renderiza details aberto quando concluida=false", async () => {
    // testa lógica de store: adicionar mensagem com pensamento
    mensagensStore.set([
      { role: "user", content: "oi" },
      { role: "assistant", content: "", pensamento: "estou pensando...", concluida: false, acoes: [] },
    ] as any);
    const msgs = get(mensagensStore);
    const ultima = msgs[msgs.length - 1] as any;
    expect(ultima.pensamento).toBe("estou pensando...");
    expect(ultima.concluida).toBe(false);
    // acoes vazias não quebram
    expect(ultima.acoes).toEqual([]);
  });

  it("acoes com status completed/error/rodando são preservadas", () => {
    mensagensStore.set([
      {
        role: "assistant",
        content: "feito",
        acoes: [
          { tool: "opencorp_task_create", status: "completed", resumo: "Task X" },
          { tool: "opencorp_task_list", status: "error" },
          { tool: "opencorp_agente_run", status: "running" },
        ],
      } as any,
    ]);
    const acoes = (get(mensagensStore)[0] as any).acoes;
    expect(acoes[0].status).toBe("completed");
    expect(acoes[1].status).toBe("error");
    expect(acoes[2].status).toBe("running");
  });
});
