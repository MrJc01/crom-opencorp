import { describe, it, expect } from "vitest";
import { MODELOS_ROTACAO_PADRAO } from "../src/core/session-manager.js";

describe("Rotação de Modelos e Detecção de Erros de API (TEST-04)", () => {
  // Regex idêntica à do SessionManager para validação unitária estrita
  const padraoErroModelo =
    /usage limit|Cannot connect to API|AI_APICallError|rate limit|free-models-per-day|quota|429|overloaded|resource exhausted|unavailable for free|model not found|insufficient balance|payment_required|402|credit balance|temporarily unavailable|Provider returned error/i;

  it("detecta erro HTTP 429 e rate limit", () => {
    const saida = 'Error: 429 Rate limit exceeded: You have exceeded the free models per day quota.';
    expect(padraoErroModelo.test(saida)).toBe(true);
  });

  it("detecta erro HTTP 402, payment_required e insufficient balance (OpenRouter/NVIDIA)", () => {
    const saidaJson = '{"code":402,"message":"Insufficient balance","metadata":{"error_type":"payment_required"}}';
    expect(padraoErroModelo.test(saidaJson)).toBe(true);

    const saidaTexto = 'Your account has an insufficient credit balance to complete this request.';
    expect(padraoErroModelo.test(saidaTexto)).toBe(true);
  });

  it("detecta sobrecarga e indisponibilidade de modelos gratuitos", () => {
    const saidaOverloaded = 'Provider returned error: model is temporarily overloaded or resource exhausted.';
    expect(padraoErroModelo.test(saidaOverloaded)).toBe(true);

    const saidaUnavailable = 'Model openrouter/nvidia/nemotron-3-ultra-550b-a55b is unavailable for free users.';
    expect(padraoErroModelo.test(saidaUnavailable)).toBe(true);
  });

  it("não dispara falso positivo para saída de sucesso ou erros normais de aplicação", () => {
    const saidaOk = 'Processamento concluído com sucesso. 10 arquivos atualizados.';
    expect(padraoErroModelo.test(saidaOk)).toBe(false);

    const erroSintaxe = 'SyntaxError: Unexpected token < in JSON at position 0';
    expect(padraoErroModelo.test(erroSintaxe)).toBe(false);
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
