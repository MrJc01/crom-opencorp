import { describe, it, expect } from "vitest";
import {
  HostDriver,
  SandboxDriver,
  ContainerDriver,
  resolverDriverExecucao,
} from "../src/core/execution-driver.js";

describe("ExecutionDriver", () => {
  const mockOpts = {
    binary: "node",
    args: ["-e", "console.log('teste')"],
    cwd: "/tmp/mock-ws",
    env: { TESTE: "1" },
    workspaceId: "ws-teste",
    workspacePath: "/tmp/mock-ws",
  };

  it("HostDriver prepara execução direta", async () => {
    const driver = new HostDriver();
    expect(await driver.disponivel()).toBe(true);

    const prep = await driver.preparar(mockOpts);
    expect(prep.driver).toBe("host");
    expect(prep.binary).toBe("node");
    expect(prep.args).toEqual(["-e", "console.log('teste')"]);
  });

  it("HostDriver aplica limites via systemd-run se informados", async () => {
    const driver = new HostDriver();
    const prep = await driver.preparar({
      ...mockOpts,
      limites: { ramMb: 512, cpuPct: 100 },
    });

    if (prep.binary === "systemd-run") {
      expect(prep.args).toContain("MemoryMax=512M");
      expect(prep.args).toContain("CPUQuota=100%");
      expect(prep.args).toContain("node");
    }
  });

  it("SandboxDriver encapsula comando no bwrap com montagens de segurança", async () => {
    const driver = new SandboxDriver();
    const temBwrap = await driver.disponivel();

    const prep = await driver.preparar(mockOpts);
    if (temBwrap) {
      expect(prep.driver).toBe("sandbox");
      expect(prep.args).toContain("/tmp/mock-ws");
      expect(prep.args).toContain("--ro-bind");
      expect(prep.args).toContain("/usr");
      expect(prep.args).toContain("--unshare-pid");
      expect(prep.args).toContain("node");
    } else {
      expect(prep.driver).toBe("host");
      expect(prep.aviso).toContain("bwrap não encontrado");
    }
  });

  it("ContainerDriver prepara comando docker com volume montado", async () => {
    const driver = new ContainerDriver("docker", "opencorp/custom:1.0");
    const temDocker = await driver.disponivel();

    const prep = await driver.preparar({
      ...mockOpts,
      limites: { ramMb: 1024, cpuPct: 150 },
    });

    if (temDocker) {
      expect(prep.driver).toBe("docker");
      expect(prep.binary).toBe("docker");
      expect(prep.args).toContain("--memory=1024m");
      expect(prep.args).toContain("--cpus=1.5");
      expect(prep.args).toContain("opencorp/custom:1.0");
    }
  });

  it("resolverDriverExecucao retorna o driver correspondente ou fallback", async () => {
    const host = await resolverDriverExecucao("host");
    expect(host.tipo).toBe("host");

    const padrao = await resolverDriverExecucao();
    // Se bwrap estiver disponível, padrão é sandbox
    expect(["sandbox", "host"]).toContain(padrao.tipo);
  });
});
