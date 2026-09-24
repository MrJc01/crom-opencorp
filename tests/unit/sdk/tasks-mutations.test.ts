/**
 * @file Testes unitários das mutações do recurso Tasks do OpenCorp SDK.
 *
 * Cobre:
 * 1. Criação de task com payload válido (POST /tasks)
 * 2. Normalização de aliases: responsavel_agente_id -> responsavel, tags -> labels
 * 3. Movimentação de coluna e posição (POST /tasks/:id/mover)
 * 4. Atualização parcial de campos (PUT /tasks/:id)
 * 5. Exclusão de task (DELETE /tasks/:id)
 * 6. Tratamento de erro 422 com ProblemDetailsError (RFC 7807 e legado)
 * 7. Injeção de workspaceId nos headers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  OpenCorpClient,
  ProblemDetailsError,
  type Task,
} from "../../../src/sdk/index.js";

const originalFetch = globalThis.fetch;

function mockFetch(
  status: number,
  body: unknown,
  headers: Record<string, string> = { "content-type": "application/json" },
): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : status === 201 ? "Created" : "Error",
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

beforeEach(() => {
  delete process.env.OPENCORP_API_URL;
  delete process.env.OPENCORP_TOKEN;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("SDK TasksResource — Mutações", () => {
  const fakeTask: Task = {
    id: "task-42",
    titulo: "Implementar autenticação",
    descricao: "Criar fluxo OAuth e MFA",
    coluna: "a_fazer",
    pos: 0,
    prioridade: "alta",
    labels: ["seguranca", "backend"],
    responsavel: "agente:dev-01",
    due: "2026-10-01",
    task_pai: null,
    bloqueado_por: [],
    lock_por: null,
    lock_expira: null,
    criado_por: "humano",
    criado_em: "2026-09-24T00:00:00Z",
    atualizado_em: "2026-09-24T00:00:00Z",
  };

  it("cria task com payload válido e normaliza responsavel_agente_id e tags", async () => {
    mockFetch(201, fakeTask);

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });
    const result = await client.tasks.criar({
      titulo: "Implementar autenticação",
      descricao: "Criar fluxo OAuth e MFA",
      coluna: "a_fazer",
      prioridade: "alta",
      responsavel_agente_id: "dev-01",
      tags: ["seguranca", "backend"],
      due: "2026-10-01",
    }, { workspaceId: "ws-principal" });

    expect(result.id).toBe("task-42");
    expect(result.titulo).toBe("Implementar autenticação");

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test:4100/tasks");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["x-opencorp-workspace"]).toBe("ws-principal");
    expect(headers["Content-Type"]).toBe("application/json");

    const corpo = JSON.parse(init.body as string);
    expect(corpo.titulo).toBe("Implementar autenticação");
    expect(corpo.responsavel).toBe("agente:dev-01");
    expect(corpo.labels).toEqual(["seguranca", "backend"]);
  });

  it("cria task preservando responsavel se já informado explicitamente", async () => {
    mockFetch(201, fakeTask);

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });
    await client.tasks.criar({
      titulo: "Tarefa com responsável humano",
      responsavel: "humano",
    });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const corpo = JSON.parse(init.body as string);
    expect(corpo.responsavel).toBe("humano");
  });

  it("move task para outra coluna e posição opcional", async () => {
    const taskMovida: Task = { ...fakeTask, coluna: "fazendo", pos: 2 };
    mockFetch(200, taskMovida);

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });
    const result = await client.tasks.mover("task-42", "fazendo", 2);

    expect(result.coluna).toBe("fazendo");
    expect(result.pos).toBe(2);

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test:4100/tasks/task-42/mover");
    expect(init.method).toBe("POST");

    const corpo = JSON.parse(init.body as string);
    expect(corpo.coluna).toBe("fazendo");
    expect(corpo.pos).toBe(2);
  });

  it("move task aceitando objeto MoverTaskInput", async () => {
    const taskMovida: Task = { ...fakeTask, coluna: "concluido", pos: 1 };
    mockFetch(200, taskMovida);

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });
    const result = await client.tasks.mover("task-42", { coluna: "concluido", ordem: 1 });

    expect(result.coluna).toBe("concluido");

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const corpo = JSON.parse(init.body as string);
    expect(corpo.coluna).toBe("concluido");
    expect(corpo.pos).toBe(1);
  });

  it("atualiza campos parciais da task via PUT", async () => {
    const taskAtualizada: Task = {
      ...fakeTask,
      titulo: "Título Atualizado",
      labels: ["revisado"],
    };
    mockFetch(200, taskAtualizada);

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });
    const result = await client.tasks.atualizar("task-42", {
      titulo: "Título Atualizado",
      tags: ["revisado"],
    });

    expect(result.titulo).toBe("Título Atualizado");

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test:4100/tasks/task-42");
    expect(init.method).toBe("PUT");

    const corpo = JSON.parse(init.body as string);
    expect(corpo.titulo).toBe("Título Atualizado");
    expect(corpo.labels).toEqual(["revisado"]);
  });

  it("exclui task com DELETE e retorna confirmação", async () => {
    mockFetch(200, { ok: true, id: "task-42" });

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });
    const result = await client.tasks.deletar("task-42");

    expect(result.ok).toBe(true);
    expect(result.id).toBe("task-42");

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://test:4100/tasks/task-42");
    expect(init.method).toBe("DELETE");
  });

  it("codifica IDs especiais na rota ao obter, mover, atualizar ou deletar", async () => {
    mockFetch(200, fakeTask);
    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });

    await client.tasks.obter("modulo/sub/task#1");
    let [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe("http://test:4100/tasks/modulo%2Fsub%2Ftask%231");

    mockFetch(200, { ok: true, id: "modulo/sub/task#1" });
    await client.tasks.deletar("modulo/sub/task#1");
    const [urlDelete] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(urlDelete).toBe("http://test:4100/tasks/modulo%2Fsub%2Ftask%231");
  });

  it("lança ProblemDetailsError com invalidParams ao receber status 422 RFC 7807", async () => {
    const problema = {
      type: "https://opencorp.dev/errors/validation-failed",
      title: "Erro de Validação",
      status: 422,
      detail: "Campos obrigatórios ausentes",
      invalidParams: [
        { name: "titulo", reason: "titulo obrigatório" },
      ],
    };

    mockFetch(422, problema, { "content-type": "application/problem+json; charset=utf-8" });

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });

    await expect(client.tasks.criar({ titulo: "" }))
      .rejects.toThrow(ProblemDetailsError);

    try {
      await client.tasks.criar({ titulo: "" });
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemDetailsError);
      if (err instanceof ProblemDetailsError) {
        expect(err.status).toBe(422);
        expect(err.title).toBe("Erro de Validação");
        expect(err.invalidParams).toHaveLength(1);
        expect(err.invalidParams?.[0].name).toBe("titulo");
      }
    }
  });

  it("lança ProblemDetailsError ao receber erro 422 em formato legado", async () => {
    mockFetch(422, { erro: "task inválida", detalhes: ["titulo: titulo obrigatório"] });

    const client = new OpenCorpClient({ baseUrl: "http://test:4100" });

    try {
      await client.tasks.criar({ titulo: "" });
      expect.fail("deveria ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(ProblemDetailsError);
      if (err instanceof ProblemDetailsError) {
        expect(err.status).toBe(422);
        expect(err.detail).toContain("task inválida");
      }
    }
  });
});
