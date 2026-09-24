import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { registerSecretarioCommand } from "../../../src/cli/commands/secretario.js";
import { limparTagsPensamento, extrairPensamento } from "../../../src/cli/ui/stream-renderer.js";
import { resetSdkClient } from "../../../src/cli/client.js";

describe("CLI UI — Stream Renderer", () => {
  it("remove tags <think> e <thought> do texto", () => {
    const texto = "<think>Raciocínio interno aqui...</think>Olá, mundo!";
    expect(limparTagsPensamento(texto)).toBe("Olá, mundo!");

    const textoComThought = "<thought>Raciocínio alternativo...</thought>Resposta final.";
    expect(limparTagsPensamento(textoComThought)).toBe("Resposta final.");
  });

  it("extrai pensamento separando da resposta", () => {
    const texto = "<think>Passo 1: calcular. Passo 2: responder.</think>O resultado é 42.";
    const { pensamento, resposta } = extrairPensamento(texto);
    expect(pensamento).toBe("Passo 1: calcular. Passo 2: responder.");
    expect(resposta).toBe("O resultado é 42.");
  });
});

describe("CLI Commands — Secretario com SDK", () => {
  const originalFetch = globalThis.fetch;
  let logs: string[] = [];
  const originalLog = console.log;

  function mockFetch(
    status: number,
    body: unknown,
    headers: Record<string, string> = { "content-type": "application/json" },
  ): void {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : status === 404 ? "Not Found" : "Error",
      headers: new Headers(headers),
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  }

  beforeEach(() => {
    resetSdkClient();
    process.env.OPENCORP_API_URL = "http://test-server:4100";
    logs = [];
    console.log = (...args: unknown[]) => logs.push(args.join(" "));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    delete process.env.OPENCORP_API_URL;
  });

  it("secretario --status --json emite JSON com status retornado pelo SDK", async () => {
    mockFetch(200, { rodando: true, porta: 4100, pid: 12345 });

    const program = new Command();
    registerSecretarioCommand(program);

    await program.parseAsync(["node", "oc", "secretario", "--status", "--json"]);

    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.rodando).toBe(true);
    expect(parsed.porta).toBe(4100);
    expect(parsed.pid).toBe(12345);
  });

  it("secretario --sessoes --json emite lista de sessões", async () => {
    mockFetch(200, [{ id: "ses-1", title: "Primeira conversa" }]);

    const program = new Command();
    registerSecretarioCommand(program);

    await program.parseAsync(["node", "oc", "secretario", "--sessoes", "--json"]);

    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].id).toBe("ses-1");
    expect(parsed[0].title).toBe("Primeira conversa");
  });

  it("secretario --historico <id> --json emite mensagens da conversa", async () => {
    mockFetch(200, {
      id: "ses-1",
      messages: [
        { role: "user", content: "Olá" },
        { role: "assistant", content: "Olá, como posso ajudar?" },
      ],
    });

    const program = new Command();
    registerSecretarioCommand(program);

    await program.parseAsync(["node", "oc", "secretario", "--historico", "ses-1", "--json"]);

    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.id).toBe("ses-1");
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].content).toBe("Olá");
  });

  it("secretario 'mensagem' envia payload via SDK e formata resposta", async () => {
    mockFetch(200, {
      resposta: "Recebido com sucesso!",
      sessao_id: "ses-novo",
    });

    const program = new Command();
    registerSecretarioCommand(program);

    await program.parseAsync(["node", "oc", "secretario", "qual", "o", "status", "--json"]);

    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.resposta).toBe("Recebido com sucesso!");
    expect(parsed.sessao_id).toBe("ses-novo");

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test-server:4100/secretario/conversa");
    const corpo = JSON.parse(init.body as string);
    expect(corpo.mensagem).toBe("qual o status");
    expect(corpo.agente).toBe("secretario-exec");
  });

  it("secretario 'mensagem' com --no-think limpa tags de pensamento", async () => {
    mockFetch(200, {
      resposta: "<think>Raciocinando...</think>Pronto!",
      sessao_id: "ses-think",
    });

    const program = new Command();
    registerSecretarioCommand(program);

    await program.parseAsync(["node", "oc", "secretario", "me", "diga", "ola", "--no-think", "--json"]);

    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.resposta).toBe("Pronto!");
  });

  it("secretario --stop --json para o serviço com sucesso", async () => {
    mockFetch(200, { ok: true, parado: true });

    const program = new Command();
    registerSecretarioCommand(program);

    await program.parseAsync(["node", "oc", "secretario", "--stop", "--json"]);

    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
  });
});
