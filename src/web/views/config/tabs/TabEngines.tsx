import { type Component, createSignal, onMount, Show, For, type Accessor } from "solid-js";
import { Button } from "../../../ui/Button";
import { showToast } from "../../../ui/Toast";
import { fetchApi } from "../../../lib/context";
import { EngineAuthModal } from "../../../components/EngineAuthModal";
import {
  Bot,
  RefreshCw,
  Cpu,
  Plus,
  Star,
  Unplug,
  Key,
  Play,
  Download,
  Terminal,
  Circle,
  Package,
  Activity,
  Save,
  Users,
  Coins,
  Trash2,
  Clock,
  RotateCcw,
  Gauge,
  DollarSign,
  ExternalLink,
  Check,
  AlertCircle,
  Shield,
  ShieldCheck,
  X,
} from "lucide-solid";
import type {
  TabConfigId,
  ProvedorAgenteItem,
  MotorInfo,
  ContaMotor,
} from "./types";
import { PROVEDORES_POR_AGENTE } from "./types";

export interface TabEnginesProps {
  abaAtiva: Accessor<TabConfigId>;
  escopoConfig?: Accessor<"global" | "workspace">;
  wsAtivo?: Accessor<string>;
  onGoToKeysTab?: () => void;
}

const SUB_PROVEDORES: Record<string, string[]> = {
  opencode: ["opencode", "opencode-go"],
};

