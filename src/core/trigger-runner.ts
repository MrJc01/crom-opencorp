import { opencorpHome } from "../utils/paths.js";
import { basename } from "node:path";
import { eventBus } from "./event-bus.js";
import { HookStore, TriggersStore, type Hook } from "./hook-store.js";
import { WorkspaceManager } from "./workspace-manager.js";

const emAndamento = new Set<Promise<unknown>>();

export function pendentesTriggers(): Promise<unknown>[] {
  return [...emAndamento];
}

export function instalarTriggers(opcoes: { homeDir?: string } = {}): void {
  const homeDir = opcoes.homeDir ?? opencorpHome();
  const triggers = new TriggersStore();
  const hooks = new HookStore({
    executores: {
      agentRun: async (agente: string, ordem: string, wsPath: string) => {
        // Spawn DETACHED (anti-stale): a ordem disparada por trigger roda em
        // processo próprio e sobrevive ao processo que emitiu o evento.
        const { spawnOpencorpDetached } = await import("./spawn-detached.js");
        const wsId = basename(wsPath);
        const r = spawnOpencorpDetached(
          ["agent", "run", agente, ordem, "--workspace", wsId],
          { homeDir, nomeLog: `trigger-${agente}` },
        );
        return { id: `detached-pid-${r.pid}`, captura: `spawn detached (pid ${r.pid})` };
      },
      flowRun: async (flow: string, entrada: string, wsPath: string) => {
        const { FlowStore } = await import("./flow-store.js");
        const r = await new FlowStore({ homeDir, cwd: wsPath }).executar(wsPath, flow, { entrada });
        return { id: r.execId, captura: r.contextoFinal };
      },
    },
  });

  eventBus.on((ev) => {
    if (ev.tipo.startsWith("hook.") || ev.tipo.startsWith("trigger.")) return; // evita recursão
    let casados;
    try {
      casados = triggers.casar(homeDir, ev.tipo, ev.dados);
    } catch {
      return;
    }
    for (const t of casados) {
      const p = (async () => {
        // Preferência pelo workspace do EVENTO (ex.: task criada em X) — o
        // trigger declara o workspace padrão quando o evento não traz um.
        const wsAlvo = (ev.dados.workspace as string) || t.workspace || "";
        const ws = (await new WorkspaceManager({ homeDir }).resolver(wsAlvo)) as unknown as {
          id: string;
          path: string;
        };
        const hook: Hook = {
          id: t.id,
          nome: `trigger:${t.id}`,
          token: "",
          metodos: [],
          respond: "imediato",
          dedup_seg: 0,
          ativo: true,
          alvo: t.alvo,
          workspace: ws.id || t.workspace || "",
          criado_em: "",
        };
        await hooks.executar(ws.path, hook, { corpo: { ...ev.dados, evento: ev.tipo }, query: {} });
      })();
      emAndamento.add(p);
      void p.catch(() => undefined).finally(() => emAndamento.delete(p));
    }
  });
}
