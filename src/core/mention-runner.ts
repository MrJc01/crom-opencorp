import { TaskStore } from "./task-store.js";
import { eventBus } from "./event-bus.js";
import type { Gatilho } from "../schemas/gatilho.js";
import { opencorpHome } from "../utils/paths.js";
import { basename } from "node:path";

export interface ExecutoresMencoes {
  rodar(agente: string, ordem: string, wsPath: string, gatilho?: Gatilho): Promise<{ id: string; captura: string }>;
}

export interface OpcoesMencoes {
  homeDir?: string;
  executores?: ExecutoresMencoes;
  max_mensagens_auto_h?: number;
  agora?: () => Date;
}

const emAndamento = new Set<Promise<unknown>>();

export function pendentesMencoes(): Promise<unknown>[] {
  return [...emAndamento];
}

export function instalarMencoes(opcoes: OpcoesMencoes = {}): () => void {
  const {
    homeDir: homeDirOpcao,
    executores: executoresExternos,
    max_mensagens_auto_h = 20,
    agora = () => new Date(),
  } = opcoes;
  const homeDir = homeDirOpcao ?? opencorpHome();

  const tasks = new TaskStore({ agora });

  const executores: ExecutoresMencoes = executoresExternos ?? {
    rodar: async (agente: string, ordem: string, wsPath: string, gatilho?: Gatilho) => {
      // Spawn DETACHED: a execução delegada roda em processo próprio e
      // sobrevive à morte do processo que recebeu a menção (anti-stale).
      // O filho registra a exec, posta no chat da task e processa as suas
      // próprias menções — cada elo da cadeia é autônomo.
      const { spawnOpencorpDetached } = await import("./spawn-detached.js");
      const wsId = basename(wsPath);
      const extras = gatilho ? ["--gatilho", `${gatilho.tipo}:${gatilho.origem}`] : [];
      const r = spawnOpencorpDetached(
        ["agent", "run", agente, ordem, "--workspace", wsId, ...extras],
        { homeDir, nomeLog: `mencao-${agente}` },
      );
      return { id: `detached-pid-${r.pid ?? "0"}`, captura: `spawn detached (pid ${r.pid ?? "?"}, log ${r.log})` };
    },
  };

  const off = eventBus.on((ev) => {
    if (ev.tipo !== "task.mensagem") return;
    const { task_id, autor, menciona, ws_path } = ev.dados as {
      task_id: string;
      autor: string;
      menciona: string[];
      ws_path?: string;
    };

    if (!ws_path) return;
    if (!menciona || menciona.length === 0) return;

    for (const alvo of menciona) {
      if (!alvo.startsWith("agente:")) continue;
      if (alvo === autor) continue;

      const p = (async () => {
        try {
          // 1. Loop guard
          const chat = await tasks.chat(ws_path, task_id, 30);
          let loopCount = 0;
          const autoresPar = new Set([autor, alvo]);
          for (let i = chat.length - 1; i >= 0; i--) {
            const msg = chat[i];
            // Ignora mensagens de sistema do orquestrador (não contam para ping-pong)
            if (msg.autor === "orquestrador" && msg.tipo === "sistema") continue;
            const autorMsg = msg.autor;
            const mencionaMsg = msg.menciona ?? [];
            if (autoresPar.has(autorMsg) && mencionaMsg.some((m) => autoresPar.has(m) && m !== autorMsg)) {
              loopCount++;
            } else {
              break;
            }
          }
          if (loopCount >= 4) {
            const autorCurto = autor.replace(/^agente:/, "");
            const alvoCurto = alvo.replace(/^agente:/, "");
            await tasks.mensagem(ws_path, task_id, {
              autor: "orquestrador",
              corpo: `loop guard: ping-pong ${autorCurto} ↔ ${alvoCurto} sem progresso — pausado, escala humano`,
              tipo: "sistema",
            });
            return;
          }

          // 2. Rate guard
          const chatRate = await tasks.chat(ws_path, task_id, 500);
          const umaHoraAtras = new Date(agora().getTime() - 3600_000).toISOString();
          const msgsOrquestradorRecentes = chatRate.filter(
            (m) => m.autor === "orquestrador" && m.criado_em > umaHoraAtras
          );
          if (msgsOrquestradorRecentes.length >= max_mensagens_auto_h) {
            await tasks.mensagem(ws_path, task_id, {
              autor: "orquestrador",
              corpo: `rate guard: limite de ${max_mensagens_auto_h} mensagens automáticas/hora atingido na task — escala humano`,
              tipo: "sistema",
            });
            return;
          }

          // 3. Lease guard
          try {
            await tasks.travar(ws_path, task_id, "orquestrador", 30);
          } catch {
            const alvoCurto = alvo.replace(/^agente:/, "");
            await tasks.mensagem(ws_path, task_id, {
              autor: "orquestrador",
              corpo: `fila: task travada — menção de ${alvoCurto} aguarda lock no chat`,
              tipo: "sistema",
            });
            return;
          }

          // 4. Spawn com bundle de contexto
          const task = await tasks.obter(ws_path, task_id);
          const historico = await tasks.resumoChat(ws_path, task_id, 30);

          const alvoCurto = alvo.replace(/^agente:/, "");

          const linhasHistorico = historico.length === 0
            ? "(sem mensagens)"
            : historico.map((m) => {
                const primeiraLinha = m.corpo.split("\n")[0].slice(0, 120);
                return `${m.autor} (${m.tipo}): ${primeiraLinha}`;
              }).join("\n");

          const refsUnicas = new Set<string>();
          for (const m of historico) {
            for (const ref of m.refs ?? []) refsUnicas.add(ref);
          }
          const artefatos = refsUnicas.size === 0 ? "(nenhum)" : [...refsUnicas].join(", ");

          let descricaoBloco = "";
          if (task.descricao && task.descricao.trim().length > 0) {
            const desc = task.descricao.trim().slice(0, 300);
            descricaoBloco = `\n[descrição] ${desc}`;
          }

          const ordem = `Você é o agente "${alvoCurto}" atuando na task ${task_id} do quadro opencorp.

[tarefa] ${task.titulo} — coluna: ${task.coluna}, responsável: ${task.responsavel || "-"}${descricaoBloco}
[histórico] ${linhasHistorico}
[artefatos] ${artefatos}

[contrato] Poste sua resposta no chat da task executando:
opencorp task chat ${task_id} --msg "<sua resposta>" --autor agente:${alvoCurto} --tipo comentario
Se precisar de handoff, mencione @<outro-agente> dentro da mensagem. Ao concluir o trabalho, mova a task:
opencorp task move ${task_id} --coluna feito`;

          try {
            // gatilho "mencao" no ledger unificado: quem citou → quem foi citado
            const resultado = await executores.rodar(alvoCurto, ordem, ws_path, {
              tipo: "mencao",
              origem: `${task_id}/${alvoCurto}`,
            });
            await tasks.mensagem(ws_path, task_id, {
              autor: "orquestrador",
              corpo: `spawn ${alvoCurto} concluído (exec ${resultado.id})`,
              tipo: "sistema",
            });
          } catch (err) {
            await tasks.mensagem(ws_path, task_id, {
              autor: "orquestrador",
              corpo: `spawn do agente ${alvoCurto} falhou: ${err instanceof Error ? err.message : String(err)} — escala humano`,
              tipo: "sistema",
            });
          } finally {
            try {
              await tasks.liberar(ws_path, task_id, "orquestrador");
            } catch {
              // lock já pode ter expirado ou pertencido a outro
            }
          }
        } catch (err) {
          // Erro inesperado no processamento da menção
          console.error("[mention-runner] erro processando menção:", err);
        }
      })();

      emAndamento.add(p);
      void p.catch(() => undefined).finally(() => emAndamento.delete(p));
    }
  });
  return off;
}