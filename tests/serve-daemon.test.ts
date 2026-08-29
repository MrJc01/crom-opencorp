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

describe("serve daemon (spawn detached)", () => {
  it("spawn com detached:true, stdio para log, unref, argv com flags propagadas (--port/--token/--workspace)", async () => {
    const { spawnDaemon } = await import("../src/cli/commands/serve.js");
    const logPath = join(tmpdir(), "opencorp-serve-daemon-", "api-daemon.log");
    raizes.push(join(tmpdir(), "opencorp-serve-daemon-"));

    const pid = await spawnDaemon(
      [
        "node",
        "bin/opencorp.mjs",
        "serve",
        "--foreground",
        "--port",
        "4113",
        "--token",
        "abc123token",
        "--workspace",
        "corp-teste",
      ],
      logPath,
    );

    expect(pid).toBe(4242);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const [execPath, args, opts] = spawnMock.mock.calls[0]! as [
      string,
      string[],
      { detached: boolean; stdio: unknown[] },
    ];

    expect(execPath).toBe(process.execPath);
    expect(args).toContain("serve");
    expect(args).toContain("--foreground");
    expect(args).toContain("--port");
    expect(args[args.indexOf("--port") + 1]).toBe("4113");
    expect(args).toContain("--token");
    expect(args[args.indexOf("--token") + 1]).toBe("abc123token");
    expect(args).toContain("--workspace");
    expect(args[args.indexOf("--workspace") + 1]).toBe("corp-teste");

    expect(opts.detached).toBe(true);
    expect(opts.stdio[0]).toBe("ignore");
    expect(typeof opts.stdio[1]).toBe("number");
    expect(typeof opts.stdio[2]).toBe("number");
    expect(unrefMock).toHaveBeenCalledTimes(1);
    expect(existsSync(logPath)).toBe(true);
  });
});