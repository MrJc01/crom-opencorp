import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SchedulerError, Scheduler, proximoCron, validarCron } from "../src/core/scheduler.js";
import type { Job } from "../src/core/scheduler.js";

const raizes: string[] = [];

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

let relogio = 0;
let home = "";
let scheduler: Scheduler;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "opencorp-sched-"));
  raizes.push(home);
  relogio = Date.now();
  scheduler = new Scheduler({ homeDir: home, agora: () => new Date(relogio) });
});

describe("cron", () => {
  it("valida expressões", async () => {
    await expect(scheduler.criar({ nome: "x", agenda: { tipo: "cron", valor: "30 9 * * *" }, args: ["task", "list"] })).resolves.toBeTruthy();
    expect(() => new Scheduler({ homeDir: home }).listar()).not.toThrow();
  });

  it("recusa cron com campos errados e faixa fora", async () => {
    expect(() => validarCron("30 9 * *")).toThrow(SchedulerError);
    expect(() => validarCron("61 9 * * *")).toThrow(/minuto/);
    expect(() => validarCron("30 25 * * *")).toThrow(/hora/);
  });

  it("proximoCron acha a próxima ocorrência", async () => {
    const de = new Date("2026-08-29T10:00:00");
    const proxima = proximoCron("30 9 * * *", de);
    expect(proxima.toISOString()).toBe(new Date("2026-08-30T09:30:00").toISOString());
    const marco = proximoCron("0 0 1 3 *", new Date("2026-08-29T10:00:00"));
    expect(marco.toISOString()).toBe(new Date("2027-03-01T00:00:00").toISOString());
  });

  it("proximoCron suporta passos e listas", async () => {
    const de = new Date("2026-08-29T10:07:00");
    expect(proximoCron("*/15 * * * *", de).getMinutes()).toBe(15);
    expect(proximoCron("5,35 * * * *", de).getMinutes()).toBe(35);
    expect(proximoCron("10-12 * * * *", de).getMinutes()).toBe(10);
  });
});

describe("Scheduler — CRUD", () => {
  it("cria job com próxima execução calculada (intervalo)", async () => {
    const j = await scheduler.criar({ nome: "rotina", agenda: { tipo: "intervalo_min", valor: 30 }, args: ["task", "list"], workspace: "ws" });
    expect(j.id).toMatch(/^sch-/);
    expect(j.ativo).toBe(true);
    expect(new Date(j.proxima_exec!).getTime()).toBe(relogio + 30 * 60_000);
  });

  it("recusa args vazios e agenda inválida", async () => {
    await expect(scheduler.criar({ nome: "x", agenda: { tipo: "intervalo_min", valor: 10 }, args: [] })).rejects.toThrow(SchedulerError);
    await expect(scheduler.criar({ nome: "x", agenda: { tipo: "intervalo_min", valor: 0 }, args: ["a"] })).rejects.toThrow(/>= 1/);
    await expect(scheduler.criar({ nome: "x", agenda: { tipo: "data_unica", valor: "não-data" }, args: ["a"] })).rejects.toThrow(/inválida/);
    await expect(scheduler.criar({ nome: "", agenda: { tipo: "intervalo_min", valor: 5 }, args: ["a"] })).rejects.toThrow(/nome/);
  });

  it("pausa/retoma/exclui; retoma reagenda a partir de agora", async () => {
    const j = await scheduler.criar({ nome: "p", agenda: { tipo: "intervalo_min", valor: 60 }, args: ["a"] });
    relogio += 10 * 3600_000;
    const pausado = await scheduler.pausar(j.id);
    expect(pausado.ativo).toBe(false);
    const retomado = await scheduler.retomar(j.id);
    expect(retomado.ativo).toBe(true);
    expect(new Date(retomado.proxima_exec!).getTime()).toBe(relogio + 60 * 60_000);
    await scheduler.excluir(j.id);
    await expect(scheduler.obter(j.id)).rejects.toThrow(/não encontrado/);
  });

  it("obter inexistente lança com status 404", async () => {
    try {
      await scheduler.obter("sch-nada");
      expect.unreachable();
    } catch (e) {
      expect((e as { status?: number }).status).toBe(404);
    }
  });
});

