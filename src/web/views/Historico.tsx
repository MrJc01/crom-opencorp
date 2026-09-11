import { type Component, createSignal, onMount, onCleanup, createEffect, For, Show } from "solid-js";
import {
  History,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  X,
  Terminal,
  Filter,
  Copy,
  Download,
  ListTodo,
  MessageSquare,
  Zap,
  ArrowRight,
  ExternalLink,
  StopCircle,
  Settings,
  RotateCcw,
  Activity,
  Wrench,
  Brain,
  ChevronDown,
  ChevronRight,
  Gauge,
} from "lucide-solid";
import { useSearchParams, useNavigate } from "@solidjs/router";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { fetchApi, wsAtivo } from "../lib/context";
import { showToast } from "../ui/Toast";
import { LogChatViewer } from "../components/chat/LogChatViewer";

export interface ItemHistorico {
  id: string;
  tipo: "execucao" | "task" | "rotina" | "conversa";
  titulo?: string;
  ordem?: string;
  agente?: string;
  quando?: string | null;
  inicio?: string | null;
  status?: string;
  gatilho?: { tipo: string; origem: string };
  duracao_ms?: number | null;
  custo_usd?: number | null;
  modelo?: string;
}

export interface AcaoAgente {
  id: string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string | null;
  sessao_id: string;
  agente: string;
  modelo: string;
  workspace: string;
  tipo_acao: "tool" | "pensamento" | "resposta" | "erro";
  ferramenta?: string | null;
  comando_resumo?: string | null;
  input_json?: string | null;
  output_json?: string | null;
  status: "sucesso" | "falhou" | "timeout" | "abortado";
  duracao_ms?: number;
  tokens_prompt?: number;
  tokens_saida?: number;
  custo_usd?: number;
  erro?: string | null;
  criado_em: string;
}

export interface ResumoTelemetria {
  total_acoes: number;
  total_falhas: number;
  ferramentas: Array<{ ferramenta: string; total: number; falhas: number; media_ms: number; custo_usd: number }>;
  agentes: Array<{ agente: string; total: number; falhas: number; media_ms: number; custo_usd: number }>;
}

