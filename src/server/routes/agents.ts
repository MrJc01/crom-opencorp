import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { eventBus } from "../../core/event-bus.js";
import { completarChatDirect } from "../../core/llm-client.js";
import { opencorpHome } from "../../utils/paths.js";
import { SkillStore } from "../../core/skill-store.js";
import type { OpcoesRun } from "../../core/session-manager.js";
import type { RouteContext } from "./types.js";

/** Onde um agente é citado: specs de teams (.opencorp/teams/*.json), grafos de flows
 *  (.opencorp/flows/*.json, nós agente/decisao) e tasks abertas (responsavel=agente:id).
 *  Usado pela guarda de exclusão (PUT DELETE /agents/:id → 409). */
export async function citacoesAgente(
  wsPath: string,
  idAgente: string,
  listarTasks: (p: string) => Promise<Array<{ responsavel?: string; coluna: string; id: string; titulo: string }>>,
): Promise<string[]> {
  const citacoes: string[] = [];

  const varreDirJson = (dir: string, rotulo: string, contemAgente: (obj: Record<string, unknown>, id: string) => boolean): void => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      try {
        const obj = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
        if (contemAgente(obj, String(obj.id ?? f.replace(/\.json$/, "")))) citacoes.push(`${rotulo} ${obj.id ?? f.replace(/\.json$/, "")}`);
      } catch {
        /* arquivo ilegível não bloqueia exclusão */
      }
    }
  };

  /** Teams/flows: confere o JSON inteiro — pega nós agente E os nós da fusão
   *  (fanout.paralelos/sintese, review.executor/revisor, debate.proponentes/moderador),
   *  que todos usam a forma { "agente": "<id>" } (achado da auditoria #2). */
  const jsonCita = (obj: Record<string, unknown>): boolean =>
    JSON.stringify(obj).includes(`"agente":"${idAgente}"`) || JSON.stringify(obj).includes(`"agente": "${idAgente}"`);

  varreDirJson(join(wsPath, ".opencorp", "teams"), "team", (obj) => jsonCita(obj));
  varreDirJson(join(wsPath, ".opencorp", "flows"), "flow", (obj) => jsonCita(obj));

  try {
    const abertas = await listarTasks(wsPath);
    for (const t of abertas) {
      if (t.responsavel === `agente:${idAgente}` && t.coluna !== "feito") citacoes.push(`task ${t.id} (${t.titulo})`);
    }
  } catch {
    /* erro ao listar tasks não bloqueia */
  }

  return citacoes;
}

