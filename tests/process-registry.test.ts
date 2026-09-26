import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ProcessRegistry,
  formatProcessKey,
  type ProcessKey,
  type ProcessLifecycleEvent,
} from "../src/core/runtime/process-registry.js";

describe("ETAPA 4 — ProcessRegistry: Isolamento por Chave e Reuso", () => {
  it("dois workspaces do mesmo motor recebem processos isolados", () => {
    const registry = new ProcessRegistry({
      isPidRunning: () => true,
    });

    const key1: ProcessKey = { engineId: "opencode", workspaceId: "ws-alpha" };
    const key2: ProcessKey = { engineId: "opencode", workspaceId: "ws-beta" };

    const p1 = registry.register(key1, {
      pid: 1001,
      cwd: "/workspaces/ws-alpha",
      transport: "http_server",
      port: 4096,
    });

    const p2 = registry.register(key2, {
      pid: 1002,
      cwd: "/workspaces/ws-beta",
      transport: "http_server",
      port: 4097,
    });

    expect(p1.keyString).toBe("opencode::ws-alpha");
    expect(p2.keyString).toBe("opencode::ws-beta");
    expect(p1.pid).not.toBe(p2.pid);

    expect(registry.get(key1)?.pid).toBe(1001);
    expect(registry.get(key2)?.pid).toBe(1002);
  });

  it("reuso ocorre estritamente para a mesma chave [engineId, workspaceId]", () => {
    const registry = new ProcessRegistry({
      isPidRunning: () => true,
    });

    const keyAlpha: ProcessKey = { engineId: "codex", workspaceId: "ws-alpha" };
    const keyBeta: ProcessKey = { engineId: "codex", workspaceId: "ws-beta" };

    registry.register(keyAlpha, {
      pid: 2001,
      cwd: "/workspaces/ws-alpha",
      transport: "spawn_cli",
    });

    const acquiredAlpha = registry.acquire(keyAlpha);
    expect(acquiredAlpha).toBeDefined();
    expect(acquiredAlpha?.pid).toBe(2001);
    expect(acquiredAlpha?.referenceCount).toBe(2);

    const acquiredBeta = registry.acquire(keyBeta);
    expect(acquiredBeta).toBeUndefined();
  });
});

describe("ETAPA 4 — ProcessRegistry: Referência, Atividade e Timeout Ocioso", () => {
  it("gerencia contagem de referência, liberação e timer ocioso de 15 minutos simulados", async () => {
    let now = 1000000;
    const timers: Array<{ fn: () => void; ms: number; id: number }> = [];
    let nextTimerId = 1;
    let isRunning = true;

    const events: ProcessLifecycleEvent[] = [];

    const registry = new ProcessRegistry({
      idleTimeoutMs: 15 * 60 * 1000,
      clock: () => now,
      setTimeoutFn: (fn, ms) => {
        const id = nextTimerId++;
        timers.push({ fn, ms, id });
        return id;
      },
      clearTimeoutFn: (id) => {
        const idx = timers.findIndex((t) => t.id === id);
        if (idx !== -1) timers.splice(idx, 1);
      },
      killer: () => {
        isRunning = false;
      },
      isPidRunning: () => isRunning,
    });

    registry.addListener((e) => events.push(e));

    const key: ProcessKey = { engineId: "opencode", workspaceId: "ws-idle" };

    // Registrado com refCount inicial 1
    const p = registry.register(key, {
      pid: 3001,
      cwd: "/workspaces/ws-idle",
      transport: "http_server",
      initialRefCount: 1,
    });
    expect(p.state).toBe("busy");
    expect(timers).toHaveLength(0); // Sem timer ocioso enquanto busy

    // Libera a referência: refCount vai para 0 -> estado vira 'idle' e agenda timer de 15 minutos
    registry.release(key);
    expect(p.state).toBe("idle");
    expect(p.referenceCount).toBe(0);
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(15 * 60 * 1000);

    // Atividade subsequente via touch() renova o timer
    now += 5 * 60 * 1000; // 5 minutos se passaram
    registry.touch(key);
    expect(timers).toHaveLength(1); // Timer antigo limpo e novo agendado

    // Avança 15 minutos e dispara o timer simulado
    now += 15 * 60 * 1000;
    const activeTimer = timers.pop();
    expect(activeTimer).toBeDefined();
    await activeTimer?.fn();

    // Processo deve ter recebido idle_timeout e terminado
    expect(events.some((e) => e.type === "process.idle_timeout")).toBe(true);
    expect(registry.get(key)).toBeUndefined();
  });
});

