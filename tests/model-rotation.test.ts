import { describe, it, expect } from "vitest";
import { MODELOS_ROTACAO_PADRAO, PADRAO_ERRO_MODELO } from "../src/core/session-manager.js";

describe("Rotação de Modelos e Detecção de Erros de API (TEST-04)", () => {
  it("detecta erro HTTP 429 e rate limit", () => {
    const saida = 'Error: 429 Rate limit exceeded: You have exceeded the free models per day quota.';
    expect(PADRAO_ERRO_MODELO.test(saida)).toBe(true);
  });

  it("detecta erro HTTP 402, payment_required e insufficient balance (OpenRouter/NVIDIA)", () => {
    const saidaJson = '{"code":402,"message":"Insufficient balance","metadata":{"error_type":"payment_required"}}';
    expect(PADRAO_ERRO_MODELO.test(saidaJson)).toBe(true);

    const saidaTexto = 'Your account has an insufficient credit balance to complete this request.';
    expect(PADRAO_ERRO_MODELO.test(saidaTexto)).toBe(true);
  });

  it("detecta erro de créditos insuficientes do OpenRouter (requires more credits / can only afford)", () => {
    const erroReal = 'Error: This request requires more credits, or fewer max_tokens. You requested up to 32000 tokens, but can only afford 9572. To increase, visit https://openrouter.ai/settings/credits and add more credits';
    expect(PADRAO_ERRO_MODELO.test(erroReal)).toBe(true);
  });

  it("detecta erro de saldo excedido por requisições concorrentes (in-flight requests)", () => {
    const erroInFlight = 'Error: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.';
    expect(PADRAO_ERRO_MODELO.test(erroInFlight)).toBe(true);
  });

  it("detecta travamento de concorrência de banco SQLite (database is locked)", () => {
    const erroSqlite = 'Error: Unexpected error\n\ndatabase is locked';
    expect(PADRAO_ERRO_MODELO.test(erroSqlite)).toBe(true);
  });

  it("detecta sobrecarga e indisponibilidade de modelos gratuitos", () => {
    const saidaOverloaded = 'Provider returned error: model is temporarily overloaded or resource exhausted.';
    expect(PADRAO_ERRO_MODELO.test(saidaOverloaded)).toBe(true);
  });

  it("detecta indisponibilidade de modelos gratuitos", () => {
    const saidaUnavailable = 'Model openrouter/nvidia/nemotron-3-ultra-550b-a55b is unavailable for free users.';
    expect(PADRAO_ERRO_MODELO.test(saidaUnavailable)).toBe(true);
  });

  it("não dispara falso positivo para saída de sucesso ou erros normais de aplicação", () => {
    const saidaOk = 'Processamento concluído com sucesso. 10 arquivos atualizados.';
    expect(PADRAO_ERRO_MODELO.test(saidaOk)).toBe(false);

    const erroSintaxe = 'SyntaxError: Unexpected token < in JSON at position 0';
    expect(PADRAO_ERRO_MODELO.test(erroSintaxe)).toBe(false);
  });

  it("garante que a lista de rotação contém os modelos NVIDIA e Fallbacks em ordem válida", () => {
    expect(MODELOS_ROTACAO_PADRAO.length).toBeGreaterThanOrEqual(3);

    // Deve conter modelos nvidia
    const temNvidia = MODELOS_ROTACAO_PADRAO.some((m) => m.includes("nvidia/nemotron"));
    expect(temNvidia).toBe(true);

    // Deve conter fallback minimax ou outro provedor
    const temFallback = MODELOS_ROTACAO_PADRAO.some((m) => m.includes("minimax") || m.includes("gemini") || m.includes("deepseek"));
    expect(temFallback).toBe(true);

    // Testa rotação: próximo do primeiro modelo é o segundo
    const idx0 = 0;
    const proximo = MODELOS_ROTACAO_PADRAO[idx0 + 1];
    expect(proximo).toBeDefined();
    expect(proximo).not.toBe(MODELOS_ROTACAO_PADRAO[0]);
  });
});
