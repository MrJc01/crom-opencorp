import { describe, it, expect } from "vitest";
import {
  limparAnsi,
  normalizarQuebrasDeLinha,
  sanitizarTranscript,
  extrairDeltaTexto,
  extrairResumoErro,
} from "../../../src/core/domain/session/transcript-parser.js";

describe("Core Session Domain — Transcript Parser & ANSI Sanitizer", () => {
  // ── 1. Remoção de Sequências ANSI ──────────────────────────────────────────

  describe("1. limparAnsi", () => {
    it("remove códigos de cor 16 básicos e resets", () => {
      const entrada = "\x1b[31mTexto em Vermelho\x1b[0m e \x1b[32mTexto em Verde\x1b[0m";
      expect(limparAnsi(entrada)).toBe("Texto em Vermelho e Texto em Verde");
    });

    it("remove cores 256 (38;5;n e 48;5;n)", () => {
      const entrada = "\x1b[38;5;208mLaranja 256\x1b[0m com fundo \x1b[48;5;235mEscuro\x1b[0m";
      expect(limparAnsi(entrada)).toBe("Laranja 256 com fundo Escuro");
    });

    it("remove cores 24-bit TrueColor RGB (38;2;r;g;b)", () => {
      const entrada = "\x1b[38;2;255;128;64mCor Customizada\x1b[0m";
      expect(limparAnsi(entrada)).toBe("Cor Customizada");
    });

    it("remove comandos de movimentação de cursor e limpeza de tela", () => {
      const entrada = "\x1b[2J\x1b[H\x1b[1A\x1b[2K\x1b[?25hCarregando interface...";
      expect(limparAnsi(entrada)).toBe("Carregando interface...");
    });

    it("remove comandos de janela OSC (Operating System Command)", () => {
      const entrada = "\x1b]0;Janela do Terminal\x07Texto visível\x1b[0m";
      expect(limparAnsi(entrada)).toBe("Texto visível");
    });

    it("retorna string vazia para entrada vazia ou nula", () => {
      expect(limparAnsi("")).toBe("");
      expect(limparAnsi(null as unknown as string)).toBe("");
    });
  });

  // ── 2. Normalização de Quebras de Linha ────────────────────────────────────

  describe("2. normalizarQuebrasDeLinha", () => {
    it("converte CRLF (Windows) para LF", () => {
      const entrada = "linha 1\r\nlinha 2\r\nlinha 3";
      expect(normalizarQuebrasDeLinha(entrada)).toBe("linha 1\nlinha 2\nlinha 3");
    });

    it("converte CR isolado para LF", () => {
      const entrada = "linha 1\rlinha 2\rlinha 3";
      expect(normalizarQuebrasDeLinha(entrada)).toBe("linha 1\nlinha 2\nlinha 3");
    });

    it("normaliza quebras de linha mistas", () => {
      const entrada = "l1\r\nl2\rl3\nl4";
      expect(normalizarQuebrasDeLinha(entrada)).toBe("l1\nl2\nl3\nl4");
    });
  });

  // ── 3. Cálculo de Delta de Texto para Streaming ───────────────────────────

  describe("3. extrairDeltaTexto", () => {
    it("retorna bufferAtual completo quando bufferAnterior está vazio", () => {
      expect(extrairDeltaTexto("", "Primeira parte")).toBe("Primeira parte");
    });

    it("retorna string vazia quando buffers são idênticos", () => {
      expect(extrairDeltaTexto("Texto existente", "Texto existente")).toBe("");
    });

    it("extrai o novo fragmento quando bufferAtual expande bufferAnterior", () => {
      const anterior = "Processando etapa 1...";
      const atual = "Processando etapa 1... Concluído com sucesso!";
      expect(extrairDeltaTexto(anterior, atual)).toBe(" Concluído com sucesso!");
    });

    it("calcula delta progressivo em múltiplos passos de streaming", () => {
      let acumulado = "";

      const chunk1 = extrairDeltaTexto(acumulado, "O");
      acumulado = "O";
      expect(chunk1).toBe("O");

      const chunk2 = extrairDeltaTexto(acumulado, "Open");
      acumulado = "Open";
      expect(chunk2).toBe("pen");

      const chunk3 = extrairDeltaTexto(acumulado, "OpenCorp");
      acumulado = "OpenCorp";
      expect(chunk3).toBe("Corp");

      const chunk4 = extrairDeltaTexto(acumulado, "OpenCorp Engine");
      expect(chunk4).toBe(" Engine");
    });

    it("trata overlap parcial de cauda com segurança", () => {
      const anterior = "abcdef";
      const atual = "defghij";
      expect(extrairDeltaTexto(anterior, atual)).toBe("ghij");
    });
  });

  // ── 4. Sanitização Completa de Transcripts ─────────────────────────────────

  describe("4. sanitizarTranscript", () => {
    it("elimina caracteres de controle nulos e preserva integridade de JSON e Markdown", () => {
      const raw = [
        "\x1b[32m# Relatório de Execução\x1b[0m\0",
        "",
        "Abaixo está o payload gerado:\r\n",
        "```json",
        "{\x08",
        '  "status": "sucesso",',
        '  "itens": [1, 2, 3],',
        '  "detalhes": "Acentuação válida: Olá, mundo! 🚀"',
        "}",
        "```\r\n",
        "\x1b[1mFinalizado em 2.4s.\x1b[0m",
      ].join("\r\n");

      const limpo = sanitizarTranscript(raw);

      // Não deve conter ANSI
      expect(limpo).not.toContain("\x1b[");
      // Não deve conter null bytes
      expect(limpo).not.toContain("\0");
      expect(limpo).not.toContain("\x08");
      // Não deve conter CRLF
      expect(limpo).not.toContain("\r");

      // Deve preservar títulos markdown e bloco JSON legível
      expect(limpo).toContain("# Relatório de Execução");
      expect(limpo).toContain('{\n  "status": "sucesso"');
      expect(limpo).toContain("Acentuação válida: Olá, mundo! 🚀");
      expect(limpo).toContain("Finalizado em 2.4s.");
    });
  });

  // ── 5. Extração de Resumo de Erro ─────────────────────────────────────────

  describe("5. extrairResumoErro", () => {
    it("extrai mensagem de erro declarada com Error: ou Quota", () => {
      const log = [
        "Iniciando chamada para o provedor...",
        "POST https://api.openrouter.ai/v1/chat/completions",
        "\x1b[31mError: 429 Rate limit exceeded for model\x1b[0m",
        "Processo encerrado",
      ].join("\n");

      const resumo = extrairResumoErro(log, 1);
      expect(resumo).toContain("Error: 429 Rate limit exceeded for model");
    });

    it("retorna última linha significativa como fallback", () => {
      const log = [
        "> opencode run --agent redator",
        "# iniciando turno 1",
        "Falha ao carregar arquivo de entrada config.yaml",
      ].join("\n");

      const resumo = extrairResumoErro(log, 2);
      expect(resumo).toBe("Falha ao carregar arquivo de entrada config.yaml");
    });

    it("retorna mensagem padrão se o log estiver vazio", () => {
      expect(extrairResumoErro("", 137)).toBe("Processo encerrou com exit code 137");
    });
  });
});