describe("ETAPA 4 — ProcessRegistry: Encerramento Gracioso e Sinais", () => {
  it("processo cooperativo encerra com SIGTERM dentro do grace period", async () => {
    let pidAlive = true;
    const signalsSent: string[] = [];

    const registry = new ProcessRegistry({
      gracePeriodMs: 5000,
      killer: (pid, sig) => {
        signalsSent.push(sig);
        if (sig === "SIGTERM") {
          pidAlive = false; // encerrou cooperativamente
        }
      },
      isPidRunning: () => pidAlive,
    });

    const key: ProcessKey = { engineId: "opencode", workspaceId: "ws-term" };
    registry.register(key, { pid: 4001, cwd: "/tmp", transport: "http_server" });

    const ok = await registry.terminate(key);
    expect(ok).toBe(true);
    expect(signalsSent).toEqual(["SIGTERM"]);
    expect(registry.get(key)).toBeUndefined();
  });

  it("processo travado recebe SIGKILL após timeout de 5 segundos simulados", async () => {
    let pidAlive = true;
    const signalsSent: string[] = [];
    let now = 1000;

    const registry = new ProcessRegistry({
      gracePeriodMs: 5000,
      clock: () => now,
      setTimeoutFn: (fn) => {
        now += 6000; // avança o relógio além do gracePeriod
        fn();
      },
      killer: (pid, sig) => {
        signalsSent.push(sig);
        if (sig === "SIGKILL") {
          pidAlive = false; // morre apenas no SIGKILL
        }
      },
      isPidRunning: () => pidAlive,
    });

    const key: ProcessKey = { engineId: "codex", workspaceId: "ws-stuck" };
    registry.register(key, { pid: 4002, cwd: "/tmp", transport: "spawn_cli" });

    const ok = await registry.terminate(key);
    expect(ok).toBe(true);
    expect(signalsSent).toContain("SIGTERM");
    expect(signalsSent).toContain("SIGKILL");
    expect(registry.get(key)).toBeUndefined();
  });

  it("shutdownAll encerra todos os processos possuídos no registro", async () => {
    const terminatedPids: number[] = [];

    const registry = new ProcessRegistry({
      isPidRunning: () => false,
      killer: (pid) => {
        terminatedPids.push(pid);
      },
    });

    registry.register({ engineId: "opencode", workspaceId: "ws-1" }, { pid: 5001, cwd: "/tmp", transport: "http_server" });
    registry.register({ engineId: "codex", workspaceId: "ws-2" }, { pid: 5002, cwd: "/tmp", transport: "spawn_cli" });

    const count = await registry.shutdownAll();
    expect(count).toBe(2);
    expect(terminatedPids).toContain(5001);
    expect(terminatedPids).toContain(5002);
    expect(registry.list()).toHaveLength(0);
  });
});

describe("ETAPA 4 — ProcessRegistry: Reconciliação no Boot e Pidfiles", () => {
  let tempPidDir: string;

  beforeEach(() => {
    tempPidDir = join(tmpdir(), `opencorp-pidfiles-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    mkdirSync(tempPidDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempPidDir, { recursive: true, force: true });
  });

  it("não adota processo quando a identidade do executável não pode ser confirmada", async () => {
    const registry = new ProcessRegistry({
      pidfilesDir: tempPidDir,
      isPidRunning: (pid) => pid === 7777,
      getPidCommandLine: (pid) => "/usr/bin/google-chrome --no-sandbox", // Processo completamente alheio
    });

    const pidfileData = {
      key: { engineId: "opencode", workspaceId: "ws-x" },
      keyString: "opencode::ws-x",
      pid: 7777,
      cwd: "/tmp",
      transport: "http_server",
      expectedExecutableName: "opencode",
    };
    writeFileSync(join(tempPidDir, "opencode__ws-x.json"), JSON.stringify(pidfileData));

    const result = await registry.reconcileBoot({ killOrphans: false });
    expect(result.adopted).toBe(0);
    expect(result.staleRemoved).toBe(1);
    expect(registry.get({ engineId: "opencode", workspaceId: "ws-x" })).toBeUndefined();
  });

  it("descarta pidfiles obsoletos de processos que já morreram", async () => {
    const registry = new ProcessRegistry({
      pidfilesDir: tempPidDir,
      isPidRunning: () => false, // Processo morto
    });

    writeFileSync(
      join(tempPidDir, "dead_process.json"),
      JSON.stringify({ key: { engineId: "opencode", workspaceId: "dead" }, keyString: "opencode::dead", pid: 9999 })
    );

    const result = await registry.reconcileBoot();
    expect(result.staleRemoved).toBe(1);
    expect(result.adopted).toBe(0);
  });

  it("reconcilia e adota órfão legítimo quando a identidade é confirmada", async () => {
    const registry = new ProcessRegistry({
      pidfilesDir: tempPidDir,
      isPidRunning: (pid) => pid === 8888,
      getPidCommandLine: (pid) => "/usr/local/bin/opencode serve --port 4096",
    });

    writeFileSync(
      join(tempPidDir, "opencode__ws-legit.json"),
      JSON.stringify({
        key: { engineId: "opencode", workspaceId: "ws-legit" },
        keyString: "opencode::ws-legit",
        pid: 8888,
        cwd: "/tmp/ws-legit",
        transport: "http_server",
        expectedExecutableName: "opencode",
      })
    );

    const result = await registry.reconcileBoot({ killOrphans: false });
    expect(result.adopted).toBe(1);

    const adopted = registry.get({ engineId: "opencode", workspaceId: "ws-legit" });
    expect(adopted).toBeDefined();
    expect(adopted?.pid).toBe(8888);
    expect(adopted?.state).toBe("idle");
  });
});
