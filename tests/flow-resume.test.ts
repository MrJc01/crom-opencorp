import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { FlowError } from "../src/core/errors.js";
import { FlowStore } from "../src/core/flow-store.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock("execa", () => ({ execa: execaMock }));

const raizes: string[] = [];
afterAll(async () => {
  await Promise.all(raizes.map((r) => rm(r, { recursive: true, force: true })));
});

function child({ out = [], exitCode = 0 }: { out?: string[]; exitCode?: number }) {
  const c = Promise.resolve({ exitCode, killed: false }) as unknown as {
    stdout: Readable;
    stderr: Readable;
    pid?: number;
    killed: boolean;
  } & Promise<{ exitCode: number; killed: boolean }>;
  c.stdout = Readable.from(out);
  c.stderr = Readable.from([]);
  c.pid = 424242;
  c.killed = false;
  return c;
}

describe("Flow durável — retomar do último nó ok (PLANO-UNIFICACAO Etapa 4)", () => {
  it("run falha no nó 2 → resume conclui sem re-executar nós ok, mesmo exec", async () => {
    const home = await mkdtemp(join(tmpdir(), "opencorp-flow-resume-"));
    raizes.push(home);
    const ws = await new WorkspaceManager({ homeDir: home, cwd: home }).criar("corp-resume");
    const flows = new FlowStore({ homeDir: home, cwd: ws.path });

    await flows.salvar(wsPath(ws), {
      id: "editoria-resume",
      nome: "Editoria resume",
      nos: [
        { id: "gatilho", tipo: "manual", config: {} },
        { id: "passo-um", tipo: "agente", config: { agente: "executor-padrao", ordem: "parte 1: {{entrada}}" } },
        { id: "passo-dois", tipo: "agente", config: { agente: "executor-padrao", ordem: "parte 2" } },
        { id: "saida", tipo: "registro", config: { categoria: "documentos", id: "editoria-resume" } },
      ],
      arestas: [
        { de: "gatilho", para: "passo-um" },
        { de: "passo-um", para: "passo-dois" },
        { de: "passo-dois", para: "saida" },
      ],
    });

    // run 1: passo-um ok, passo-dois falha
    execaMock
      .mockImplementationOnce(() => child({ out: ["parte um pronta\n"] }))
      .mockImplementationOnce(() => child({ out: ["erro deliberado\n"], exitCode: 1 }));
    let execIdFalho = "";
    await expect(
      (async () => {
        try {
          await flows.executar(wsPath(ws), "editoria-resume", { entrada: "tema" });
          return "nao-falhou";
        } catch (e) {
          // a mensagem termina com "(exec <execId do flow>)" — o motivo interno
          // também contém "exec <sessão>", por isso o âncora no final
          const m = /\(exec (exec-[\w-]+)\)\s*$/.exec((e as Error).message);
          execIdFalho = m?.[1] ?? "";
          throw e;
        }
      })(),
    ).rejects.toThrow(FlowError);
    expect(execIdFalho).not.toBe("");

    // resume: só o nó pendente (passo-dois) + saída executam
    execaMock.mockClear();
    execaMock.mockImplementationOnce(() => child({ out: ["parte dois pronta\n"] }));
    const r = await flows.executar(wsPath(ws), "editoria-resume", { execId: execIdFalho, retomar: true });

    expect(r.execId).toBe(execIdFalho);
    expect(r.status).toBe("concluido");
    expect(r.nos.map((n) => n.status)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(execaMock).toHaveBeenCalledTimes(1); // passo-um NÃO re-executou
    expect(r.contextoFinal).toContain("parte dois pronta");

    // registro do run preservado e evento "retomado" anexado ao MESMO exec
    const journal = await import("node:fs/promises").then((m) =>
      m.readFile(join(ws.path, ".opencorp", "registries", "execucoes", execIdFalho, "journal.jsonl"), "utf8"),
    );
    const eventos = journal.trim().split("\n").map((l) => JSON.parse(l) as { evento: string });
    expect(eventos.map((e) => e.evento)).toContain("retomado");
  });

  it("resume de execução concluída ou inexistente falha com mensagem clara", async () => {
    const home = await mkdtemp(join(tmpdir(), "opencorp-flow-resume2-"));
    raizes.push(home);
    const ws = await new WorkspaceManager({ homeDir: home, cwd: home }).criar("corp-resume2");
    const flows = new FlowStore({ homeDir: home, cwd: ws.path });
    await flows.salvar(wsPath(ws), {
      id: "sempre-ok",
      nome: "Sempre ok",
      nos: [
        { id: "gatilho", tipo: "manual", config: {} },
        { id: "passo", tipo: "agente", config: { agente: "executor-padrao", ordem: "faça" } },
      ],
      arestas: [{ de: "gatilho", para: "passo" }],
    });
    execaMock.mockImplementation(() => child({ out: ["ok\n"] }));
    const r = await flows.executar(wsPath(ws), "sempre-ok", { entrada: "x" });

    await expect(flows.executar(wsPath(ws), "sempre-ok", { execId: r.execId, retomar: true })).rejects.toThrow(
      /só execuções falhas podem ser retomadas/,
    );
    await expect(flows.executar(wsPath(ws), "sempre-ok", { execId: "exec-inexistente", retomar: true })).rejects.toThrow(
      /não encontrada/,
    );
  });
});

function wsPath(ws: { path: string }): string {
  return ws.path;
}
