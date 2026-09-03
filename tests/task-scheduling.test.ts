import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseQuandoDataUnica, parseAgendaTask, Scheduler } from "../src/core/scheduler.js";
import { createApiServer, type ApiServerOptions, type SessaoApi } from "../src/server/index.js";
import { TaskStore } from "../src/core/task-store.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";

const raizes: string[] = [];

async function tmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "opencorp-task-sched-"));
  raizes.push(dir);
  return dir;
}

function makeFetch(port: number, token: string) {
  const base = `http://127.0.0.1:${port}`;
  return async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`${base}${path}`, {
      ...opts,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...opts.headers,
      },
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    return { status: res.status, json, headers: res.headers };
  };
}

describe("Task Scheduling & Execution Parsing Unit Tests", () => {
  const baseDate = new Date("2026-09-03T10:00:00.000Z");

  describe("parseQuandoDataUnica", () => {
    it("converte offset relativo em minutos (+15m)", () => {
      const res = parseQuandoDataUnica("+15m", baseDate);
      const expected = new Date(baseDate.getTime() + 15 * 60_000).toISOString();
      expect(res).toBe(expected);
    });

    it("converte offset relativo em horas (+2h)", () => {
      const res = parseQuandoDataUnica("+2h", baseDate);
      const expected = new Date(baseDate.getTime() + 2 * 3600_000).toISOString();
      expect(res).toBe(expected);
    });

    it("converte offset relativo em dias (+3d)", () => {
      const res = parseQuandoDataUnica("+3d", baseDate);
      const expected = new Date(baseDate.getTime() + 3 * 86400_000).toISOString();
      expect(res).toBe(expected);
    });

    it("interpreta horário HH:mm", () => {
      const res = parseQuandoDataUnica("14:30", baseDate);
      const d = new Date(res);
      expect(d.getHours()).toBe(14);
      expect(d.getMinutes()).toBe(30);
    });

    it("interpreta 'amanha 09:00'", () => {
      const res = parseQuandoDataUnica("amanha 09:00", baseDate);
      const d = new Date(res);
      expect(d.getDate()).toBe(baseDate.getDate() + 1);
      expect(d.getHours()).toBe(9);
      expect(d.getMinutes()).toBe(0);
    });

    it("aceita data em formato ISO diretamente", () => {
      const iso = "2026-10-15T18:00:00.000Z";
      const res = parseQuandoDataUnica(iso, baseDate);
      expect(res).toBe(iso);
    });

    it("lança erro amigável para formato não reconhecido", () => {
      expect(() => parseQuandoDataUnica("formato-invalido", baseDate)).toThrow(
        /formato de agendamento não reconhecido/,
      );
    });
  });

  describe("parseAgendaTask", () => {
    it("converte repete: 'diario' para cron '0 9 * * *'", () => {
      const res = parseAgendaTask({ repete: "diario" });
      expect(res).not.toBeNull();
      expect(res?.agenda.tipo).toBe("cron");
      expect(res?.agenda.valor).toBe("0 9 * * *");
      expect(res?.descricao).toContain("Diariamente às 09:00");
    });

    it("combina repete: 'diario' com quando: '18:30'", () => {
      const res = parseAgendaTask({ repete: "diario", quando: "18:30" });
      expect(res).not.toBeNull();
      expect(res?.agenda.tipo).toBe("cron");
      expect(res?.agenda.valor).toBe("30 18 * * *");
      expect(res?.descricao).toContain("18:30");
    });

    it("converte repete: 'horario' para intervalo de 60 min", () => {
      const res = parseAgendaTask({ repete: "horario" });
      expect(res).not.toBeNull();
      expect(res?.agenda.tipo).toBe("intervalo_min");
      expect(res?.agenda.valor).toBe(60);
    });

    it("converte repete: 'semanal' para cron '0 9 * * 1'", () => {
      const res = parseAgendaTask({ repete: "semanal" });
      expect(res).not.toBeNull();
      expect(res?.agenda.tipo).toBe("cron");
      expect(res?.agenda.valor).toBe("0 9 * * 1");
    });

    it("converte repete: '45m' para intervalo de 45 min", () => {
      const res = parseAgendaTask({ repete: "45m" });
      expect(res).not.toBeNull();
      expect(res?.agenda.tipo).toBe("intervalo_min");
      expect(res?.agenda.valor).toBe(45);
    });

    it("converte repete: '3h' para intervalo de 180 min", () => {
      const res = parseAgendaTask({ repete: "3h" });
      expect(res).not.toBeNull();
      expect(res?.agenda.tipo).toBe("intervalo_min");
      expect(res?.agenda.valor).toBe(180);
    });

    it("converte cron direto", () => {
      const res = parseAgendaTask({ cron: "*/10 * * * *" });
      expect(res).not.toBeNull();
      expect(res?.agenda.tipo).toBe("cron");
      expect(res?.agenda.valor).toBe("*/10 * * * *");
    });

    it("converte quando pontual para data_unica", () => {
      const res = parseAgendaTask({ quando: "+20m" });
      expect(res).not.toBeNull();
      expect(res?.agenda.tipo).toBe("data_unica");
    });

    it("retorna null quando nenhuma opção de agendamento é informada", () => {
      const res = parseAgendaTask({});
      expect(res).toBeNull();
    });
  });
});