export const HistoricoView: Component = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [itens, setItens] = createSignal<ItemHistorico[]>([]);
  const [carregando, setCarregando] = createSignal(false);
  const [runSelecionado, setRunSelecionado] = createSignal<any | null>(null);
  const [logRun, setLogRun] = createSignal<string>("");
  const [carregandoLog, setCarregandoLog] = createSignal(false);
  const [modoVisualizacao, setModoVisualizacao] = createSignal<"chat" | "terminal" | "telemetria">("chat");
  const [encerrando, setEncerrando] = createSignal(false);
  const [reenviando, setReenviando] = createSignal(false);
  const [tempoRealAtivo, setTempoRealAtivo] = createSignal(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = createSignal<string>("");

  // Estados de Telemetria e Spans
  const [acoesRun, setAcoesRun] = createSignal<AcaoAgente[]>([]);
  const [carregandoAcoes, setCarregandoAcoes] = createSignal(false);
  const [acaoAbertaId, setAcaoAbertaId] = createSignal<string | null>(null);
  const [resumoTelemetria, setResumoTelemetria] = createSignal<ResumoTelemetria | null>(null);
  const [mostrarCardsTelemetria, setMostrarCardsTelemetria] = createSignal(true);

  let liveLogInterval: any = null;
  let timerTempoReal: any = null;

  const filtroTipo = () => (searchParams.tipo as string) || "tudo";
  const filtroStatus = () => (searchParams.status as string) || "todos";
  const filtroAgente = () => (searchParams.agente as string) || "todos";

  const carregarHistorico = async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      // Buscar do endpoint unificado /historico que agrupa execucoes, tasks, rotinas e conversas
      const dados = await fetchApi<ItemHistorico[]>("/historico?limite=200");
      let listaFinal: ItemHistorico[] = [];
      if (Array.isArray(dados) && dados.length > 0) {
        listaFinal = dados;
      } else {
        // Fallback para /execucoes caso /historico retorne vazio
        const execs = await fetchApi<any[]>("/execucoes?limite=100");
        listaFinal = (execs || []).map((e) => ({
          ...e,
          tipo: "execucao",
          quando: e.inicio,
          titulo: e.ordem || e.id,
        }));
      }
      setItens(listaFinal);
      setUltimaAtualizacao(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );

      // Carregar resumo de telemetria agregado
      try {
        const resTelemetria = await fetchApi<ResumoTelemetria>("/telemetria/resumo");
        if (resTelemetria) setResumoTelemetria(resTelemetria);
      } catch {}

      // Se há um run aberto na URL, atualiza seus dados reais
      const runAtual = searchParams.run as string | undefined;
      if (runAtual) {
        const itemReal = listaFinal.find((x) => x.id === runAtual);
        if (itemReal) {
          setRunSelecionado((prev: any) => (prev ? { ...prev, ...itemReal } : itemReal));
          if (itemReal.status === "executando" && !liveLogInterval) {
            let pollCount = 0;
            liveLogInterval = setInterval(async () => {
              pollCount++;
              const atualizado = await buscarLog(runAtual);
              setLogRun(atualizado);

              if (pollCount % 2 === 0) {
                try {
                  const reg = await fetchApi<{ meta?: { extras?: any } }>(
                    `/registries/execucoes/${encodeURIComponent(runAtual)}`
                  );
                  const st = reg?.meta?.extras?.status;
                  if (st && st !== "executando") {
                    setRunSelecionado((prev: any) => (prev ? { ...prev, status: st } : null));
                    if (liveLogInterval) {
                      clearInterval(liveLogInterval);
                      liveLogInterval = null;
                    }
                  }
                } catch {}
              }
            }, 2000);
          } else if (itemReal.status !== "executando" && liveLogInterval) {
            clearInterval(liveLogInterval);
            liveLogInterval = null;
          }
        }
      }
    } catch {
      try {
        const execs = await fetchApi<any[]>("/execucoes?limite=50");
        const mapeados: ItemHistorico[] = (execs || []).map((e) => ({
          ...e,
          tipo: "execucao",
          quando: e.inicio,
          titulo: e.ordem || e.id,
        }));
        setItens(mapeados);
        setUltimaAtualizacao(
          new Date().toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        );
      } catch {}
    } finally {
      if (!silencioso) setCarregando(false);
    }
  };

  const buscarLog = async (runId: string) => {
    try {
      const res = await fetchApi<{ id: string; log: string }>(
        `/sessions/${encodeURIComponent(runId)}/log`
      );
      if (res?.log && res.log.trim()) return res.log;
    } catch {}

    try {
      const reg = await fetchApi<{ conteudo?: string }>(
        `/registries/execucoes/${encodeURIComponent(runId)}`
      );
      if (reg?.conteudo && reg.conteudo.trim()) return reg.conteudo;
    } catch {}

    return "(Nenhuma saída de log capturada para esta execução)";
  };

  const abrirLogPorId = async (runId: string) => {
    setCarregandoLog(true);
    setLogRun("Carregando log da execução...");

    let r = itens().find((item) => item.id === runId);
    if (!r) {
      try {
        const h = await fetchApi<ItemHistorico[]>("/historico?limite=100");
        if (Array.isArray(h)) {
          r = h.find((item) => item.id === runId);
        }
      } catch {}
      if (!r) {
        try {
          const reg = await fetchApi<{ meta?: { criado_por?: string; descricao?: string; criado_em?: string; extras?: any } }>(
            `/registries/execucoes/${encodeURIComponent(runId)}`
          );
          if (reg?.meta) {
            const ex = reg.meta.extras || {};
            r = {
              id: runId,
              tipo: "execucao",
              agente: reg.meta.criado_por || ex.agente || "executor-padrao",
              status: ex.status || "concluido",
              quando: reg.meta.criado_em,
              ordem: ex.ordem || reg.meta.descricao?.replace(/^Ordem:\s*/i, ""),
              modelo: ex.modelo,
              duracao_ms: ex.duracao_ms,
              custo_usd: ex.custo_usd,
            };
          }
        } catch {}
      }
      if (!r) {
        r = { id: runId, tipo: "execucao", agente: "agente", status: "registrada" };
      }
    } else if (!r.ordem) {
      try {
        const reg = await fetchApi<{ meta?: { descricao?: string; extras?: any } }>(
          `/registries/execucoes/${encodeURIComponent(runId)}`
        );
        if (reg?.meta) {
          const ordem = reg.meta.extras?.ordem || reg.meta.descricao?.replace(/^Ordem:\s*/i, "");
          if (ordem) {
            r = { ...r, ordem };
          }
        }
      } catch {}
    }
    setRunSelecionado(r);

    const textoLog = await buscarLog(runId);
    setLogRun(textoLog);
    setCarregandoLog(false);

    // Carregar ações/spans granulares de telemetria para esta sessão
    setCarregandoAcoes(true);
    fetchApi<AcaoAgente[]>(`/acoes/${encodeURIComponent(runId)}`)
      .then((acoes) => setAcoesRun(Array.isArray(acoes) ? acoes : []))
      .catch(() => setAcoesRun([]))
      .finally(() => setCarregandoAcoes(false));

    if (liveLogInterval) {
      clearInterval(liveLogInterval);
      liveLogInterval = null;
    }

    if (r.status === "executando") {
      let pollCount = 0;
      liveLogInterval = setInterval(async () => {
        pollCount++;
        const atualizado = await buscarLog(runId);
        setLogRun(atualizado);

        if (pollCount % 2 === 0) {
          try {
            const reg = await fetchApi<{ meta?: { extras?: any } }>(
              `/registries/execucoes/${encodeURIComponent(runId)}`
            );
            const st = reg?.meta?.extras?.status;
            if (st && st !== "executando") {
              setRunSelecionado((prev: any) => prev ? { ...prev, status: st } : null);
              if (liveLogInterval) {
                clearInterval(liveLogInterval);
                liveLogInterval = null;
              }
              void carregarHistorico();
            }
          } catch {}
        }
      }, 2500);
    }
  };

  const selecionarItem = (item: ItemHistorico) => {
    if (item.tipo === "task") {
      navigate(`/tasks?task=${encodeURIComponent(item.id)}`);
      return;
    }
    if (item.tipo === "conversa") {
      navigate(`/secretario`);
      return;
    }
    setSearchParams({ run: item.id });
  };

  const fecharLog = () => {
    if (liveLogInterval) {
      clearInterval(liveLogInterval);
      liveLogInterval = null;
    }
    setRunSelecionado(null);
    setLogRun("");
    setAcoesRun([]);
    setAcaoAbertaId(null);
    setSearchParams({ run: undefined });
  };

  const copiarLog = () => {
    navigator.clipboard.writeText(logRun());
    showToast("Log copiado para a área de transferência!", "sucesso");
  };

  const baixarLog = () => {
    const blob = new Blob([logRun()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${runSelecionado()?.id || "exec"}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const encerrarExecucao = async () => {
    const run = runSelecionado();
    if (!run) return;
    setEncerrando(true);
    try {
      const res = await fetchApi<{ ok?: boolean; erro?: string; mensagem?: string }>(
        `/execucoes/${encodeURIComponent(run.id)}/cancelar`,
        { method: "POST" } as any
      );
      if (res && res.ok === false) {
        showToast(`Falha ao encerrar: ${res.erro || "Operação não concluída"}`, "erro");
        return;
      }
      showToast(res?.mensagem || "Execução encerrada com sucesso", "sucesso");
      setRunSelecionado({ ...run, status: "cancelado" });
      if (liveLogInterval) {
        clearInterval(liveLogInterval);
        liveLogInterval = null;
      }
      void carregarHistorico();
    } catch (e: any) {
      showToast(`Erro ao encerrar execução: ${e.message || String(e)}`, "erro");
    } finally {
      setEncerrando(false);
    }
  };

  const reenviarExecucao = async () => {
    const run = runSelecionado();
    if (!run) return;
    setReenviando(true);
    try {
      const res = await fetchApi<{
        ok?: boolean;
        exec_id?: string;
        exec_id_original?: string;
        agente?: string;
        ordem?: string;
        mensagem?: string;
        erro?: string;
      }>(
        `/execucoes/${encodeURIComponent(run.id)}/retry`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" } as any
      );
      if (res?.erro) {
        showToast(`Falha ao reenviar: ${res.erro}`, "erro");
        return;
      }
      showToast(
        res?.mensagem || `Execução reenviada como ${res?.exec_id ?? "?"}`,
        "sucesso"
      );
      // Navegar para a nova execução
      if (res?.exec_id) {
        fecharLog();
        void carregarHistorico();
        // Abre o novo run após breve delay para dar tempo do historico atualizar
        setTimeout(() => {
          setSearchParams({ run: res.exec_id });
        }, 1200);
      }
    } catch (e: any) {
      showToast(`Erro ao reenviar execução: ${e.message || String(e)}`, "erro");
    } finally {
      setReenviando(false);
    }
  };

  // Reagir a alteração em ?run=
  createEffect(() => {
    const runParam = searchParams.run as string | undefined;
    if (runParam) {
      void abrirLogPorId(runParam);
    } else {
      if (liveLogInterval) {
        clearInterval(liveLogInterval);
        liveLogInterval = null;
      }
      setRunSelecionado(null);
      setLogRun("");
    }
  });

  // Reagir a troca de workspace selecionado
  createEffect(() => {
    wsAtivo();
    void carregarHistorico(false);
  });

  onMount(() => {
    void carregarHistorico(false);

    // Polling inteligente em tempo real: 2.5s se ativo na tela, 6s se em background
    const iniciarPolling = () => {
      if (timerTempoReal) clearInterval(timerTempoReal);
      const intervaloMs = typeof document !== "undefined" && document.hidden ? 6000 : 2500;
      timerTempoReal = setInterval(() => {
        if (tempoRealAtivo()) {
          void carregarHistorico(true);
        }
      }, intervaloMs);
    };

    iniciarPolling();

    const aoMudarVisibilidade = () => {
      iniciarPolling();
      if (typeof document !== "undefined" && !document.hidden && tempoRealAtivo()) {
        void carregarHistorico(true);
      }
    };

    const aoFocarJanela = () => {
      if (tempoRealAtivo()) {
        void carregarHistorico(true);
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", aoMudarVisibilidade);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", aoFocarJanela);
    }

    const aoPressionarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" && runSelecionado()) {
        fecharLog();
      }
    };
    window.addEventListener("keydown", aoPressionarTecla);

    onCleanup(() => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", aoFocarJanela);
        window.removeEventListener("keydown", aoPressionarTecla);
      }
      if (timerTempoReal) clearInterval(timerTempoReal);
      if (liveLogInterval) clearInterval(liveLogInterval);
    });
  });

  const itensFiltrados = () => {
    const tp = filtroTipo();
    const st = filtroStatus();
    const ag = filtroAgente();

    return itens().filter((i) => {
      if (tp !== "tudo" && i.tipo !== tp) return false;
      if (st !== "todos" && i.status && i.status !== st) return false;
      if (ag !== "todos" && i.agente && i.agente !== ag) return false;
      return true;
    });
  };

  const agentesUnicos = () => {
    const set = new Set<string>();
    itens().forEach((i) => i.agente && set.add(i.agente));
    return Array.from(set);
  };

  const badgeTipo = (tipo: string) => {
    switch (tipo) {
      case "execucao":
        return <span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-700/40 text-zinc-300 border border-zinc-600/40">EXECUÇÃO</span>;
      case "task":
        return <span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">TASK</span>;
      case "conversa":
        return <span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">CONVERSA</span>;
      default:
        return <span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-800 text-zinc-300">EVENTO</span>;
    }
  };

  return (
    <div class="flex flex-col h-full w-full overflow-hidden p-6 space-y-4 bg-zinc-950">
      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Histórico de Atividades</h1>
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300">
              {itensFiltrados().length} de {itens().length} registros
            </span>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5">
            Linha do tempo auditável de cada chamada a LLM, tarefa concluída, rotina 24h e decisão do Secretário.
          </p>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          {/* Tabs Filtro por Tipo */}
          <div class="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setSearchParams({ tipo: undefined })}
              class={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filtroTipo() === "tudo" ? "bg-zinc-800 text-zinc-100 font-semibold" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Tudo
            </button>
            <button
              onClick={() => setSearchParams({ tipo: "execucao" })}
              class={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filtroTipo() === "execucao" ? "bg-zinc-800 text-zinc-100 font-semibold" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Execuções
            </button>
            <button
              onClick={() => setSearchParams({ tipo: "task" })}
              class={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filtroTipo() === "task" ? "bg-zinc-800 text-zinc-100 font-semibold" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Tasks
            </button>
            <button
              onClick={() => setSearchParams({ tipo: "conversa" })}
              class={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filtroTipo() === "conversa" ? "bg-zinc-800 text-zinc-100 font-semibold" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Conversas
            </button>
          </div>

          {/* Filtro Status */}
          <div class="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs">
            <Filter size={12} class="text-zinc-400" />
            <select
              class="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer"
              value={filtroStatus()}
              onChange={(e) =>
                setSearchParams({ status: e.currentTarget.value === "todos" ? undefined : e.currentTarget.value })
              }
            >
              <option value="todos" class="bg-zinc-900">Todos status</option>
              <option value="executando" class="bg-zinc-900">Executando</option>
              <option value="concluido" class="bg-zinc-900">Concluído</option>
              <option value="falhou" class="bg-zinc-900">Falhou</option>
              <option value="feito" class="bg-zinc-900">Feito (Task)</option>
              <option value="hitl_pendente" class="bg-zinc-900">HITL Pendente</option>
            </select>
          </div>

          {/* Filtro Agente */}
          <div class="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs">
            <select
              class="bg-transparent text-xs text-zinc-300 focus:outline-none cursor-pointer"
              value={filtroAgente()}
              onChange={(e) =>
                setSearchParams({ agente: e.currentTarget.value === "todos" ? undefined : e.currentTarget.value })
              }
            >
              <option value="todos" class="bg-zinc-900">Todos agentes</option>
              <For each={agentesUnicos()}>
                {(ag) => (
                  <option value={ag} class="bg-zinc-900">
                    @{ag}
                  </option>
                )}
              </For>
            </select>
          </div>

          {/* Badge Tempo Real */}
          <button
            type="button"
            onClick={() => setTempoRealAtivo(!tempoRealAtivo())}
            class={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
              tempoRealAtivo()
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
            title={
              tempoRealAtivo()
                ? `Tempo Real ATIVO (atualizando a cada 2.5s). Clique para pausar.`
                : `Tempo Real PAUSADO. Clique para reativar auto-atualização.`
            }
          >
            <span class="relative flex h-2 w-2">
              <Show when={tempoRealAtivo()}>
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </Show>
              <Show when={!tempoRealAtivo()}>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-zinc-600"></span>
              </Show>
            </span>
            <span class="font-medium">{tempoRealAtivo() ? "Ao Vivo" : "Pausado"}</span>
            <Show when={tempoRealAtivo() && ultimaAtualizacao()}>
              <span class="text-[10px] text-emerald-500/70 font-mono hidden md:inline ml-0.5">
                {ultimaAtualizacao()}
              </span>
            </Show>
          </button>

          <Button size="sm" variant="ghost" onClick={() => carregarHistorico(false)} title="Atualizar agora">
            <RefreshCw size={13} class={carregando() ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {/* Banner de Telemetria e Observabilidade */}
      <Show when={resumoTelemetria() && resumoTelemetria()!.total_acoes > 0}>
        <div class="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 text-xs flex-shrink-0">
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="flex items-center gap-2">
              <Activity size={14} class="text-sky-400" />
              <span class="font-semibold text-zinc-200">Telemetria de Agentes & Ferramentas</span>
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                {resumoTelemetria()!.total_acoes} ações registradas
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMostrarCardsTelemetria(!mostrarCardsTelemetria())}
              class="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
            >
              <span>{mostrarCardsTelemetria() ? "Ocultar métricas" : "Ver métricas"}</span>
              <Show when={mostrarCardsTelemetria()} fallback={<ChevronRight size={12} />}>
                <ChevronDown size={12} />
              </Show>
            </button>
          </div>

          <Show when={mostrarCardsTelemetria()}>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1.5 border-t border-zinc-800/60">
              <div class="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/60">
                <span class="text-[10px] text-zinc-500 uppercase tracking-wider font-mono block">Taxa de Sucesso</span>
                <div class="flex items-baseline gap-1.5 mt-0.5">
                  <span class="text-lg font-bold text-zinc-100">
                    {resumoTelemetria()!.total_acoes > 0
                      ? (((resumoTelemetria()!.total_acoes - resumoTelemetria()!.total_falhas) / resumoTelemetria()!.total_acoes) * 100).toFixed(1)
                      : "100"}%
                  </span>
                  <span class="text-[10px] text-zinc-400">
                    ({resumoTelemetria()!.total_falhas} falhas)
                  </span>
                </div>
              </div>

              <div class="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/60 col-span-1 sm:col-span-2">
                <span class="text-[10px] text-zinc-500 uppercase tracking-wider font-mono block mb-1">Ferramentas Mais Utilizadas</span>
                <div class="flex items-center gap-1.5 flex-wrap">
                  <For each={resumoTelemetria()!.ferramentas.slice(0, 4)}>
                    {(f) => (
                      <span class="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300 font-mono text-[10px] border border-zinc-700/50 flex items-center gap-1">
                        <Wrench size={10} class="text-sky-400" />
                        {f.ferramenta}
                        <span class="text-zinc-400 font-semibold">{f.total}</span>
                        <span class="text-zinc-500 text-[9px]">({f.media_ms}ms)</span>
                      </span>
                    )}
                  </For>
                </div>
              </div>

              <div class="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/60">
                <span class="text-[10px] text-zinc-500 uppercase tracking-wider font-mono block mb-1">Agentes Ativos</span>
                <div class="flex items-center gap-1.5 flex-wrap">
                  <For each={resumoTelemetria()!.agentes.slice(0, 2)}>
                    {(ag) => (
                      <span class="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300 font-mono text-[10px] border border-zinc-700/50">
                        @{ag.agente} ({ag.total})
                      </span>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* Lista de Registros */}
      <div class="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        <div class="space-y-2.5 pb-4">
          <For
            each={itensFiltrados()}
            fallback={
              <div class="py-16 text-center text-xs text-zinc-500">
                Nenhum registro encontrado para os filtros selecionados.
              </div>
            }
          >
            {(item) => {
              const emAndamento = item.status === "executando";
              const ok = item.status === "concluido" || item.status === "feito" || item.status === "concluida";
              const hitl = item.status === "hitl_pendente";
              const falhou = item.status === "falhou";

              return (
                <div
                  onClick={() => selecionarItem(item)}
                  class={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-4 text-xs shadow-xs ${
                    searchParams.run === item.id
                      ? "bg-zinc-800/60 border-zinc-600 ring-1 ring-zinc-600/40"
                      : emAndamento
                      ? "bg-zinc-900/80 border-zinc-700/80 hover:border-zinc-600"
                      : "bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700"
                  }`}
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="flex-shrink-0">
                      {emAndamento ? (
                        <div class="h-3.5 w-3.5 rounded-full bg-emerald-500 animate-ping" />
                      ) : ok ? (
                        <CheckCircle2 size={16} class="text-emerald-400" />
                      ) : hitl ? (
                        <AlertTriangle size={16} class="text-amber-400 animate-pulse" />
                      ) : falhou ? (
                        <XCircle size={16} class="text-rose-400" />
                      ) : (
                        <Clock size={16} class="text-zinc-500" />
                      )}
                    </div>

                    <div class="min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        {badgeTipo(item.tipo)}
                        <Show when={item.agente}>
                          <span class="font-semibold text-zinc-100 font-mono">
                            @{item.agente}
                          </span>
                        </Show>
                        <span class="text-[10px] text-zinc-500 font-mono">({item.id})</span>
                        <Show when={item.status}>
                          <span class="text-[10px] text-zinc-400 capitalize">· {item.status}</span>
                        </Show>
                      </div>

                      <div class="text-[11px] text-zinc-300 truncate max-w-xl mt-0.5 font-sans">
                        {item.titulo || item.ordem || "Registro de atividade no sistema"}
                      </div>
                    </div>
                  </div>

                  <div class="text-right text-[11px] text-zinc-400 font-mono flex-shrink-0 flex items-center gap-3">
                    <div>
                      {item.duracao_ms ? (
                        <div>{(item.duracao_ms / 1000).toFixed(1)}s</div>
                      ) : item.custo_usd ? (
                        <div>US$ {Number(item.custo_usd).toFixed(4)}</div>
                      ) : null}
                      <div class="text-[10px] text-zinc-500">
                        {item.quando ? new Date(item.quando).toLocaleTimeString("pt-BR") : ""}
                      </div>
                    </div>

                    <ArrowRight size={14} class="text-zinc-600 hover:text-zinc-300" />
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      {/* Modal / Visualizador de Log */}
      <Show when={runSelecionado()}>
        <div class="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) fecharLog(); }}>
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-5xl w-full p-4 sm:p-5 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
            {/* Topo do Modal */}
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3 flex-shrink-0">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <Terminal size={17} class="text-emerald-400" />
                  <h2 class="text-sm font-bold text-zinc-100 font-mono truncate">
                    Execução: {runSelecionado()!.id}
                  </h2>
                  <Show when={runSelecionado()!.status === "executando"}>
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                      STREAMING AO VIVO
                    </span>
                  </Show>
                </div>
                <div class="text-[11px] text-zinc-400 font-mono mt-0.5 flex items-center gap-2">
                  <span>@{runSelecionado()!.agente}</span>
                  <span>·</span>
                  <span
                    class={`capitalize font-semibold ${
                      runSelecionado()!.status === "executando"
                        ? "text-emerald-400 animate-pulse"
                        : runSelecionado()!.status === "concluido"
                        ? "text-emerald-400"
                        : runSelecionado()!.status === "falhou"
                        ? "text-rose-400"
                        : runSelecionado()!.status === "cancelado"
                        ? "text-amber-400"
                        : "text-zinc-400"
                    }`}
                  >
                    {runSelecionado()!.status}
                  </span>
                  <Show when={runSelecionado()!.modelo}>
                    <span>·</span>
                    <span class="text-zinc-500 truncate max-w-xs">{runSelecionado()!.modelo}</span>
                  </Show>
                </div>
                <Show when={runSelecionado()!.ordem}>
                  <div class="mt-2 text-xs bg-zinc-950/70 border border-zinc-800/80 rounded-lg px-2.5 py-1.5 text-zinc-300 font-sans max-h-20 overflow-y-auto leading-relaxed select-text">
                    <span class="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500 block mb-0.5">
                      Ordem Original:
                    </span>
                    {runSelecionado()!.ordem}
                  </div>
                </Show>
              </div>

              {/* Controles e Alternador de Visão */}
              <div class="flex items-center gap-2 flex-wrap">
                {/* Switcher Chat / Telemetria / Terminal */}
                <div class="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setModoVisualizacao("chat")}
                    class={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                      modoVisualizacao() === "chat"
                        ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <MessageSquare size={13} class="text-zinc-400" />
                    <span>Chat ao Vivo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoVisualizacao("telemetria")}
                    class={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                      modoVisualizacao() === "telemetria"
                        ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <Activity size={13} class="text-sky-400" />
                    <span>Telemetria {acoesRun().length > 0 ? `(${acoesRun().length})` : ""}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoVisualizacao("terminal")}
                    class={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                      modoVisualizacao() === "terminal"
                        ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <Terminal size={13} class="text-emerald-400" />
                    <span>Terminal Raw</span>
                  </button>
                </div>

                <Button size="xs" variant="ghost" onClick={copiarLog} title="Copiar log bruto">
                  <Copy size={13} class="mr-1" /> Copiar
                </Button>
                <Button size="xs" variant="ghost" onClick={baixarLog} title="Baixar arquivo .log">
                  <Download size={13} class="mr-1" /> Baixar
                </Button>

                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    const run = runSelecionado();
                    if (run?.agente) {
                      navigate(`/agentes?agente=${encodeURIComponent(run.agente)}`);
                    } else {
                      navigate("/config");
                    }
                  }}
                  title="Configurar agente ou parâmetros"
                  class="text-zinc-400 hover:text-zinc-100"
                >
                  <Settings size={13} class="mr-1" /> Configurar
                </Button>

                <Button
                  size="xs"
                  variant="ghost"
                  onClick={reenviarExecucao}
                  disabled={reenviando()}
                  title="Reenviar esta execução com os mesmos parâmetros"
                  class="!bg-sky-950/40 !text-sky-300 hover:!bg-sky-900/60 !border !border-sky-800/80 font-bold"
                >
                  <RotateCcw size={13} class={`mr-1 text-sky-400 ${reenviando() ? "animate-spin" : ""}`} />
                  {reenviando() ? "Reenviando..." : "Reenviar"}
                </Button>

                <Show when={runSelecionado()!.status === "executando"}>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={encerrarExecucao}
                    disabled={encerrando()}
                    title="Encerrar esta execução"
                    class="!bg-rose-950/40 !text-rose-300 hover:!bg-rose-900/60 !border !border-rose-800/80 font-bold"
                  >
                    <StopCircle size={13} class="mr-1 text-rose-400" />
                    {encerrando() ? "Encerrando..." : "Encerrar"}
                  </Button>
                </Show>

                <IconButton size="xs" variant="ghost" onClick={fecharLog} title="Fechar modal (ESC)">
                  <X size={16} />
                </IconButton>
              </div>
            </div>

            {/* Sub-barra informativa */}
            <div class="flex items-center justify-between text-[11px] text-zinc-400 px-1 font-mono flex-shrink-0">
              <span>URL: <code class="text-emerald-400">/historico?run={runSelecionado()!.id}</code></span>
              <span>{logRun().split("\n").length} linhas capturadas</span>
            </div>

            {/* Corpo: Chat ao Vivo, Terminal Raw ou Telemetria Granular */}
            <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
              <Show when={modoVisualizacao() === "chat"}>
                <div class="flex-1 overflow-y-auto scrollbar-thin pr-1 pb-2">
                  <LogChatViewer
                    log={logRun()}
                    agente={runSelecionado()?.agente}
                    modelo={runSelecionado()?.modelo}
                    status={runSelecionado()?.status}
                    quando={runSelecionado()?.quando || runSelecionado()?.inicio}
                    gatilho={runSelecionado()?.gatilho}
                    duracaoMs={runSelecionado()?.duracao_ms}
                  />
                </div>
              </Show>

              <Show when={modoVisualizacao() === "terminal"}>
                <pre class="flex-1 bg-black/95 p-4 rounded-xl border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-y-auto whitespace-pre-wrap leading-relaxed scrollbar-thin select-text">
                  {logRun()}
                </pre>
              </Show>

              <Show when={modoVisualizacao() === "telemetria"}>
                <div class="flex-1 overflow-y-auto scrollbar-thin p-1 space-y-3">
                  <Show when={carregandoAcoes()}>
                    <div class="py-16 text-center text-xs text-zinc-400">
                      <RefreshCw size={18} class="animate-spin mx-auto mb-2 text-sky-400" />
                      Carregando telemetria e passos do agente...
                    </div>
                  </Show>

                  <Show when={!carregandoAcoes() && acoesRun().length === 0}>
                    <div class="py-16 text-center text-xs text-zinc-500 bg-zinc-950/40 rounded-xl border border-zinc-800/80 p-6">
                      <Activity size={24} class="mx-auto mb-2 text-zinc-600" />
                      <p class="font-medium text-zinc-400">Nenhum span granular registrado para esta execução</p>
                      <p class="text-[11px] text-zinc-500 mt-1 max-w-sm mx-auto">
                        A telemetria detalhada (chamadas a ferramentas, pensamentos e respostas) é gravada automaticamente nas sessões e conversas do Secretário.
                      </p>
                    </div>
                  </Show>

                  <Show when={!carregandoAcoes() && acoesRun().length > 0}>
                    {/* Header do Trace */}
                    <div class="bg-zinc-950/70 border border-zinc-800 rounded-xl p-3 text-xs flex items-center justify-between gap-3 flex-wrap">
                      <div class="flex items-center gap-2">
                        <Activity size={14} class="text-sky-400" />
                        <span class="text-zinc-400 font-mono text-[11px]">Trace:</span>
                        <code class="text-zinc-200 font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 select-all">
                          {acoesRun()[0]?.trace_id || runSelecionado()?.id}
                        </code>
                      </div>
                      <div class="flex items-center gap-2 text-[11px]">
                        <span class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                          {acoesRun().length} passos
                        </span>
                        <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                          {acoesRun().filter((a) => a.status === "sucesso").length} ok
                        </span>
                        <Show when={acoesRun().some((a) => a.status !== "sucesso")}>
                          <span class="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-mono">
                            {acoesRun().filter((a) => a.status !== "sucesso").length} falhas
                          </span>
                        </Show>
                      </div>
                    </div>

                    {/* Timeline de Ações / Spans */}
                    <div class="space-y-2">
                      <For each={acoesRun()}>
                        {(acao, index) => {
                          const aberta = () => acaoAbertaId() === acao.id;
                          const toggle = () => setAcaoAbertaId(aberta() ? null : acao.id);
                          const sucesso = acao.status === "sucesso";

                          return (
                            <div class={`rounded-xl border transition-all text-xs ${
                              sucesso
                                ? "bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700"
                                : "bg-rose-950/20 border-rose-900/50 hover:border-rose-800/70"
                            }`}>
                              {/* Linha do Span */}
                              <div
                                onClick={toggle}
                                class="p-3 flex items-center justify-between gap-3 cursor-pointer select-none"
                              >
                                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                                  <span class="text-zinc-500 font-mono text-[10px] w-6 flex-shrink-0">
                                    #{String(index() + 1).padStart(2, "0")}
                                  </span>

                                  {/* Ícone por tipo */}
                                  <div class="flex-shrink-0">
                                    <Show when={acao.tipo_acao === "tool"}>
                                      <div class="p-1 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                        <Wrench size={12} />
                                      </div>
                                    </Show>
                                    <Show when={acao.tipo_acao === "pensamento"}>
                                      <div class="p-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                        <Brain size={12} />
                                      </div>
                                    </Show>
                                    <Show when={acao.tipo_acao === "resposta"}>
                                      <div class="p-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                        <MessageSquare size={12} />
                                      </div>
                                    </Show>
                                    <Show when={acao.tipo_acao === "erro"}>
                                      <div class="p-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                        <AlertTriangle size={12} />
                                      </div>
                                    </Show>
                                  </div>

                                  {/* Identificação da Ação / Tool */}
                                  <div class="min-w-0 flex-1 flex items-baseline gap-2">
                                    <span class="font-mono font-semibold text-zinc-200 text-xs">
                                      {acao.ferramenta || acao.tipo_acao}
                                    </span>
                                    <Show when={acao.comando_resumo}>
                                      <span class="text-zinc-400 text-[11px] truncate max-w-md font-mono">
                                        {acao.comando_resumo}
                                      </span>
                                    </Show>
                                  </div>
                                </div>

                                {/* Status & Duração & Toggle */}
                                <div class="flex items-center gap-2 flex-shrink-0">
                                  <Show when={acao.duracao_ms && acao.duracao_ms > 0}>
                                    <span class="text-[10px] font-mono text-zinc-500">
                                      {acao.duracao_ms}ms
                                    </span>
                                  </Show>
                                  <span class={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                    sucesso
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                      : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                  }`}>
                                    {acao.status}
                                  </span>
                                  <span class="text-zinc-500 text-[10px] font-mono">
                                    {(acao.criado_em || "").slice(11, 19)}
                                  </span>
                                  {aberta() ? <ChevronDown size={14} class="text-zinc-400" /> : <ChevronRight size={14} class="text-zinc-500" />}
                                </div>
                              </div>

                              {/* Detalhes Colapsáveis */}
                              <Show when={aberta()}>
                                <div class="px-3 pb-3 pt-1 border-t border-zinc-800/80 space-y-2 text-xs">
                                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono text-zinc-400 bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/60">
                                    <div>
                                      <span class="text-zinc-600 block">Span ID:</span>
                                      <span class="text-zinc-300 select-all">{acao.span_id}</span>
                                    </div>
                                    <div>
                                      <span class="text-zinc-600 block">Parent Span:</span>
                                      <span class="text-zinc-300 select-all">{acao.parent_span_id || "root"}</span>
                                    </div>
                                    <div>
                                      <span class="text-zinc-600 block">Agente:</span>
                                      <span class="text-zinc-300">@{acao.agente}</span>
                                    </div>
                                    <div>
                                      <span class="text-zinc-600 block">Modelo:</span>
                                      <span class="text-zinc-300 truncate">{acao.modelo || "-"}</span>
                                    </div>
                                  </div>

                                  <Show when={acao.erro}>
                                    <div class="bg-rose-950/40 border border-rose-800/60 rounded-lg p-2.5 text-rose-200 text-xs">
                                      <span class="font-bold text-[10px] uppercase font-mono tracking-wider block text-rose-400 mb-1">
                                        Erro Registrado:
                                      </span>
                                      <pre class="font-mono text-[11px] whitespace-pre-wrap select-text">{acao.erro}</pre>
                                    </div>
                                  </Show>

                                  <Show when={acao.input_json}>
                                    <div class="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-2.5">
                                      <span class="font-bold text-[10px] uppercase font-mono tracking-wider block text-zinc-500 mb-1">
                                        Entrada / Parâmetros:
                                      </span>
                                      <pre class="font-mono text-[11px] text-zinc-300 whitespace-pre-wrap max-h-40 overflow-y-auto scrollbar-thin select-text">
                                        {acao.input_json}
                                      </pre>
                                    </div>
                                  </Show>

                                  <Show when={acao.output_json}>
                                    <div class="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-2.5">
                                      <span class="font-bold text-[10px] uppercase font-mono tracking-wider block text-zinc-500 mb-1">
                                        Saída Sanitizada / Resultado:
                                      </span>
                                      <pre class="font-mono text-[11px] text-zinc-300 whitespace-pre-wrap max-h-60 overflow-y-auto scrollbar-thin select-text">
                                        {acao.output_json}
                                      </pre>
                                    </div>
                                  </Show>
                                </div>
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </div>
              </Show>
            </div>

            {/* Rodapé */}
            <div class="pt-2 border-t border-zinc-800/80 flex justify-between items-center flex-shrink-0 text-xs text-zinc-400">
              <span class="text-[11px] font-mono">
                {runSelecionado()!.status === "executando"
                  ? "● Polling de streaming ativo (2.5s)"
                  : "Sessão arquivada"}
              </span>
              <Button size="sm" variant="secondary" onClick={fecharLog}>
                Fechar Visualizador
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
