/**
 * Probe real do runtime conversacional Codex (app-server).
 *
 * Desabilitado por padrão e no CI. Para executar, com o Codex instalado e
 * autenticado:
 *
 *   OPENCORP_REAL_PROBES=codex OPENCORP_PROBE_CODEX_MODEL=<modelo> npm run test:real
 *
 * Opcional: OPENCORP_PROBE_MAX_TOKENS (padrão 40000) e OPENCORP_PROBE_CODEX_BIN.
 * O probe usa um workspace temporário, recusa qualquer aprovação pedida pelo
 * motor e encerra o processo ao final.
 */
import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexAdapter, runConversationProbe } from "../../src/core/engines/index.js";
import { ProcessRegistry } from "../../src/core/runtime/index.js";
import { opencorpHome } from "../../src/utils/paths.js";

const habilitado = (process.env.OPENCORP_REAL_PROBES ?? "").split(",").map((s) => s.trim()).includes("codex");
const modelo = process.env.OPENCORP_PROBE_CODEX_MODEL?.trim();

describe.runIf(habilitado)("Probe real — Codex app-server", () => {
  const registry = new ProcessRegistry({ idleTimeoutMs: 60_000 });
  const dirs: string[] = [];

  afterAll(async () => {
    await registry.shutdownAll();
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  });

  it("exige modelo explícito", () => {
    expect(modelo, "defina OPENCORP_PROBE_CODEX_MODEL; probes não escolhem modelo").toBeTruthy();
  });

  it.runIf(Boolean(modelo))("conversa com inferência, streaming e continuação sem deixar processo", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "opencorp-codex-probe-"));
    dirs.push(workspace);
    const adapter = new CodexAdapter({ processRegistry: registry, binPath: process.env.OPENCORP_PROBE_CODEX_BIN || undefined });
    const report = await runConversationProbe({
      runtime: adapter.conversationRuntime,
      workspaceId: "probe-codex",
      workspacePath: workspace,
      homeDir: opencorpHome(),
      model: modelo!,
      maxTotalTokens: Number(process.env.OPENCORP_PROBE_MAX_TOKENS) || undefined,
    });
    console.info("[probe codex]", JSON.stringify(report));
    expect(report.budgetExceeded).toBe(false);
    expect(report.checks.inference.status).toBe("passed");
    expect(report.checks.streaming.status).toBe("passed");
    expect(report.checks.conversation.status).toBe("passed");

    const pid = registry.get("codex::probe-codex")?.pid;
    await registry.shutdownAll();
    if (pid) expect(() => process.kill(pid, 0)).toThrow();
  }, 300_000);
});
