import React, { useState, useEffect, useCallback, type FC } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Clock,
  ExternalLink,
  Play,
  RefreshCw,
  Terminal,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Workflow,
  ArrowRight,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { showToast } from "../../../shared/ui/Toast.js";

export interface HistoryRoutineDrawerProps {
  aberto: boolean;
  rotinaId: string | null;
  aoFechar: () => void;
  aoAbrirExecucao?: (execId: string) => void;
}

export interface RoutineDetalhe {
  id: string;
  nome: string;
  workspace?: string;
  wsPath?: string;
  expressao_cron?: string;
  agenda?: { tipo?: string; valor?: string };
  ativo?: boolean;
  proxima_exec?: string | null;
  ultima_exec?: string | null;
  comando?: string;
  args?: any[];
  flowId?: string;
}

export interface RoutineDisparoItem {
  id: string;
  execucao_id?: string;
  iniciado_em?: string;
  quando?: string;
  status: string;
  duracao_ms?: number;
  resultado?: string;
  erro?: string;
  pulado?: boolean;
  agente?: string;
  ordem?: string;
}

function formatarDataHora(dataIso?: string | null): string {
  if (!dataIso) return "—";
  try {
    const d = new Date(dataIso);
    if (isNaN(d.getTime())) return dataIso;
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dataIso;
  }
}

