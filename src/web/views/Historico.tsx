import { type Component, createSignal, onMount, onCleanup, createEffect, untrack, For, Show } from "solid-js";
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
  Search,
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
  GitCommit,
  GitBranch,
  FileText,
} from "lucide-solid";
import { useSearchParams, useNavigate } from "@solidjs/router";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { fetchApi, wsAtivo } from "../lib/context";
import { carregarFuso, fmtDataHora, fmtHora, distanciaHumana, jaPassou, fuso } from "../lib/fuso";
import { showToast } from "../ui/Toast";
import { LogChatViewer } from "../components/chat/LogChatViewer";
import { FlowChart } from "../components/chat/FlowChart";

export interface FilhaHistorico {
  id: string;
  no?: string;
  volta?: number;
  agente?: string;
  status?: string;
  quando?: string | null;
}

export interface ItemHistorico {
  id: string;
  tipo: "execucao" | "task" | "rotina" | "conversa" | "fluxo";
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
  flow?: string;
  nos_total?: number;
  nos_ok?: number;
  contexto_final?: string;
  entrada?: string;
  reuniao?: string;
  filhas?: FilhaHistorico[];
}

export interface NoFluxoInfo {
  id: string;
  tipo: string;
  agente?: string | null;
  status: "ok" | "falhou" | "nao-executado" | "executando";
  exec_id: string | null;
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
  // Modal padrão de Task: mesma casca dos runs — instrução, comentários e
  // execuções vinculadas (cada execução abre o chat dela no visualizador)
  const [taskModal, setTaskModal] = createSignal<{
    task: any | null;
    msgs: any[];
    execs: Array<{ id: string; agente: string; inicio: string; status: string; duracao_ms?: number }>;
    carregando: boolean;
  } | null>(null);

  const abrirTaskPorId = async (taskId: string) => {
    setTaskModal({ task: null, msgs: [], execs: [], carregando: true });
    try {
      const [task, msgs, execs] = await Promise.all([
        fetchApi<any>(`/tasks/${encodeURIComponent(taskId)}`).catch(() => null),
        fetchApi<any[]>(`/tasks/${encodeURIComponent(taskId)}/mensagens`).catch(() => []),
        fetchApi<any[]>(`/tasks/${encodeURIComponent(taskId)}/execucoes`).catch(() => []),
      ]);
      setTaskModal({
        task,
        msgs: Array.isArray(msgs) ? msgs : [],
        execs: Array.isArray(execs) ? execs : [],
        carregando: false,
      });
    } catch {
      setTaskModal({ task: null, msgs: [], execs: [], carregando: false });
    }
  };
  const fecharTask = () => setTaskModal(null);

  // Popup padrão de Rotina e Conversa: mesma casca dos demais — nada navega
  // para fora (só botões explícitos como "Ver Agenda" ou "Continuar chat").
  const [infoModal, setInfoModal] = createSignal<
    | { kind: "rotina"; job: any | null; execs: ItemHistorico[]; runs: any[]; carregando: boolean }
    | { kind: "conversa"; item: ItemHistorico; msgs: Array<{ role: string; content: string }>; carregando: boolean }
    | null
  >(null);
  const fecharInfo = () => setInfoModal(null);

  // Abre a página do dono do item: agente → catálogo, fluxo → Studio,
  // rotina → agenda, reunião → salas. Usado pelos nomes clicáveis nos modais.
  const abrirAgente = (agente?: string | null) => {
    const a = (agente || "").trim().replace(/^@/, "");
    if (!a) return;
    if (a.startsWith("flow:")) {
      navigate(`/fluxos?fluxo=${encodeURIComponent(a.slice("flow:".length))}`);
    } else if (a === "rotina") {
      navigate("/agenda");
    } else if (a === "reuniao" || a === "mesa-reuniao") {
      navigate("/reunioes");
    } else {
      navigate(`/agentes?agente=${encodeURIComponent(a)}`);
    }
  };

  // Descreve como o job executa: agente, fluxo ou script direto (scripts não
  // geram execução de agente — o rastro deles está nos disparos do agendador)
  const comandoJob = (job: any): string => ((job?.args || []) as string[]).join(" ") || "—";
  const tipoJob = (job: any): "agente" | "fluxo" | "script" => {
    const cmd = comandoJob(job);
    if (/(^|\s)flow(\s| run)/.test(cmd)) return "fluxo";
    if (/(^|\s)agent(\s| run)/.test(cmd)) return "agente";
    return "script";
  };

  const abrirRotinaPorId = async (jobId: string) => {
    setInfoModal({ kind: "rotina", job: null, execs: [], runs: [], carregando: true });
    try {
      const [jobs, runs] = await Promise.all([
        fetchApi<any[]>("/schedules").catch(() => []),
        fetchApi<any[]>(`/schedules/${encodeURIComponent(jobId)}/runs`).catch(() => []),
      ]);
      const job = (jobs || []).find((j) => j.id === jobId) || null;
      // Execuções disparadas por este job: gatilho.origem traz o nome (ex.: yt-pautador-30min)
      const chave = job?.nome || jobId;
      // Job de fluxo: inclui também os execs dos nós (origem "flow:<id>/<no>")
      const jobFlowId =
        Array.isArray(job?.args) && job.args[0] === "flow" && job.args[1] === "run" ? String(job.args[2] || "") : "";
      const execs = itens()
        .filter(
          (i) =>
            i.gatilho?.origem === chave ||
            i.gatilho?.origem === jobId ||
            (jobFlowId !== "" && String(i.gatilho?.origem || "").startsWith(`flow:${jobFlowId}/`)),
        )
        .sort((a, b) => String(b.quando || "").localeCompare(String(a.quando || "")));
      setInfoModal({ kind: "rotina", job, execs, runs: Array.isArray(runs) ? runs.slice(0, 10) : [], carregando: false });
    } catch {
      setInfoModal({ kind: "rotina", job: null, execs: [], runs: [], carregando: false });
    }
  };

