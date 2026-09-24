import { describe, expect, it } from "vitest";
import {
  validarExpressaoCron,
  compilarCampoCron,
  calcularProximoCron,
  calcularProximoCronEmTimezone,
  CronExpressionError,
  fusoValido,
  FUSO_PADRAO,
} from "../../../src/core/domain/scheduling/cron-evaluator.js";
import { SchedulerError } from "../../../src/core/shared/errors.js";

describe("cron-evaluator — Domínio Puro de Agendamento", () => {
  describe("1. Validação de Sintaxe Cron (5 campos)", () => {
    it("aceita expressões canônicas válidas", () => {
      expect(() => validarExpressaoCron("* * * * *")).not.toThrow();
      expect(() => validarExpressaoCron("*/15 * * * *")).not.toThrow();
      expect(() => validarExpressaoCron("0 9 * * 1-5")).not.toThrow();
      expect(() => validarExpressaoCron("1,15,30 8-18/2 1,15 1-12 0,6")).not.toThrow();
      expect(() => validarExpressaoCron("59 23 31 12 6")).not.toThrow();
    });

    it("rejeita expressões com quantidade incorreta de campos (fail-fast)", () => {
      expect(() => validarExpressaoCron("")).toThrow(CronExpressionError);
      expect(() => validarExpressaoCron("* * * *")).toThrow(/precisa de 5 campos/);
      expect(() => validarExpressaoCron("* * * * * *")).toThrow(/precisa de 5 campos/);
      expect(() => validarExpressaoCron("30 9 * *")).toThrow(SchedulerError);
    });

    it("rejeita valores e faixas fora dos limites de cada campo", () => {
      // Minuto: 0-59
      expect(() => validarExpressaoCron("60 * * * *")).toThrow(/minuto/);
      expect(() => validarExpressaoCron("-1 * * * *")).toThrow(/minuto/);

      // Hora: 0-23
      expect(() => validarExpressaoCron("0 24 * * *")).toThrow(/hora/);

      // Dia do mês: 1-31
      expect(() => validarExpressaoCron("0 0 0 * *")).toThrow(/dia-do-mês/);
      expect(() => validarExpressaoCron("0 0 32 * *")).toThrow(/dia-do-mês/);

      // Mês: 1-12
      expect(() => validarExpressaoCron("0 0 1 0 *")).toThrow(/mês/);
      expect(() => validarExpressaoCron("0 0 1 13 *")).toThrow(/mês/);

      // Dia da semana: 0-6
      expect(() => validarExpressaoCron("0 0 * * 7")).toThrow(/dia-da-semana/);

      // Faixas invertidas e passos inválidos
      expect(() => validarExpressaoCron("10-5 * * * *")).toThrow(/faixa 10-5 fora/);
      expect(() => validarExpressaoCron("*/0 * * * *")).toThrow(/passo 0/);
    });
  });

  describe("2. Predicados Numéricos de Campo (compilarCampoCron)", () => {
    it("compila predicados com passos, faixas e listas", () => {
      const pMinuto = compilarCampoCron("*/15", "minuto");
      expect(pMinuto(0)).toBe(true);
      expect(pMinuto(15)).toBe(true);
      expect(pMinuto(30)).toBe(true);
      expect(pMinuto(45)).toBe(true);
      expect(pMinuto(10)).toBe(false);

      const pHora = compilarCampoCron("9-17", "hora");
      expect(pHora(9)).toBe(true);
      expect(pHora(13)).toBe(true);
      expect(pHora(17)).toBe(true);
      expect(pHora(8)).toBe(false);
      expect(pHora(18)).toBe(false);

      const pDias = compilarCampoCron("1,3,5", "dia-da-semana");
      expect(pDias(1)).toBe(true);
      expect(pDias(3)).toBe(true);
      expect(pDias(5)).toBe(true);
      expect(pDias(0)).toBe(false);
      expect(pDias(2)).toBe(false);
    });
  });

  describe("3. Cálculo do Próximo Disparo (calcularProximoCron)", () => {
    it("calcula o minuto seguinte determinístico", () => {
      const base = new Date("2026-09-24T10:14:00");
      const proximo = calcularProximoCron("15 10 * * *", base);
      expect(proximo.getTime()).toBe(new Date("2026-09-24T10:15:00").getTime());
    });

    it("avança para o dia seguinte se o horário já passou", () => {
      const base = new Date("2026-09-24T11:00:00");
      const proximo = calcularProximoCron("0 10 * * *", base);
      expect(proximo.getTime()).toBe(new Date("2026-09-25T10:00:00").getTime());
    });

    it("suporta passos e listas no cálculo determinístico", () => {
      const base = new Date("2026-09-24T10:07:00Z");
      expect(calcularProximoCron("*/15 * * * *", base).getMinutes()).toBe(15);
      expect(calcularProximoCron("5,35 * * * *", base).getMinutes()).toBe(35);
      expect(calcularProximoCron("10-12 * * * *", base).getMinutes()).toBe(10);
    });
  });

  describe("4. Projeção Determinística de Fuso Horário (calcularProximoCronEmTimezone)", () => {
    it("valida corretude do FUSO_PADRAO e função fusoValido", () => {
      expect(FUSO_PADRAO).toBe("America/Sao_Paulo");
      expect(fusoValido("America/Sao_Paulo")).toBe(true);
      expect(fusoValido("UTC")).toBe(true);
      expect(fusoValido("Asia/Tokyo")).toBe(true);
      expect(fusoValido("Fuso/Invalido")).toBe(false);
      expect(fusoValido("")).toBe(false);
    });

    it("projeta ocorrência no fuso America/Sao_Paulo (UTC-3)", () => {
      // 10:00Z = 07:00 BRT → próximo "0 9 * * *" (09:00 BRT) = 12:00Z do mesmo dia
      const base = new Date("2026-09-12T10:00:00Z");
      const proximo = calcularProximoCronEmTimezone("0 9 * * *", "America/Sao_Paulo", base);
      expect(proximo.toISOString()).toBe("2026-09-12T12:00:00.000Z");
    });

    it("avança para o dia seguinte no fuso quando o horário local já passou", () => {
      // 13:00Z = 10:00 BRT → próximo 09:00 BRT é amanhã = 12:00Z do dia 13
      const base = new Date("2026-09-12T13:00:00Z");
      const proximo = calcularProximoCronEmTimezone("0 9 * * *", "America/Sao_Paulo", base);
      expect(proximo.toISOString()).toBe("2026-09-13T12:00:00.000Z");
    });

    it("respeita timezone UTC e Asia/Tokyo", () => {
      const baseUTC = new Date("2026-09-12T09:00:00Z");
      const proxUTC = calcularProximoCronEmTimezone("30 9 * * *", "UTC", baseUTC);
      expect(proxUTC.toISOString()).toBe("2026-09-12T09:30:00.000Z");

      // 00:00 UTC = 09:00 JST (Tokyo é UTC+9)
      // Se pedimos 09:00 JST às 00:01 UTC (09:01 JST), o próximo é amanhã às 09:00 JST (00:00 UTC)
      const baseTokyo = new Date("2026-09-12T00:01:00Z");
      const proxTokyo = calcularProximoCronEmTimezone("0 9 * * *", "Asia/Tokyo", baseTokyo);
      expect(proxTokyo.toISOString()).toBe("2026-09-13T00:00:00.000Z");
    });

    it("lança CronExpressionError para fusos inválidos", () => {
      expect(() =>
        calcularProximoCronEmTimezone("0 9 * * *", "Fuso/Inexistente", new Date())
      ).toThrow(CronExpressionError);
    });
  });
});