function formatarDistanciaAtraso(dataIso: string): string | null {
  try {
    const d = new Date(dataIso).getTime();
    const agora = Date.now();
    if (isNaN(d) || d >= agora) return null;
    const diffSec = Math.floor((agora - d) / 1000);
    if (diffSec < 60) return `${diffSec}s atrás`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}min atrás`;
    const diffH = Math.floor(diffMin / 60);
    return `${diffH}h atrás`;
  } catch {
    return null;
  }
}

function traduzirCron(cron?: string): string {
  if (!cron) return "Não configurado";
  const c = cron.trim();
  if (c === "* * * * *") return "A cada minuto";
  if (c === "*/5 * * * *") return "A cada 5 minutos";
  if (c === "*/10 * * * *") return "A cada 10 minutos";
  if (c === "*/15 * * * *") return "A cada 15 minutos";
  if (c === "*/30 * * * *") return "A cada 30 minutos";
  if (c === "0 * * * *") return "A cada hora (no minuto 0)";
  if (c === "0 0 * * *") return "Diariamente à meia-noite";
  if (c === "0 8 * * *") return "Diariamente às 08:00";
  if (c === "0 9 * * *") return "Diariamente às 09:00";
  if (c === "0 12 * * *") return "Diariamente às 12:00";
  if (c === "0 18 * * *") return "Diariamente às 18:00";
  if (c === "0 0 * * 1") return "Semanalmente na segunda-feira";
  return c;
}

export const HistoryRoutineDrawer: FC<HistoryRoutineDrawerProps> = ({
  aberto,
  rotinaId,
  aoFechar,
  aoAbrirExecucao,
}) => {
  const navigate = useNavigate();
  const { client, workspaceId, tratarErro } = useOpenCorp();

  const [rotina, setRotina] = useState<RoutineDetalhe | null>(null);
  const [disparos, setDisparos] = useState<RoutineDisparoItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [executandoAgora, setExecutandoAgora] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const wsEfetivo = workspaceId || undefined;

  const carregarDadosRotina = useCallback(async (id: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const cleanId = id.replace(/^(job-|rotina-|flow-)/, "");
      const headers = wsEfetivo ? { "x-opencorp-workspace": wsEfetivo } : undefined;

      // 1. Buscar a lista de agendamentos em /schedules
      const agendamentos = await client.http.get<any[]>("/schedules", { headers }).catch(() => []);
      const agendamento = Array.isArray(agendamentos)
        ? agendamentos.find(
            (a) =>
              a.id === id ||
              a.id === cleanId ||
              a.nome === id ||
              a.nome === cleanId ||
              String(a.id).includes(cleanId)
          )
        : null;

      // Se encontrou ou se monta a partir do id
      const detalhe: RoutineDetalhe = agendamento
        ? {
            id: agendamento.id,
            nome: agendamento.nome || agendamento.id,
            workspace: agendamento.workspace,
            expressao_cron: agendamento.expressao_cron || agendamento.agenda?.valor,
            agenda: agendamento.agenda,
            ativo: agendamento.ativo !== false,
            proxima_exec: agendamento.proxima_exec || null,
            ultima_exec: agendamento.ultima_exec || null,
            comando: agendamento.comando || (agendamento.args ? agendamento.args.join(" ") : undefined),
            args: agendamento.args,
            flowId: agendamento.id,
          }
        : {
            id: cleanId,
            nome: id,
            expressao_cron: undefined,
            ativo: true,
            flowId: cleanId,
          };

      setRotina(detalhe);

      // 2. Buscar histórico de execuções vinculadas ao fluxo/rotina
      const flowIdAlvo = detalhe.flowId || cleanId;
      const [execsFlow, runsSched] = await Promise.all([
        client.http.get<any[]>(`/flows/${encodeURIComponent(flowIdAlvo)}/execucoes`, { headers }).catch(() => []),
        client.http.get<any[]>(`/schedules/${encodeURIComponent(cleanId)}/runs`, { headers }).catch(() => []),
      ]);

      const listaDisparos: RoutineDisparoItem[] = [];

      if (Array.isArray(execsFlow) && execsFlow.length > 0) {
        for (const ef of execsFlow) {
          listaDisparos.push({
            id: ef.execId || ef.id || `exec-${Math.random()}`,
            execucao_id: ef.execId || ef.id,
            iniciado_em: ef.iniciado_em || ef.quando || ef.inicio,
            status: ef.status || "concluido",
            duracao_ms: ef.duracao_ms,
            resultado: ef.contextoFinal ? String(ef.contextoFinal).slice(0, 150) : undefined,
            erro: ef.erro || (ef.status === "erro" ? "Falha na execução" : undefined),
            agente: ef.agente || `flow:${flowIdAlvo}`,
          });
        }
      }

      if (Array.isArray(runsSched) && runsSched.length > 0) {
        for (const rs of runsSched) {
          if (!listaDisparos.some((ld) => ld.id === String(rs.id))) {
            listaDisparos.push({
              id: String(rs.id),
              execucao_id: rs.execucao_id || rs.exec_id,
              iniciado_em: rs.iniciado_em || rs.quando,
              status: rs.pulado ? "pulado" : rs.erro ? "erro" : "sucesso",
              duracao_ms: rs.duracao_ms,
              resultado: rs.resultado,
              erro: rs.erro,
              pulado: rs.pulado,
            });
          }
        }
      }

      setDisparos(listaDisparos);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao carregar detalhes da rotina";
      setErro(msg);
      tratarErro(err, "Falha ao carregar rotina do scheduler");
    } finally {
      setCarregando(false);
    }
  }, [client, wsEfetivo, tratarErro]);

  useEffect(() => {
    if (aberto && rotinaId) {
      void carregarDadosRotina(rotinaId);
    } else {
      setRotina(null);
      setDisparos([]);
      setErro(null);
    }
  }, [aberto, rotinaId, carregarDadosRotina]);

  const handleExecutarAgora = async () => {
    if (!rotina) return;
    setExecutandoAgora(true);
    try {
      const flowId = rotina.flowId || rotina.id.replace(/^(job-|rotina-|flow-)/, "");
      const headers = wsEfetivo ? { "x-opencorp-workspace": wsEfetivo } : undefined;

      // Dispara via POST /flows/:id/run ou fallback para /schedules/:id/run
      let disparado = false;
      try {
        const res = await client.http.post<any>(
          `/flows/${encodeURIComponent(flowId)}/run`,
          { gatilho: "manual:historico-rotina" },
          { headers }
        );
        disparado = true;
        showToast(
          `Rotina iniciada com sucesso! ${res?.exec_id ? `Execução: ${res.exec_id}` : ""}`,
          "sucesso"
        );
        if (res?.exec_id && aoAbrirExecucao) {
          aoFechar();
          aoAbrirExecucao(res.exec_id);
          return;
        }
      } catch {
        // Fallback para schedules
        await client.http.post(`/schedules/${encodeURIComponent(flowId)}/run`, {}, { headers });
        disparado = true;
        showToast("Rotina disparada no scheduler com sucesso.", "sucesso");
      }

      if (disparado) {
        await carregarDadosRotina(rotina.id);
      }
    } catch (err) {
      tratarErro(err, "Falha ao disparar execução imediata da rotina");
    } finally {
      setExecutandoAgora(false);
    }
  };

  if (!aberto || !rotinaId) return null;

  const atraso = rotina?.proxima_exec ? formatarDistanciaAtraso(rotina.proxima_exec) : null;
  const cronLegivel = traduzirCron(rotina?.expressao_cron);

  return (
    <>
      {/* Overlay Escuro com Desfoque */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity"
        onClick={aoFechar}
      />

      {/* Gaveta Lateral Direita Deslizante */}
      <aside className="fixed inset-y-0 right-0 w-full sm:w-[560px] md:w-[600px] max-w-full z-50 bg-zinc-950/95 backdrop-blur-md border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 select-none">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-950/60 border border-amber-800/50 text-amber-400 shrink-0">
              <Clock size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-zinc-400 font-bold truncate">
                  {rotina?.id || rotinaId}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border flex items-center gap-1 ${
                    rotina?.ativo
                      ? "bg-emerald-950/60 text-emerald-400 border-emerald-800"
                      : "bg-zinc-800/80 text-zinc-400 border-zinc-700"
                  }`}
                >
                  {rotina?.ativo ? (
                    <>
                      <PlayCircle size={10} />
                      <span>Ativa</span>
                    </>
                  ) : (
                    <>
                      <PauseCircle size={10} />
                      <span>Pausada</span>
                    </>
                  )}
                </span>
              </div>
              <h2 className="text-sm font-bold text-zinc-100 truncate mt-0.5">
                {rotina?.nome || (carregando ? "Carregando rotina..." : "Rotina Agendada")}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void carregarDadosRotina(rotinaId)}
              disabled={carregando}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 transition-colors cursor-pointer disabled:opacity-50"
              title="Atualizar dados da rotina"
            >
              <RefreshCw size={14} className={carregando ? "animate-spin text-amber-400" : ""} />
            </button>
            <button
              type="button"
              onClick={aoFechar}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 transition-colors cursor-pointer"
              title="Fechar (ESC)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-5 space-y-4 scrollbar-thin">
          {carregando && !rotina ? (
            <div className="py-20 text-center text-xs text-zinc-400 space-y-2">
              <RefreshCw size={22} className="animate-spin text-amber-400 mx-auto" />
              <p>Carregando agendamento e histórico de disparos...</p>
            </div>
          ) : erro ? (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-rose-400 shrink-0" />
                <span>{erro}</span>
              </div>
              <button
                type="button"
                onClick={() => void carregarDadosRotina(rotinaId)}
                className="px-2.5 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-800 text-rose-100 text-xs font-medium cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : rotina ? (
            <>
              {/* Cards de Configuração do Agendamento */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {/* Expressão Cron */}
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
                  <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 block mb-0.5">
                    Expressão Cron
                  </span>
                  <div className="font-mono text-zinc-200 font-bold">
                    {rotina.expressao_cron || rotina.agenda?.valor || "Manual"}
                  </div>
                  <div className="text-[10px] text-amber-400/90 truncate mt-0.5" title={cronLegivel}>
                    {cronLegivel}
                  </div>
                </div>

                {/* Última Execução */}
                <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
                  <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 block mb-0.5">
                    Última Execução
                  </span>
                  <div className="font-mono text-zinc-200">
                    {formatarDataHora(rotina.ultima_exec)}
                  </div>
                </div>

                {/* Próxima Execução */}
                <div
                  className={`p-2.5 rounded-xl border ${
                    atraso
                      ? "bg-amber-950/30 border-amber-600/50"
                      : "bg-zinc-900/60 border-zinc-800/80"
                  }`}
                >
                  <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 block mb-0.5">
                    Próxima Execução
                  </span>
                  <div className="font-mono text-zinc-200">
                    {formatarDataHora(rotina.proxima_exec)}
                  </div>
                  {atraso && (
                    <span className="inline-block mt-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      atrasada ({atraso})
                    </span>
                  )}
                </div>
              </div>

              {/* Informações de Execução / Fluxo */}
              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500 block">
                    Modo de Execução
                  </span>
                  {rotina.flowId && (
                    <button
                      type="button"
                      onClick={() => {
                        aoFechar();
                        navigate(`/fluxos?fluxo=${encodeURIComponent(rotina.flowId!)}`);
                      }}
                      className="text-[11px] font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Workflow size={12} />
                      <span>Abrir editor de fluxo</span>
                      <ExternalLink size={10} />
                    </button>
                  )}
                </div>

                <div className="p-2 rounded-lg bg-black/40 border border-zinc-800/80 font-mono text-[11px] text-zinc-300 break-all select-text">
                  {rotina.comando ||
                    `open-corp run flow ${rotina.flowId || rotina.id} --gatilho=cron`}
                </div>
              </div>

              {/* Histórico de Disparos / Execuções */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                  <span className="flex items-center gap-1.5">
                    <Terminal size={14} className="text-amber-400" />
                    <span>Disparos &amp; Execuções Realizadas</span>
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
                    {disparos.length} {disparos.length === 1 ? "registro" : "registros"}
                  </span>
                </div>

                {disparos.length === 0 ? (
                  <div className="p-4 rounded-xl bg-zinc-900/30 border border-zinc-850/80 text-center text-xs text-zinc-500">
                    Nenhum disparo registrado para esta rotina ainda.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {disparos.map((disp) => {
                      const isOk =
                        disp.status === "concluido" ||
                        disp.status === "ok" ||
                        disp.status === "sucesso";
                      const isFalhou =
                        disp.status === "falhou" ||
                        disp.status === "erro" ||
                        Boolean(disp.erro);
                      const isExec = disp.status === "executando";
                      const isPulado = disp.pulado;

                      return (
                        <div
                          key={disp.id}
                          onClick={() => {
                            if (disp.execucao_id && aoAbrirExecucao) {
                              aoAbrirExecucao(disp.execucao_id);
                            }
                          }}
                          className={`p-3 rounded-xl bg-zinc-900/70 border border-zinc-800/80 transition-all flex items-center justify-between gap-3 group ${
                            disp.execucao_id ? "hover:border-amber-500/60 cursor-pointer" : ""
                          }`}
                          title={
                            disp.execucao_id
                              ? `Inspecionar execução ${disp.execucao_id}`
                              : `Disparo ${disp.id}`
                          }
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${
                                  isPulado
                                    ? "bg-zinc-500"
                                    : isOk
                                    ? "bg-emerald-400"
                                    : isFalhou
                                    ? "bg-rose-400"
                                    : isExec
                                    ? "bg-amber-400 animate-pulse"
                                    : "bg-zinc-400"
                                }`}
                              />
                              <span className="font-mono text-xs font-bold text-zinc-200">
                                {formatarDataHora(disp.iniciado_em || disp.quando)}
                              </span>
                              {disp.execucao_id && (
                                <span className="text-[10px] font-mono text-zinc-500 truncate">
                                  #{disp.execucao_id}
                                </span>
                              )}
                            </div>

                            <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-2">
                              <span className="capitalize">{disp.status}</span>
                              {disp.duracao_ms !== undefined && (
                                <span>· {(disp.duracao_ms / 1000).toFixed(1)}s</span>
                              )}
                              {disp.erro && (
                                <span className="text-rose-400 truncate max-w-[200px]">
                                  · {disp.erro}
                                </span>
                              )}
                              {disp.resultado && !disp.erro && (
                                <span className="text-zinc-500 truncate max-w-[200px]">
                                  · {disp.resultado}
                                </span>
                              )}
                            </div>
                          </div>

                          {disp.execucao_id && (
                            <div className="flex items-center gap-1 text-[11px] font-mono text-amber-400 opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0">
                              <span>Inspecionar</span>
                              <ArrowRight size={12} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Rodapé da Gaveta com Botão de Disparo Imediato */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExecutarAgora}
              disabled={executandoAgora || carregando}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
              title="Disparar rotina imediatamente"
            >
              {executandoAgora ? (
                <>
                  <RefreshCw size={13} className="animate-spin text-amber-400" />
                  <span>Disparando...</span>
                </>
              ) : (
                <>
                  <Play size={13} className="fill-amber-400 text-amber-400" />
                  <span>Executar Agora</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                aoFechar();
                navigate("/agenda");
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-medium transition-colors cursor-pointer"
              title="Abrir página da Agenda 24h"
            >
              <Calendar size={13} />
              <span>Ver na Agenda</span>
            </button>
          </div>

          <button
            type="button"
            onClick={aoFechar}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </aside>
    </>
  );
};