describe("API Server POST /tasks com Agendamento e Execução Imediata", () => {
  let home: string;
  let token = "test-token";
  let port: number;
  let fetchApi: ReturnType<typeof makeFetch>;
  let server: ReturnType<typeof createApiServer>["server"];
  let wsId = "default";
  let wsPath: string;

  beforeAll(async () => {
    home = await tmpDir();

    const fakeSessoes: SessaoApi = {
      async rodar(opcoes) {
        return {
          id: opcoes.execId,
          agente: opcoes.agente,
          modelo: opcoes.model ?? "test-model",
          ordem: opcoes.ordem,
          inicio: new Date().toISOString(),
          fim: new Date().toISOString(),
          status: "concluido",
          exit_code: 0,
          duracao_ms: 50,
          pid: null,
          log: "fake.log",
          captura: "sucesso",
          custo_usd: 0,
        };
      },
      async listarExecucoes() {
        return [];
      },
      async logDe() {
        return "log";
      },
    };

    const srvInst = createApiServer({
      homeDir: home,
      token,
      sessoes: fakeSessoes,
      instalarMencoes: false,
    } as ApiServerOptions);

    server = srvInst.server;
    server.listen(0, "127.0.0.1");
    port = await srvInst.porta;
    fetchApi = makeFetch(port, token);

    // Cria workspace para testes
    const wsRes = await fetchApi("/workspaces", {
      method: "POST",
      body: JSON.stringify({ id: "corp-tasks" }),
    });
    const wsJson = wsRes.json as any;
    wsId = wsJson.id;
    wsPath = wsJson.caminho;
  });

  afterAll(async () => {
    server.close();
    await new Promise((resolve) => setTimeout(resolve, 80));
    await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true }).catch(() => {})));
  });

  it("cria task com agendamento pontual (+30m) e cria job no Scheduler", async () => {
    const res = await fetchApi(`/tasks?workspace=${wsId}`, {
      method: "POST",
      body: JSON.stringify({
        titulo: "Task Agendada Pontual",
        quando: "+30m",
        responsavel: "agente:executor-padrao",
      }),
    });

    expect(res.status).toBe(201);
    const body = res.json as any;
    expect(body.id).toMatch(/^tsk-/);
    expect(body.labels).toContain("agendada");
    expect(body.agendamento).toBeDefined();
    expect(body.agendamento.id).toMatch(/^sch-/);

    // Verifica que o job foi persistido no scheduler
    const scheduler = new Scheduler({ homeDir: home });
    const jobs = await scheduler.listar();
    const jobCriado = jobs.find((j) => j.id === body.agendamento.id);
    expect(jobCriado).toBeDefined();
    expect(jobCriado?.agenda.tipo).toBe("data_unica");
    expect(jobCriado?.args).toEqual(["task", "run", body.id]);

    // Verifica mensagem de sistema no chat da task
    const taskStore = new TaskStore();
    const msgs = await taskStore.chat(wsPath, body.id);
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0]?.corpo).toContain("📅 Agendamento configurado");
  });

  it("cria task com repetição diária e cria job cron no Scheduler", async () => {
    const res = await fetchApi(`/tasks?workspace=${wsId}`, {
      method: "POST",
      body: JSON.stringify({
        titulo: "Task Recorrente Diária",
        repete: "diario",
        quando: "19:00",
        responsavel: "agente:relatorios",
      }),
    });

    expect(res.status).toBe(201);
    const body = res.json as any;
    expect(body.labels).toContain("recorrente");
    expect(body.agendamento).toBeDefined();
    expect(body.agendamento.descricao).toContain("19:00");

    const scheduler = new Scheduler({ homeDir: home });
    const jobs = await scheduler.listar();
    const job = jobs.find((j) => j.id === body.agendamento.id);
    expect(job).toBeDefined();
    expect(job?.agenda.tipo).toBe("cron");
    expect(job?.agenda.valor).toBe("0 19 * * *");
  });

  it("cria task com imediato: true e move para fazendo", async () => {
    const res = await fetchApi(`/tasks?workspace=${wsId}`, {
      method: "POST",
      body: JSON.stringify({
        titulo: "Task Execução Imediata",
        imediato: true,
        responsavel: "agente:executor-padrao",
      }),
    });

    expect(res.status).toBe(201);
    const body = res.json as any;
    expect(body.coluna).toBe("fazendo");
    expect(body.executando_agora).toBe(true);
  });
});
