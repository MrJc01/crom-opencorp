import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApiServer, type SessaoApi } from "../src/server/index.js";
import { OpencorpDb } from "../src/core/db/opencorp-db.js";

const raizes: string[] = [];

async function tmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "opencorp-agents-sched-"));
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
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    return { status: res.status, json, headers: res.headers };
  };
}

describe("Rotas Modulares de Agentes e Scheduler (Micro-Passo 12)", () => {
  let home: string;
  let token = "test-token-agents-scheduler";
  let port: number;
  let fetchApi: ReturnType<typeof makeFetch>;
  let server: ReturnType<typeof createApiServer>["server"];
  let execucoesDisparadas: Array<{ execId: string; ordem: string }> = [];

  const fakeSessoes: SessaoApi = {
    async rodar(opcoes) {
      execucoesDisparadas.push({ execId: opcoes.execId, ordem: opcoes.ordem });
      return {
        id: opcoes.execId,
        agente: opcoes.agente,
        modelo: opcoes.model ?? "model-mock",
        ordem: opcoes.ordem,
        inicio: new Date().toISOString(),
        fim: new Date().toISOString(),
        status: "concluido",
      };
    },
    async listarExecucoes() {
      return [];
    },
    async logDe(_ws, id) {
      return `[LOG-EXEC ${id}] ok`;
    },
    async cancelar(_ws, _id) {
      return true;
    },
    async retomarDoErro(_ws, _id) {
      return { execId: "retry-1", status: "retomado" };
    },
    async reenviar(_ws, _id) {
      return { execId: "reenvio-1", status: "reenviado" };
    },
    async streamLog() {
      return () => undefined;
    },
  };

  let wsPath: string;

  beforeAll(async () => {
    home = await tmpDir();
    const inst = createApiServer({
      homeDir: home,
      token,
      sessoes: fakeSessoes,
    });
    server = inst.server;
    await new Promise<void>((res) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        port = typeof addr === "object" && addr ? addr.port : 0;
        res();
      });
    });
    fetchApi = makeFetch(port, token);

    // Inicializa workspace padrão
    const wsRes = await fetchApi("/workspaces", {
      method: "POST",
      body: JSON.stringify({ id: "ws-principal" }),
    });
    wsPath = (wsRes.json as any)?.caminho || join(home, "workspaces", "ws-principal");
  });

  afterAll(async () => {
    await new Promise<void>((res) => server.close(() => res()));
    for (const r of raizes) {
      await rm(r, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  describe("Rotas de Agentes (/agents, /agentes, /skills, /tools)", () => {
    it("GET /agents e /agentes lista o catálogo", async () => {
      const r1 = await fetchApi("/agents");
      expect(r1.status).toBe(200);
      expect(Array.isArray(r1.json)).toBe(true);

      const r2 = await fetchApi("/agentes");
      expect(r2.status).toBe(200);
      expect(Array.isArray(r2.json)).toBe(true);
    });

    it("POST /agents cria novo agente e GET /agents/:id carrega detalhes", async () => {
      const criado = await fetchApi("/agents", {
        method: "POST",
        body: JSON.stringify({
          id: "agente-unit-test",
          role: "Especialista em Testes",
          model: "openrouter/anthropic/claude-3.5-sonnet",
          corpo_prompt: "Você é um testador rigoroso e preciso.",
          permissions: "level-2",
          ativo: true,
        }),
      });
      expect(criado.status).toBe(201);
      const criadoJson = criado.json as any;
      expect(criadoJson.id).toBe("agente-unit-test");

      // Consulta agente criado
      const det = await fetchApi("/agents/agente-unit-test");
      expect(det.status).toBe(200);
      const detJson = det.json as any;
      expect(detJson.id).toBe("agente-unit-test");
      expect(detJson.role).toBe("Especialista em Testes");
      expect(detJson.corpo_prompt).toContain("testador rigoroso");
    });

    it("PUT /agents/:id edita propriedades do agente", async () => {
      const edit = await fetchApi("/agents/agente-unit-test", {
        method: "PUT",
        body: JSON.stringify({
          role: "Lead QA Automation",
          budget_daily_usd: 15.5,
        }),
      });
      expect(edit.status).toBe(200);
      const editJson = edit.json as any;
      expect(editJson.role).toBe("Lead QA Automation");
    });

    it("PUT /agents/:id bloqueia desativação de agentes de sistema", async () => {
      const resp = await fetchApi("/agents/secretario", {
        method: "PUT",
        body: JSON.stringify({ ativo: false }),
      });
      expect(resp.status).toBe(422);
      expect((resp.json as any).erro).toContain("agentes de sistema e não podem ser desativados");
    });

    it("POST /agents/:id/run dispara execução do agente", async () => {
      const runResp = await fetchApi("/agents/agente-unit-test/run", {
        method: "POST",
        body: JSON.stringify({ ordem: "Executar bateria de testes" }),
      });
      expect(runResp.status).toBe(202);
      const runJson = runResp.json as any;
      expect(runJson.status).toBe("iniciado");
      expect(runJson.exec_id).toBeTruthy();
    });

    it("POST /agents/semear-catalogo e /aplicar-modelo-global funcionam", async () => {
      const semear = await fetchApi("/agents/semear-catalogo", { method: "POST" });
      expect(semear.status).toBe(200);

      const aplicar = await fetchApi("/agents/aplicar-modelo-global", {
        method: "POST",
        body: JSON.stringify({ model: "openrouter/google/gemini-pro" }),
      });
      expect(aplicar.status).toBe(200);
      expect((aplicar.json as any).ok).toBe(true);
    });

    it("DELETE /agents/:id remove agente", async () => {
      const del = await fetchApi("/agents/agente-unit-test", { method: "DELETE" });
      expect(del.status).toBe(200);
      expect((del.json as any).ok).toBe(true);
    });

    it("GET /skills e GET /tools respondem adequadamente", async () => {
      // Mock de tool e skill no workspace
      const toolsDir = join(wsPath, ".opencorp", "tools");
      const skillsDir = join(wsPath, ".opencorp", "skills", "minha-skill");
      mkdirSync(toolsDir, { recursive: true });
      mkdirSync(skillsDir, { recursive: true });

      writeFileSync(
        join(toolsDir, "calculadora.json"),
        JSON.stringify({ name: "calculadora", description: "Calcula expressões matemáticas" }),
        "utf8",
      );
      writeFileSync(
        join(skillsDir, "SKILL.md"),
        `---\nname: minha-skill\ndescription: Skill de teste\nallowed-tools: [bash]\n---\nConteúdo da skill.\n`,
        "utf8",
      );

      const resSkills = await fetchApi("/skills?workspace=ws-principal");
      expect(resSkills.status).toBe(200);
      expect(Array.isArray(resSkills.json)).toBe(true);
      const skills = resSkills.json as any[];
      expect(skills.some((s) => s.name === "minha-skill")).toBe(true);

      const resTools = await fetchApi("/tools?workspace=ws-principal");
      expect(resTools.status).toBe(200);
      expect(Array.isArray(resTools.json)).toBe(true);
      const tools = resTools.json as any[];
      expect(tools.some((t) => t.id === "calculadora")).toBe(true);
    });

    it("GET /skills/:id e POST /agents/:id/skills operam no padrão Agent Skills Standard", async () => {
      // 1. Consulta detalhe da skill com corpo Markdown
      const resSkillDetalhe = await fetchApi("/skills/minha-skill?workspace=ws-principal");
      expect(resSkillDetalhe.status).toBe(200);
      expect((resSkillDetalhe.json as any).name).toBe("minha-skill");
      expect((resSkillDetalhe.json as any).corpo).toContain("Conteúdo da skill.");

      // 2. Cria um agente no workspace
      await fetchApi("/agents?workspace=ws-principal", {
        method: "POST",
        body: JSON.stringify({ id: "agente-teste-skill", role: "Agente de Teste" }),
      });

      // 3. Atribui skill ao agente via POST /agents/:id/skills
      const resAtribui = await fetchApi("/agents/agente-teste-skill/skills?workspace=ws-principal", {
        method: "POST",
        body: JSON.stringify({ skill: "minha-skill", acao: "adicionar" }),
      });
      expect(resAtribui.status).toBe(200);
      expect((resAtribui.json as any).skills).toContain("minha-skill");

      // 4. Consulta detalhe do agente para confirmar frontmatter
      const resAgente = await fetchApi("/agents/agente-teste-skill?workspace=ws-principal");
      expect(resAgente.status).toBe(200);
      expect((resAgente.json as any).skills).toContain("minha-skill");

      // 5. Remove skill do agente
      const resRemove = await fetchApi("/agents/agente-teste-skill/skills?workspace=ws-principal", {
        method: "POST",
        body: JSON.stringify({ skill: "minha-skill", acao: "remover" }),
      });
      expect(resRemove.status).toBe(200);
      expect((resRemove.json as any).skills).not.toContain("minha-skill");
    });

    it("GET /packs e POST /packs/:id/install operam com Packs de Solução", async () => {
      // 1. Lista packs
      const resPacks = await fetchApi("/packs?workspace=ws-principal");
      expect(resPacks.status).toBe(200);
      expect(Array.isArray(resPacks.json)).toBe(true);
      const packs = resPacks.json as any[];
      expect(packs.some((p) => p.id === "youtube-factory")).toBe(true);

      // 2. Consulta detalhe do pack
      const resPackDetalhe = await fetchApi("/packs/youtube-factory?workspace=ws-principal");
      expect(resPackDetalhe.status).toBe(200);
      expect((resPackDetalhe.json as any).conteudo.agentes.length).toBeGreaterThan(0);

      // 3. Instala pack no workspace
      const resInstall = await fetchApi("/packs/youtube-factory/install?workspace=ws-principal", {
        method: "POST",
        body: JSON.stringify({ workspace: "ws-principal" }),
      });
      expect(resInstall.status).toBe(200);
      expect((resInstall.json as any).ok).toBe(true);
      expect((resInstall.json as any).instalados.agentes).toContain("pautador-youtube");
    });
  });

  describe("Rotas de Scheduler e Jobs (/scheduler/jobs, /jobs, /schedules, /scheduler/status)", () => {
    let jobIdCriado: string;

    it("GET /scheduler/status e /scheduler/saude retornam diagnóstico do daemon", async () => {
      const st1 = await fetchApi("/scheduler/status");
      expect(st1.status).toBe(200);
      const stJson = st1.json as any;
      expect(stJson.ok).toBe(true);
      expect(stJson.daemon).toBeDefined();
      expect(stJson.jobs).toBeDefined();

      const st2 = await fetchApi("/scheduler/saude");
      expect(st2.status).toBe(200);
      expect((st2.json as any).ok).toBe(true);
    });

    it("POST /scheduler/jobs retorna 410 Gone (rotinas avulsas foram unificadas em fluxos)", async () => {
      const resp = await fetchApi("/scheduler/jobs", {
        method: "POST",
        body: JSON.stringify({
          nome: "Rotina Legada",
          agenda_tipo: "cron",
          agenda_valor: "*/10 * * * *",
          args: ["task", "list"],
        }),
      });
      expect(resp.status).toBe(410);
      expect((resp.json as any).erro).toContain("removida");
    });

    it("GET /jobs lista jobs e aliases /scheduler/jobs /schedules", async () => {
      const rJobs = await fetchApi("/jobs");
      expect(rJobs.status).toBe(200);
      expect(Array.isArray(rJobs.json)).toBe(true);

      const rSched = await fetchApi("/scheduler/jobs");
      expect(rSched.status).toBe(200);
      expect(Array.isArray(rSched.json)).toBe(true);

      const rSchedules = await fetchApi("/schedules");
      expect(rSchedules.status).toBe(200);
      expect(Array.isArray(rSchedules.json)).toBe(true);
    });

    it("Mutações em jobs legados retornam 410 Gone", async () => {
      const p1 = await fetchApi("/scheduler/jobs/job-legado/pausar", { method: "POST" });
      expect(p1.status).toBe(410);

      const p2 = await fetchApi("/scheduler/jobs/job-legado/ativar", { method: "POST" });
      expect(p2.status).toBe(410);

      const p3 = await fetchApi("/scheduler/jobs/job-legado/toggle", { method: "POST" });
      expect(p3.status).toBe(410);

      const runResp = await fetchApi("/scheduler/jobs/job-legado/run", { method: "POST" });
      expect(runResp.status).toBe(410);

      const runs = await fetchApi("/scheduler/jobs/job-legado/runs");
      expect(runs.status).toBe(410);

      const del = await fetchApi("/scheduler/jobs/job-legado", { method: "DELETE" });
      expect(del.status).toBe(410);
    });
  });
});
