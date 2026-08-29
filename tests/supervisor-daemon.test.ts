import { afterAll, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { spawnMock, unrefMock } = vi.hoisted(() => {
  const unrefMock = vi.fn();
  const spawnMock = vi.fn(() => ({ pid: 4242, unref: unrefMock }));
  return { spawnMock, unrefMock };
});

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

const raizes: string[] = [];

afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

describe("spawnDaemon (start daemonizado)", () => {
  it("spawn com detached:true, stdio ignorado/para log, unref e retorna o pid", async () => {
    const { spawnDaemon } = await import("../src/core/supervisor.js");
    const logPath = join(tmpdir(), "opencorp-daemon-", "supervisor-daemon.log");
    raizes.push(join(tmpdir(), "opencorp-daemon-"));
    const pid = await spawnDaemon(
      ["node", "bin/opencorp.mjs", "supervisor", "start", "--foreground", "--interval", "1", "--workspace", "corp-x"],
      logPath,
    );
    expect(pid).toBe(4242);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [execPath, args, opts] = spawnMock.mock.calls[0]! as [string, string[], { detached: boolean; stdio: unknown[] }];
    expect(execPath).toBe(process.execPath);
    expect(args).toContain("supervisor");
    expect(args).toContain("start");
    expect(args).toContain("--foreground");
    expect(args).toContain("--interval");
    expect(args[args.indexOf("--interval") + 1]).toBe("1");
    expect(args).toContain("--workspace");
    expect(args[args.indexOf("--workspace") + 1]).toBe("corp-x");
    expect(opts.detached).toBe(true);
    expect(opts.stdio[0]).toBe("ignore");
    expect(typeof opts.stdio[1]).toBe("number");
    expect(typeof opts.stdio[2]).toBe("number");
    expect(unrefMock).toHaveBeenCalledTimes(1);
    expect(existsSync(logPath)).toBe(true);
  });
});
