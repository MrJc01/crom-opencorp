import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiServer, type SessaoApi } from "../src/server/index.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { RegistryStore } from "../src/core/registry-store.js";
import type { OpcoesRun, ResultadoRun } from "../src/core/session-manager.js";

describe("Execuções — Retry / Reenviar (Clone com mesmos parâmetros)", () => {
  let homeDir: string;
  let server: ReturnType<typeof createApiServer>["server"];
  let porta: number;
  let token: string;
  let runsExecutados: OpcoesRun[] = [];

  const criarAgente = async (wsPath: string, id: string, ativo = true, model = "test/model") => {
    const dir = join(wsPath, ".opencorp", "agents");
    await mkdir(dir, { recursive: true });
    const content = `---
id: "${id}"
role: "Dev"
category: "operario"
model: "${model}"
tools: ["bash"]
permissions: "level-1"
budget:
  daily_usd: 10
  max_turns: 20
ativo: ${ativo}
---
Prompt do agente ${id}
`;
    await writeFile(join(dir, `${id}.md`), content, "utf8");
  };

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "oc-test-retry-"));
    runsExecutados = [];

    const fakeSessoes: SessaoApi = {
      rodar: async (opcoes: OpcoesRun): Promise<ResultadoRun> => {
        runsExecutados.push(opcoes);
        return {
          id: opcoes.execId ?? "fake-id",
          agente: opcoes.agente,
          inicio: new Date().toISOString(),
          fim: new Date().toISOString(),
          status: "concluido",
          exit_code: 0,
          duracao_ms: 100,
          log: "fake-log",
          captura: "fake-captura",
          custo_usd: 0.001,
        };
      },
      listarExecucoes: async () => [],
      logDe: async () => "fake log",
      cancelar: async () => true,
    };

    const srv = createApiServer({
      homeDir,
      cwd: homeDir,
      token: "test-token",
      sessoes: fakeSessoes,
      instalarMencoes: false,
    });
    server = srv.server;
    server.listen(0, "127.0.0.1");
    porta = await srv.porta;
    token = srv.token;
  });

  afterEach(async () => {
    server?.close();
    await rm(homeDir, { recursive: true, force: true });
  });

  it("reenvia (clona) uma execução existente mantendo agente, ordem e modelo", async () => {
    const wsMgr = new WorkspaceManager({ homeDir, cwd: homeDir });
    const ws = await wsMgr.criar("ws-origem");
    await criarAgente(ws.path, "dev-agent", true, "test/model");

    const registros = new RegistryStore();
    await registros.garantirCategorias(ws.path);
    await registros.criar(ws.path, {
      categoria: "execucoes",
      id: "exec-original-123",
      descricao: "Ordem: Executar refatoração do backend",
      criadoPor: "dev-agent",
      extras: {
        status: "falhou",
        agente: "dev-agent",
        ordem: "Executar refatoração do backend e testes",
        modelo: "test/model",
      },
    });

    const res = await fetch(`http://127.0.0.1:${porta}/execucoes/exec-original-123/retry?workspace=ws-origem`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    });

    expect(res.status).toBe(202);
    const json = await res.json() as any;
    expect(json.ok).toBe(true);
    expect(json.exec_id_original).toBe("exec-original-123");
    expect(json.agente).toBe("dev-agent");
    expect(json.ordem).toContain("Executar refatoração");
    expect(json.exec_id).toMatch(/^exec-/);

    // Verifica se sessoes.rodar foi chamado com os parâmetros originais
    expect(runsExecutados.length).toBe(1);
    const run = runsExecutados[0];
    expect(run.agente).toBe("dev-agent");
    expect(run.ordem).toBe("Executar refatoração do backend e testes");
    expect(run.model).toBe("test/model");
    expect(run.gatilho).toEqual({ tipo: "manual", origem: "retry:exec-original-123" });
    expect(run.retryDe).toEqual({ de_modelo: "test/model", de_exec: "exec-original-123" });
    expect(run.workspaceDir).toBe(ws.path);
  });

  it("reenvia com sucesso mesmo se a execução estiver em outro workspace (cross-workspace)", async () => {
    const wsMgr = new WorkspaceManager({ homeDir, cwd: homeDir });
    const ws1 = await wsMgr.criar("ws-com-execucao");
    await wsMgr.criar("ws-vazio");
    await criarAgente(ws1.path, "agente-x", true, "test/model-x");

    const registros = new RegistryStore();
    await registros.garantirCategorias(ws1.path);
    await registros.criar(ws1.path, {
      categoria: "execucoes",
      id: "exec-cross-456",
      descricao: "Ordem: Tarefa em outro workspace",
      criadoPor: "agente-x",
      extras: {
        status: "concluido",
        agente: "agente-x",
        ordem: "Instrução cross workspace",
        modelo: "test/model-x",
      },
    });

    // Chamada aponta para ws-vazio, mas a execução pertence a ws-com-execucao
    const res = await fetch(`http://127.0.0.1:${porta}/execucoes/exec-cross-456/retry?workspace=ws-vazio`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    });

    expect(res.status).toBe(202);
    const json = await res.json() as any;
    expect(json.ok).toBe(true);
    expect(json.exec_id_original).toBe("exec-cross-456");
    expect(json.agente).toBe("agente-x");

    // O run deve ter sido executado no workspace correto (ws1)
    expect(runsExecutados.length).toBe(1);
    expect(runsExecutados[0].workspaceDir).toBe(ws1.path);
    expect(runsExecutados[0].workspaceId).toBe("ws-com-execucao");
  });

  it("retorna 404 quando a execução não existe em nenhum workspace", async () => {
    const wsMgr = new WorkspaceManager({ homeDir, cwd: homeDir });
    await wsMgr.criar("ws-qualquer");

    const res = await fetch(`http://127.0.0.1:${porta}/execucoes/exec-fantasma-999/retry`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    });

    expect(res.status).toBe(404);
    const json = await res.json() as any;
    expect(json.erro).toContain('Execução "exec-fantasma-999" não encontrada');
  });

  it("retorna 409 quando o agente da execução original está desativado", async () => {
    const wsMgr = new WorkspaceManager({ homeDir, cwd: homeDir });
    const ws = await wsMgr.criar("ws-desativado");
    await criarAgente(ws.path, "agente-desativado", false);

    const registros = new RegistryStore();
    await registros.garantirCategorias(ws.path);
    await registros.criar(ws.path, {
      categoria: "execucoes",
      id: "exec-desativado-789",
      descricao: "Ordem: Fazer algo",
      criadoPor: "agente-desativado",
      extras: {
        status: "falhou",
        agente: "agente-desativado",
        ordem: "Fazer algo",
      },
    });

    const res = await fetch(`http://127.0.0.1:${porta}/execucoes/exec-desativado-789/retry?workspace=ws-desativado`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    });

    expect(res.status).toBe(409);
    const json = await res.json() as any;
    expect(json.erro).toContain("está desativado");
  });
});
