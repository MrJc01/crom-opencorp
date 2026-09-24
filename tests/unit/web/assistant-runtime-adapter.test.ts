import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildAssistantParts,
} from "../../../src/web/features/chat/runtime/secretary-runtime-adapter.js";
import { ProblemDetailsError } from "../../../src/sdk/index.js";

describe("Assistant-UI Runtime Adapter — buildAssistantParts", () => {
  it("inicializa com array vazio se nenhum dado for fornecido", () => {
    const partes = buildAssistantParts("", [], "");
    expect(partes).toEqual([]);
  });

  it("cria parte de reasoning quando há cadeia de pensamento", () => {
    const partes = buildAssistantParts("Analisando o repositório...", [], "");
    expect(partes).toHaveLength(1);
    expect(partes[0]).toEqual({
      type: "reasoning",
      text: "Analisando o repositório...",
    });
  });

  it("cria partes de tool-call com status e resumo de ferramentas", () => {
    const ferramentas = [
      { ferramenta: "bash", resumo: "git status concluído", sucesso: true },
      { ferramenta: "read_file", resumo: "arquivo não encontrado", sucesso: false },
    ];
    const partes = buildAssistantParts("", ferramentas, "");
    expect(partes).toHaveLength(2);
    expect(partes[0]).toMatchObject({
      type: "tool-call",
      toolName: "bash",
      result: "git status concluído",
      isError: false,
    });
    expect(partes[1]).toMatchObject({
      type: "tool-call",
      toolName: "read_file",
      result: "arquivo não encontrado",
      isError: true,
    });
  });

  it("mantém a ordem canônica: 1. reasoning -> 2. tool-calls -> 3. text", () => {
    const ferramentas = [{ ferramenta: "git", resumo: "commit efetuado", sucesso: true }];
    const partes = buildAssistantParts("Pensando...", ferramentas, "Aqui está a resposta final.");

    expect(partes).toHaveLength(3);
    expect(partes[0].type).toBe("reasoning");
    expect(partes[0].text).toBe("Pensando...");

    expect(partes[1].type).toBe("tool-call");
    expect(partes[1].toolName).toBe("git");

    expect(partes[2].type).toBe("text");
    expect(partes[2].text).toBe("Aqui está a resposta final.");
  });

  it("ignora strings de pensamento em branco (apenas espaços)", () => {
    const partes = buildAssistantParts("   \n\t  ", [], "Texto válido");
    expect(partes).toHaveLength(1);
    expect(partes[0]).toEqual({
      type: "text",
      text: "Texto válido",
    });
  });
});

describe("Assistant-UI Runtime Adapter — Ciclo de Vida do Stream", () => {
  it("simula execução de stream com transição de isRunning e agregação de eventos", async () => {
    let isRunning = false;
    let mensagens: any[] = [];
    let pensamentoBuffer = "";
    let textoBuffer = "";
    let ferramentasBuffer: any[] = [];

    const userMessage = {
      content: [{ type: "text", text: "Liste os agentes ativos" }],
    };

    // 1. Início do turno
    isRunning = true;
    mensagens.push({ role: "user", content: userMessage.content });
    mensagens.push({ role: "assistant", content: [] });

    expect(isRunning).toBe(true);
    expect(mensagens).toHaveLength(2);

    // 2. Simulação de callbacks SSE recebidos de executarSecretarioStream
    const callbacks = {
      onPensamento: (_delta: string, acumulado: string) => {
        pensamentoBuffer = acumulado;
        mensagens[1].content = buildAssistantParts(pensamentoBuffer, ferramentasBuffer, textoBuffer);
      },
      onAcao: (itens: any[]) => {
        ferramentasBuffer = itens;
        mensagens[1].content = buildAssistantParts(pensamentoBuffer, ferramentasBuffer, textoBuffer);
      },
      onDelta: (_delta: string, acumulado: string) => {
        textoBuffer = acumulado;
        mensagens[1].content = buildAssistantParts(pensamentoBuffer, ferramentasBuffer, textoBuffer);
      },
      onFim: () => {
        isRunning = false;
      },
    };

    callbacks.onPensamento("Pensa", "Pensando nos agentes...");
    callbacks.onAcao([{ ferramenta: "list_agents", resumo: "2 agentes encontrados", sucesso: true }]);
    callbacks.onDelta("Temos ", "Temos 2 agentes ativos no workspace.");
    callbacks.onFim();

    // 3. Validações finais
    expect(isRunning).toBe(false);
    expect(mensagens[1].content).toHaveLength(3);
    expect(mensagens[1].content[0].type).toBe("reasoning");
    expect(mensagens[1].content[0].text).toBe("Pensando nos agentes...");
    expect(mensagens[1].content[1].type).toBe("tool-call");
    expect(mensagens[1].content[1].toolName).toBe("list_agents");
    expect(mensagens[1].content[2].type).toBe("text");
    expect(mensagens[1].content[2].text).toBe("Temos 2 agentes ativos no workspace.");
  });

  it("trata erro RFC 7807 (ProblemDetailsError) e atualiza estado para não-executando", () => {
    let isRunning = true;
    let textoBuffer = "";
    const erroSdk = new ProblemDetailsError({
      status: 404,
      title: "Workspace Not Found",
      detail: "O workspace especificado não existe",
    });

    try {
      throw erroSdk;
    } catch (err: any) {
      isRunning = false;
      if (!textoBuffer) {
        textoBuffer = `⚠️ ${err.title}: ${err.detail}`;
      }
    }

    expect(isRunning).toBe(false);
    expect(textoBuffer).toBe("⚠️ Workspace Not Found: O workspace especificado não existe");
  });
});
