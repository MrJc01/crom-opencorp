import { resolve, relative, isAbsolute } from "node:path";
import { WorkspaceError } from "../../../core/shared/errors.js";
import {
  SecretarioError,
  extrairPassosMensagens,
  type MensagemOc,
} from "../../../core/contexts/execution/opencode-server.js";
import { resolverCadeiaModelosAgente } from "../../../core/contexts/agents/model-resolver.js";
import type { RouteContext } from "../types.js";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function parsearModelo(modelo: string): { providerID: string; modelID: string } {
  const m = String(modelo ?? "").trim();
  if (!m) return { providerID: "opencode", modelID: "default" };
  if (!m.includes("/")) {
    return { providerID: "opencode", modelID: m };
  }
  const idx = m.indexOf("/");
  return {
    providerID: m.slice(0, idx).trim(),
    modelID: m.slice(idx + 1).trim(),
  };
}

export async function trocarModeloEngine(baseUrl: string, sessaoId: string, modeloCompleto: string): Promise<boolean> {
  try {
    const { providerID, modelID } = parsearModelo(modeloCompleto);
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/session/${encodeURIComponent(sessaoId)}/model`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: { id: modelID, providerID } }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => null),
      fetch(`${baseUrl}/session/${encodeURIComponent(sessaoId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: { id: modelID, providerID } }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => null),
    ]);
    return Boolean((res1 && (res1.ok || res1.status === 204)) || (res2 && res2.ok));
  } catch {
    return false;
  }
}

export async function resolverCaminhoLocal(wsPath: string, pathParam: string): Promise<string> {
  const base = resolve(wsPath);
  const solicitado = pathParam ?? "";
  const normalizado = solicitado.replace(/^\.\//, "").replace(/\/+/g, "/");
  const alvo = resolve(base, normalizado);
  const relativo = relative(base, alvo);
  if (relativo.startsWith("..") || isAbsolute(relativo)) {
    throw new WorkspaceError("caminho fora do workspace (path traversal bloqueado)", { exitCode: 3 });
  }
  return alvo;
}

export async function obterPorta(ctx: RouteContext, autoIniciar = false): Promise<number> {
  const { portaOpencodeOuErro, opencodeServer } = ctx;
  if (portaOpencodeOuErro) return portaOpencodeOuErro(autoIniciar);
  if (!opencodeServer) throw new SecretarioError("servidor do motor de IA não configurado", { status: 500 });
  let st = await opencodeServer.status();
  if (autoIniciar && (!st.rodando || !st.porta)) {
    try {
      const res = await opencodeServer.iniciar();
      if (res.porta) return res.porta;
      st = await opencodeServer.status();
    } catch (err) {
      console.error("[secretario] falha ao auto-iniciar opencode server:", err);
    }
  }
  if (!st.rodando || !st.porta) {
    throw new SecretarioError("motor do secretário não iniciado — execute POST /secretario/start", { status: 409 });
  }
  return st.porta;
}

export async function sincronizarCorp(ctx: RouteContext, porta: number, sessaoId: string): Promise<void> {
  if (ctx.sincronizarSessaoNoCorp) {
    await ctx.sincronizarSessaoNoCorp(porta, sessaoId);
  }
}

export async function resolverModelos(
  ctx: RouteContext,
  opts: {
    modeloRequisicao?: string;
    agenteId?: string;
    wsPath?: string;
  },
): Promise<{ modelos: string[]; motorPadrao: string }> {
  const { modeloRequisicao, agenteId, wsPath } = opts;
  const { agentes } = ctx;

  let ag: any = undefined;
  if (agenteId && agentes && wsPath) {
    try {
      ag = await agentes.carregar(wsPath, agenteId);
    } catch {}
  }

  try {
    const { cadeia } = resolverCadeiaModelosAgente({
      agente: ag?.frontmatter || ag,
      wsPath: wsPath || "",
      modeloSolicitado: modeloRequisicao,
    });
    return { modelos: cadeia, motorPadrao: "opencode" };
  } catch {
    return {
      modelos: [
        modeloRequisicao,
        "openrouter/nvidia/nemotron-3.5-lightning:free",
        "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
        "openrouter/google/gemma-4-31b-it:free",
      ].filter(Boolean) as string[],
      motorPadrao: "opencode",
    };
  }
}

export async function limparMensagensTentativaFalha(
  baseUrlSessao: string,
  idsAntes: Set<string | undefined>,
  manterSeTiverTextoSubstancial: boolean = true,
): Promise<void> {
  try {
    await fetch(`${baseUrlSessao}/abort`, { method: "POST" }).catch(() => {});
    const getRes = await fetch(`${baseUrlSessao}/message`, { signal: AbortSignal.timeout(4000) });
    if (!getRes.ok) return;
    const msgs = (await getRes.json()) as MensagemOc[];
    if (!Array.isArray(msgs)) return;

    const novas = msgs.filter((m) => m.info?.id && !idsAntes.has(m.info.id));
    if (novas.length === 0) return;

    if (manterSeTiverTextoSubstancial) {
      const assistentesNovas = novas.filter((m) => m.info?.role === "assistant");
      const temSubstancial = assistentesNovas.some((a) => {
        const passos = extrairPassosMensagens([a]);
        const txt = passos.filter((p) => p.tipo === "texto").map((p) => p.texto ?? "").join("\n").trim();
        return txt.length > 20;
      });
      if (temSubstancial) return;
    }

    for (const m of novas) {
      if (m.info?.id) {
        await fetch(`${baseUrlSessao}/message/${encodeURIComponent(m.info.id)}`, {
          method: "DELETE",
          signal: AbortSignal.timeout(3000),
        }).catch(() => {});
      }
    }
  } catch {}
}