export async function gerarPromptComIA(
  homeDir: string,
  descricao: string,
  modeloPreferido?: string,
  modelosFallback: string[] = [],
): Promise<{ prompt: string; modelo: string }> {
  const modelosCandidatos = [
    modeloPreferido,
    ...modelosFallback,
    "openrouter/google/gemini-3.8-flash",
    "openrouter/nvidia/nemotron-3.5-lightning:free",
    "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free",
    "openrouter/minimax/minimax-m3:free",
  ].filter(Boolean) as string[];

  for (const mod of modelosCandidatos) {
    try {
      const resp = await completarChatDirect({
        model: mod,
        messages: [
          {
            role: "system",
            content:
              "Você é um arquiteto especialista em Agentes Autônomos de Inteligência Artificial. " +
              "Crie um System Prompt em formato Markdown profissional, detalhado, rico e em português para o agente solicitado. " +
              "Estruture o prompt com as seções: # [Nome do Agente], ## Papel & Missão Principal, ## Diretrizes & Regras de Ação, ## Formato de Resposta & Comunicação, ## Restrições & Segurança. " +
              "IMPORTANTE: Não inclua processos de pensamento (thinking). Comece a resposta imediatamente com '# System Prompt:'. Retorne apenas o markdown do prompt, sem blocos de código envolvendo tudo.",
          },
          {
            role: "user",
            content: `Gere o System Prompt completo para este agente: ${descricao}`,
          },
        ],
        homeDir,
        maxTokens: 1200,
        temperature: 0.7,
      });

      let content = resp.content;
      if (typeof content === "string" && content.trim().length > 50) {
        if (content.includes("# ")) {
          content = content.slice(content.indexOf("# "));
        }
        content = content.replace(/^```markdown\s*/i, "").replace(/\s*```$/, "").trim();
        return { prompt: content, modelo: resp.model || mod };
      }
    } catch {}
  }

  // Fallback estruturado caso a API externa não responda
  const promptFallback = [
    `# System Prompt: ${descricao.split("\n")[0]?.slice(0, 60) || "Agente Especialista"}`,
    "",
    "## Papel & Missão Principal",
    `Você é um agente autônomo especialista encarregado da seguinte missão: ${descricao}`,
    "Sua função é atuar com excelência, pensamento crítico e foco em entregar resultados concretos de alto valor para o workspace.",
    "",
    "## Diretrizes & Regras de Ação",
    "1. Analise o contexto completo antes de iniciar qualquer execução.",
    "2. Execute tarefas de forma precisa, modular e documentada.",
    "3. Siga boas práticas de engenharia de software e padrões corporativos.",
    "4. Priorize decisões estratégicas que otimizem tempo e recursos.",
    "5. Valide seus passos antes de concluir para garantir precisão máxima.",
    "",
    "## Formato de Resposta & Comunicação",
    "- Seja direto, profissional e objetivo.",
    "- Utilize Markdown para estruturar tópicos, passos e relatórios.",
    "- Apresente dados em tabelas ou listas quando facilitar a compreensão.",
    "- Justifique decisões técnicas com clareza.",
    "",
    "## Restrições & Segurança",
    "- Não execute comandos destrutivos sem verificação de impacto.",
    "- Respeite os limites operacionais e políticas de segurança do workspace.",
    "- Em caso de ambiguidade crítica, documente as premissas adotadas.",
  ].join("\n");

  return { prompt: promptFallback, modelo: modeloPreferido || "fallback-local" };
}


