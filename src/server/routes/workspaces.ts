/**
 * Rotas de Workspaces — Extração Modular (MICRO-PASSO 10)
 */

import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { writeFileAtomic } from "../../utils/fs-safe.js";
import type { RouteContext } from "./types.js";

const SUBROTAS_RESERVADAS = new Set([
  "current",
  "ativo",
  "import-corp",
  "driver-info",
  "driver-config",
  "git",
]);

export async function handleWorkspaceRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, url, rota, resolverWs, lerCorpo, enviar, workspaces, templates } = ctx;

  // ── 1. GET /workspaces — lista workspaces disponíveis ──
  if (rota === "/workspaces" && req.method === "GET") {
    enviar(res, 200, await workspaces.listar());
    return true;
  }

  // ── 2. POST /workspaces — cria novo workspace ──
  if (rota === "/workspaces" && req.method === "POST") {
    const corpo = (await lerCorpo(req)) as {
      id?: string;
      template?: string;
      path?: string;
      perfil?: {
        empresa?: string;
        nicho?: string;
        publico?: string;
        tom?: string;
        tom_evitar?: unknown[];
        topicos?: unknown[];
        diferenciais?: unknown[];
      };
    };

    const criado = await workspaces.criar(corpo.id ?? "", {
      template: corpo.template,
      path: corpo.path,
    });

    // Perfil editorial opcional → grava .opencorp/projeto.json no workspace
    if (corpo.perfil && typeof corpo.perfil === "object") {
      const p = corpo.perfil;
      const projeto: Record<string, unknown> = {
        empresa: String(p.empresa ?? criado.id),
        nicho: String(p.nicho ?? ""),
        publico: String(p.publico ?? ""),
        tom: String(p.tom ?? ""),
        tom_evitar: Array.isArray(p.tom_evitar) ? p.tom_evitar.map(String) : [],
        topicos_editoriais: Array.isArray(p.topicos) ? p.topicos.map(String) : [],
      };
      if (Array.isArray(p.diferenciais)) projeto.diferenciais = p.diferenciais.map(String);
      await writeFileAtomic(join(criado.path, ".opencorp", "projeto.json"), `${JSON.stringify(projeto, null, 2)}\n`);
    }

    enviar(res, 201, { id: criado.id, caminho: criado.path });
    return true;
  }

  // ── 3. POST /workspaces/import-corp — importa template e cria workspace ──
  if (rota === "/workspaces/import-corp" && req.method === "POST") {
    const corpo = (await lerCorpo(req)) as {
      id?: string;
      nome_arquivo?: string;
      arquivo_base64: string;
      path?: string;
    };
    if (!corpo.arquivo_base64 || typeof corpo.arquivo_base64 !== "string") {
      enviar(res, 400, { erro: "arquivo_base64 obrigatório" });
      return true;
    }

    const nomeLimpo = (corpo.nome_arquivo || "workspace.corp")
      .replace(/\.corp$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-");
    const idAlvo = (corpo.id ? String(corpo.id).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-") : "") || nomeLimpo || `ws-${Date.now()}`;

    const tmpPath = join(tmpdir(), `opencorp-import-${Date.now()}-${randomBytes(4).toString("hex")}.corp`);
    try {
      const b64Limpo = corpo.arquivo_base64.replace(/^data:[^;]+;base64,/, "");
      writeFileSync(tmpPath, Buffer.from(b64Limpo, "base64"));

      const templateId = `import-${idAlvo}-${Date.now()}`;
      if (templates) {
        await templates.importar(tmpPath, templateId);
      }
      const criado = await workspaces.criar(idAlvo, { template: templateId, path: corpo.path });
      enviar(res, 201, { ok: true, id: criado.id, caminho: criado.path });
    } catch (err: unknown) {
      const mensagem = err instanceof Error ? err.message : String(err);
      enviar(res, 500, { erro: `Falha ao importar .corp: ${mensagem}` });
    } finally {
      try {
        if (existsSync(tmpPath)) rmSync(tmpPath, { force: true });
      } catch {}
    }
    return true;
  }

  // ── 4. GET /workspaces/current ou /workspaces/ativo — retorna workspace atual ──
  if ((rota === "/workspaces/current" || rota === "/workspaces/ativo") && req.method === "GET") {
    const ws = await resolverWs(url);
    const atual = await workspaces.atual();
    enviar(res, 200, { id: ws.id, caminho: ws.path, ativo: atual?.id === ws.id });
    return true;
  }

  // ── 5. POST /workspaces/ativo — seleciona/troca o workspace ativo ──
  if ((rota === "/workspaces/ativo" || rota === "/workspaces/current") && req.method === "POST") {
    const corpo = (await lerCorpo(req)) as { id?: string };
    if (!corpo.id) {
      enviar(res, 400, { erro: "id do workspace obrigatório" });
      return true;
    }
    const ativado = await workspaces.usar(corpo.id);
    enviar(res, 200, { ok: true, id: ativado.id, caminho: ativado.path });
    return true;
  }

  // ── 6. Rotas por ID: GET /workspaces/:id e DELETE /workspaces/:id ──
  const mWs = /^\/workspaces\/([^/]+)$/.exec(rota);
  if (mWs) {
    const id = decodeURIComponent(mWs[1]!);
    if (SUBROTAS_RESERVADAS.has(id)) {
      return false;
    }

    if (req.method === "GET") {
      const detalhes = await workspaces.detalhar(id);
      enviar(res, 200, detalhes);
      return true;
    }

    if (req.method === "DELETE") {
      const resultado = await workspaces.deletar(id, { sim: true });
      enviar(res, 200, { ok: true, id, ...resultado });
      return true;
    }
  }

  return false;
}