describe("Scheduler — tick", () => {
  function schedulerComExec(registro: { executados: string[]; jobs: Job[] }): Scheduler {
    return new Scheduler({
      homeDir: home,
      agora: () => new Date(relogio),
      executar: async (job) => {
        registro.executados.push(job.id);
        registro.jobs.push(job);
        return "ok";
      },
    });
  }

  it("executa job vencido e reagendaa intervalo", async () => {
    const j = await scheduler.criar({ nome: "r", agenda: { tipo: "intervalo_min", valor: 5 }, args: ["a"] });
    relogio += 6 * 60_000;
    const registro = { executados: [] as string[], jobs: [] as Job[] };
    const s2 = schedulerComExec(registro);
    const { executados, pulados } = await s2.tick();
    expect(executados).toEqual([j.id]);
    expect(pulados).toEqual([]);
    const atual = await scheduler.obter(j.id);
    expect(atual.ultima_exec).not.toBeNull();
    expect(new Date(atual.proxima_exec!).getTime()).toBe(relogio + 5 * 60_000);
  });

  it("pula job atrasado além da graça e reagenda", async () => {
    const j = await scheduler.criar({ nome: "atrasado", agenda: { tipo: "intervalo_min", valor: 5 }, args: ["a"] });
    relogio += 40 * 60_000;
    const registro = { executados: [] as string[], jobs: [] as Job[] };
    const s2 = schedulerComExec(registro);
    const { executados, pulados } = await s2.tick();
    expect(executados).toEqual([]);
    expect(pulados).toEqual([j.id]);
    expect((await scheduler.obter(j.id)).ultima_exec).toBeNull();
  });

  it("não executa job antes da hora nem pausado", async () => {
    const j = await scheduler.criar({ nome: "futuro", agenda: { tipo: "intervalo_min", valor: 60 }, args: ["a"] });
    await scheduler.criar({ nome: "pausado", agenda: { tipo: "intervalo_min", valor: 1 }, args: ["a"] });
    await scheduler.pausar((await scheduler.listar()).find((x) => x.nome === "pausado")!.id);
    relogio += 2 * 60_000;
    const registro = { executados: [] as string[], jobs: [] as Job[] };
    const s2 = schedulerComExec(registro);
    const { executados } = await s2.tick();
    expect(executados).toEqual([]);
    expect((await scheduler.obter(j.id)).ultima_exec).toBeNull();
  });

  it("data_unica executa uma vez e desativa", async () => {
    relogio = new Date("2026-08-29T10:00:00").getTime();
    const j = await scheduler.criar({
      nome: "única",
      agenda: { tipo: "data_unica", valor: "2026-08-29T10:02:00" },
      args: ["a"],
    });
    relogio = new Date("2026-08-29T10:03:00").getTime();
    const registro = { executados: [] as string[], jobs: [] as Job[] };
    const s2 = schedulerComExec(registro);
    const { executados } = await s2.tick();
    expect(executados).toEqual([j.id]);
    expect((await scheduler.obter(j.id)).ativo).toBe(false);
    expect((await scheduler.obter(j.id)).proxima_exec).toBeNull();
  });

  it("runNow executa sem mudar a agenda", async () => {
    const j = await scheduler.criar({ nome: "manual", agenda: { tipo: "intervalo_min", valor: 60 }, args: ["a"] });
    const antes = j.proxima_exec;
    const registro = { executados: [] as string[], jobs: [] as Job[] };
    const s2 = schedulerComExec(registro);
    const { resultado } = await s2.runNow(j.id);
    expect(resultado).toBe("ok");
    expect((await scheduler.obter(j.id)).proxima_exec).toBe(antes);
  });
});
