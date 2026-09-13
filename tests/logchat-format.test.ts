import { describe, expect, it } from "vitest";
import { parseLogToMensagens, realcarPassos } from "../src/web/components/chat/log-parse.js";

describe("LogChatViewer — realcarPassos", () => {
  it("converte cabeçalhos PASSO em seções markdown", () => {
    const saida = realcarPassos("intro\nPASSO 1 — DEDUP: leia tudo\ncorpo");
    expect(saida).toBe("intro\n### PASSO 1 — DEDUP: leia tudo\ncorpo");
  });

  it("não toca em JSON, código ou linhas sem o padrão", () => {
    const json = '{"tipo":"HOOK","fala":"texto"}';
    expect(realcarPassos(json)).toBe(json);
    const longa = "PASSO 9 — " + "x".repeat(200);
    expect(realcarPassos(longa)).toBe(`### ${longa}`);
    expect(realcarPassos("$ curl -s https://x")).toBe("$ curl -s https://x");
    expect(realcarPassos("o PASSO 1 continua aqui")).toBe("o PASSO 1 continua aqui");
  });
});

describe("LogChatViewer — parseLogToMensagens com prompt-eco", () => {
  const prompt = ["Você é o curador.", "PASSO 1 — DEDUP: leia tudo", "PASSO 2 — PESQUISA: busque tudo"].join("\n");

  it("log só-prompt vira 2 mensagens sem duplicar (user + assistant única)", () => {
    const msgs = parseLogToMensagens(prompt, { agente: "pautador-youtube", status: "falhou" });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe("user");
    expect(msgs[1]!.role).toBe("assistant");
    expect(msgs[1]!.passos).toBeUndefined();
    expect(msgs[1]!.content).toContain("### PASSO 1 — DEDUP: leia tudo");
  });

  it("não duplica a resposta final entre conteúdo e passos", () => {
    const log = ["$ curl -s https://x", "saida ok", "Vou explicar o resultado", "resposta final aqui"].join("\n");
    const msgs = parseLogToMensagens(log, { status: "concluido" });
    const ass = msgs[1]!;
    const textos = (ass.passos ?? []).filter((p) => p.tipo === "texto").map((p) => (p as { texto: string }).texto);
    // conteúdo vazio quando o último passo de texto já o contém
    expect(textos.length > 0 && ass.content === "").toBe(true);
  });
});
