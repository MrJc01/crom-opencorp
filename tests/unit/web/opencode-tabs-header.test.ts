import { describe, it, expect, beforeEach } from "vitest";
import { formatarTituloAba } from "../../../src/web/features/chat/components/OpenCodeTabsHeader.js";
import {
  carregarAbasWorkspace,
  salvarAbasWorkspace,
} from "../../../src/web/features/chat/views/SecretarioView.js";
import { converterMensagensBackend } from "../../../src/web/features/chat/runtime/secretary-runtime-adapter.js";

if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as unknown as Storage;
}

describe("OpenCodeTabsHeader — Formatação de Títulos", () => {
  it("remove prefixos técnicos de workspace e sessão", () => {
    expect(formatarTituloAba('[WORKSPACE ATIVO: "yt-factory"] Análise')).toBe("Análise");
    expect(formatarTituloAba("[SESSÃO: 123] Revisão de Roteiros")).toBe("Revisão de Roteiros");
    expect(formatarTituloAba('[WORKSPACE "corp"]')).toBe("Conversa");
  });

  it("retorna 'Nova conversa' para valores nulos, vazios ou indefinidos", () => {
    expect(formatarTituloAba("")).toBe("Nova conversa");
    expect(formatarTituloAba(undefined)).toBe("Nova conversa");
    expect(formatarTituloAba("   ")).toBe("Nova conversa");
  });

  it("preserva títulos limpos definidos pelo usuário", () => {
    expect(formatarTituloAba("Auditoria SEO")).toBe("Auditoria SEO");
    expect(formatarTituloAba("Planejamento 2026")).toBe("Planejamento 2026");
  });
});

describe("SecretarioView — Persistência de Abas por Workspace", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("salva e recupera abas com chave isolada por workspace", () => {
    const abasWsA = [
      { id: "ses_1", titulo: "Aba Projeto A", criadoEm: 1000 },
    ];
    const abasWsB = [
      { id: "ses_2", titulo: "Aba Projeto B", criadoEm: 2000 },
    ];

    salvarAbasWorkspace("projeto-a", abasWsA);
    salvarAbasWorkspace("projeto-b", abasWsB);

    expect(carregarAbasWorkspace("projeto-a")).toEqual(abasWsA);
    expect(carregarAbasWorkspace("projeto-b")).toEqual(abasWsB);
  });

  it("retorna array vazio quando não há abas salvas para o workspace", () => {
    expect(carregarAbasWorkspace("inexistente")).toEqual([]);
  });
});

describe("secretary-runtime-adapter — Hidratação de Mensagens", () => {
  it("converte mensagens brutas do backend em ThreadMessageLike", () => {
    const backendMsgs = [
      {
        id: "msg_user_1",
        role: "user",
        content: "Qual o status do projeto?",
        criado_em: "2026-09-25T01:00:00.000Z",
      },
      {
        id: "msg_asst_1",
        role: "assistant",
        content: "O projeto está operacional.",
        pensamento: "Consultando tabela de status...",
        acoes: [
          { ferramenta: "git_status", resumo: "Branch limpa", sucesso: true },
        ],
        criado_em: "2026-09-25T01:00:05.000Z",
      },
    ];

    const convertidas = converterMensagensBackend(backendMsgs, "ses_test");

    expect(convertidas).toHaveLength(2);

    // Mensagem do usuário
    expect(convertidas[0].role).toBe("user");
    expect(convertidas[0].content).toEqual([
      { type: "text", text: "Qual o status do projeto?" },
    ]);

    // Mensagem do assistente estruturada com partes (reasoning, tool-call, text)
    expect(convertidas[1].role).toBe("assistant");
    const partes = convertidas[1].content as any[];
    expect(partes).toHaveLength(3);
    expect(partes[0]).toEqual({
      type: "reasoning",
      text: "Consultando tabela de status...",
    });
    expect(partes[1]).toMatchObject({
      type: "tool-call",
      toolName: "git_status",
      result: "Branch limpa",
      isError: false,
    });
    expect(partes[2]).toEqual({
      type: "text",
      text: "O projeto está operacional.",
    });
  });

  it("retorna array vazio se a lista de mensagens for inválida", () => {
    expect(converterMensagensBackend(null as any, "ses_test")).toEqual([]);
    expect(converterMensagensBackend(undefined as any, "ses_test")).toEqual([]);
    expect(converterMensagensBackend([] as any, "ses_test")).toEqual([]);
  });
});