export async function handleAgentRoutes(ctx: RouteContext): Promise<boolean> {
  const {
    req,
    res,
    url,
    resolverWs,
    lerCorpo,
    enviar,
    agentes,
    tasks,
    hooks,
    settings,
    sessoes,
    gerarIdExec,
    homeDir,
    skillStore,
  } = ctx;

  // Unifica rotas em português e inglês (/agentes -> /agents)
  const rota = ctx.rota.replace(/^\/agentes(\/|$)/, "/agents$1");

  // ── GET /skills (catálogo de skills e parâmetros) ───────────────────
  if ((rota === "/skills" || ctx.rota === "/skills") && req.method === "GET") {
    const ws = await resolverWs(url);
    const store = skillStore ?? new SkillStore();
    const skills = await store.listar(ws.path);
    enviar(res, 200, skills);
    return true;
  }

  // ── GET /tools (registro de ferramentas disponíveis para os agentes) ─
  if ((rota === "/tools" || ctx.rota === "/tools") && req.method === "GET") {
    const ws = await resolverWs(url);
    const dir = join(ws.path, ".opencorp", "tools");
    const itens: Array<{ id: string; spec?: unknown; erro?: string }> = [];
    if (existsSync(dir)) {
      const arquivos = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
      for (const f of arquivos) {
        const id = f.replace(/\.json$/, "");
        try {
          itens.push({ id, spec: JSON.parse(readFileSync(join(dir, f), "utf8")) });
        } catch (erro) {
          itens.push({ id, erro: `JSON inválido: ${erro instanceof Error ? erro.message : String(erro)}` });
        }
      }
    }
    enviar(res, 200, itens);
    return true;
  }

  if (!agentes) return false;

  // ── GET /agents ou /agentes ──────────────────────────────────────────
  if (rota === "/agents" && req.method === "GET") {
    const ws = await resolverWs(url);
    enviar(res, 200, await agentes.listar(ws.path));
    return true;
  }

  // ── POST /agents ou /agentes ─────────────────────────────────────────
  if (rota === "/agents" && req.method === "POST") {
    const ws = await resolverWs(url);
    const corpo = (await lerCorpo(req)) as {
      id?: string;
      from?: string;
      model?: string;
      role?: string;
      corpo_prompt?: string;
      permissions?: string;
      ativo?: boolean;
    };
    const criado = await agentes.criar(ws.path, corpo.id ?? "", { de: corpo.from, model: corpo.model });
    // Se vieram campos extras (role, corpo_prompt, permissions), aplica via editar()
    const temExtras = corpo.role || corpo.corpo_prompt || corpo.permissions || corpo.ativo !== undefined;
    if (temExtras) {
      const editado = await agentes.editar(ws.path, criado.frontmatter.id, {
        role: corpo.role,
        model: corpo.model,
        permissions: corpo.permissions as "level-1" | "level-2" | "level-3" | undefined,
        corpo: corpo.corpo_prompt,
        ativo: corpo.ativo,
      });
      enviar(res, 201, { id: editado.id, modelo: editado.model, role: editado.role });
    } else {
      enviar(res, 201, { id: criado.frontmatter.id, modelo: criado.frontmatter.model });
    }
    return true;
  }

  // ── POST /agents/gerar-prompt ────────────────────────────────────────
  if (rota === "/agents/gerar-prompt" && req.method === "POST") {
    const ws = await resolverWs(url);
    const corpo = (await lerCorpo(req)) as { descricao?: string; modelo?: string };
    const descricao = String(corpo.descricao ?? "").trim();
    if (!descricao) {
      enviar(res, 400, { erro: "campo 'descricao' é obrigatório para gerar o prompt" });
      return true;
    }

    const s = settings ? await settings.resolve({ workspaceDir: ws.path }) : null;
    const modeloPref = corpo.modelo?.trim() || s?.settings.default_model;
    const fallbackList = s?.settings.tests?.rotation || [];
    const home = homeDir ?? opencorpHome();

    const resultado = await gerarPromptComIA(home, descricao, modeloPref, fallbackList);
    enviar(res, 200, resultado);
    return true;
  }

  // ── POST /agents/aplicar-modelo-global ───────────────────────────────
  if (rota === "/agents/aplicar-modelo-global" && req.method === "POST") {
    const ws = await resolverWs(url);
    const corpo = (await lerCorpo(req)) as { model?: string };
    const s = settings ? await settings.resolve({ workspaceDir: ws.path }) : null;
    const modeloAlvo = corpo.model?.trim() || s?.settings.default_model || "openrouter/nvidia/nemotron-3.5-lightning:free";
    const lista = await agentes.listar(ws.path);
    let alterados = 0;
    for (const ag of lista) {
      try {
        await agentes.editar(ws.path, ag.id, { model: modeloAlvo });
        alterados++;
      } catch {}
    }
    eventBus.emit("agentes.atualizados", { total: alterados, modelo: modeloAlvo });
    enviar(res, 200, { ok: true, alterados, modelo: modeloAlvo });
    return true;
  }

  // ── POST /agents/semear-catalogo ─────────────────────────────────────
  if (rota === "/agents/semear-catalogo" && req.method === "POST") {
    const ws = await resolverWs(url);
    const resultado = await agentes.semearCatalogo(ws.path);
    enviar(res, 200, resultado);
    return true;
  }

  // ── POST /agents/:id/run ─────────────────────────────────────────────
  const mAgenteRun = /^\/agents\/([^/]+)\/run$/.exec(rota);
  if (mAgenteRun && req.method === "POST") {
    const ws = await resolverWs(url);
    const idRun = decodeURIComponent(mAgenteRun[1]!);
    const corpo = (await lerCorpo(req)) as { ordem?: string; model?: string; engine?: string; harness?: string };
    const alvo = await agentes.carregar(ws.path, idRun);
    if (alvo.frontmatter.ativo === false) {
      enviar(res, 409, { erro: `agente '${idRun}' está desativado — ative no painel de agentes` });
      return true;
    }
    const execId = gerarIdExec ? gerarIdExec() : `exec-${Date.now()}`;
    const opcoes: OpcoesRun = {
      agente: idRun,
      ordem: corpo.ordem ?? "",
      model: corpo.model,
      engine: corpo.engine || corpo.harness,
      harness: corpo.harness || corpo.engine,
      workspaceDir: ws.path,
      workspaceId: ws.id,
      execId,
      gatilho: { tipo: "manual", origem: `api:${ws.id}` },
    };
    void sessoes.rodar(opcoes).catch(() => undefined);
    enviar(res, 202, { exec_id: execId, status: "iniciado" });
    return true;
  }

  // ── GET, PUT, DELETE /agents/:id ─────────────────────────────────────
  const mAgente = /^\/agents\/([^/]+)$/.exec(rota);
  if (mAgente) {
    const id = decodeURIComponent(mAgente[1]!);

    if (req.method === "GET") {
      const ws = await resolverWs(url);
      const carregado = await agentes.carregar(ws.path, id);
      enviar(res, 200, { ...carregado.frontmatter, corpo_prompt: carregado.corpo });
      return true;
    }

    if (req.method === "PUT") {
      const ws = await resolverWs(url);
      const corpo = (await lerCorpo(req)) as Record<string, unknown>;
      if (corpo.ativo !== undefined && typeof corpo.ativo !== "boolean") {
        enviar(res, 422, { erro: "campo 'ativo' deve ser boolean (true/false)" });
        return true;
      }
      if (corpo.ativo === false && (id === "secretario" || id === "secretario-exec")) {
        enviar(res, 422, { erro: "secretário e secretário-exec são agentes de sistema e não podem ser desativados" });
        return true;
      }
      const salvo = await agentes.editar(ws.path, id, {
        role: corpo.role !== undefined ? String(corpo.role) : undefined,
        model: corpo.model !== undefined ? String(corpo.model) : undefined,
        permissions: corpo.permissions !== undefined ? (String(corpo.permissions) as "level-1" | "level-2" | "level-3") : undefined,
        tools: Array.isArray(corpo.tools) ? (corpo.tools as unknown[]).map(String).filter(Boolean) : undefined,
        budget_daily_usd: typeof corpo.budget_daily_usd === "number" ? corpo.budget_daily_usd : undefined,
        budget_max_turns: typeof corpo.budget_max_turns === "number" ? corpo.budget_max_turns : undefined,
        ativo: corpo.ativo as boolean | undefined,
        corpo: typeof corpo.corpo_prompt === "string" ? corpo.corpo_prompt : (typeof corpo.corpo === "string" ? corpo.corpo : undefined),
        harness: typeof corpo.harness === "string" ? corpo.harness.trim() : (typeof (corpo as any).engine === "string" ? (corpo as any).engine.trim() : undefined),
        harness_fallback: Array.isArray(corpo.harness_fallback) ? (corpo.harness_fallback as unknown[]).map(String).filter(Boolean) : undefined,
        rotation: Array.isArray(corpo.rotation) ? (corpo.rotation as unknown[]).map(String).filter(Boolean) : undefined,
        model_fallback: Array.isArray(corpo.model_fallback) ? (corpo.model_fallback as unknown[]).map(String).filter(Boolean) : undefined,
        workspace_rotation_fallback: typeof corpo.workspace_rotation_fallback === "boolean" ? corpo.workspace_rotation_fallback : (typeof (corpo as any).rotacao_global === "boolean" ? (corpo as any).rotacao_global : undefined),
      });
      eventBus.emit("agente.editado", { agente: id });
      enviar(res, 200, salvo);
      return true;
    }

    if (req.method === "DELETE") {
      const ws = await resolverWs(url);
      const citacoes = await citacoesAgente(ws.path, id, (p) => tasks.listar(p));
      if (hooks) {
        try {
          for (const h of hooks.listar(ws.path)) {
            const alvo = h.alvo as { tipo?: string; agente?: string };
            if (alvo?.tipo === "agent_run" && alvo.agente === id) citacoes.push(`hook ${h.id}`);
          }
        } catch {
          /* hooks indisponíveis não bloqueiam */
        }
      }
      if (citacoes.length) {
        enviar(res, 409, {
          erro: `agente "${id}" está em uso e não pode ser excluído — remova-o primeiro de: ${citacoes.slice(0, 8).join(", ")}${citacoes.length > 8 ? ` (+${citacoes.length - 8})` : ""}`,
          citacoes,
        });
        return true;
      }
      await agentes.excluir(ws.path, id);
      eventBus.emit("agente.excluido", { agente: id });
      enviar(res, 200, { ok: true, id });
      return true;
    }
  }

  return false;
}
