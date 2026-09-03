import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiServer } from "../src/server/index.js";
import { MeetingManager } from "../src/core/meeting-manager.js";

const raizes: string[] = [];

async function tmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "opencorp-reuniao-chat-"));
  raizes.push(dir);
  return dir;
}

function makeFetch(port: number, token: string) {
  const base = `http://127.0.0.1:${port}`;
  return async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`${base}${path}`, {
      ...opts,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...opts.headers,
      },
    });
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    return { status: res.status, json };
  };
}

describe("Reuniões Interativas em Chat Multi-Agente (Estilo Secretário)", () => {
  let home: string;
  let wsDir: string;
  let token = "test-token-reuniao";
  let fetchApi: ReturnType<typeof makeFetch>;
  let server: ReturnType<typeof createApiServer>["server"];

  beforeAll(async () => {
    home = await tmpDir();
    wsDir = join(home, ".opencorp", "workspaces", "corp-teste");
    await mkdir(join(wsDir, ".opencorp", "agents"), { recursive: true });
    await mkdir(join(wsDir, "scripts"), { recursive: true });
    await writeFile(join(wsDir, ".opencorp", "config.json"), JSON.stringify({
      site_url: "https://pulso-diario.wp.crom.me/",
    }));
    await mkdir(join(home, ".opencorp"), { recursive: true });
    await writeFile(join(home, ".opencorp", "workspaces.json"), JSON.stringify({
      version: 1,
      ativo: "corp-teste",
      workspaces: [{ id: "corp-teste", criado_em: new Date().toISOString() }],
    }));

    // Criar agentes participantes válidos
    for (const ag of ["ceo-estrategia", "editor", "ceo-documentos"]) {
      await writeFile(
        join(wsDir, ".opencorp", "agents", `${ag}.md`),
        `---
id: ${ag}
role: Agente ${ag}
category: custom
model: opencode/nemotron-3-ultra-free
tools: [read]
permissions: level-1
budget:
  daily_usd: 1.0
  max_turns: 10
---
Prompt do ${ag}
`,
      );
    }

    const fakeSessoes = {
      async rodar(opcoes: any) {
        return {
          id: "exec-test-1",
          status: "concluido",
          captura: `Resposta do agente @${opcoes.agente} na reunião.`,
        };
      },
      async listarExecucoes() { return []; },
    };

    const meetings = new MeetingManager({
      homeDir: home,
      cwd: wsDir,
      sessoes: fakeSessoes as any,
    });

    const apiInstance = createApiServer({
      homeDir: home,
      cwd: wsDir,
      token,
      porta: 0,
      host: "127.0.0.1",
      sessoes: fakeSessoes as any,
      meetings,
    });

    server = apiInstance.server;
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const port = (server.address() as any).port;
    fetchApi = makeFetch(port, token);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const r of raizes) {
      await rm(r, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("POST /meetings/chat cria sala de reunião para chat interativo", async () => {
    const res = await fetchApi("/meetings/chat", {
      method: "POST",
      body: JSON.stringify({
        pauta: "Alinhar lançamento do site e correções",
        agentes: "ceo-estrategia,editor",
      }),
    });

    expect(res.status).toBe(201);
    expect(res.json.ok).toBe(true);
    expect(res.json.id).toMatch(/^reuniao-/);
    expect(res.json.status).toBe("em-andamento");
    expect(res.json.participantes).toEqual(["ceo-estrategia", "editor"]);
  });

  it("POST /meetings/:id/mensagem no modo direcionado aciona apenas o agente alvo", async () => {
    const salaRes = await fetchApi("/meetings/chat", {
      method: "POST",
      body: JSON.stringify({
        pauta: "Discussão de estratégia",
        agentes: "ceo-estrategia,editor",
      }),
    });
    const salaId = salaRes.json.id;

    const res = await fetchApi(`/meetings/${encodeURIComponent(salaId)}/mensagem`, {
      method: "POST",
      body: JSON.stringify({
        mensagem: "@editor como está a revisão dos textos?",
        modo: "direcionado",
        agente: "editor",
      }),
    });

    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.mensagemUsuario.texto).toBe("@editor como está a revisão dos textos?");
    expect(res.json.respostas).toHaveLength(1);
    expect(res.json.respostas[0].agente).toBe("editor");
    expect(res.json.respostas[0].texto).toContain("Resposta do agente @editor na reunião.");
  });

  it("POST /meetings/:id/mensagem no modo sequencial faz todos os agentes convocados responderem", async () => {
    const salaRes = await fetchApi("/meetings/chat", {
      method: "POST",
      body: JSON.stringify({
        pauta: "Alinhamento geral de metas",
        agentes: "ceo-estrategia,editor",
      }),
    });
    const salaId = salaRes.json.id;

    const res = await fetchApi(`/meetings/${encodeURIComponent(salaId)}/mensagem`, {
      method: "POST",
      body: JSON.stringify({
        mensagem: "Qual a visão de cada um sobre o cronograma?",
        modo: "sequencial",
      }),
    });

    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.respostas).toHaveLength(2);
    expect(res.json.respostas[0].agente).toBe("ceo-estrategia");
    expect(res.json.respostas[1].agente).toBe("editor");
  });

  it("POST /meetings/:id/concluir encerra a sala e redige ata", async () => {
    const salaRes = await fetchApi("/meetings/chat", {
      method: "POST",
      body: JSON.stringify({
        pauta: "Fechamento de pauta",
        agentes: "ceo-estrategia,editor,ceo-documentos",
      }),
    });
    const salaId = salaRes.json.id;

    const res = await fetchApi(`/meetings/${encodeURIComponent(salaId)}/concluir`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.status).toBe("encerrada");
  });
});
