/**
 * Rotas de Reuniões e Salas Multi-Agente — Extração Modular (MICRO-PASSO 10)
 */

import { gerarIdReuniao } from "../../core/contexts/meetings/meeting-manager.js";
import { MeetingError, RegistryError } from "../../core/shared/errors.js";
import type { RouteContext } from "./types.js";

export async function handleMeetingRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, url, rota, resolverWs, lerCorpo, enviar, meetings } = ctx;

  const ehMeetingBase = rota === "/meetings" || rota === "/reunioes";

  // ── 1. GET /meetings — lista reuniões (vivas + histórico) ──
  if (ehMeetingBase && req.method === "GET") {
    const ws = await resolverWs(url);
    const disco = await meetings.listar(ws.path);
    const vivas = meetings.salasVivas(ws.path);
    const idsVivas = new Set(vivas.map((v) => v.id));
    enviar(res, 200, [...vivas, ...disco.filter((s) => !idsVivas.has(s.id))]);
    return true;
  }

  // ── 2. POST /meetings — inicia nova reunião (modo autônomo / background) ──
  if (ehMeetingBase && req.method === "POST") {
    const ws = await resolverWs(url);
    const corpo = (await lerCorpo(req)) as { pauta?: string; agentes?: string; model?: string };
    const pauta = String(corpo.pauta ?? "").trim();
    if (pauta.length === 0) {
      enviar(res, 422, { erro: "pauta vazia — informe a pauta: POST /meetings { pauta }" });
      return true;
    }
    const novoId = gerarIdReuniao();
    void meetings
      .iniciar({ pauta, agentes: corpo.agentes, model: corpo.model, workspaceDir: ws.path, workspaceId: ws.id, id: novoId })
      .catch(() => undefined);
    enviar(res, 202, { status: "iniciado", id: novoId });
    return true;
  }

  // ── 3. POST /meetings/chat — cria reunião em modo Chat Interativo ──
  if ((rota === "/meetings/chat" || rota === "/reunioes/chat") && req.method === "POST") {
    const ws = await resolverWs(url);
    const corpo = (await lerCorpo(req)) as { pauta?: string; agentes?: string; model?: string };
    const pauta = String(corpo.pauta ?? "").trim();
    if (pauta.length === 0) {
      enviar(res, 422, { erro: "pauta obrigatória" });
      return true;
    }
    try {
      const sala = await meetings.criarSalaChat({
        pauta,
        agentes: corpo.agentes,
        model: corpo.model,
        workspaceDir: ws.path,
        workspaceId: ws.id,
      });
      enviar(res, 201, { ok: true, id: sala.id, status: sala.status, participantes: sala.participantes, pauta: sala.pauta });
    } catch (erro) {
      enviar(res, 400, { erro: erro instanceof Error ? erro.message : String(erro) });
    }
    return true;
  }

  // ── 4. Rotas com ID: /meetings/:id, /meetings/:id/mensagem, /meetings/:id/concluir, /meetings/:id/stop ──
  const mMeeting = /^\/(?:meetings|reunioes)\/([^/]+)(?:\/(mensagem|mensagens|concluir|encerrar|stop|parar))?$/.exec(rota);
  if (mMeeting) {
    const ws = await resolverWs(url);
    const meetingId = decodeURIComponent(mMeeting[1]!);
    const subrecurso = mMeeting[2];

    // Detalhes da sala: GET /meetings/:id
    if (!subrecurso && req.method === "GET") {
      try {
        enviar(res, 200, await meetings.estadoSala(ws.path, meetingId));
      } catch (erro) {
        if (erro instanceof MeetingError || erro instanceof RegistryError) {
          enviar(res, 404, { erro: `reunião "${meetingId}" não encontrada` });
          return true;
        }
        throw erro;
      }
      return true;
    }

    // Enviar mensagem: POST /meetings/:id/mensagem
    if ((subrecurso === "mensagem" || subrecurso === "mensagens") && req.method === "POST") {
      const corpo = (await lerCorpo(req)) as {
        mensagem: string;
        modo?: "sequencial" | "paralelo" | "direcionado";
        agente?: string;
        responder?: boolean;
      };
      const texto = String(corpo.mensagem ?? "").trim();
      if (!texto) {
        enviar(res, 400, { erro: "mensagem obrigatória" });
        return true;
      }

      try {
        const msgUsuario = await meetings.enviarMensagemGrupo(ws.path, meetingId, "usuario", texto);
        let respostas: Array<{ agente: string; texto: string; ts: string }> = [];
        if (corpo.responder !== false) {
          respostas = await meetings.responderGrupo(ws.path, meetingId, {
            modo: corpo.modo || "sequencial",
            agente: corpo.agente,
          });
        }
        const estadoAtual = await meetings.estadoSala(ws.path, meetingId);
        enviar(res, 200, { ok: true, mensagemUsuario: msgUsuario, respostas, estado: estadoAtual });
      } catch (erro) {
        enviar(res, 400, { erro: erro instanceof Error ? erro.message : String(erro) });
      }
      return true;
    }

    // Finalizar reunião: POST /meetings/:id/concluir
    if ((subrecurso === "concluir" || subrecurso === "encerrar") && req.method === "POST") {
      try {
        const resultado = await meetings.finalizarComAta(ws.path, meetingId);
        enviar(res, 200, { ok: true, status: resultado.sala.status, ata: resultado.ata, id: meetingId });
      } catch (erro) {
        enviar(res, 400, { erro: erro instanceof Error ? erro.message : String(erro) });
      }
      return true;
    }

    // Interromper reunião: POST /meetings/:id/stop
    if ((subrecurso === "stop" || subrecurso === "parar") && req.method === "POST") {
      if (meetings.temSalaViva(meetingId)) {
        if (meetings.salaVivaEmAndamento(meetingId)) {
          meetings.solicitarInterrupcao(meetingId);
          enviar(res, 200, { ok: true, detalhe: `interrupção solicitada para reunião ${meetingId}` });
          return true;
        }
        enviar(res, 409, { erro: "nenhuma reunião ativa neste servidor" });
        return true;
      }

      const reunioes = await meetings.listar(ws.path);
      const alvo = reunioes.find((r) => r.id === meetingId);
      if (!alvo) {
        enviar(res, 404, { erro: `reunião "${meetingId}" não encontrada` });
        return true;
      }
      if (alvo.status !== "em-andamento") {
        enviar(res, 409, { erro: "nenhuma reunião ativa neste servidor" });
        return true;
      }

      await meetings.encerrar(ws.path, meetingId, "encerrada pelo humano (meeting end)");
      enviar(res, 200, { ok: true, detalhe: `interrupção solicitada para reunião ${meetingId}` });
      return true;
    }
  }

  return false;
}
