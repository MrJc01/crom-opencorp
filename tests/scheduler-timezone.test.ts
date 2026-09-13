import { describe, expect, it } from "vitest";
import { FUSO_PADRAO, fusoValido, proximoCronTz, SchedulerError } from "../src/core/scheduler.js";

describe("scheduler timezone (FUSO_PADRAO + proximoCronTz)", () => {
  it("FUSO_PADRAO é America/Sao_Paulo", () => {
    expect(FUSO_PADRAO).toBe("America/Sao_Paulo");
    expect(fusoValido("America/Sao_Paulo")).toBe(true);
    expect(fusoValido("America/Sao_Paulo")).toBe(true);
  });

  it("rejeita fuso inválido", () => {
    expect(fusoValido("Atlantis/Nowhere")).toBe(false);
    expect(fusoValido("")).toBe(false);
  });

  it("proximoCronTz interpreta o cron no relógio do fuso", () => {
    // 10:00Z = 07:00 BRT → próximo "0 9 * * *" (09:00 BRT) = 12:00Z do mesmo dia
    const p = proximoCronTz("0 9 * * *", new Date("2026-09-12T10:00:00Z"), "America/Sao_Paulo");
    expect(p.toISOString()).toBe("2026-09-12T12:00:00.000Z");
  });

  it("proximoCronTz pula para o dia seguinte quando o horário já passou no fuso", () => {
    // 13:00Z = 10:00 BRT → próximo 09:00 BRT é amanhã = 12:00Z do dia 13
    const p = proximoCronTz("0 9 * * *", new Date("2026-09-12T13:00:00Z"), "America/Sao_Paulo");
    expect(p.toISOString()).toBe("2026-09-13T12:00:00.000Z");
  });

  it("proximoCronTz respeita UTC quando o fuso é UTC", () => {
    const p = proximoCronTz("30 9 * * *", new Date("2026-09-12T09:00:00Z"), "UTC");
    expect(p.toISOString()).toBe("2026-09-12T09:30:00.000Z");
  });

  it("proximoCronTz lança SchedulerError para fuso inválido", () => {
    expect(() => proximoCronTz("0 9 * * *", new Date(), "Terra/Plana")).toThrow(SchedulerError);
  });

  it("proximoCronTz lança SchedulerError para cron inválido", () => {
    expect(() => proximoCronTz("invalido", new Date(), "America/Sao_Paulo")).toThrow(SchedulerError);
  });
});