export const TabEngines: Component<TabEnginesProps> = (props) => {
  const escopo = () => (props.escopoConfig ? props.escopoConfig() : "global");
  const ws = () => (props.wsAtivo ? props.wsAtivo() : "");

  const [statusMotores, setStatusMotores] = createSignal<any>(null);
  const [carregandoMotores, setCarregandoMotores] = createSignal(false);
  const [motorSelecionadoTab, setMotorSelecionadoTab] = createSignal<string>("opencode");
  const [limitesMotores, setLimitesMotores] = createSignal<Record<string, any>>({});
  const [salvandoLimites, setSalvandoLimites] = createSignal(false);
  const [contasPorMotor, setContasPorMotor] = createSignal<ContaMotor[]>([]);
  const [tokensMotores, setTokensMotores] = createSignal<Record<string, any>>({});
  const [carregandoTokens, setCarregandoTokens] = createSignal(false);
  const [tokensContas, setTokensContas] = createSignal<Record<string, any>>({});
  const [consultandoConta, setConsultandoConta] = createSignal<string | null>(null);
  const [popupConectarAberto, setPopupConectarAberto] = createSignal(false);
  const [instalandoMotor, setInstalandoMotor] = createSignal<string | null>(null);
  const [testandoMotor, setTestandoMotor] = createSignal<string | null>(null);
  const [conectandoMotor, setConectandoMotor] = createSignal<string | null>(null);
  const [desconectandoMotor, setDesconectandoMotor] = createSignal<string | null>(null);
  const [motorSelecionadoAuth, setMotorSelecionadoAuth] = createSignal<any | null>(null);
  const [testandoModelo, setTestandoModelo] = createSignal<string | null>(null);
  const [resultadoTeste, setResultadoTeste] = createSignal<Record<string, any>>({});

  const motores = (): MotorInfo[] => statusMotores()?.motores || [];
  const motorConectado = (m: MotorInfo): boolean => {
    if (!m) return false;
    if (m.id === "opencode") return true;
    return Boolean(m.installed && (m.authStatus?.authenticated || m.contaAtiva));
  };
  const motoresVisiveis = (): MotorInfo[] => {
    const list = motores();
    const con = list.filter((m) => motorConectado(m));
    const sel = motorSelecionadoTab();
    if (sel && !con.some((m) => m.id === sel) && list.some((m) => m.id === sel)) {
      const s = list.find((m) => m.id === sel);
      return s ? [...con, s] : con;
    }
    return con.length > 0 ? con : list;
  };
  const motoresDesconectados = (): MotorInfo[] => motores().filter((m) => !motorConectado(m));
  const currentMotor = (): MotorInfo => {
    const list = motores();
    return list.find((m) => m.id === motorSelecionadoTab()) || list[0] || {
      id: "opencode",
      name: "OpenCode Engine",
      description: "Runtime nativo de execução com sandbox e suporte multi-modelo",
      category: "REACTIVE CODEBASE AGENT",
      maintainer: "@opencorp",
      installed: true,
      ativo: true,
      isManaged: true,
      path: "opencode",
      version: "v0.7.0",
    };
  };

  const contasDoMotorAtual = () => {
    const motorId = currentMotor().id;
    const ids = SUB_PROVEDORES[motorId] || [motorId];
    return contasPorMotor().filter((c) => ids.includes(c.motorId));
  };

  const carregarStatusMotores = async () => {
    setCarregandoMotores(true);
    try {
      const data = await fetchApi<any>("/motores/status");
      if (data && data.ok) {
        setStatusMotores(data);
        if (data.limits) setLimitesMotores(data.limits);
        if (data.contas) setContasPorMotor(data.contas);
        if (data.tokens) setTokensMotores(data.tokens);
      }
    } catch (err: any) {
      console.error("Falha ao carregar status dos motores:", err);
    } finally {
      setCarregandoMotores(false);
    }
  };

  const recarregarTokensAoVivo = async (motorId?: string) => {
    setCarregandoTokens(true);
    try {
      if (motorId) {
        const res = await fetchApi<any>(`/api/motores/${encodeURIComponent(motorId)}/tokens`);
        if (res?.tokens) {
          setTokensMotores((prev) => ({ ...prev, [motorId]: res.tokens }));
          showToast(`Quota e tokens de ${motorId} atualizados diretamente do adaptador`, "sucesso");
        }
      } else {
        const res = await fetchApi<any>("/api/motores/tokens");
        if (res?.tokens) {
          setTokensMotores(res.tokens);
          showToast("Tokens de todos os motores atualizados ao vivo diretamente dos adaptadores", "sucesso");
        }
      }
    } catch (err: any) {
      showToast(`Erro ao consultar tokens ao vivo: ${err?.message || err}`, "erro");
    } finally {
      setCarregandoTokens(false);
    }
  };

  const consultarTokensConta = async (motorId: string, contaId: string) => {
    setConsultandoConta(contaId);
    try {
      const res = await fetchApi<any>(`/api/motores/${encodeURIComponent(motorId)}/contas/${encodeURIComponent(contaId)}/tokens`);
      if (res?.tokens) {
        setTokensContas((prev) => ({ ...prev, [contaId]: res.tokens }));
        showToast("Tokens da conta consultados diretamente do adaptador do motor", "sucesso");
      }
    } catch (err: any) {
      showToast(`Erro ao consultar tokens da conta: ${err?.message || err}`, "erro");
    } finally {
      setConsultandoConta(null);
    }
  };

  const salvarLimitesMotores = async (novosLimites: Record<string, any>) => {
    setSalvandoLimites(true);
    try {
      await fetchApi("/api/motores/limites", {
        method: "PUT",
        body: JSON.stringify(novosLimites),
      });
      showToast("Limites dos motores atualizados com sucesso!", "sucesso");
      await carregarStatusMotores();
    } catch (err: any) {
      showToast(`Erro ao salvar limites: ${err.message}`, "erro");
    } finally {
      setSalvandoLimites(false);
    }
  };

  const ativarContaMotor = async (motorId: string, contaId: string) => {
    try {
      await fetchApi(`/api/motores/${encodeURIComponent(motorId)}/contas/${encodeURIComponent(contaId)}/ativar`, {
        method: "POST",
      });
      showToast("Conta ativada como principal do motor!", "sucesso");
      await carregarStatusMotores();
    } catch (err: any) {
      showToast(`Erro ao ativar conta: ${err.message}`, "erro");
    }
  };

  const desconectarContaMotor = async (motorId: string, contaId: string) => {
    try {
      await fetchApi(`/api/motores/${encodeURIComponent(motorId)}/contas/${encodeURIComponent(contaId)}`, {
        method: "DELETE",
      });
      showToast("Conta desconectada com sucesso!", "sucesso");
      await carregarStatusMotores();
    } catch (err: any) {
      showToast(`Erro ao desconectar conta: ${err.message}`, "erro");
    }
  };

  const instalarMotor = async (id: string) => {
    setInstalandoMotor(id);
    try {
      showToast(`Iniciando instalação isolada de ${id} em ~/.opencorp/bin/...`, "aviso");
      const res = await fetchApi<any>(`/api/motores/${encodeURIComponent(id)}/install`, { method: "POST" });
      showToast(res.log || `Motor ${id} instalado com sucesso!`, "sucesso");
      await carregarStatusMotores();
    } catch (err: any) {
      showToast(`Falha ao instalar motor ${id}: ${err.message}`, "erro");
    } finally {
      setInstalandoMotor(null);
    }
  };

  const testarMotor = async (id: string) => {
    setTestandoMotor(id);
    try {
      const res = await fetchApi<any>(`/api/motores/${encodeURIComponent(id)}/test`, { method: "POST" });
      if (res.health?.healthy) {
        showToast(`[${id}] ${res.health.statusText}`, "sucesso");
      } else {
        showToast(`[${id}] ${res.health?.statusText || "Falha no diagnóstico"}`, "erro");
      }
      await carregarStatusMotores();
    } catch (err: any) {
      showToast(`Erro ao testar ${id}: ${err.message}`, "erro");
    } finally {
      setTestandoMotor(null);
    }
  };

  const conectarMotor = async (id: string) => {
    setConectandoMotor(id);
    try {
      await fetchApi<any>(`/api/motores/${encodeURIComponent(id)}/conectar`, { method: "POST" });
      showToast(`Motor "${id}" conectado e definido como o motor ativo padrão!`, "sucesso");
      await carregarStatusMotores();
    } catch (err: any) {
      const m = motores().find((x) => x.id === id);
      if (err?.message?.includes("requer autenticação") || err?.message?.includes("não pode ser ativado")) {
        showToast(err.message, "aviso");
        if (m) setMotorSelecionadoAuth(m);
      } else {
        showToast(`Erro ao conectar motor ${id}: ${err.message}`, "erro");
      }
    } finally {
      setConectandoMotor(null);
    }
  };

  const desconectarMotor = async (id: string) => {
    setDesconectandoMotor(id);
    try {
      await fetchApi<any>(`/api/motores/${encodeURIComponent(id)}/desconectar`, { method: "POST" });
      showToast(`Motor "${id}" desconectado. OpenCode redefinido como padrão do sistema.`, "sucesso");
      await carregarStatusMotores();
    } catch (err: any) {
      showToast(`Erro ao desconectar motor ${id}: ${err.message}`, "erro");
    } finally {
      setDesconectandoMotor(null);
    }
  };

  const desconectarProvedor = async (provider: string) => {
    if (!confirm(`Desconectar o provedor "${provider}"? A chave de API será removida.`)) return;
    try {
      await fetchApi(`/provider-keys/${encodeURIComponent(provider)}?escopo=global`, { method: "DELETE" }).catch(() => {});
      if (ws()) {
        await fetchApi(`/provider-keys/${encodeURIComponent(provider)}?escopo=workspace`, { method: "DELETE" }).catch(() => {});
      }
      showToast(`Provedor "${provider}" desconectado`, "sucesso");
      await carregarStatusMotores();
    } catch (err: any) {
      showToast(`Erro ao desconectar: ${err.message}`, "erro");
    }
  };

  const testarConexaoModelo = async (model: string) => {
    setTestandoModelo(model);
    try {
      const res = await fetchApi<any>("/llm/test", {
        method: "POST",
        body: JSON.stringify({ model }),
      });
      setResultadoTeste((prev) => ({ ...prev, [model]: res }));
      if (res.ok) {
        showToast(`Modelo respondendo (${res.ms}ms)!`, "sucesso");
      } else {
        showToast(`Falha no teste: ${res.error || "Erro na API"}`, "erro");
      }
    } catch (err: any) {
      setResultadoTeste((prev) => ({ ...prev, [model]: { ok: false, error: err.message } }));
      showToast(`Erro ao testar: ${err.message}`, "erro");
    } finally {
      setTestandoModelo(null);
    }
  };

  const getProvedorStatus = (prov: ProvedorAgenteItem, motor: any) => {
    const provPadrao = (statusMotores()?.provedores || []).find((p: any) => p.id === prov.id);
    if (provPadrao) {
      return {
        conectado: Boolean(provPadrao.conectado),
        detalhe: provPadrao.previewChave || (provPadrao.conectado ? "Chave configurada" : "Não configurado"),
        isDirectKey: true,
        provPadrao,
      };
    }

    if (prov.tipo === "oauth_cli" || prov.tipo === "token") {
      const auth = motor?.authStatus;
      const isAuthThisMethod = Boolean(
        auth?.authenticated && (
          auth.method?.toLowerCase().includes(prov.id.split("-")[0]) ||
          auth.details?.toLowerCase().includes(prov.id.split("-")[0]) ||
          (prov.id === "claude-oauth" && auth.method?.toLowerCase().includes("oauth")) ||
          (prov.id === "copilot-device" && (auth.method?.toLowerCase().includes("github") || auth.details?.toLowerCase().includes("github"))) ||
          (prov.id === "github-token" && (auth.method?.toLowerCase().includes("token") || auth.method?.toLowerCase().includes("gh"))) ||
          (prov.id === "cursor-account" && auth.method?.toLowerCase().includes("cursor")) ||
          (prov.id === "codex-oauth" && auth.method?.toLowerCase().includes("codex")) ||
          (prov.id === "antigravity-runtime" && (auth.method?.toLowerCase().includes("agy") || auth.method?.toLowerCase().includes("sistema")))
        )
      );
      return {
        conectado: isAuthThisMethod,
        detalhe: isAuthThisMethod ? (auth?.details || auth?.method || "Sessão Ativa") : "Requer autenticação",
        isDirectKey: false,
      };
    }

    if (prov.id === "cursor-api") {
      const hasCursorKey = Boolean(motor?.authStatus?.method?.includes("CURSOR_API_KEY"));
      return {
        conectado: hasCursorKey,
        detalhe: hasCursorKey ? "CURSOR_API_KEY ativa" : "Não configurado",
        isDirectKey: true,
      };
    }

    return {
      conectado: false,
      detalhe: "Não configurado",
      isDirectKey: false,
    };
  };

  onMount(() => {
    void carregarStatusMotores();
  });

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────
          ABA MOTORES & OPENCODE
         ───────────────────────────────────────────────────────────── */}
      <Show when={props.abaAtiva() === "motores"}>
        <div class="space-y-6 bg-transparent">
          {/* CABEÇALHO */}
          <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-zinc-800/40 gap-2">
            <div>
              <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Bot size={15} class="text-zinc-400 shrink-0" />
                <span>Diagnóstico dos Motores e Runtimes de Execução</span>
              </h2>
              <p class="text-xs text-zinc-400 mt-0.5">
                Ambiente de execução autônoma dos agentes corporativos e status em tempo real.
              </p>
            </div>
            <Button
              size="xs"
              variant="ghost"
              class="self-start sm:self-auto border border-zinc-800/50"
              loading={carregandoMotores()}
              onClick={carregarStatusMotores}
              title="Atualizar diagnóstico agora"
            >
              <RefreshCw size={12} class="mr-1" /> Atualizar
            </Button>
          </div>

          {/* BANNER DE MOTOR ATIVO & DAEMONS */}
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2.5 border-b border-zinc-800/40 text-xs">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="h-6 w-6 rounded-md bg-zinc-800/50 flex items-center justify-center text-zinc-300 shrink-0">
                <Cpu size={13} />
              </div>
              <div class="flex items-center gap-1.5 flex-wrap min-w-0">
                <span class="text-zinc-400">Motor Ativo:</span>
                <span class="font-semibold text-zinc-100 font-mono">
                  {statusMotores()?.motor_ativo || statusMotores()?.runner?.engine || "opencode"}
                </span>
                <span class="text-[10px] font-mono text-zinc-300 px-1.5 py-0.5 rounded bg-zinc-800/70">
                  PADRÃO
                </span>
                <span class="hidden sm:inline-block text-[11px] text-zinc-500 font-mono truncate max-w-[200px]">
                  ({statusMotores()?.runner?.binary_path || "opencode"})
                </span>
              </div>
            </div>

            <div class="flex items-center gap-3 text-[11px] font-mono text-zinc-400 flex-wrap">
              <span class="flex items-center gap-1.5">
                <span
                  class={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    statusMotores()?.daemons?.scheduler?.ativo ? "bg-emerald-400" : "bg-zinc-600"
                  }`}
                />
                Scheduler ({statusMotores()?.daemons?.scheduler?.pid || "ativo"})
              </span>
              <span class="flex items-center gap-1.5">
                <span
                  class={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    statusMotores()?.daemons?.secretario?.ativo ? "bg-emerald-400" : "bg-zinc-600"
                  }`}
                />
                Secretário ({statusMotores()?.daemons?.secretario?.porta ? `porta ${statusMotores()?.daemons?.secretario?.porta}` : "online"})
              </span>
            </div>
          </div>

          {/* SELEÇÃO E CONTROLE POR ABAS DE AGENTES */}
          <div class="space-y-4">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span class="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Bot size={13} class="text-zinc-400" /> Motores & Agentes Autônomos
                </span>
                <p class="text-[11px] text-zinc-400 mt-0.5">
                  Selecione um agente para gerenciar credenciais, definir o executor padrão do sistema e configurar provedores compatíveis.
                </p>
              </div>
              <span class="text-[11px] text-zinc-500 font-mono">
                Gerenciamento isolado em ~/.opencorp/bin/
              </span>
            </div>

            {/* BARRA HORIZONTAL DE ABAS DE CADA AGENTE */}
            <div class="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-zinc-800/40 -mx-3.5 px-3.5 sm:mx-0 sm:px-0">
              <button
                type="button"
                data-testid="conectar-motor-btn"
                onClick={() => setPopupConectarAberto(true)}
                title="Escolher qual motor conectar para adicionar à lista"
                class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer border border-dashed border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
              >
                <Plus size={12} /> Conectar
                <Show when={motoresDesconectados().length > 0}>
                  <span class="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400">
                    {motoresDesconectados().length}
                  </span>
                </Show>
              </button>
              <For each={motoresVisiveis()}>
                {(mot: any) => {
                  const isSelected = () => motorSelecionadoTab() === mot.id;
                  const isAtivo = () => Boolean(mot.ativo);
                  return (
                    <button
                      type="button"
                      data-engine-id={mot.id}
                      onClick={() => setMotorSelecionadoTab(mot.id)}
                      class={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                        isSelected()
                          ? "bg-zinc-800 text-zinc-100 font-semibold"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30"
                      }`}
                    >
                      <span
                        class={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isAtivo()
                            ? "bg-emerald-400"
                            : mot.installed
                            ? "bg-zinc-400"
                            : "bg-zinc-600"
                        }`}
                      />
                      <span class="whitespace-nowrap">{mot.name}</span>
                      <Show when={isAtivo()}>
                        <span class="flex items-center gap-0.5 text-[9px] font-mono uppercase text-zinc-300 px-1 py-0.2 rounded bg-zinc-700/50">
                          <Star size={9} class="fill-current text-zinc-300 shrink-0" />
                          PADRÃO
                        </span>
                      </Show>
                    </button>
                  );
                }}
              </For>
            </div>

            {/* CONTEÚDO DO AGENTE SELECIONADO */}
            <div class="space-y-4 pt-1 bg-transparent">
              <div class="flex items-start justify-between gap-3 flex-wrap">
                <div class="space-y-1 min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="text-sm font-semibold text-zinc-100">{currentMotor().name}</h3>
                    <span class="text-[10px] font-mono uppercase text-zinc-400">
                      {currentMotor().category}
                    </span>
                    <Show when={currentMotor().maintainer}>
                      <span class="text-[10px] font-mono text-zinc-500">
                        • {currentMotor().maintainer}
                      </span>
                    </Show>
                  </div>
                  <p class="text-xs text-zinc-400 leading-relaxed">
                    {currentMotor().description}
                  </p>
                </div>

                <div class="shrink-0 flex items-center gap-2">
                  <Show
                    when={currentMotor().installed}
                    fallback={
                      <span class="text-[11px] font-mono text-zinc-500">
                        Disponível para instalação
                      </span>
                    }
                  >
                    <Show
                      when={currentMotor().ativo}
                      fallback={
                        <span class="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
                          <span class="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                          {currentMotor().isManaged ? "Isolado em ~/.opencorp/bin" : "Binário do Sistema"}
                        </span>
                      }
                    >
                      <span class="text-[11px] font-mono font-medium text-zinc-200 flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        MOTOR PADRÃO ATIVO
                      </span>
                    </Show>
                  </Show>
                </div>
              </div>

              {/* BOTÃO E DESTAQUE: DEFINIR COMO MOTOR PADRÃO */}
              <div class="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-y border-zinc-800/40">
                <Show
                  when={currentMotor().ativo}
                  fallback={
                    <>
                      <div>
                        <span class="text-xs font-medium text-zinc-200 block">
                          Executor padrão do sistema
                        </span>
                        <span class="text-[11px] text-zinc-400">
                          Executar tarefas autônomas, rotinas e chamadas ReAct com {currentMotor().name}.
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        class="font-medium text-xs px-3 py-1.5 whitespace-nowrap flex items-center gap-1.5 shrink-0"
                        loading={conectandoMotor() === currentMotor().id}
                        disabled={!currentMotor().installed}
                        onClick={() => conectarMotor(currentMotor().id)}
                        title={
                          currentMotor().installed
                            ? "Definir este motor como o executor ativo padrão"
                            : "Instale o motor primeiro"
                        }
                      >
                        <Star size={12} class="text-zinc-400 shrink-0" />
                        {currentMotor().installed ? "Definir como Motor Padrão" : "Instalar Primeiro"}
                      </Button>
                    </>
                  }
                >
                  <div class="flex items-center gap-2.5">
                    <Star size={14} class="fill-zinc-300 text-zinc-300 shrink-0" />
                    <div>
                      <span class="text-xs font-medium text-zinc-200 block">
                        Motor Padrão Ativo do Sistema
                      </span>
                      <span class="text-[11px] text-zinc-400">
                        Orquestrando turnos autônomos, tarefas agendadas e chamadas de ferramentas no OpenCorp.
                      </span>
                    </div>
                  </div>
                  <Show when={currentMotor().id !== "opencode"}>
                    <Button
                      size="xs"
                      variant="ghost"
                      class="text-zinc-400 hover:text-zinc-200 text-xs px-2.5 py-1 whitespace-nowrap shrink-0"
                      loading={desconectandoMotor() === currentMotor().id}
                      onClick={() => desconectarMotor(currentMotor().id)}
                      title="Desconectar este motor e reverter para o OpenCode padrão"
                    >
                      <Unplug size={12} class="mr-1" /> Reverter para OpenCode
                    </Button>
                  </Show>
                </Show>
              </div>

              {/* BARRA DE AÇÕES DO MOTOR */}
              <div class="flex items-center gap-2 flex-wrap">
                <Button
                  size="xs"
                  variant="secondary"
                  class="text-xs px-2.5 py-1 text-zinc-300 hover:text-zinc-100 whitespace-nowrap"
                  onClick={() => setMotorSelecionadoAuth(currentMotor())}
                  title={`Abrir orientações de login e CLI para ${currentMotor().name}`}
                >
                  <Key size={12} class="mr-1.5 text-zinc-400 shrink-0" /> Autenticar / Chave
                </Button>

                <Show when={currentMotor().installed}>
                  <Button
                    size="xs"
                    variant="secondary"
                    class="text-xs px-2.5 py-1 text-zinc-300 hover:text-zinc-100 whitespace-nowrap"
                    loading={testandoMotor() === currentMotor().id}
                    onClick={() => testarMotor(currentMotor().id)}
                    title="Executar diagnóstico em tempo real de execução e parâmetros"
                  >
                    <Play size={12} class="mr-1.5 text-zinc-400 shrink-0" /> Testar
                  </Button>
                </Show>

                <Button
                  size="xs"
                  variant="ghost"
                  class="text-xs px-2.5 py-1 text-zinc-400 hover:text-zinc-200 whitespace-nowrap"
                  loading={instalandoMotor() === currentMotor().id}
                  onClick={() => instalarMotor(currentMotor().id)}
                  title={
                    currentMotor().installed
                      ? currentMotor().isManaged
                        ? "Reinstalar binário isolado em ~/.opencorp/bin"
                        : "Instalar binário isolado em ~/.opencorp/bin"
                      : "Instalar motor isolado"
                  }
                >
                  <Download size={12} class="mr-1.5 shrink-0" />
                  {currentMotor().installed
                    ? currentMotor().isManaged
                      ? "Reinstalar Isolado"
                      : "Isolar em ~/.opencorp/bin"
                    : "Instalar Motor Isolado"}
                </Button>
              </div>

              {/* ESPECIFICAÇÕES TÉCNICAS */}
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 py-2 text-xs">
                <div class="space-y-0.5">
                  <span class="text-[10px] uppercase font-mono tracking-wider text-zinc-500 block">
                    Localização do Binário
                  </span>
                  <div class="font-mono text-zinc-300 truncate" title={currentMotor().path || "(não instalado)"}>
                    {currentMotor().path || "(não instalado)"}
                  </div>
                  <span class="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                    <Show
                      when={currentMotor().isManaged}
                      fallback={
                        <Show
                          when={currentMotor().installed}
                          fallback={<><Circle size={10} class="text-zinc-500" /> Não instalado</>}
                        >
                          <Terminal size={10} class="text-zinc-400" /> Binário do Sistema
                        </Show>
                      }
                    >
                      <Package size={10} class="text-zinc-400" /> Isolado em ~/.opencorp/bin
                    </Show>
                  </span>
                </div>

                <div class="space-y-0.5">
                  <span class="text-[10px] uppercase font-mono tracking-wider text-zinc-500 block">
                    Versão
                  </span>
                  <div
                    class="font-mono text-zinc-300 truncate"
                    title={String(currentMotor().version || "n/d")}
                  >
                    {String(currentMotor().version || "n/d").split("\n")[0]}
                  </div>
                  <span class="text-[10px] text-zinc-500 font-mono block">
                    {currentMotor().installed ? "Compatível v0.7.0" : "Aguardando instalação"}
                  </span>
                </div>

                <div class="space-y-0.5">
                  <span class="text-[10px] uppercase font-mono tracking-wider text-zinc-500 block">
                    Diagnóstico & Auth
                  </span>
                  <div class="flex items-center gap-1.5 truncate">
                    <span
                      class={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        currentMotor().health?.healthy
                          ? "bg-emerald-400"
                          : currentMotor().installed
                          ? "bg-zinc-400"
                          : "bg-zinc-600"
                      }`}
                    />
                    <span
                      class="text-zinc-300 truncate font-mono"
                      title={
                        currentMotor().health?.statusText ||
                        currentMotor().authStatus?.details ||
                        (currentMotor().installed ? "Pronto" : "Não instalado")
                      }
                    >
                      {currentMotor().health?.statusText ||
                        currentMotor().authStatus?.details ||
                        (currentMotor().installed ? "Pronto" : "Não instalado")}
                    </span>
                  </div>
                  <span class="text-[10px] text-zinc-500 font-mono block truncate">
                    {currentMotor().authStatus?.method || "Detecção automática"}
                  </span>
                </div>
              </div>
            </div>

            {/* LISTA DE PROVEDORES CONTEXTUALIZADA CONFORME O AGENTE */}
            <div class="pt-4 border-t border-zinc-800/40 space-y-3">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span class="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Key size={13} class="text-zinc-400" /> Provedores & Autenticações de {currentMotor().name}
                  </span>
                  <p class="text-[11px] text-zinc-400 mt-0.5">
                    Provedores de inteligência e credenciais compatíveis com este agente.
                  </p>
                </div>
                <span class="text-[11px] text-zinc-500 font-mono">
                  {(PROVEDORES_POR_AGENTE[currentMotor().id] || []).length} método(s)
                </span>
              </div>

              <div class="divide-y divide-zinc-800/40">
                <For each={PROVEDORES_POR_AGENTE[currentMotor().id] || []}>
                  {(prov) => {
                    const st = () => getProvedorStatus(prov, currentMotor());
                    const testTarget = () => prov.modelosSugeridos?.[0] || prov.id;
                    const testando = () => testandoModelo() === testTarget();
                    const res = () => resultadoTeste()[testTarget()];

                    return (
                      <div class="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-transparent">
                        <div class="space-y-1 min-w-0 flex-1">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-xs font-medium text-zinc-200">{prov.nome}</span>
                            <span class="text-[10px] font-mono flex items-center gap-1 text-zinc-400">
                              <span class={`w-1.5 h-1.5 rounded-full ${st().conectado ? "bg-emerald-400" : "bg-zinc-600"}`} />
                              {st().conectado ? "Conectado" : "Não configurado"}
                            </span>
                            <Show when={st().detalhe}>
                              <span class="text-[10px] font-mono text-zinc-500 truncate max-w-xs">
                                • {st().detalhe}
                              </span>
                            </Show>
                          </div>

                          <p class="text-[11px] text-zinc-400 leading-relaxed">{prov.descricao}</p>

                          <Show when={prov.modelosSugeridos && prov.modelosSugeridos.length > 0}>
                            <div class="flex items-center gap-1.5 flex-wrap pt-0.5">
                              <span class="text-[10px] text-zinc-500 font-mono">Modelos:</span>
                              <For each={prov.modelosSugeridos}>
                                {(m) => (
                                  <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800/50 text-zinc-300">
                                    {m}
                                  </span>
                                )}
                              </For>
                            </div>
                          </Show>
                        </div>

                        <div class="flex items-center gap-2 self-end md:self-auto shrink-0 flex-wrap">
                          <Show when={prov.loginUrl}>
                            <a
                              href={prov.loginUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded transition-colors shrink-0 whitespace-nowrap"
                              title={`Abrir console de ${prov.nome}`}
                            >
                              <ExternalLink size={10} /> {prov.loginUrlLabel || "Console"}
                            </a>
                          </Show>

                          <Show when={res()}>
                            <span class="text-[10px] font-mono flex items-center gap-1 text-zinc-300">
                              <Show when={res()?.ok} fallback={<><AlertCircle size={10} class="text-rose-400" /> Erro</>}>
                                <Check size={10} class="text-emerald-400" /> {res()?.ms}ms
                              </Show>
                            </span>
                          </Show>

                          <Show when={st().conectado}>
                            <Show when={prov.modelosSugeridos && prov.modelosSugeridos.length > 0}>
                              <Button
                                size="xs"
                                variant="secondary"
                                class="text-[11px] px-2 py-1 whitespace-nowrap"
                                loading={testando()}
                                onClick={() => testarConexaoModelo(testTarget())}
                                title={`Testar inferência em ${testTarget()}`}
                              >
                                <Play size={10} class="mr-1 text-zinc-400 shrink-0" /> Testar
                              </Button>
                            </Show>
                            <Show when={st().isDirectKey && prov.id}>
                              <Button
                                size="xs"
                                variant="ghost"
                                class="text-zinc-400 hover:text-rose-400 text-[11px] px-2 py-1 whitespace-nowrap"
                                onClick={() => desconectarProvedor(prov.id)}
                                title="Remover chave configurada"
                              >
                                <Unplug size={10} class="mr-1 shrink-0" /> Desconectar
                              </Button>
                            </Show>
                          </Show>

                          <Show when={!st().conectado}>
                            <Show
                              when={prov.tipo === "oauth_cli" || prov.loginCmd}
                              fallback={
                                <Button
                                  size="xs"
                                  variant="secondary"
                                  class="text-[11px] px-2 py-1 whitespace-nowrap text-zinc-300 hover:text-zinc-100"
                                  onClick={() => {
                                    if (props.onGoToKeysTab) props.onGoToKeysTab();
                                  }}
                                >
                                  <Plus size={10} class="mr-1 shrink-0" /> Chave
                                </Button>
                              }
                            >
                              <Button
                                size="xs"
                                variant="secondary"
                                class="text-[11px] px-2 py-1 whitespace-nowrap text-zinc-300 hover:text-zinc-100"
                                onClick={() => setMotorSelecionadoAuth(currentMotor())}
                              >
                                <Key size={10} class="mr-1 text-zinc-400 shrink-0" /> Login
                              </Button>
                            </Show>
                          </Show>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>

            {/* CONTAS CONECTADAS DO MOTOR */}
            <div class="space-y-3 pt-3 border-t border-zinc-800/40">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Users size={14} class="text-zinc-400" />
                  <h4 class="text-xs font-semibold text-zinc-200">
                    Contas Conectadas ({contasDoMotorAtual().length})
                  </h4>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  class="text-xs text-zinc-300 hover:text-white"
                  onClick={() => setMotorSelecionadoAuth(currentMotor())}
                >
                  <Plus size={12} class="mr-1 text-emerald-400" /> Conectar Mais Uma Conta
                </Button>
              </div>

              <div class="space-y-2">
                <For
                  each={contasDoMotorAtual()}
                  fallback={
                    <div class="p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/40 text-xs text-zinc-400 flex items-center justify-between">
                      <span>Nenhuma conta personalizada cadastrada no OpenCorp. O motor usa a credencial padrão do sistema.</span>
                      <Button
                        size="xs"
                        variant="ghost"
                        class="text-xs text-emerald-400 hover:text-emerald-300"
                        onClick={() => setMotorSelecionadoAuth(currentMotor())}
                      >
                        + Adicionar Conta
                      </Button>
                    </div>
                  }
                >
                  {(c) => (
                    <div class="p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div class="flex items-center gap-2.5 min-w-0">
                        <span
                          class={`w-2 h-2 rounded-full shrink-0 ${
                            c.ativa ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]" : "bg-zinc-600"
                          }`}
                        />
                        <div class="min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-medium text-zinc-200 truncate">{c.nome}</span>
                            <span
                              class={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                                c.ativa
                                  ? "bg-emerald-950/30 text-emerald-300 border-emerald-800/50"
                                  : "bg-zinc-800/50 text-zinc-400 border-zinc-700/40"
                              }`}
                            >
                              {c.ativa ? "CONTA ATIVA" : "SECUNDÁRIA"}
                            </span>
                            <span class="text-[10px] font-mono px-1.5 py-0.2 rounded border bg-cyan-950/30 text-cyan-300 border-cyan-800/40">
                              {c.motorId}
                            </span>
                          </div>
                          <div class="text-[11px] text-zinc-500 font-mono flex items-center gap-2 mt-0.5 flex-wrap">
                            <span>Auth: {c.authType}</span>
                            <span>•</span>
                            <span class="text-amber-400/80">
                              {c.tokenOuChave
                                ? `${c.tokenOuChave.slice(0, 6)}…${c.tokenOuChave.slice(-4)}`
                                : "—"}
                            </span>
                            <span>•</span>
                            <span>Cota: {c.limits?.status_cota || "normal"}</span>
                            <span>•</span>
                            <span>Teto: ${c.limits?.daily_cost_usd || 10}/dia</span>
                            <span>•</span>
                            <span>{c.limits?.rate_limit_rpm || 30} RPM</span>
                          </div>
                          <Show when={tokensContas()[c.id]}>
                            <div class="mt-1 p-1.5 rounded bg-zinc-950/70 border border-zinc-800/60 text-[11px] font-mono text-emerald-300 flex items-center justify-between">
                              <span>Tokens da Conta: {tokensContas()[c.id].mensagem}</span>
                              <span class="text-[10px] text-zinc-500 ml-2">
                                {new Date(tokensContas()[c.id].consultadoEm).toLocaleTimeString()}
                              </span>
                            </div>
                          </Show>
                        </div>
                      </div>

                      <div class="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        <Button
                          size="xs"
                          variant="ghost"
                          class="text-[11px] text-zinc-400 hover:text-white"
                          loading={consultandoConta() === c.id}
                          onClick={() => consultarTokensConta(currentMotor().id, c.id)}
                        >
                          <Coins size={11} class="mr-1 text-amber-400" /> Consultar Tokens
                        </Button>
                        <Show when={!c.ativa}>
                          <Button
                            size="xs"
                            variant="ghost"
                            class="text-[11px] text-zinc-300 hover:text-white"
                            onClick={() => ativarContaMotor(currentMotor().id, c.id)}
                          >
                            Tornar Ativa
                          </Button>
                        </Show>
                        <Button
                          size="xs"
                          variant="ghost"
                          class="text-[11px] text-red-400 hover:text-red-300 hover:bg-red-950/30"
                          onClick={() => desconectarContaMotor(currentMotor().id, c.id)}
                          title="Desconectar esta conta"
                        >
                          <Trash2 size={12} class="mr-1" /> Desconectar
                        </Button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>

            {/* LIMITES ESPECÍFICOS DO MOTOR */}
            <div class="space-y-3 pt-3 border-t border-zinc-800/40">
              <div class="flex items-center gap-2">
                <Activity size={14} class="text-zinc-400" />
                <h4 class="text-xs font-semibold text-zinc-200">
                  Limites & Cotas de {currentMotor().name}
                </h4>
              </div>

              {(() => {
                const mId = currentMotor().id;
                const limAtual = () => limitesMotores()[mId] || {
                  timeout_min: 20,
                  max_turns: 40,
                  rate_limit_rpm: 30,
                  daily_cost_usd: 10.0,
                  status_cota: "normal",
                };

                return (
                  <div class="p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/40 space-y-3 text-xs">
                    {/* LIVE TOKENS DO MOTOR SELECIONADO */}
                    {(() => {
                      const liveTok = () => tokensMotores()[mId] || currentMotor()?.tokens || null;
                      return (
                        <div class="p-2.5 rounded bg-zinc-950/70 border border-zinc-800/70 space-y-2">
                          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                            <div class="flex items-center gap-1.5 text-zinc-200 font-medium flex-wrap">
                              <Coins size={13} class="text-amber-400 shrink-0" />
                              <span>Quota Real & Tokens Disponíveis</span>
                              <span class="hidden sm:inline-block text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 font-mono">
                                CONSULTA REAL AO VIVO
                              </span>
                              <span class="sm:hidden text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 font-mono">
                                AO VIVO
                              </span>
                            </div>
                            <button
                              class="self-start sm:self-auto text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-mono transition-colors cursor-pointer"
                              disabled={carregandoTokens()}
                              onClick={() => recarregarTokensAoVivo(mId)}
                            >
                              <RefreshCw size={10} class={carregandoTokens() ? "animate-spin" : ""} />
                              Consultar Adaptador
                            </button>
                          </div>

                          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                            <div class="p-2 rounded bg-zinc-900/50 border border-zinc-800/50">
                              <span class="text-[10px] text-zinc-400 block font-mono mb-0.5">Provedor Consultado</span>
                              <span class="text-xs text-zinc-100 font-semibold font-mono">
                                {liveTok()?.provedor || currentMotor()?.maintainer || "Adaptador do Motor"}
                              </span>
                            </div>
                            <div class="p-2 rounded bg-zinc-900/50 border border-zinc-800/50">
                              <span class="text-[10px] text-zinc-400 block font-mono mb-0.5">Tokens / Reqs Disponíveis</span>
                              <span class="text-xs text-emerald-400 font-bold font-mono">
                                {liveTok()?.tokensDisponiveis != null
                                  ? typeof liveTok()?.tokensDisponiveis === "number"
                                    ? Number(liveTok()?.tokensDisponiveis).toLocaleString()
                                    : String(liveTok()?.tokensDisponiveis).toUpperCase()
                                  : "Disponível via Adaptador"}
                              </span>
                            </div>
                            <div class="p-2 rounded bg-zinc-900/50 border border-zinc-800/50">
                              <span class="text-[10px] text-zinc-200 font-mono">
                                {liveTok()?.saldoUsd != null
                                  ? `$${liveTok()?.saldoUsd.toFixed(2)} USD`
                                  : (liveTok()?.rateLimitRpm ? `${liveTok()?.rateLimitRpm} RPM` : "Ativo")}
                              </span>
                            </div>
                          </div>

                          <div class="text-[11px] text-zinc-400 font-mono bg-zinc-900/40 p-2 rounded border border-zinc-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <span class="truncate">{liveTok()?.mensagem || "Pronto para consulta direta pelo adaptador"}</span>
                            <Show when={liveTok()?.consultadoEm}>
                              <span class="text-[10px] text-zinc-500 whitespace-nowrap">
                                Última consulta: {new Date(liveTok()?.consultadoEm).toLocaleTimeString()}
                              </span>
                            </Show>
                          </div>
                        </div>
                      );
                    })()}

                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div class="p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/60 focus-within:border-emerald-500/50 transition-colors">
                        <label class="flex items-center gap-1.5 text-zinc-400 mb-1.5 text-[11px] font-medium">
                          <Clock size={12} class="text-zinc-500" />
                          <span>Timeout por Run (min)</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="120"
                          value={limAtual().timeout_min}
                          onInput={(e) => {
                            const val = Number(e.currentTarget.value) || 20;
                            setLimitesMotores((prev) => ({
                              ...prev,
                              [mId]: { ...limAtual(), timeout_min: val },
                            }));
                          }}
                          class="w-full bg-zinc-900/80 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 font-mono text-xs focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      <div class="p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/60 focus-within:border-emerald-500/50 transition-colors">
                        <label class="flex items-center gap-1.5 text-zinc-400 mb-1.5 text-[11px] font-medium">
                          <RotateCcw size={12} class="text-zinc-500" />
                          <span>Max Turns (0 = Ilimitado)</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="999999"
                          placeholder="0 = ilimitado"
                          value={limAtual().max_turns}
                          onInput={(e) => {
                            const raw = e.currentTarget.value.trim();
                            const val = raw === "" ? 0 : Number(raw);
                            setLimitesMotores((prev) => ({
                              ...prev,
                              [mId]: { ...limAtual(), max_turns: isNaN(val) ? 0 : val },
                            }));
                          }}
                          class="w-full bg-zinc-900/80 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 font-mono text-xs focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      <div class="p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/60 focus-within:border-emerald-500/50 transition-colors">
                        <label class="flex items-center gap-1.5 text-zinc-400 mb-1.5 text-[11px] font-medium">
                          <Gauge size={12} class="text-zinc-500" />
                          <span>Rate Limit (RPM)</span>
                        </label>
                        <input
                          type="number"
                          min="5"
                          max="300"
                          value={limAtual().rate_limit_rpm}
                          onInput={(e) => {
                            const val = Number(e.currentTarget.value) || 30;
                            setLimitesMotores((prev) => ({
                              ...prev,
                              [mId]: { ...limAtual(), rate_limit_rpm: val },
                            }));
                          }}
                          class="w-full bg-zinc-900/80 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 font-mono text-xs focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      <div class="p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/60 focus-within:border-emerald-500/50 transition-colors">
                        <label class="flex items-center gap-1.5 text-zinc-400 mb-1.5 text-[11px] font-medium">
                          <DollarSign size={12} class="text-zinc-500" />
                          <span>Cota Diária (USD)</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          step="1"
                          value={limAtual().daily_cost_usd}
                          onInput={(e) => {
                            const val = Number(e.currentTarget.value) || 10;
                            setLimitesMotores((prev) => ({
                              ...prev,
                              [mId]: { ...limAtual(), daily_cost_usd: val },
                            }));
                          }}
                          class="w-full bg-zinc-900/80 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 font-mono text-xs focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                    </div>

                    <div class="flex items-center justify-between pt-2 border-t border-zinc-800/30">
                      <div class="flex items-center gap-2">
                        <span class="text-zinc-400">Status da Cota:</span>
                        <select
                          value={limAtual().status_cota}
                          onChange={(e) => {
                            const val = e.currentTarget.value;
                            setLimitesMotores((prev) => ({
                              ...prev,
                              [mId]: { ...limAtual(), status_cota: val },
                            }));
                          }}
                          class="bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-zinc-200 text-xs"
                        >
                          <option value="normal">Normal (Operacional)</option>
                          <option value="alerta_80">Alerta (80% atingido)</option>
                          <option value="esgotado">Esgotado (Acionar fallback)</option>
                        </select>
                      </div>
                      <Button
                        size="xs"
                        variant="secondary"
                        loading={salvandoLimites()}
                        onClick={() => salvarLimitesMotores(limitesMotores())}
                      >
                        <Save size={12} class="mr-1" /> Salvar Limites de {currentMotor().name}
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* DADOS ISOLADOS DO WORKSPACE */}
          <Show when={escopo() === "workspace"}>
            <div class="py-2.5 border-t border-zinc-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-zinc-400">
              <div class="flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                <span>Este workspace executa em sandboxing com dados isolados.</span>
              </div>
              <span class="font-mono text-[11px] text-zinc-500">
                ~/.opencorp/opencode-data/{ws()}
              </span>
            </div>
          </Show>
        </div>
      </Show>

      {/* ─────────────────────────────────────────────────────────────
          ABA LIMITES DOS MOTORES
         ───────────────────────────────────────────────────────────── */}
      <Show when={props.abaAtiva() === "limites"}>
        <div class="space-y-6 bg-transparent" data-testid="tab-limites-motores">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-zinc-800/40 gap-3">
            <div>
              <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Activity size={15} class="text-emerald-400 shrink-0" />
                Limites de Operação, Taxas e Cotas por Motor
              </h2>
              <p class="text-xs text-zinc-400 mt-0.5">
                Controle centralizado de timeouts, limites de turnos ReAct, rate limits (RPM) e tetos diários para todos os motores.
              </p>
            </div>
            <div class="flex items-center gap-2 w-full sm:w-auto">
              <Button
                size="xs"
                variant="secondary"
                class="border border-zinc-750 text-zinc-300 hover:text-white text-xs font-medium flex-1 sm:flex-initial justify-center"
                loading={carregandoTokens()}
                onClick={() => recarregarTokensAoVivo()}
              >
                <RefreshCw size={12} class={`mr-1 ${carregandoTokens() ? "animate-spin" : ""}`} /> Recarregar Quotas
              </Button>
              <Button
                size="xs"
                variant="primary"
                class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex-1 sm:flex-initial justify-center"
                loading={salvandoLimites()}
                onClick={() => salvarLimitesMotores(limitesMotores())}
              >
                <Save size={12} class="mr-1" /> Salvar Todos
              </Button>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div class="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60 hover:border-zinc-700/60 transition-colors">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-xs text-zinc-400 font-medium">Motores Ativos / Homologados</span>
                <Cpu size={14} class="text-zinc-500" />
              </div>
              <div class="flex items-baseline gap-2">
                <span class="text-xl font-bold text-zinc-100 font-mono">
                  {motores().filter((m: any) => m.installed).length}
                </span>
                <span class="text-xs text-zinc-500 font-mono">/ {motores().length} instalados</span>
              </div>
            </div>

            <div class="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60 hover:border-zinc-700/60 transition-colors">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-xs text-zinc-400 font-medium">Total de Contas Conectadas</span>
                <Key size={14} class="text-emerald-500/80" />
              </div>
              <div class="flex items-baseline gap-2">
                <span class="text-xl font-bold text-emerald-400 font-mono">
                  {contasPorMotor().length}
                </span>
                <span class="text-xs text-zinc-500 font-mono">credenciais ativas</span>
              </div>
            </div>

            <div class="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60 hover:border-zinc-700/60 transition-colors">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-xs text-zinc-400 font-medium">Fallback Global de Harness</span>
                <ShieldCheck size={14} class="text-cyan-500/80" />
              </div>
              <span class="text-xs font-mono text-zinc-300 block truncate">
                {statusMotores()?.runner?.harness_fallback?.join(" → ") || "antigravity → copilot → opencode"}
              </span>
            </div>
          </div>

          <div class="space-y-4">
            <For each={motores()}>
              {(m: any) => {
                const lim = () => limitesMotores()[m.id] || {
                  timeout_min: 20,
                  max_turns: 40,
                  rate_limit_rpm: 30,
                  daily_cost_usd: 10.0,
                  status_cota: "normal",
                };

                return (
                  <div class="p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/50 hover:border-zinc-700/50 transition-colors space-y-3.5">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-zinc-800/40">
                      <div class="flex items-center gap-2.5 min-w-0">
                        <span
                          class={`w-2 h-2 rounded-full shrink-0 ${
                            m.installed ? (m.ativo ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "bg-cyan-400") : "bg-zinc-600"
                          }`}
                        />
                        <div class="min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-sm font-semibold text-zinc-100">{m.name}</span>
                            <span class="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                              {m.id}
                            </span>
                            <Show when={m.ativo}>
                              <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
                                PADRÃO
                              </span>
                            </Show>
                          </div>
                          <span class="text-[11px] text-zinc-500 font-mono truncate block">
                            {m.maintainer || "Motor Corporativo"} • {m.category || "Generalista"}
                          </span>
                        </div>
                      </div>

                      <div class="flex items-center gap-2 shrink-0">
                        <Button
                          size="xs"
                          variant="ghost"
                          class="text-xs text-zinc-400 hover:text-white"
                          loading={carregandoTokens()}
                          onClick={() => recarregarTokensAoVivo(m.id)}
                          title="Consultar cota ao vivo deste motor"
                        >
                          <Coins size={12} class="mr-1 text-amber-400" /> Consultar
                        </Button>
                        <Button
                          size="xs"
                          variant="secondary"
                          class="text-xs"
                          onClick={() => {
                            setMotorSelecionadoTab(m.id);
                          }}
                        >
                          Gerenciar Motor
                        </Button>
                      </div>
                    </div>

                    <div class="space-y-2 pt-1">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
                          <Shield size={12} class="text-zinc-500" />
                          <span>Guardrails e Limites Operacionais</span>
                        </div>
                        <Button
                          size="xs"
                          variant="ghost"
                          class="text-[11px] text-zinc-400 hover:text-white"
                          loading={salvandoLimites()}
                          onClick={() => salvarLimitesMotores(limitesMotores())}
                        >
                          <Save size={11} class="mr-1" /> Salvar {m.name}
                        </Button>
                      </div>

                      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                        <div class="p-2 rounded-lg bg-zinc-950/40 border border-zinc-800/60 focus-within:border-emerald-500/50 transition-colors">
                          <label class="flex items-center gap-1 text-[11px] text-zinc-400 mb-1 font-medium">
                            <Clock size={11} class="text-zinc-500" /> Timeout (min)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="120"
                            value={lim().timeout_min}
                            onInput={(e) => {
                              const val = Number(e.currentTarget.value) || 20;
                              setLimitesMotores((prev) => ({
                                ...prev,
                                [m.id]: { ...lim(), timeout_min: val },
                              }));
                            }}
                            class="w-full bg-zinc-900/80 border border-zinc-800 rounded px-2.5 py-1 text-zinc-100 font-mono text-xs focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>

                        <div class="p-2 rounded-lg bg-zinc-950/40 border border-zinc-800/60 focus-within:border-emerald-500/50 transition-colors">
                          <label class="flex items-center gap-1 text-[11px] text-zinc-400 mb-1 font-medium">
                            <RotateCcw size={11} class="text-zinc-500" /> Max Turns (0 = Ilimitado)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="999999"
                            placeholder="0 = ilimitado"
                            value={lim().max_turns}
                            onInput={(e) => {
                              const raw = e.currentTarget.value.trim();
                              const val = raw === "" ? 0 : Number(raw);
                              setLimitesMotores((prev) => ({
                                ...prev,
                                [m.id]: { ...lim(), max_turns: isNaN(val) ? 0 : val },
                              }));
                            }}
                            class="w-full bg-zinc-900/80 border border-zinc-800 rounded px-2.5 py-1 text-zinc-100 font-mono text-xs focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>

                        <div class="p-2 rounded-lg bg-zinc-950/40 border border-zinc-800/60 focus-within:border-emerald-500/50 transition-colors">
                          <label class="flex items-center gap-1 text-[11px] text-zinc-400 mb-1 font-medium">
                            <Gauge size={11} class="text-zinc-500" /> Rate Limit (RPM)
                          </label>
                          <input
                            type="number"
                            min="5"
                            max="300"
                            value={lim().rate_limit_rpm}
                            onInput={(e) => {
                              const val = Number(e.currentTarget.value) || 30;
                              setLimitesMotores((prev) => ({
                                ...prev,
                                [m.id]: { ...lim(), rate_limit_rpm: val },
                              }));
                            }}
                            class="w-full bg-zinc-900/80 border border-zinc-800 rounded px-2.5 py-1 text-zinc-100 font-mono text-xs focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>

                        <div class="p-2 rounded-lg bg-zinc-950/40 border border-zinc-800/60 focus-within:border-emerald-500/50 transition-colors">
                          <label class="flex items-center gap-1 text-[11px] text-zinc-400 mb-1 font-medium">
                            <DollarSign size={11} class="text-zinc-500" /> Cota Diária (USD)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="1000"
                            step="1"
                            value={lim().daily_cost_usd}
                            onInput={(e) => {
                              const val = Number(e.currentTarget.value) || 10;
                              setLimitesMotores((prev) => ({
                                ...prev,
                                [m.id]: { ...lim(), daily_cost_usd: val },
                              }));
                            }}
                            class="w-full bg-zinc-900/80 border border-zinc-800 rounded px-2.5 py-1 text-zinc-100 font-mono text-xs focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* Popup: escolher qual motor conectar */}
      <Show when={popupConectarAberto()}>
        <div class="fixed inset-0 bg-black/60 z-40" onClick={() => setPopupConectarAberto(false)} />
        <div
          data-testid="popup-conectar-motor"
          class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[22rem] max-w-[90vw] max-h-[80vh] overflow-y-auto scrollbar-thin bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-4 space-y-3"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-zinc-100">Conectar motor</span>
            <button
              type="button"
              onClick={() => setPopupConectarAberto(false)}
              class="text-zinc-500 hover:text-zinc-200 cursor-pointer"
              title="Fechar"
            >
              <X size={15} />
            </button>
          </div>
          <p class="text-[11px] text-zinc-400 leading-relaxed">
            Somente motores com driver implementado aparecem aqui. Ao autenticar/instalar, o motor entra na lista de abas.
          </p>
          <Show
            when={motoresDesconectados().length > 0}
            fallback={<p class="text-xs text-emerald-400">Todos os motores implementados já estão conectados.</p>}
          >
            <div class="space-y-2">
              <For each={motoresDesconectados()}>
                {(m: any) => (
                  <div class="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
                    <div class="min-w-0">
                      <div class="text-xs font-medium text-zinc-200 truncate">{m.name || m.id}</div>
                      <div class="text-[10px] font-mono text-zinc-500">
                        {m.installed ? (m.authStatus?.authenticated ? "instalado · autenticado" : "instalado · sem auth") : "não instalado"}
                      </div>
                    </div>
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => {
                        setPopupConectarAberto(false);
                        setMotorSelecionadoTab(m.id);
                        setMotorSelecionadoAuth(m);
                      }}
                    >
                      <Key size={11} class="mr-1" /> Conectar
                    </Button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      <EngineAuthModal
        open={Boolean(motorSelecionadoAuth())}
        onClose={() => setMotorSelecionadoAuth(null)}
        motor={motorSelecionadoAuth()}
        onSuccess={carregarStatusMotores}
        onGoToKeysTab={() => {
          if (props.onGoToKeysTab) props.onGoToKeysTab();
        }}
      />
    </>
  );
};
