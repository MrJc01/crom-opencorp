import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  HostDriver,
  SandboxDriver,
  ContainerDriver,
  resolverDriverExecucao,
  escolherPreferenciaDriver,
} from "../src/core/execution-driver.js";
import type { OpcoesPreparacaoDriver } from "../src/core/execution-driver.js";

describe("ExecutionDriver", () => {
  const mockOpts: OpcoesPreparacaoDriver = {
    binary: "node",
    args: ["-e", "console.log('teste')"],
    cwd: "/tmp/mock-ws",
    env: { TESTE: "1", PATH: "/usr/bin" },
    workspaceId: "ws-teste",
    workspacePath: "/tmp/mock-ws",
  };

  // ── HostDriver ────────────────────────────────────────────────────

  describe("HostDriver", () => {
    it("está sempre disponível", async () => {
      const driver = new HostDriver();
      expect(driver.tipo).toBe("host");
      expect(await driver.disponivel()).toBe(true);
    });

    it("prepara execução direta sem limites", async () => {
      const driver = new HostDriver();
      const prep = await driver.preparar(mockOpts);
      expect(prep.driver).toBe("host");
      expect(prep.binary).toBe("node");
      expect(prep.args).toEqual(["-e", "console.log('teste')"]);
      expect(prep.cwd).toBe("/tmp/mock-ws");
      expect(prep.env).toEqual(mockOpts.env);
    });

    it("aplica limites de RAM via systemd-run se disponível", async () => {
      const driver = new HostDriver();
      const prep = await driver.preparar({
        ...mockOpts,
        limites: { ramMb: 512 },
      });

      if (prep.binary === "systemd-run") {
        expect(prep.args).toContain("MemoryMax=512M");
        expect(prep.args).toContain("node");
      } else {
        // systemd-run not available, falls back to direct exec
        expect(prep.binary).toBe("node");
      }
    });

    it("aplica limites de CPU via systemd-run se disponível", async () => {
      const driver = new HostDriver();
      const prep = await driver.preparar({
        ...mockOpts,
        limites: { cpuPct: 200 },
      });

      if (prep.binary === "systemd-run") {
        expect(prep.args).toContain("CPUQuota=200%");
      }
    });

    it("aplica limites combinados RAM + CPU", async () => {
      const driver = new HostDriver();
      const prep = await driver.preparar({
        ...mockOpts,
        limites: { ramMb: 1024, cpuPct: 100 },
      });

      if (prep.binary === "systemd-run") {
        expect(prep.args).toContain("MemoryMax=1024M");
        expect(prep.args).toContain("CPUQuota=100%");
        // Deve conter o binário original depois dos args do scope
        const nodeIdx = prep.args.indexOf("node");
        expect(nodeIdx).toBeGreaterThan(0);
        expect(prep.args[nodeIdx + 1]).toBe("-e");
      }
    });

    it("preserva env e cwd inalterados", async () => {
      const driver = new HostDriver();
      const envCustom = { MY_VAR: "hello", SECRET: "abc123" };
      const prep = await driver.preparar({ ...mockOpts, env: envCustom });
      expect(prep.env).toEqual(envCustom);
      expect(prep.cwd).toBe("/tmp/mock-ws");
    });
  });

  // ── SandboxDriver ─────────────────────────────────────────────────

  describe("SandboxDriver", () => {
    it("usa bwrap com montagens seguras quando disponível", async () => {
      const driver = new SandboxDriver();
      expect(driver.tipo).toBe("sandbox");

      const temBwrap = await driver.disponivel();
      const prep = await driver.preparar(mockOpts);

      if (temBwrap) {
        expect(prep.driver).toBe("sandbox");
        expect(prep.args).toContain("--ro-bind");
        expect(prep.args).toContain("/usr");
        expect(prep.args).toContain("/lib");
        expect(prep.args).toContain("/bin");
        expect(prep.args).toContain("/etc");
        expect(prep.args).toContain("--proc");
        expect(prep.args).toContain("--dev");
        expect(prep.args).toContain("--unshare-pid");
        expect(prep.args).toContain("--unshare-uts");
        expect(prep.args).toContain("--unshare-ipc");
        expect(prep.args).toContain("--die-with-parent");
        expect(prep.args).toContain("/tmp/mock-ws"); // bind workspace
        expect(prep.args).toContain("node"); // user binary at end
      } else {
        // Fallback para host se bwrap não está instalado
        expect(prep.driver).toBe("host");
        expect(prep.aviso).toContain("bwrap não encontrado");
      }
    });

    it("combina sandbox + systemd-run quando há limites e ambos disponíveis", async () => {
      const driver = new SandboxDriver();
      const temBwrap = await driver.disponivel();

      const prep = await driver.preparar({
        ...mockOpts,
        limites: { ramMb: 256, cpuPct: 50 },
      });

      if (temBwrap && prep.binary === "systemd-run") {
        expect(prep.args).toContain("MemoryMax=256M");
        expect(prep.args).toContain("CPUQuota=50%");
        expect(prep.args).toContain("bwrap");
        expect(prep.args).toContain("--ro-bind");
      }
    });

    it("garante PATH no env dentro do sandbox", async () => {
      const driver = new SandboxDriver();
      const temBwrap = await driver.disponivel();

      const prep = await driver.preparar({
        ...mockOpts,
        env: { CUSTOM: "1" }, // sem PATH
      });

      if (temBwrap) {
        expect(prep.env.PATH).toBeDefined();
        expect(prep.env.PATH).toContain("/usr/bin");
      }
    });
  });

  // ── ContainerDriver ───────────────────────────────────────────────

  describe("ContainerDriver", () => {
    it("Docker: prepara container com volume montado", async () => {
      const driver = new ContainerDriver("docker", "opencorp/custom:1.0");
      expect(driver.tipo).toBe("docker");

      const temDocker = await driver.disponivel();
      const prep = await driver.preparar(mockOpts);

      if (temDocker) {
        expect(prep.driver).toBe("docker");
        expect(prep.binary).toBe("docker");
        expect(prep.args).toContain("run");
        expect(prep.args).toContain("--rm");
        expect(prep.args).toContain("-i");
        expect(prep.args).toContain("opencorp/custom:1.0");
        expect(prep.args).toContain("node");
        // Volume mount
        const vIdx = prep.args.indexOf("-v");
        expect(vIdx).toBeGreaterThan(-1);
        expect(prep.args[vIdx + 1]).toContain("/tmp/mock-ws");
      }
    });

    it("Docker: aplica limites de RAM e CPU", async () => {
      const driver = new ContainerDriver("docker", "opencorp/workspace-base:latest");
      const temDocker = await driver.disponivel();

      const prep = await driver.preparar({
        ...mockOpts,
        limites: { ramMb: 1024, cpuPct: 150 },
      });

      if (temDocker) {
        expect(prep.args).toContain("--memory=1024m");
        expect(prep.args).toContain("--cpus=1.5");
      }
    });

    it("Podman: inclui --userns=keep-id", async () => {
      const driver = new ContainerDriver("podman", "opencorp/workspace-base:latest");
      expect(driver.tipo).toBe("podman");

      const temPodman = await driver.disponivel();
      const prep = await driver.preparar(mockOpts);

      if (temPodman) {
        expect(prep.driver).toBe("podman");
        expect(prep.binary).toBe("podman");
        expect(prep.args).toContain("--userns=keep-id");
      }
    });

    it("Docker: propaga variáveis de ambiente (exceto PATH)", async () => {
      const driver = new ContainerDriver("docker");
      const temDocker = await driver.disponivel();

      const prep = await driver.preparar({
        ...mockOpts,
        env: { MINHA_CHAVE: "valor123", SECRET: "abc", PATH: "/usr/bin" },
      });

      if (temDocker) {
        expect(prep.args).toContain("-e");
        const eIdx1 = prep.args.indexOf("MINHA_CHAVE=valor123");
        const eIdx2 = prep.args.indexOf("SECRET=abc");
        expect(eIdx1).toBeGreaterThan(-1);
        expect(eIdx2).toBeGreaterThan(-1);
        // PATH não deve ser propagado
        expect(prep.args.find((a) => a.startsWith("PATH="))).toBeUndefined();
      }
    });

    it("Container sem runtime disponível faz fallback para sandbox/host", async () => {
      // Usa um runtime fictício que certamente não existe
      const driver = new ContainerDriver("docker", "my-image:test");
      const temDocker = await driver.disponivel();

      if (!temDocker) {
        const prep = await driver.preparar(mockOpts);
        expect(["sandbox", "host"]).toContain(prep.driver);
        expect(prep.aviso).toContain("não encontrado");
      }
    });

    it("imagem padrão é opencorp/workspace-base:latest", async () => {
      const driver = new ContainerDriver("docker");
      const temDocker = await driver.disponivel();
      const prep = await driver.preparar(mockOpts);

      if (temDocker) {
        expect(prep.args).toContain("opencorp/workspace-base:latest");
      }
    });
  });

  // ── resolverDriverExecucao ────────────────────────────────────────

  describe("resolverDriverExecucao", () => {
    it("retorna HostDriver quando preferência é 'host'", async () => {
      const driver = await resolverDriverExecucao("host");
      expect(driver.tipo).toBe("host");
    });

    it("padrão retorna sandbox se bwrap disponível, senão host", async () => {
      const driver = await resolverDriverExecucao();
      expect(["sandbox", "host"]).toContain(driver.tipo);
    });

    it("preferência explícita 'sandbox' resolve adequadamente", async () => {
      const driver = await resolverDriverExecucao("sandbox");
      expect(["sandbox", "host"]).toContain(driver.tipo);
    });

    it("preferência inválida faz fallback para sandbox ou host", async () => {
      const driver = await resolverDriverExecucao("invalido-xyz-123");
      expect(["sandbox", "host"]).toContain(driver.tipo);
    });

    it("preferência case-insensitive funciona (HOST, Docker)", async () => {
      const d1 = await resolverDriverExecucao("HOST");
      expect(d1.tipo).toBe("host");

      const d2 = await resolverDriverExecucao("  Host  ");
      expect(d2.tipo).toBe("host");
    });

    it("aceita imagem customizada para container", async () => {
      const driver = await resolverDriverExecucao("docker", "my-custom:v2");
      // Regardless of availability, tipo should be defined
      expect(driver.tipo).toBeDefined();
    });
  });

  describe("escolherPreferenciaDriver (agente > workspace > global)", () => {
    it("agente prevalece sobre workspace e global", () => {
      expect(escolherPreferenciaDriver("host", "sandbox", "sandbox")).toBe("host");
    });
    it("container é alias de docker", () => {
      expect(escolherPreferenciaDriver("container", "sandbox")).toBe("docker");
    });
    it("sem agente usa workspace, sem workspace usa global", () => {
      expect(escolherPreferenciaDriver(undefined, "host", "sandbox")).toBe("host");
      expect(escolherPreferenciaDriver(undefined, undefined, "host")).toBe("host");
    });
  });

  describe("SandboxDriver rede isolada", () => {
    it("adiciona --unshare-net quando redeIsolada=true sem allowlist", async () => {
      const driver = new SandboxDriver();
      const prep = await driver.preparar({
        binary: "node",
        args: [],
        cwd: "/tmp/mock-ws",
        env: {},
        workspaceId: "ws",
        workspacePath: "/tmp/mock-ws",
        limites: { redeIsolada: true },
      });
      if (prep.binary === "bwrap" || prep.args.includes("bwrap")) {
        expect(prep.args).toContain("--unshare-net");
      } else {
        expect(prep.aviso).toBeDefined();
      }
    });

    it("não isola rede por padrão", async () => {
      const driver = new SandboxDriver();
      const prep = await driver.preparar({
        binary: "node",
        args: [],
        cwd: "/tmp/mock-ws",
        env: {},
        workspaceId: "ws",
        workspacePath: "/tmp/mock-ws",
      });
      if (prep.binary === "bwrap" || prep.args.includes("bwrap")) {
        expect(prep.args).not.toContain("--unshare-net");
      }
    });
  });
});
