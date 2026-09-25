import { readFile, stat } from "node:fs/promises";
import { resolverCaminhoLocal } from "./helpers.js";
import type { RouteContext } from "../types.js";

export const RE_MENCAO_TIPADA = /@(agente|prompt|arquivo|task):([^\s@]+)/g;
export const RE_MENCAO_SIMPLES = /(?:^|\s)@([A-Za-z0-9][A-Za-z0-9._/-]*)/g;
export const CAP_KB_CONTEXTO = 12 * 1024;
export const MAX_ITENS_CONTEXTO = 8;

export async function resolverMencoes(
  ctx: RouteContext,
  opts: {
    mensagemBruta: string;
    corpoContexto?: string[];
    agenteAtual: string;
    ws: { id: string; path: string };
  },
): Promise<{ mensagem: string; contexto: string[]; agente: string }> {
  const { mensagemBruta, corpoContexto, agenteAtual, ws } = opts;
  const { agentes, tasks, prompts } = ctx;

  const contextoBase = (Array.isArray(corpoContexto) ? corpoContexto : [])
    .map((c) => String(c).replace(/^@/, "").slice(0, 120))
    .filter(Boolean)
    .slice(0, MAX_ITENS_CONTEXTO);

  const tipadas = [...mensagemBruta.matchAll(RE_MENCAO_TIPADA)].map((m) => ({
    tipo: m[1]!.toLowerCase(),
    valor: m[2]!,
  }));
  const semTipadas = mensagemBruta.replace(RE_MENCAO_TIPADA, " ");
  const simples = [...semTipadas.matchAll(RE_MENCAO_SIMPLES)].map((m) => m[1]!);

  const idsAgentes = new Set(agentes ? (await agentes.listar(ws.path).catch(() => [])).map((a) => a.id) : []);
  const totalMencoes = tipadas.length + simples.length;

  let agente = agenteAtual;
  let mensagem = mensagemBruta;
  const hidratado: string[] = [];

  for (const referencia of contextoBase) {
    const matchFlow = referencia.match(/^#?(?:flow|fluxo):(.+)$/i);
    if (!matchFlow?.[1]) continue;
    const flowId = matchFlow[1].trim();
    const flow = ctx.flows
      ? await ctx.flows.obter(ws.path, flowId).catch(() => null)
      : null;
    hidratado.push(
      flow
        ? `Fonte: fluxo ativo "${flowId}" (editável no workspace "${ws.id}")\n${JSON.stringify(flow, null, 2).slice(0, CAP_KB_CONTEXTO)}\n\nAo alterar este fluxo, preserve o ID e use as operações de FlowStore/API do workspace. A interface será atualizada em tempo real após salvar.`
        : `Fonte: fluxo ativo "${flowId}" — não encontrado no workspace "${ws.id}"`,
    );
  }

  if (totalMencoes === 1) {
    let alvoAgente: string | null = null;
    if (tipadas.length === 1 && tipadas[0]!.tipo === "agente") alvoAgente = tipadas[0]!.valor;
    else if (simples.length === 1 && idsAgentes.has(simples[0]!)) alvoAgente = simples[0]!;
    if (alvoAgente && idsAgentes.has(alvoAgente)) {
      agente = alvoAgente;
      mensagem = mensagem
        .replace(RE_MENCAO_TIPADA, "")
        .replace(RE_MENCAO_SIMPLES, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  for (const t of tipadas) {
    if (t.tipo === "arquivo") {
      try {
        const alvo = await resolverCaminhoLocal(ws.path, t.valor);
        const info = await stat(alvo).catch(() => null);
        if (info && info.isFile()) {
          const conteudo = await readFile(alvo, "utf8");
          const cortado = conteudo.length > CAP_KB_CONTEXTO;
          hidratado.push(
            `Fonte: arquivo "${t.valor}"\n${conteudo.slice(0, CAP_KB_CONTEXTO)}${cortado ? "\n…(truncado)" : ""}`,
          );
        } else {
          hidratado.push(`Fonte: arquivo "${t.valor}" — não encontrado ou não é um arquivo`);
        }
      } catch {
        hidratado.push(`Fonte: arquivo "${t.valor}" — não encontrado ou não é um arquivo`);
      }
    } else if (t.tipo === "task") {
      const tk = tasks ? await tasks.obter(ws.path, t.valor).catch(() => null) : null;
      hidratado.push(
        tk
          ? `Fonte: task "${tk.id}" (${tk.titulo}, coluna "${tk.coluna}", responsável "${tk.responsavel || "-"}")\n${tk.descricao || ""}`.trim()
          : `Fonte: task "${t.valor}" — não encontrada`,
      );
    } else if (t.tipo === "prompt") {
      try {
        if (prompts) {
          const texto = await prompts.get(ws.path, t.valor);
          hidratado.push(`Fonte: prompt "${t.valor}"\n${texto}`);
        }
      } catch (erro) {
        hidratado.push(`Fonte: prompt "${t.valor}" — ${erro instanceof Error ? erro.message : "não encontrado"}`);
      }
    }
  }

  mensagem = mensagem.replace(RE_MENCAO_TIPADA, "").replace(/\s+/g, " ").trim();
  const contexto = [...contextoBase, ...hidratado].slice(0, MAX_ITENS_CONTEXTO);

  if (hidratado.length > 0) {
    mensagem = `${mensagem || "(contexto referenciado)"}\n\n[CONTEXTO REFERENCIADO]\n${hidratado.join("\n\n---\n\n")}`;
  } else if (contextoBase.length > 0) {
    mensagem = mensagem
      ? `${mensagem}\n\n(Contexto referenciado pelo usuário: ${contextoBase.map((c) => "@" + c).join(" ")})`
      : mensagem;
  }

  return { mensagem, contexto, agente };
}