  const abrirConversaPorId = async (item: ItemHistorico) => {
    setInfoModal({ kind: "conversa", item, msgs: [], carregando: true });
    try {
      const msgs = await fetchApi<Array<{ role: string; content: string }>>(
        `/secretario/sessoes/${encodeURIComponent(item.id)}/mensagens`
      ).catch(() => []);
      setInfoModal({ kind: "conversa", item, msgs: Array.isArray(msgs) ? msgs : [], carregando: false });
    } catch {
      setInfoModal({ kind: "conversa", item, msgs: [], carregando: false });
    }
  };
  const [carregandoLog, setCarregandoLog] = createSignal(false);
  const [modoVisualizacao, setModoVisualizacao] = createSignal<"chat" | "terminal" | "telemetria" | "diff" | "fluxo" | "resultado">("chat");
  const [encerrando, setEncerrando] = createSignal(false);
  const [reenviando, setReenviando] = createSignal(false);
  const [tempoRealAtivo, setTempoRealAtivo] = createSignal(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = createSignal<string>("");
  const [gruposAbertos, setGruposAbertos] = createSignal<Set<string>>(new Set());

  // Estados de Diff de Arquivos
  const [diffRun, setDiffRun] = createSignal<string>("");
  const [arquivosDiff, setArquivosDiff] = createSignal<Array<{ caminho: string; adicionadas: string; removidas: string }>>([]);
  const [carregandoDiff, setCarregandoDiff] = createSignal(false);
  const [commitHashDiff, setCommitHashDiff] = createSignal<string | null>(null);

  // Estados de Telemetria e Spans
  const [acoesRun, setAcoesRun] = createSignal<AcaoAgente[]>([]);
  const [carregandoAcoes, setCarregandoAcoes] = createSignal(false);
  const [acaoAbertaId, setAcaoAbertaId] = createSignal<string | null>(null);
  const [resumoTelemetria, setResumoTelemetria] = createSignal<ResumoTelemetria | null>(null);
  const [mostrarCardsTelemetria, setMostrarCardsTelemetria] = createSignal(true);

  // Estados de Fluxo (timeline por nó)
  const [nosFluxo, setNosFluxo] = createSignal<NoFluxoInfo[]>([]);
  // Definição do fluxo aberto (arestas + agente por nó) — alimenta o fluxograma
  const [defFluxo, setDefFluxo] = createSignal<{
    id: string;
    nos: Array<{ id: string; tipo: string; config?: { agente?: string } }>;
    arestas: Array<{ de: string; para: string; rotulo?: string }>;
  } | null>(null);

  /** Cruza nós da execução com a definição: preenche o agente de cada nó. */
  const enriquecerNos = (lista: NoFluxoInfo[]): NoFluxoInfo[] => {
    const def = defFluxo();
    if (!def) return lista;
    const porId = new Map(def.nos.map((n) => [n.id, n]));
    return lista.map((n) => {
      const agente = porId.get(n.id)?.config?.agente;
      return typeof agente === "string" && agente && !n.agente ? { ...n, agente } : n;
    });
  };
  const [contextoFinalFluxo, setContextoFinalFluxo] = createSignal<string>("");
  const [entradaFluxo, setEntradaFluxo] = createSignal<string>("");
  const [carregandoFluxo, setCarregandoFluxo] = createSignal(false);

  let pollInterval: any = null;
  // Poller do log do run aberto (restaura declaração removida no refactor:
  // sem ela, os usos abaixo lançam ReferenceError e a lista não renderiza)
  let liveLogInterval: any = null;

  const filtroLimite = () => {
    const p = searchParams.limite as string | undefined;
    return p ? Math.min(Number(p), 500) : 200;
  };
  const filtroTipo = () => (searchParams.tipo as string) || "tudo";
  const filtroStatus = () => (searchParams.status as string) || "todos";
  const filtroAgente = () => (searchParams.agente as string) || "todos";
  const filtroBusca = () => (searchParams.busca as string) || "";

  // Paginação finita (lista do mais recente ao mais velho, em páginas)
  const [pagina, setPagina] = createSignal(1);
  const [porPagina, setPorPagina] = createSignal(25);
  // Busca textual com debounce → reflete em ?busca= (o backend filtra tasks/fluxos;
  // execuções são filtradas também no cliente em itensOrdenados)
  const [termoBusca, setTermoBusca] = createSignal(filtroBusca());
  let buscaTimer: any = null;
  const aoDigitarBusca = (v: string) => {
    setTermoBusca(v);
    if (buscaTimer) clearTimeout(buscaTimer);
    buscaTimer = setTimeout(() => {
      setSearchParams({ busca: v.trim() ? v.trim() : undefined });
    }, 400);
  };
  // Qualquer troca de filtro/abA/busca volta para a página 1 (o polling não dispara isso)
  createEffect(() => {
    filtroTipo();
    filtroStatus();
    filtroAgente();
    filtroBusca();
    setPagina(1);
  });

  const carregarHistorico = async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      // Buscar do endpoint unificado /historico que agrupa execucoes, tasks, rotinas e conversas
      const paramsBusca = new URLSearchParams({ limite: String(filtroLimite()) });
      const termoServidor = filtroBusca().trim();
      if (termoServidor) paramsBusca.set("busca", termoServidor);
      const dados = await fetchApi<ItemHistorico[]>(`/historico?${paramsBusca.toString()}`);
      let listaFinal: ItemHistorico[] = [];
      if (Array.isArray(dados) && dados.length > 0) {
        listaFinal = dados;
      } else {
        // Fallback para /execucoes caso /historico retorne vazio
        const execs = await fetchApi<any[]>("/execucoes?limite=" + Math.min(Number(filtroLimite()), 100));
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

      // Se há um run aberto na URL, atualiza seus dados (sem recriar o objeto
      // quando nada mudou — recriar a cada polling causa re-render e scroll jump
      // no modal; e nunca sobrescreve o log, que é cuidado pelo liveLogInterval)
      const runAtual = searchParams.run as string | undefined;
      if (runAtual) {
        const itemReal = listaFinal.find((x) => x.id === runAtual);
        if (itemReal) {
          setRunSelecionado((prev: any) => {
            if (!prev) return itemReal;
            if (prev.status === itemReal.status) return prev;
            return { ...prev, ...itemReal };
          });
        }
      }
    } catch {
      try {
        const execs = await fetchApi<any[]>("/execucoes?limite=" + Math.min(Number(filtroLimite()), 50));
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

  const LOG_VAZIO = "(Nenhuma saída de log capturada para esta execução)";

  const buscarLog = async (runId: string, ehFluxo = false) => {
    try {
      const res = await fetchApi<{ id: string; log: string }>(
        `/sessions/${encodeURIComponent(runId)}/log`
      );
      if (res?.log && res.log.trim()) return res.log;
    } catch {}

    try {
      const reg = await fetchApi<{ conteudo?: string; meta?: { extras?: any } }>(
        `/registries/execucoes/${encodeURIComponent(runId)}`
      );
      if (reg?.conteudo && reg.conteudo.trim()) return reg.conteudo;
      const ctx = reg?.meta?.extras?.contexto_final;
      if (typeof ctx === "string" && ctx.trim()) return ctx;
    } catch {}

    return LOG_VAZIO;
  };

  const recarregarFluxo = async (runId: string, flowId: string | undefined, r?: ItemHistorico | null, silencioso = false) => {
    if (!flowId) {
      // Sem flowId não há /flows/:id/execucoes — tenta ao menos o registro
      try {
        const reg = await fetchApi<{ meta?: { extras?: any } }>(
          `/registries/execucoes/${encodeURIComponent(runId)}`
        );
        const ex = reg?.meta?.extras || {};
        if (Array.isArray(ex.nos)) setNosFluxo(ex.nos);
        if (typeof ex.contexto_final === "string" && ex.contexto_final.trim()) {
          setContextoFinalFluxo(ex.contexto_final);
          if (logRun() === LOG_VAZIO) setLogRun(ex.contexto_final);
        }
        if (typeof ex.entrada === "string") setEntradaFluxo(ex.entrada);
        if (ex.status) setRunSelecionado((prev: any) => (prev && prev.id === runId ? { ...prev, status: ex.status } : prev));
      } catch {}
      return;
    }
    if (!silencioso) setCarregandoFluxo(true);
    // Definição do fluxo (arestas + agente por nó) — busca uma vez por flowId
    if (defFluxo()?.id !== flowId) {
      setDefFluxo(null);
      try {
        const def = await fetchApi<{
          id: string;
          nos?: Array<{ id: string; tipo: string; config?: { agente?: string } }>;
          arestas?: Array<{ de: string; para: string; rotulo?: string }>;
        }>(`/flows/${encodeURIComponent(flowId)}`);
        if (def && Array.isArray(def.nos)) {
          setDefFluxo({ id: def.id || flowId, nos: def.nos, arestas: Array.isArray(def.arestas) ? def.arestas : [] });
        }
      } catch {}
    }
    try {
      const execs = await fetchApi<Array<{ execId: string; status: string; nos: NoFluxoInfo[]; contextoFinal: string; entrada?: string }>>(
        `/flows/${encodeURIComponent(flowId)}/execucoes`
      );
      const atual = (execs || []).find((e) => e.execId === runId) || (execs || [])[0];
      if (atual) {
        setNosFluxo(enriquecerNos(atual.nos || []));
        if (atual.contextoFinal) {
          setContextoFinalFluxo(atual.contextoFinal);
          if (logRun() === LOG_VAZIO || !logRun().trim()) setLogRun(atual.contextoFinal);
        }
        if (atual.entrada) setEntradaFluxo(atual.entrada);
        if (r && !(r as ItemHistorico).contexto_final && atual.contextoFinal) {
          setRunSelecionado((prev: any) => (prev ? { ...prev, contexto_final: atual.contextoFinal, entrada: atual.entrada, status: atual.status } : prev));
        } else {
          setRunSelecionado((prev: any) => (prev && prev.id === runId ? { ...prev, status: atual.status } : prev));
        }
      }
      // Completa pelo registro quando a lista vem vazia/parcial
      if (nosFluxo().length === 0 || !contextoFinalFluxo().trim()) {
        const reg = await fetchApi<{ meta?: { extras?: any } }>(
          `/registries/execucoes/${encodeURIComponent(runId)}`
        );
        const ex = reg?.meta?.extras || {};
        if (Array.isArray(ex.nos) && (ex.nos as unknown[]).length > nosFluxo().length) setNosFluxo(enriquecerNos(ex.nos));
        if (typeof ex.contexto_final === "string" && ex.contexto_final.trim() && !contextoFinalFluxo().trim()) {
          setContextoFinalFluxo(ex.contexto_final);
          if (logRun() === LOG_VAZIO) setLogRun(ex.contexto_final);
        }
        if (typeof ex.entrada === "string" && !entradaFluxo()) setEntradaFluxo(ex.entrada);
        if (ex.status) setRunSelecionado((prev: any) => (prev && prev.id === runId ? { ...prev, status: ex.status } : prev));
      }
    } catch {} finally {
      if (!silencioso) setCarregandoFluxo(false);
    }
  };

  const abrirLogPorId = async (runId: string) => {
    setCarregandoLog(true);
    setLogRun("Carregando log da execução...");

    let r = itens().find((item) => item.id === runId);
    if (!r) {
      try {
        const h = await fetchApi<ItemHistorico[]>("/historico?limite=" + filtroLimite());
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
            const ehFluxo = ex.tipo === "flow";
            r = ehFluxo
              ? {
                  id: runId,
                  tipo: "fluxo",
                  agente: reg.meta.criado_por || `flow:${ex.flow || "?"}`,
                  status: ex.status || "concluido",
                  quando: reg.meta.criado_em,
                  titulo: ex.nome ? `${ex.nome} (${ex.flow})` : `Fluxo ${ex.flow || runId}`,
                  flow: typeof ex.flow === "string" ? ex.flow : undefined,
                  contexto_final: typeof ex.contexto_final === "string" ? ex.contexto_final : undefined,
                  entrada: typeof ex.entrada === "string" ? ex.entrada : undefined,
                }
              : {
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
    } else if (!r.ordem && r.tipo !== "fluxo") {
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
    setModoVisualizacao(r.tipo === "fluxo" ? "fluxo" : "chat");

    // Reseta antes de buscar (evita vazar log/contexto do run anterior)
    setLogRun("Carregando log da execução...");
    setNosFluxo([]);
    setDefFluxo(null);
    setContextoFinalFluxo((r as ItemHistorico).contexto_final || "");
    setEntradaFluxo((r as ItemHistorico).entrada || "");

    const textoLog = await buscarLog(runId, r.tipo === "fluxo");
    setLogRun(textoLog);
    setCarregandoLog(false);

    // Fluxo: carregar timeline por nó (status + contexto final + entrada)
    await recarregarFluxo(runId, (r as ItemHistorico).flow, r as ItemHistorico);

    // Carregar ações/spans granulares de telemetria para esta sessão
    setCarregandoAcoes(true);
    fetchApi<AcaoAgente[]>(`/acoes/${encodeURIComponent(runId)}`)
      .then((acoes) => setAcoesRun(Array.isArray(acoes) ? acoes : []))
      .catch(() => setAcoesRun([]))
      .finally(() => setCarregandoAcoes(false));

    // Carregar diff de arquivos do Git gerado por esta sessão
    setCarregandoDiff(true);
    setDiffRun("");
    setArquivosDiff([]);
    setCommitHashDiff(null);
    fetchApi<{ ok?: boolean; diff?: string; arquivos?: any[]; commitHash?: string }>(
      `/execucoes/${encodeURIComponent(runId)}/diff`
    )
      .then((res) => {
        if (res && res.ok) {
          setDiffRun(res.diff || "");
          setArquivosDiff(res.arquivos || []);
          setCommitHashDiff(res.commitHash || null);
        }
      })
      .catch(() => {})
      .finally(() => setCarregandoDiff(false));

    if (liveLogInterval) {
      clearInterval(liveLogInterval);
      liveLogInterval = null;
    }

    if (r.status === "executando") {
      const ehFluxo = r.tipo === "fluxo";
      const flowId = ehFluxo ? (r as ItemHistorico).flow : undefined;
      let pollCount = 0;
      let pollTravado = false;
      liveLogInterval = setInterval(async () => {
        if (pollTravado) return;
        pollTravado = true;
        try {
          pollCount++;
          const atualizado = await buscarLog(runId, ehFluxo);
          setLogRun(atualizado);

          if (ehFluxo) {
            // Timeline do fluxo acompanha nó a nó até a finalização
            await recarregarFluxo(runId, flowId, null, true);
            const st = runSelecionado()?.status;
            if (st && st !== "executando") {
              if (liveLogInterval) {
                clearInterval(liveLogInterval);
                liveLogInterval = null;
              }
              void carregarHistorico();
            }
            return;
          }

          if (pollCount % 2 === 0) {
            try {
              const reg = await fetchApi<{ meta?: { extras?: any } }>(
                `/registries/execucoes/${encodeURIComponent(runId)}`
              );
              const st = reg?.meta?.extras?.status;
              if (st && st !== "executando") {
                setRunSelecionado((prev: any) => prev ? { ...prev, status: st } : null);
                void carregarHistorico();
              }
            } catch {}
          }
        } finally {
          pollTravado = false;
        }
      }, 2500);
    }
  };

  const selecionarItem = (item: ItemHistorico) => {
    if (item.tipo === "task") {
      // Popup padrão de task (não navega para fora): instrução, comentários e execuções
      void abrirTaskPorId(item.id);
      return;
    }
    if (item.tipo === "conversa") {
      if (item.reuniao) {
        // Sala de reunião é uma página própria (vários participantes ao vivo)
        navigate(`/reunioes?reuniao=${encodeURIComponent(item.reuniao)}`);
        return;
      }
      void abrirConversaPorId(item);
      return;
    }
    if (item.tipo === "rotina") {
      void abrirRotinaPorId(item.id);
      return;
    }
    // execucao e fluxo abrem o visualizador com ?run=
    setSearchParams({ run: item.id });
  };

  const alternarGrupo = (id: string) => {
    setGruposAbertos((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
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
    setNosFluxo([]);
    setDefFluxo(null);
    setContextoFinalFluxo("");
    setEntradaFluxo("");
    setCarregandoFluxo(false);
    setSearchParams({ run: undefined });
  };

  const textoParaExportar = () => {
    const run = runSelecionado() as ItemHistorico | null;
    if (run?.tipo === "fluxo" && contextoFinalFluxo().trim()) {
      return `Fluxo ${run.flow || run.id}\nExecução ${run.id} (${run.status})\n\n${contextoFinalFluxo()}`;
    }
    return logRun();
  };

  const copiarLog = () => {
    navigator.clipboard.writeText(textoParaExportar());
    showToast("Conteúdo copiado para a área de transferência!", "sucesso");
  };

  const baixarLog = () => {
    const blob = new Blob([textoParaExportar()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${runSelecionado()?.id || "exec"}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pontosLatenciaCusto = () => {
    const porModelo = new Map<string, { total: number; somaMs: number; custo: number; falhas: number }>();
    for (const a of acoesRun()) {
      const m = a.modelo || "desconhecido";
      const e = porModelo.get(m) ?? { total: 0, somaMs: 0, custo: 0, falhas: 0 };
      e.total += 1;
      e.somaMs += a.duracao_ms ?? 0;
      e.custo += a.custo_usd ?? 0;
      if (a.status !== "sucesso") e.falhas += 1;
      porModelo.set(m, e);
    }
    return [...porModelo.entries()].map(([modelo, v]) => ({
      modelo,
      total: v.total,
      mediaMs: v.total ? Math.round(v.somaMs / v.total) : 0,
      custo: v.custo,
      falhas: v.falhas,
    }));
  };

  const exportarTelemetria = (formato: "csv" | "json") => {
    const acoes = acoesRun();
    if (acoes.length === 0) { showToast("Nada a exportar", "aviso"); return; }
    const nome = `telemetria-${runSelecionado()?.id || "exec"}.${formato}`;
    let blob: Blob;
    if (formato === "json") {
      blob = new Blob([JSON.stringify(acoes, null, 2)], { type: "application/json;charset=utf-8" });
    } else {
      const cab = "id;trace_id;span_id;agente;modelo;tipo_acao;ferramenta;status;duracao_ms;custo_usd;erro\n";
      const linhas = acoes.map((a) =>
        [a.id, a.trace_id, a.span_id, a.agente, a.modelo, a.tipo_acao, a.ferramenta ?? "", a.status, a.duracao_ms ?? "", a.custo_usd ?? "", (a.erro ?? "").replace(/[\r\n;]+/g, " ")].join(";")
      );
      blob = new Blob([cab + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
    }
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = nome;
    el.click();
    URL.revokeObjectURL(url);
    showToast(`Telemetria exportada: ${nome}`, "sucesso");
  };

  const restaurarArquivoDoDiff = async (caminho: string) => {
    try {
      const data = await fetchApi<{ sucesso: boolean; mensagem: string }>("/workspaces/git/restore", {
        method: "POST",
        body: JSON.stringify({ arquivo: caminho }),
      });
      showToast(data.mensagem, data.sucesso ? "sucesso" : "erro");
    } catch (e: unknown) {
      showToast(`Erro: ${e instanceof Error ? e.message : String(e)}`, "erro");
    }
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
    const run = runSelecionado() as ItemHistorico | null;
    if (!run) return;
    // Fluxo: reexecuta o flow (gera novo exec_id rastreável)
    if (run.tipo === "fluxo" && run.flow) {
      setReenviando(true);
      try {
        const res = await fetchApi<{ status?: string; exec_id?: string; flow?: string }>(
          `/flows/${encodeURIComponent(run.flow)}/run`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entrada: entradaFluxo() || undefined }) } as any
        );
        showToast(`Fluxo reenviado (${res?.exec_id ?? "?"})`, "sucesso");
        if (res?.exec_id) {
          fecharLog();
          void carregarHistorico();
          setTimeout(() => setSearchParams({ run: res.exec_id }), 1200);
        }
      } catch (e: any) {
        showToast(`Erro ao reenviar fluxo: ${e.message || String(e)}`, "erro");
      } finally {
        setReenviando(false);
      }
      return;
    }
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

  const retomarFluxo = async () => {
    const run = runSelecionado() as ItemHistorico | null;
    if (!run?.flow) return;
    setReenviando(true);
    try {
      const res = await fetchApi<{ status?: string; exec_id?: string; exec?: string; erro?: string }>(
        `/flows/${encodeURIComponent(run.flow)}/resume`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exec_id: run.id }) } as any
      );
      if (res?.erro) {
        showToast(`Não retomado: ${res.erro}`, "aviso");
        return;
      }
      showToast(`Fluxo retomando (${res?.exec_id ?? res?.exec ?? run.id})`, "sucesso");
      setModoVisualizacao("fluxo");
      void carregarHistorico();
    } catch (e: any) {
      showToast(`Erro ao retomar fluxo: ${e.message || String(e)}`, "erro");
    } finally {
      setReenviando(false);
    }
  };

  // Reagir SOMENTE a alteração em ?run= — com untrack, porque abrirLogPorId lê
  // itens() e sem isso cada polling da lista (2.5s) reabria o modal do zero:
  // resetava a aba para "chat", zerava a telemetria e fazia o scroll pular.
  createEffect(() => {
    const runParam = searchParams.run as string | undefined;
    untrack(() => {
      if (runParam) {
        // Evita recarregar o run já aberto (clique repetido, re-render, etc.)
        if (runSelecionado()?.id !== runParam) {
          void abrirLogPorId(runParam);
        }
      } else {
        if (liveLogInterval) {
          clearInterval(liveLogInterval);
          liveLogInterval = null;
        }
        setRunSelecionado(null);
        setLogRun("");
      }
    });
  });

  // Reagir a troca de workspace selecionado (recarrega lista + fuso do workspace)
  createEffect(() => {
    wsAtivo();
    void carregarFuso();
    void carregarHistorico(false);
  });

  onMount(() => {
    void carregarFuso();
    void carregarHistorico(false);

    // Polling inteligente em tempo real: 2.5s se ativo na tela, 6s se em background
    const iniciarPolling = () => {
      if (pollInterval) clearInterval(pollInterval);
      const intervaloMs = typeof document !== "undefined" && document.hidden ? 6000 : 2500;
      pollInterval = setInterval(() => {
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
    if (pollInterval) clearInterval(pollInterval);
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

  // Ordenação garantida do mais recente ao mais velho + busca textual no cliente
  // (o backend ignora ?busca= para execuções — aqui ela vale para todos os tipos)
  const itensOrdenados = () => {
    const b = filtroBusca().trim().toLowerCase();
    let lista = itensFiltrados();
    if (b) {
      lista = lista.filter((i) =>
        [i.titulo, i.ordem, i.agente, i.id, i.flow]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(b)
      );
    }
    return [...lista].sort((x, y) => String(y.quando || "").localeCompare(String(x.quando || "")));
  };

  const totalPaginas = () => Math.max(1, Math.ceil(itensOrdenados().length / porPagina()));
  const paginaAtual = () => Math.min(Math.max(pagina(), 1), totalPaginas());
  const faixaAtual = () => {
    const total = itensOrdenados().length;
    if (total === 0) return "0";
    const ini = (paginaAtual() - 1) * porPagina() + 1;
    const fim = Math.min(paginaAtual() * porPagina(), total);
    return `${ini}–${fim}`;
  };
  const itensPaginados = () => {
    const ini = (paginaAtual() - 1) * porPagina();
    return itensOrdenados().slice(ini, ini + porPagina());
  };

  const badgeTipo = (tipo: string) => {
    switch (tipo) {
      case "execucao":
        return <span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-700/40 text-zinc-300 border border-zinc-600/40">EXECUÇÃO</span>;
      case "fluxo":
        return <span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">FLUXO</span>;
      case "rotina":
        return <span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">ROTINA</span>;
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
              {faixaAtual()} de {itensOrdenados().length} registros · pág {paginaAtual()}/{totalPaginas()}
            </span>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5">
            Linha do tempo auditável de cada chamada a LLM, fluxo executado, tarefa concluída, rotina 24h e decisão do Secretário.
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
              onClick={() => setSearchParams({ tipo: "fluxo" })}
              class={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filtroTipo() === "fluxo" ? "bg-zinc-800 text-zinc-100 font-semibold" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Fluxos
            </button>
            <button
              onClick={() => setSearchParams({ tipo: "rotina" })}
              class={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filtroTipo() === "rotina" ? "bg-zinc-800 text-zinc-100 font-semibold" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Rotinas
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
              <option value="cancelado" class="bg-zinc-900">Cancelado</option>
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

          {/* Busca textual (título, agente, id, fluxo) */}
          <div class="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs">
            <Search size={12} class="text-zinc-400 flex-shrink-0" />
            <input
              type="text"
              placeholder="Buscar título, agente, id…"
              class="bg-transparent text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none w-36 sm:w-52"
              value={termoBusca()}
              onInput={(e) => aoDigitarBusca(e.currentTarget.value)}
            />
            <Show when={termoBusca()}>
              <button
                type="button"
                onClick={() => aoDigitarBusca("")}
                class="text-zinc-500 hover:text-zinc-200 cursor-pointer"
                title="Limpar busca"
              >
                <X size={12} />
              </button>
            </Show>
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
            each={itensPaginados()}
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
              const cancelado = item.status === "cancelado";
              const temFilhas = Boolean(item.filhas && item.filhas.length > 0);
              const grupoAberto = () => gruposAbertos().has(item.id);

              return (
                <>
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
                        ) : cancelado ? (
                          <StopCircle size={16} class="text-zinc-500" />
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
                          <Show when={temFilhas}>
                            <span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-sky-500/15 text-sky-300 border border-sky-500/30">
                              {item.filhas!.length} {item.filhas!.length === 1 ? "filho" : "filhos"}
                            </span>
                          </Show>
                        </div>

                        <div class="text-[11px] text-zinc-300 truncate max-w-xl mt-0.5 font-sans">
                          {item.titulo || item.ordem || "Registro de atividade no sistema"}
                        </div>
                        <Show when={item.tipo === "fluxo" && item.nos_total}>
                          <div class="text-[10px] text-indigo-300/80 font-mono mt-0.5">
                            {item.nos_ok ?? 0}/{item.nos_total} nós ok{item.flow ? ` · ${item.flow}` : ""}
                          </div>
                        </Show>
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
                          {item.quando ? fmtHora(item.quando) : ""}
                        </div>
                      </div>

                      <Show when={temFilhas}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            alternarGrupo(item.id);
                          }}
                          class="flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-700/70 bg-zinc-900 text-[10px] font-mono text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                          title="Expandir execuções agrupadas"
                        >
                          {grupoAberto() ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          {item.filhas!.length}
                        </button>
                      </Show>

                      <ArrowRight size={14} class="text-zinc-600 hover:text-zinc-300" />
                    </div>
                  </div>

                  <Show when={temFilhas && grupoAberto()}>
                    <div class="ml-4 pl-4 border-l-2 border-zinc-700/60 space-y-1.5">
                      <For each={item.filhas}>
                        {(filha) => {
                          const fOk = filha.status === "concluido" || filha.status === "feito";
                          const fFalhou = filha.status === "falhou";
                          const fExecutando = filha.status === "executando";
                          const fCancelado = filha.status === "cancelado";
                          return (
                            <div
                              onClick={() => setSearchParams({ run: filha.id })}
                              class="p-2.5 rounded-lg border bg-zinc-950/60 border-zinc-800/70 hover:border-zinc-700 cursor-pointer flex items-center justify-between gap-3 text-xs"
                            >
                              <div class="flex items-center gap-2.5 min-w-0">
                                <div class="flex-shrink-0">
                                  {fExecutando ? (
                                    <RefreshCw size={13} class="text-indigo-400 animate-spin" />
                                  ) : fOk ? (
                                    <CheckCircle2 size={13} class="text-emerald-400" />
                                  ) : fFalhou ? (
                                    <XCircle size={13} class="text-rose-400" />
                                  ) : fCancelado ? (
                                    <StopCircle size={13} class="text-zinc-500" />
                                  ) : (
                                    <Clock size={13} class="text-zinc-500" />
                                  )}
                                </div>
                                <span class="font-mono font-semibold text-zinc-200 truncate">
                                  {filha.no ?? filha.id}
                                </span>
                                <Show when={filha.volta !== undefined}>
                                  <span class="text-[10px] text-zinc-500 font-mono">volta {filha.volta}</span>
                                </Show>
                                <Show when={filha.agente}>
                                  <span class="text-[10px] text-zinc-500 font-mono">@{filha.agente}</span>
                                </Show>
                              </div>
                              <div class="flex items-center gap-2 flex-shrink-0">
                                <span class="text-[10px] text-zinc-500 font-mono">{filha.id}</span>
                                <span
                                  class={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                                    fOk
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                      : fFalhou
                                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                      : fExecutando
                                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                                      : fCancelado
                                      ? "bg-zinc-800 text-zinc-400 border border-zinc-700"
                                      : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                                  }`}
                                >
                                  {filha.status ?? "—"}
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </>
              );
            }}
          </For>
        </div>
      </div>

      {/* Paginação — lista finita do mais recente ao mais velho */}
      <div class="flex items-center justify-between gap-3 pt-1 text-xs text-zinc-400 flex-shrink-0 flex-wrap">
        <span class="font-mono text-[11px]">
          Mostrando {faixaAtual()} de {itensOrdenados().length} · mais recentes primeiro
        </span>
        <div class="flex items-center gap-2 flex-wrap">
          <label class="text-[11px] text-zinc-500 font-mono">por pág:</label>
          <select
            class="bg-zinc-900 border border-zinc-800 rounded-lg px-1.5 py-1 text-xs text-zinc-300 focus:outline-none cursor-pointer"
            value={porPagina()}
            onChange={(e) => {
              setPorPagina(Number(e.currentTarget.value) || 25);
              setPagina(1);
            }}
          >
            <option value="10" class="bg-zinc-900">10</option>
            <option value="25" class="bg-zinc-900">25</option>
            <option value="50" class="bg-zinc-900">50</option>
            <option value="100" class="bg-zinc-900">100</option>
          </select>
          <button
            type="button"
            disabled={paginaAtual() <= 1}
            onClick={() => setPagina(paginaAtual() - 1)}
            class="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-zinc-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          >
            ‹ Anterior
          </button>
          <span class="font-mono text-[11px] text-zinc-400">
            pág {paginaAtual()}/{totalPaginas()}
          </span>
          <button
            type="button"
            disabled={paginaAtual() >= totalPaginas()}
            onClick={() => setPagina(paginaAtual() + 1)}
            class="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-zinc-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          >
            Próxima ›
          </button>
        </div>
      </div>

      {/* Modal padrão de Task: instrução, comentários e execuções vinculadas */}
      <Show when={taskModal()}>
        <div class="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) fecharTask(); }}>
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-3xl w-full p-4 sm:p-5 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3 flex-shrink-0">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  {badgeTipo("task")}
                  <h2 class="text-sm font-bold text-zinc-100 truncate">
                    {taskModal()!.task?.titulo || "Carregando tarefa…"}
                  </h2>
                </div>
                <div class="text-[11px] text-zinc-400 font-mono mt-0.5">
                  {taskModal()!.task ? (
                    <><Show
                      when={taskModal()!.task.responsavel}
                      fallback={<span>sem responsável</span>}
                    >
                      <button
                        type="button"
                        onClick={() => abrirAgente(taskModal()!.task.responsavel)}
                        class="hover:text-emerald-300 hover:underline cursor-pointer"
                        title={`Abrir ${taskModal()!.task.responsavel}`}
                      >
                        @{taskModal()!.task.responsavel}
                      </button>
                    </Show><span> · </span><span class="capitalize">{taskModal()!.task.coluna}</span><span> · </span><span>{taskModal()!.task.id}</span></>
                  ) : (
                    <span>buscando dados da tarefa…</span>
                  )}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Show when={taskModal()!.task}>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      const id = taskModal()!.task.id;
                      fecharTask();
                      navigate(`/tasks?task=${encodeURIComponent(id)}`);
                    }}
                    title="Abrir no quadro de Tasks"
                  >
                    <ExternalLink size={13} class="mr-1" /> Quadro
                  </Button>
                </Show>
                <IconButton size="xs" variant="ghost" onClick={fecharTask} title="Fechar (ESC)">
                  <X size={16} />
                </IconButton>
              </div>
            </div>

            <Show when={taskModal()!.carregando}>
              <div class="py-12 text-center text-xs text-zinc-400">
                <RefreshCw size={18} class="animate-spin mx-auto mb-2 text-purple-400" />
                Carregando tarefa, comentários e execuções…
              </div>
            </Show>

            <Show when={!taskModal()!.carregando && !taskModal()!.task}>
              <div class="py-12 text-center text-xs text-zinc-500">
                Tarefa não encontrada neste workspace.
              </div>
            </Show>

            <Show when={!taskModal()!.carregando && taskModal()!.task}>
              <div class="flex-1 overflow-y-auto min-h-0 space-y-4 scrollbar-thin pr-1">
                <Show when={taskModal()!.task.descricao}>
                  <div class="text-xs bg-zinc-950/70 border border-zinc-800/80 rounded-lg px-2.5 py-2 text-zinc-300 leading-relaxed select-text">
                    <span class="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500 block mb-0.5">
                      Instrução:
                    </span>
                    <span class="whitespace-pre-wrap">{taskModal()!.task.descricao}</span>
                  </div>
                </Show>

                <div class="space-y-2">
                  <div class="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Terminal size={12} class="text-emerald-400" /> Execuções do agente nesta task
                    <Show when={taskModal()!.execs.length > 0}>
                      <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        {taskModal()!.execs.length}
                      </span>
                    </Show>
                  </div>
                  <Show
                    when={taskModal()!.execs.length > 0}
                    fallback={<div class="text-[11px] text-zinc-500 py-1">Nenhuma execução vinculada — clique em Executar na página da task para gerar a primeira.</div>}
                  >
                    <For each={taskModal()!.execs}>
                      {(ex) => (
                        <button
                          type="button"
                          onClick={() => {
                            fecharTask();
                            setSearchParams({ run: ex.id });
                          }}
                          class="w-full text-left p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/70 hover:border-zinc-600 cursor-pointer flex items-center justify-between gap-2 transition-colors"
                          title={`Abrir chat da execução ${ex.id}`}
                        >
                          <div class="min-w-0">
                            <div class="flex items-center gap-1.5">
                              <span class={`h-2 w-2 rounded-full flex-shrink-0 ${ex.status === "concluido" || ex.status === "feito" ? "bg-emerald-400" : ex.status === "falhou" ? "bg-rose-400" : ex.status === "executando" ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
                              <span role="link" tabindex="0" onClick={(e) => { e.stopPropagation(); abrirAgente(ex.agente); }} onKeyDown={(e) => { if (e.key === "Enter") abrirAgente(ex.agente); }} class="font-mono font-semibold text-zinc-200 text-[11px] hover:text-emerald-300 hover:underline cursor-pointer" title={`Abrir ${ex.agente}`}>@{ex.agente}</span>
                              <span class="text-[10px] text-zinc-500 font-mono truncate">{ex.id}</span>
                            </div>
                            <div class="text-[10px] text-zinc-500 font-mono mt-0.5">
                              {ex.status}{ex.duracao_ms ? ` · ${(ex.duracao_ms / 1000).toFixed(1)}s` : ""}{ex.inicio ? ` · ${fmtHora(ex.inicio)}` : ""}
                            </div>
                          </div>
                          <span class="text-[10px] font-mono text-zinc-500 flex-shrink-0">abrir chat →</span>
                        </button>
                      )}
                    </For>
                  </Show>
                </div>

                <div class="space-y-2">
                  <div class="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
                    <MessageSquare size={12} class="text-zinc-400" /> Comentários & Handoffs
                  </div>
                  <Show
                    when={taskModal()!.msgs.length > 0}
                    fallback={<div class="text-[11px] text-zinc-500 py-1">Nenhum comentário registrado ainda.</div>}
                  >
                    <For each={taskModal()!.msgs}>
                      {(m) => (
                        <div class="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/70 text-xs space-y-1">
                          <div class="flex items-center justify-between text-[10px] text-zinc-500">
                            <span class="font-semibold text-zinc-300 font-mono">@{m.autor} · {m.tipo}</span>
                            <span>{m.criado_em ? fmtHora(m.criado_em) : ""}</span>
                          </div>
                          <p class="text-zinc-300 leading-relaxed text-[11px] whitespace-pre-wrap">{m.corpo}</p>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </div>
            </Show>

            <div class="pt-2 border-t border-zinc-800/80 flex justify-end flex-shrink-0">
              <Button size="sm" variant="secondary" onClick={fecharTask}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </Show>

      {/* Modal padrão de Rotina / Conversa: mesma casca, sem navegar para fora */}
      <Show when={infoModal()}>
        <div class="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) fecharInfo(); }}>
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-3xl w-full p-4 sm:p-5 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3 flex-shrink-0">
              <div class="min-w-0">
                <Show
                  when={infoModal()!.kind === "rotina"}
                  fallback={
                    <div class="flex items-center gap-2">
                      {badgeTipo("conversa")}
                      <h2 class="text-sm font-bold text-zinc-100 truncate">
                        {(infoModal() as any).item?.titulo || "Conversa"}
                      </h2>
                    </div>
                  }
                >
                  <div class="flex items-center gap-2">
                    {badgeTipo("rotina")}
                    <h2 class="text-sm font-bold text-zinc-100 truncate">
                      {(infoModal() as any).job?.nome || "Carregando rotina…"}
                    </h2>
                  </div>
                </Show>
                <div class="text-[11px] text-zinc-400 font-mono mt-0.5">
                  <Show
                    when={infoModal()!.kind === "rotina"}
                    fallback={<><button
                      type="button"
                      onClick={() => abrirAgente((infoModal() as any).item?.agente)}
                      class="hover:text-emerald-300 hover:underline cursor-pointer"
                      title={`Abrir ${(infoModal() as any).item?.agente}`}
                    >
                      @{(infoModal() as any).item?.agente}
                    </button><span> · {(infoModal() as any).item?.id}</span></>}
                  >
                    <span>
                      {(infoModal() as any).job ? (
                        <><span>@rotina</span><span> · </span><span>{(infoModal() as any).job.ativo ? "ativa" : "pausada"}</span><span> · </span><span>{(infoModal() as any).job.id}</span></>
                      ) : "buscando dados do agendamento…"}
                    </span>
                  </Show>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Show when={infoModal()!.kind === "rotina" && (infoModal() as any).job}>
                  <Button size="xs" variant="ghost" onClick={() => navigate("/agenda")} title="Abrir agenda 24h">
                    <ExternalLink size={13} class="mr-1" /> Agenda
                  </Button>
                </Show>
                <Show when={infoModal()!.kind === "conversa"}>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      const id = (infoModal() as any).item.id;
                      fecharInfo();
                      navigate(`/secretario?sessao=${encodeURIComponent(id)}`);
                    }}
                    title="Continuar esta conversa no Secretário"
                  >
                    <MessageSquare size={13} class="mr-1" /> Continuar chat →
                  </Button>
                </Show>
                <IconButton size="xs" variant="ghost" onClick={fecharInfo} title="Fechar">
                  <X size={16} />
                </IconButton>
              </div>
            </div>

            <Show when={(infoModal() as any).carregando}>
              <div class="py-12 text-center text-xs text-zinc-400">
                <RefreshCw size={18} class="animate-spin mx-auto mb-2 text-amber-400" />
                Carregando detalhes…
              </div>
            </Show>

            <Show when={!(infoModal() as any).carregando}>
              <div class="flex-1 overflow-y-auto min-h-0 space-y-4 scrollbar-thin pr-1">
                {/* ---- ROTINA ---- */}
                <Show when={infoModal()!.kind === "rotina"}>
                  <Show
                    when={(infoModal() as any).job}
                    fallback={<div class="py-8 text-center text-xs text-zinc-500">Agendamento não encontrado (pode ter sido removido).</div>}
                  >
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div class="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                        <span class="text-[10px] uppercase font-mono font-bold text-zinc-500 block mb-0.5">Cron</span>
                        <span class="font-mono text-zinc-200">{(infoModal() as any).job.agenda?.valor || (infoModal() as any).job.agenda?.tipo || "—"}</span>
                      </div>
                      <div class="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800">
                        <span class="text-[10px] uppercase font-mono font-bold text-zinc-500 block mb-0.5">Última exec</span>
                        <span class="font-mono text-zinc-200">{fmtDataHora((infoModal() as any).job.ultima_exec)}</span>
                      </div>
                      <div class={`p-2.5 rounded-lg border ${(infoModal() as any).job.proxima_exec && jaPassou((infoModal() as any).job.proxima_exec) ? "bg-amber-950/40 border-amber-500/50" : "bg-zinc-950/60 border-zinc-800"}`}>
                        <span class="text-[10px] uppercase font-mono font-bold text-zinc-500 block mb-0.5">
                          Próxima exec <span class="text-zinc-600 normal-case">({fuso()})</span>
                        </span>
                        <span class="font-mono text-zinc-200">{fmtDataHora((infoModal() as any).job.proxima_exec)}</span>
                        <Show when={(infoModal() as any).job.proxima_exec && jaPassou((infoModal() as any).job.proxima_exec)}>
                          <span class="block mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 w-fit">
                            atrasada {distanciaHumana((infoModal() as any).job.proxima_exec)} — daemon parado?
                          </span>
                        </Show>
                      </div>
                    </div>
                    <div class="text-xs bg-zinc-950/60 border border-zinc-800 rounded-lg px-2.5 py-2">
                      <span class="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500 block mb-0.5">
                        Como executa · {(infoModal() as any).job && tipoJob((infoModal() as any).job) === "script" ? "script direto (sem agente)" : tipoJob((infoModal() as any).job)}
                      </span>
                      <code class="font-mono text-[11px] text-zinc-300 break-all select-text">{(infoModal() as any).job && comandoJob((infoModal() as any).job)}</code>
                      <Show
                        when={
                          (infoModal() as any).job &&
                          tipoJob((infoModal() as any).job) === "fluxo" &&
                          (infoModal() as any).job.args?.[2]
                        }
                      >
                        <div class="mt-1.5">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => {
                              const fid = String((infoModal() as any).job.args[2]);
                              fecharInfo();
                              navigate(`/fluxos?fluxo=${encodeURIComponent(fid)}`);
                            }}
                            title="Abrir o fluxo que este job agenda"
                          >
                            <ExternalLink size={12} class="mr-1" /> Abrir fluxo {(infoModal() as any).job.args[2]} →
                          </Button>
                        </div>
                      </Show>
                      <Show when={(infoModal() as any).job && tipoJob((infoModal() as any).job) === "script"}>
                        <p class="text-[11px] text-zinc-500 mt-1 font-sans">
                          Job de script: roda o comando acima e não gera execução de agente — o rastro está nos disparos do agendador abaixo.
                        </p>
                      </Show>
                    </div>
                    <div class="space-y-2">
                      <div class="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
                        <Terminal size={12} class="text-emerald-400" /> Execuções desta rotina
                        <Show when={(infoModal() as any).execs.length > 0}>
                          <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                            {(infoModal() as any).execs.length}
                          </span>
                        </Show>
                      </div>
                      <Show
                        when={(infoModal() as any).execs.length > 0}
                        fallback={<div class="text-[11px] text-zinc-500 py-1">Nenhuma execução registrada para este agendamento ainda.</div>}
                      >
                        <For each={(infoModal() as any).execs}>
                          {(ex: ItemHistorico) => (
                            <button
                              type="button"
                              onClick={() => {
                                fecharInfo();
                                setSearchParams({ run: ex.id });
                              }}
                              class="w-full text-left p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/70 hover:border-zinc-600 cursor-pointer flex items-center justify-between gap-2 transition-colors"
                              title={`Abrir chat da execução ${ex.id}`}
                            >
                              <div class="min-w-0">
                                <div class="flex items-center gap-1.5">
                                  <span class={`h-2 w-2 rounded-full flex-shrink-0 ${ex.status === "concluido" ? "bg-emerald-400" : ex.status === "falhou" ? "bg-rose-400" : ex.status === "executando" ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
                                  <span role="link" tabindex="0" onClick={(e) => { e.stopPropagation(); abrirAgente(ex.agente); }} onKeyDown={(e) => { if (e.key === "Enter") abrirAgente(ex.agente); }} class="font-mono font-semibold text-zinc-200 text-[11px] hover:text-emerald-300 hover:underline cursor-pointer" title={`Abrir ${ex.agente}`}>@{ex.agente}</span>
                                  <span class="text-[10px] text-zinc-500 font-mono truncate">{ex.id}</span>
                                </div>
                                <div class="text-[10px] text-zinc-500 font-mono mt-0.5">
                                  {ex.status}{ex.duracao_ms ? ` · ${(ex.duracao_ms / 1000).toFixed(1)}s` : ""}{ex.quando ? ` · ${fmtHora(ex.quando)}` : ""}
                                </div>
                              </div>
                              <span class="text-[10px] font-mono text-zinc-500 flex-shrink-0">abrir chat →</span>
                            </button>
                          )}
                        </For>
                      </Show>
                    </div>
                  </Show>
                </Show>

                <Show when={infoModal()!.kind === "rotina" && (infoModal() as any).job}>
                  <div class="space-y-2">
                    <div class="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Clock size={12} class="text-amber-400" /> Disparos do agendador
                      <Show when={(infoModal() as any).runs.length > 0}>
                        <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                          {(infoModal() as any).runs.length}
                        </span>
                      </Show>
                    </div>
                    <Show
                      when={(infoModal() as any).runs.length > 0}
                      fallback={<div class="text-[11px] text-zinc-500 py-1">Nenhum disparo registrado para este agendamento.</div>}
                    >
                      <For each={(infoModal() as any).runs.slice(0, 10)}>
                        {(r: any) => (
                          <div class="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/70 text-xs flex items-center justify-between gap-2">
                            <div class="min-w-0">
                              <div class="font-mono text-[11px] text-zinc-200">
                                {r.iniciado_em ? fmtDataHora(r.iniciado_em) : `#${r.id}`}
                              </div>
                              <Show when={r.resultado}>
                                <div class="text-[10px] text-zinc-500 font-mono truncate">{String(r.resultado).slice(0, 120)}</div>
                              </Show>
                              <Show when={r.erro}>
                                <div class="text-[10px] text-rose-300 font-mono truncate">{String(r.erro).slice(0, 160)}</div>
                              </Show>
                            </div>
                            <span class={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold flex-shrink-0 ${
                              r.pulado
                                ? "bg-zinc-800 text-zinc-400 border border-zinc-700"
                                : r.erro
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            }`}>
                              {r.pulado ? "pulado" : r.erro ? "erro" : "ok"}
                            </span>
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                </Show>

                {/* ---- CONVERSA ---- */}                <Show when={infoModal()!.kind === "conversa"}>
                  <Show
                    when={(infoModal() as any).msgs.length > 0}
                    fallback={<div class="py-8 text-center text-xs text-zinc-500">Nenhuma mensagem nesta conversa.</div>}
                  >
                    <div class="space-y-2">
                      <For each={(infoModal() as any).msgs}>
                        {(m: { role: string; content: string }) => (
                          <div class={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div class={`max-w-[85%] p-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap select-text ${
                              m.role === "user"
                                ? "bg-zinc-800/80 border border-zinc-700/60 text-zinc-100"
                                : "bg-transparent border border-zinc-800 text-zinc-300"
                            }`}>
                              <div class={`text-[10px] font-mono mb-1 ${m.role === "user" ? "text-zinc-400" : "text-emerald-400"}`}>
                                {m.role === "user" ? "Você" : `@${(infoModal() as any).item?.agente || "secretario"}`}
                              </div>
                              {m.content}
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </Show>
              </div>
            </Show>

            <div class="pt-2 border-t border-zinc-800/80 flex justify-end flex-shrink-0">
              <Button size="sm" variant="secondary" onClick={fecharInfo}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </Show>

      {/* Modal / Visualizador de Log */}
      <Show when={runSelecionado()}>
        <div class="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50" onClick={(e) => { if (e.target === e.currentTarget) fecharLog(); }}>
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-5xl w-full p-4 sm:p-5 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
            {/* Topo do Modal */}
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3 flex-shrink-0">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <Show
                    when={(runSelecionado() as ItemHistorico)?.tipo === "fluxo"}
                    fallback={<Terminal size={17} class="text-emerald-400" />}
                  >
                    <GitBranch size={17} class="text-indigo-400" />
                  </Show>
                  <Show
                    when={(runSelecionado() as ItemHistorico)?.tipo === "fluxo"}
                    fallback={
                      <h2 class="text-sm font-bold text-zinc-100 font-mono truncate">
                        Execução: {runSelecionado()!.id}
                      </h2>
                    }
                  >
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/fluxos?fluxo=${encodeURIComponent((runSelecionado() as ItemHistorico)?.flow || runSelecionado()!.id)}`)
                      }
                      class="text-sm font-bold text-zinc-100 font-mono truncate hover:text-indigo-300 hover:underline cursor-pointer text-left"
                      title="Abrir fluxo no Studio"
                    >
                      Fluxo: {(runSelecionado() as ItemHistorico)?.flow || runSelecionado()!.id}
                    </button>
                  </Show>
                  <Show when={runSelecionado()!.status === "executando"}>
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                      STREAMING AO VIVO
                    </span>
                  </Show>
                </div>
                <div class="text-[11px] text-zinc-400 font-mono mt-0.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => abrirAgente(runSelecionado()!.agente)}
                    class="hover:text-emerald-300 hover:underline cursor-pointer"
                    title={`Abrir ${runSelecionado()!.agente}`}
                  >
                    @{runSelecionado()!.agente}
                  </button>
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
                <Show when={(runSelecionado() as ItemHistorico)?.tipo === "fluxo" && ((runSelecionado() as ItemHistorico)?.flow || entradaFluxo())}>
                  <div class="mt-2 text-xs bg-indigo-950/30 border border-indigo-800/40 rounded-lg px-2.5 py-1.5 text-zinc-300 font-sans max-h-20 overflow-y-auto leading-relaxed select-text">
                    <span class="text-[10px] uppercase font-mono font-bold tracking-wider text-indigo-400/80 block mb-0.5">
                      Fluxo: {(runSelecionado() as ItemHistorico)?.flow || "—"}
                    </span>
                    {entradaFluxo() || (runSelecionado() as ItemHistorico)?.entrada || "Sem entrada registrada."}
                  </div>
                </Show>
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
                {/* Switcher: circuito+resultado para fluxos; chat/telemetria/terminal/diff para agentes */}
                <div class="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                  <Show
                    when={(runSelecionado() as ItemHistorico)?.tipo === "fluxo"}
                    fallback={
                      <>
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
                        <button
                          type="button"
                          onClick={() => setModoVisualizacao("diff")}
                          class={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                            modoVisualizacao() === "diff"
                              ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          <GitCommit size={13} class="text-amber-400" />
                          <span>Diff de Arquivos {arquivosDiff().length > 0 ? `(${arquivosDiff().length})` : ""}</span>
                        </button>
                      </>
                    }
                  >
                    <button
                      type="button"
                      onClick={() => setModoVisualizacao("fluxo")}
                      class={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                        modoVisualizacao() === "fluxo"
                          ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <GitBranch size={13} class="text-indigo-400" />
                      <span>Circuito {nosFluxo().length > 0 ? `(${nosFluxo().length})` : ""}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoVisualizacao("resultado")}
                      class={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                        modoVisualizacao() === "resultado"
                          ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <FileText size={13} class="text-emerald-400" />
                      <span>Resultado</span>
                    </button>
                  </Show>
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
                    const run = runSelecionado() as ItemHistorico | null;
                    if (run?.tipo === "fluxo" && run.flow) {
                      navigate(`/fluxos?fluxo=${encodeURIComponent(run.flow)}`);
                    } else if (run?.agente) {
                      navigate(`/agentes?agente=${encodeURIComponent(run.agente)}`);
                    } else {
                      navigate("/config");
                    }
                  }}
                  title={(runSelecionado() as ItemHistorico)?.tipo === "fluxo" ? "Abrir fluxo no Studio" : "Configurar agente ou parâmetros"}
                  class="text-zinc-400 hover:text-zinc-100"
                >
                  <Settings size={13} class="mr-1" /> {(runSelecionado() as ItemHistorico)?.tipo === "fluxo" ? "Studio" : "Configurar"}
                </Button>

                <Button
                  size="xs"
                  variant="ghost"
                  onClick={reenviarExecucao}
                  disabled={reenviando()}
                  title={(runSelecionado() as ItemHistorico)?.tipo === "fluxo" ? "Reexecutar este fluxo (novo exec_id)" : "Reenviar esta execução com os mesmos parâmetros"}
                  class="!bg-sky-950/40 !text-sky-300 hover:!bg-sky-900/60 !border !border-sky-800/80 font-bold"
                >
                  <RotateCcw size={13} class={`mr-1 text-sky-400 ${reenviando() ? "animate-spin" : ""}`} />
                  {reenviando() ? "Reenviando..." : (runSelecionado() as ItemHistorico)?.tipo === "fluxo" ? "Reexecutar fluxo" : "Reenviar"}
                </Button>

                <Show when={(runSelecionado() as ItemHistorico)?.tipo === "fluxo" && (runSelecionado() as ItemHistorico)?.flow && runSelecionado()!.status === "falhou"}>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={retomarFluxo}
                    disabled={reenviando()}
                    title="Retomar fluxo falho do último nó ok (mesmo exec_id)"
                    class="!bg-indigo-950/40 !text-indigo-300 hover:!bg-indigo-900/60 !border !border-indigo-800/80 font-bold"
                  >
                    <GitBranch size={13} class="mr-1 text-indigo-400" />
                    Retomar
                  </Button>
                </Show>

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
              <Show
                when={(runSelecionado() as ItemHistorico)?.tipo === "fluxo"}
                fallback={<span>{logRun().split("\n").length} linhas capturadas</span>}
              >
                <span>{nosFluxo().filter((n) => n.status === "ok").length}/{nosFluxo().length} nós concluídos</span>
              </Show>
            </div>

            {/* Corpo: Fluxo, Chat ao Vivo, Terminal Raw ou Telemetria Granular */}
            <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
              <Show when={modoVisualizacao() === "fluxo"}>
                <div class="flex-1 overflow-y-auto scrollbar-thin p-1 space-y-3">
                  <Show when={carregandoFluxo()}>
                    <div class="py-12 text-center text-xs text-zinc-400">
                      <RefreshCw size={18} class="animate-spin mx-auto mb-2 text-indigo-400" />
                      Carregando timeline do fluxo...
                    </div>
                  </Show>
                  <Show when={!carregandoFluxo() && entradaFluxo()}>
                    <div class="bg-zinc-950/70 border border-zinc-800 rounded-xl p-3 text-xs">
                      <span class="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500 block mb-1">Entrada do fluxo:</span>
                      <pre class="font-sans text-zinc-300 whitespace-pre-wrap select-text max-h-24 overflow-y-auto">{entradaFluxo()}</pre>
                    </div>
                  </Show>
                  <Show when={!carregandoFluxo() && nosFluxo().length === 0}>
                    <div class="py-12 text-center text-xs text-zinc-500 bg-zinc-950/40 rounded-xl border border-zinc-800/80 p-6">
                      <GitBranch size={24} class="mx-auto mb-2 text-zinc-600" />
                      <p class="font-medium text-zinc-400">Nenhum nó registrado para esta execução</p>
                      <p class="text-[11px] text-zinc-500 mt-1">O fluxo pode ainda estar iniciando ou o registro foi arquivado.</p>
                    </div>
                  </Show>
                  <Show when={!carregandoFluxo() && nosFluxo().length > 0}>
                    <div class="text-[11px] text-zinc-500 font-mono px-1">
                      Clique num nó com execução para abrir o chat do agente naquele passo.
                    </div>
                    <FlowChart
                      nos={nosFluxo()}
                      arestas={(defFluxo()?.arestas || []).map((a) => ({ de: a.de, para: a.para, rotulo: a.rotulo }))}
                      onAbrirExec={(execId) => setSearchParams({ run: execId })}
                    />
                  </Show>
                  <Show when={!carregandoFluxo() && contextoFinalFluxo()}>
                    <div class="bg-zinc-950/70 border border-zinc-800 rounded-xl p-3 text-xs">
                      <span class="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500 block mb-1">Contexto final / como foi:</span>
                      <pre class="font-sans text-zinc-300 whitespace-pre-wrap select-text max-h-64 overflow-y-auto leading-relaxed">{contextoFinalFluxo()}</pre>
                    </div>
                  </Show>
                </div>
              </Show>
              <Show when={modoVisualizacao() === "chat" && (runSelecionado() as ItemHistorico)?.tipo !== "fluxo"}>
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

              <Show when={modoVisualizacao() === "resultado" && (runSelecionado() as ItemHistorico)?.tipo === "fluxo"}>
                <div class="flex-1 overflow-y-auto scrollbar-thin p-1 space-y-3">
                  <Show when={entradaFluxo()}>
                    <div class="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
                      <div class="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500 mb-1.5">Entrada</div>
                      <div class="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed select-text">{entradaFluxo()}</div>
                    </div>
                  </Show>
                  <div class="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
                    <div class="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500 mb-1.5">
                      Resultado · {(runSelecionado() as ItemHistorico)?.flow}
                    </div>
                    <Show
                      when={contextoFinalFluxo().trim()}
                      fallback={<div class="text-xs text-zinc-500">Fluxo ainda executando — acompanhe pela aba Circuito.</div>}
                    >
                      <div class="text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed select-text max-h-[50vh] overflow-y-auto scrollbar-thin">{contextoFinalFluxo()}</div>
                    </Show>
                  </div>
                  <For each={nosFluxo().filter((n) => n.exec_id)}>
                    {(no) => (
                      <button
                        type="button"
                        onClick={() => setSearchParams({ run: no.exec_id })}
                        class="w-full text-left rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-300 font-mono cursor-pointer flex items-center justify-between gap-2"
                      >
                        <span class="truncate">{no.id} · {no.tipo}</span>
                        <span class="text-zinc-500 flex-shrink-0">ver exec →</span>
                      </button>
                    )}
                  </For>
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
                        <button
                          type="button"
                          onClick={() => exportarTelemetria("csv")}
                          class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono hover:bg-zinc-700 cursor-pointer"
                          title="Exportar telemetria em CSV"
                        >
                          ⬇ CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => exportarTelemetria("json")}
                          class="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono hover:bg-zinc-700 cursor-pointer"
                          title="Exportar telemetria em JSON"
                        >
                          ⬇ JSON
                        </button>
                      </div>
                    </div>

                    {/* Gráfico Latência vs Custo por modelo */}
                    <div class="bg-zinc-950/70 border border-zinc-800 rounded-xl p-3 text-xs">
                      <div class="text-[11px] font-semibold text-zinc-300 mb-2">Latência vs Custo por modelo</div>
                      <svg viewBox="0 0 400 160" class="w-full h-[160px] bg-zinc-900/60 rounded-lg border border-zinc-800/60">
                        <line x1="30" y1="10" x2="30" y2="140" stroke="#52525b" stroke-width="1" />
                        <line x1="30" y1="140" x2="390" y2="140" stroke="#52525b" stroke-width="1" />
                        <text x="6" y="80" fill="#71717a" font-size="9" transform="rotate(-90 6 80)">ms</text>
                        <text x="330" y="155" fill="#71717a" font-size="9">custo USD →</text>
                        <For each={pontosLatenciaCusto()}>
                          {(p) => (
                            <g>
                              <title>{`${p.modelo}: ${p.mediaMs}ms médios, $${p.custo.toFixed(4)}`}</title>
                              <circle
                                cx={30 + Math.min(p.custo * 4000, 340)}
                                cy={140 - Math.min(p.mediaMs / 20, 120)}
                                r={4 + Math.min(p.total, 10)}
                                fill={p.falhas > 0 ? "#f43f5e" : "#38bdf8"}
                                opacity="0.85"
                              />
                              <text x={36 + Math.min(p.custo * 4000, 340)} y={144 - Math.min(p.mediaMs / 20, 120)} fill="#a1a1aa" font-size="8" font-family="monospace">
                                {p.modelo.slice(0, 18)}
                              </text>
                            </g>
                          )}
                        </For>
                      </svg>
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

              <Show when={modoVisualizacao() === "diff"}>
                <div class="flex-1 overflow-y-auto scrollbar-thin p-1 flex flex-col space-y-3">
                  <Show when={carregandoDiff()}>
                    <div class="py-16 text-center text-xs text-zinc-400">
                      <RefreshCw size={18} class="animate-spin mx-auto mb-2 text-amber-400" />
                      Calculando diff de arquivos do Git para esta execução...
                    </div>
                  </Show>

                  <Show when={!carregandoDiff() && !diffRun().trim()}>
                    <div class="py-16 text-center text-xs text-zinc-500 bg-zinc-950/40 rounded-xl border border-zinc-800/80 p-6">
                      <GitCommit size={28} class="mx-auto mb-2 text-zinc-600 opacity-60" />
                      <p class="font-medium text-zinc-300">Nenhum arquivo alterado nesta execução</p>
                      <p class="text-[11px] text-zinc-500 mt-1 max-w-sm mx-auto">
                        Esta sessão não gerou modificações na working tree ou os arquivos gerados foram descartados.
                      </p>
                    </div>
                  </Show>

                  <Show when={!carregandoDiff() && diffRun().trim()}>
                    {/* Header Resumo dos Arquivos Alterados */}
                    <div class="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-3 flex-shrink-0">
                      <div class="flex items-center justify-between mb-2 pb-2 border-b border-zinc-800/60">
                        <div class="flex items-center gap-2">
                          <GitCommit size={14} class="text-amber-400" />
                          <span class="text-xs font-semibold text-zinc-200">
                            {arquivosDiff().length > 0 ? `${arquivosDiff().length} arquivo(s) modificado(s)` : "Diff Registrado"}
                          </span>
                        </div>
                        <Show when={commitHashDiff()}>
                          <span class="text-[10px] font-mono bg-zinc-800/80 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700">
                            commit: {commitHashDiff()!.slice(0, 8)}
                          </span>
                        </Show>
                      </div>

                      <Show when={arquivosDiff().length > 0}>
                        <div class="flex flex-wrap gap-1.5">
                          <For each={arquivosDiff()}>
                            {(arq) => (
                              <div class="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 text-[11px] px-2 py-0.5 rounded-md font-mono">
                                <FileText size={11} class="text-zinc-500" />
                                <span class="text-zinc-300 truncate max-w-xs">{arq.caminho}</span>
                                <Show when={arq.adicionadas && arq.adicionadas !== "-"}>
                                  <span class="text-emerald-400 text-[10px]">+{arq.adicionadas}</span>
                                </Show>
                                <Show when={arq.removidas && arq.removidas !== "-"}>
                                  <span class="text-rose-400 text-[10px]">-{arq.removidas}</span>
                                </Show>
                                <button
                                  type="button"
                                  onClick={() => void restaurarArquivoDoDiff(arq.caminho)}
                                  class="ml-1 px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-amber-300 text-[10px] cursor-pointer"
                                  title={`Restaurar ${arq.caminho} (descartar alterações)`}
                                >
                                  ↩ restaurar
                                </button>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>

                    {/* Exibição formatada do Git Diff */}
                    <div class="flex-1 bg-black/95 p-3 rounded-xl border border-zinc-800 text-[11px] font-mono overflow-y-auto leading-relaxed scrollbar-thin select-text">
                      <For each={diffRun().split("\n")}>
                        {(linha) => {
                          const isAdd = linha.startsWith("+") && !linha.startsWith("+++");
                          const isDel = linha.startsWith("-") && !linha.startsWith("---");
                          const isChunk = linha.startsWith("@@");
                          const isHeader = linha.startsWith("diff --git") || linha.startsWith("index ");

                          return (
                            <div
                              class={`px-1.5 py-0.5 rounded-xs transition-colors ${
                                isAdd
                                  ? "bg-emerald-950/40 text-emerald-300"
                                  : isDel
                                  ? "bg-rose-950/40 text-rose-300"
                                  : isChunk
                                  ? "bg-sky-950/30 text-sky-400 font-bold border-t border-b border-sky-900/40 my-1"
                                  : isHeader
                                  ? "text-amber-400/90 font-bold mt-2 pt-1 border-t border-zinc-800"
                                  : "text-zinc-400"
                              }`}
                            >
                              {linha || " "}
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
