import { describe, it, expect } from "vitest";
import {
  HostDriver,
  SandboxDriver,
  ContainerDriver,
} from "../src/core/contexts/execution/execution-driver.js";
import type { OpcoesPreparacaoDriver } from "../src/core/contexts/execution/execution-driver.js";

/**
 * Testes focados exclusivamente na validação e aplicação de limites de recursos
 * (RAM e CPU) nos três tipos de driver de execução.
 */
describe("Resource Limits — Validação e Composição", () => {
  const baseOpts: OpcoesPreparacaoDriver = {
    binary: "python3",
    args: ["script.py"],
    cwd: "/tmp/test-ws",
    env: { LANG: "pt_BR.UTF-8" },
    workspaceId: "ws-limits-test",
    workspacePath: "/tmp/test-ws",
  };

  // ── Limites no HostDriver ─────────────────────────────────────────

  describe("HostDriver — systemd-run limits", () => {
    it("sem limites não invoca systemd-run", async () => {
      const driver = new HostDriver();
      const prep = await driver.preparar({ ...baseOpts, limites: undefined });
      expect(prep.binary).toBe("python3");
      expect(prep.args).toEqual(["script.py"]);
    });

    it("limites de RAM = 0 não invoca systemd-run", async () => {
      const driver = new HostDriver();
      const prep = await driver.preparar({ ...baseOpts, limites: { ramMb: 0 } });
      // ramMb 0 is falsy, should not trigger systemd-run
      expect(prep.binary).toBe("python3");
    });

    it("limites de CPU = 0 não invoca systemd-run", async () => {
      const driver = new HostDriver();
      const prep = await driver.preparar({ ...baseOpts, limites: { cpuPct: 0 } });
      expect(prep.binary).toBe("python3");
    });

    it("limites altos (16GB RAM, 800% CPU) são passados corretamente", async () => {
      const driver = new HostDriver();
      const prep = await driver.preparar({
        ...baseOpts,
        limites: { ramMb: 16384, cpuPct: 800 },
      });

      if (prep.binary === "systemd-run") {
        expect(prep.args).toContain("MemoryMax=16384M");
        expect(prep.args).toContain("CPUQuota=800%");
      }
    });

    it("somente RAM definida aplica apenas MemoryMax", async () => {
      const driver = new HostDriver();
      const prep = await driver.preparar({
        ...baseOpts,
        limites: { ramMb: 512 },
      });

      if (prep.binary === "systemd-run") {
        expect(prep.args).toContain("MemoryMax=512M");
        expect(prep.args.join(" ")).not.toContain("CPUQuota");
      }
    });

    it("somente CPU definida aplica apenas CPUQuota", async () => {
      const driver = new HostDriver();
      const prep = await driver.preparar({
        ...baseOpts,
        limites: { cpuPct: 150 },
      });

      if (prep.binary === "systemd-run") {
        expect(prep.args).toContain("CPUQuota=150%");
        expect(prep.args.join(" ")).not.toContain("MemoryMax");
      }
    });

    it("args originais do comando são preservados após os args do scope", async () => {
      const driver = new HostDriver();
      const prep = await driver.preparar({
        ...baseOpts,
        binary: "node",
        args: ["--experimental-modules", "app.mjs", "--port", "3000"],
        limites: { ramMb: 256, cpuPct: 100 },
      });

      if (prep.binary === "systemd-run") {
        const nodeIdx = prep.args.indexOf("node");
        expect(nodeIdx).toBeGreaterThan(0);
        expect(prep.args.slice(nodeIdx + 1)).toEqual([
          "--experimental-modules",
          "app.mjs",
          "--port",
          "3000",
        ]);
      }
    });
  });

  // ── Limites no SandboxDriver ──────────────────────────────────────

  describe("SandboxDriver — bwrap + systemd-run limits", () => {
    it("sandbox sem limites não usa systemd-run", async () => {
      const driver = new SandboxDriver();
      const temBwrap = await driver.disponivel();
      const prep = await driver.preparar(baseOpts);

      if (temBwrap) {
        // Deve usar bwrap diretamente, sem systemd-run
        expect(prep.binary).toBe("bwrap");
      }
    });

    it("sandbox com limites envolve bwrap no systemd-run se ambos disponíveis", async () => {
      const driver = new SandboxDriver();
      const temBwrap = await driver.disponivel();
      const prep = await driver.preparar({
        ...baseOpts,
        limites: { ramMb: 1024, cpuPct: 200 },
      });

      if (temBwrap) {
        if (prep.binary === "systemd-run") {
          // systemd-run encapsula bwrap
          const bwrapIdx = prep.args.indexOf("bwrap");
          expect(bwrapIdx).toBeGreaterThan(0);
          expect(prep.args).toContain("MemoryMax=1024M");
          expect(prep.args).toContain("CPUQuota=200%");
          // bwrap args ainda presentes após bwrap
          const roBindIdx = prep.args.indexOf("--ro-bind");
          expect(roBindIdx).toBeGreaterThan(bwrapIdx);
        } else {
          // systemd-run não disponível, bwrap direto sem limites
          expect(prep.binary).toBe("bwrap");
        }
      }
    });
  });

  // ── Limites no ContainerDriver ────────────────────────────────────

  describe("ContainerDriver — OCI flags", () => {
    it("Docker: --memory e --cpus formatados corretamente", async () => {
      const driver = new ContainerDriver("docker");
      const temDocker = await driver.disponivel();
      const prep = await driver.preparar({
        ...baseOpts,
        limites: { ramMb: 2048, cpuPct: 300 },
      });

      if (temDocker) {
        expect(prep.args).toContain("--memory=2048m");
        expect(prep.args).toContain("--cpus=3.0"); // 300% / 100
      }
    });

    it("Docker: sem limites não inclui --memory ou --cpus", async () => {
      const driver = new ContainerDriver("docker");
      const temDocker = await driver.disponivel();
      const prep = await driver.preparar(baseOpts);

      if (temDocker) {
        expect(prep.args.find((a) => a.startsWith("--memory"))).toBeUndefined();
        expect(prep.args.find((a) => a.startsWith("--cpus"))).toBeUndefined();
      }
    });

    it("Docker: somente RAM definida aplica apenas --memory", async () => {
      const driver = new ContainerDriver("docker");
      const temDocker = await driver.disponivel();
      const prep = await driver.preparar({
        ...baseOpts,
        limites: { ramMb: 512 },
      });

      if (temDocker) {
        expect(prep.args).toContain("--memory=512m");
        expect(prep.args.find((a) => a.startsWith("--cpus"))).toBeUndefined();
      }
    });

    it("Docker: CPU fracionária calculada corretamente", async () => {
      const driver = new ContainerDriver("docker");
      const temDocker = await driver.disponivel();

      // 75% => 0.8 CPUs (75/100)
      const prep = await driver.preparar({
        ...baseOpts,
        limites: { cpuPct: 75 },
      });

      if (temDocker) {
        expect(prep.args).toContain("--cpus=0.8"); // toFixed(1) => "0.8"
      }
    });

    it("Podman: limites aplicados da mesma forma que Docker", async () => {
      const driver = new ContainerDriver("podman");
      const temPodman = await driver.disponivel();
      const prep = await driver.preparar({
        ...baseOpts,
        limites: { ramMb: 4096, cpuPct: 400 },
      });

      if (temPodman) {
        expect(prep.args).toContain("--memory=4096m");
        expect(prep.args).toContain("--cpus=4.0");
        expect(prep.args).toContain("--userns=keep-id"); // Podman specific
      }
    });
  });
});
