import React, { useState, useEffect, useCallback, type FC, type ChangeEvent } from "react";
import {
  Bot,
  RefreshCw,
  Cpu,
  Key,
  KeyRound,
  Plus,
  Play,
  Activity,
  Save,
  Check,
  AlertCircle,
  ExternalLink,
  Shield,
  Layers,
  Loader2,
  Sliders,
  Sparkles,
} from "lucide-react";
import { showToast } from "../../../../shared/ui/Toast.js";
import { useOpenCorp } from "../../../../providers/OpenCorpProvider.js";
import { EngineAuthModal } from "../EngineAuthModal.js";
import type {
  TabConfigId,
  MotorInfo,
  ContaMotor,
} from "../../types.js";

export interface TabEnginesProps {
  abaAtiva: TabConfigId;
  escopoConfig?: "global" | "workspace";
  wsAtivo?: string;
  onGoToKeysTab?: () => void;
}

export const TabEngines: FC<TabEnginesProps> = ({
  abaAtiva,
  onGoToKeysTab,
}) => {
  const { client, tratarErro } = useOpenCorp();
  const [statusMotores, setStatusMotores] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const [motorSelecionado, setMotorSelecionado] = useState<string>("opencode");
  const [limites, setLimites] = useState<Record<string, any>>({});
  const [salvandoLimites, setSalvandoLimites] = useState(false);
  const [testandoMotor, setTestandoMotor] = useState<string | null>(null);
  const [resultadoTeste, setResultadoTeste] = useState<Record<string, any>>({});

  // Controle de abertura do EngineAuthModal
  const [modalAuthAberto, setModalAuthAberto] = useState(false);
  const [motorSelecionadoAuth, setMotorSelecionadoAuth] = useState<{ id: string; nome: string } | null>(null);

  const abrirModalAuth = (motor: { id: string; name?: string }) => {
    setMotorSelecionadoAuth({ id: motor.id, nome: motor.name || motor.id });
    setModalAuthAberto(true);
  };

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    setErroCarregamento(null);
    try {
      const [resMotores, resLimites] = await Promise.all([
        client.http.get<any>("/api/motores"),
        client.http.get<any>("/api/motores/limites"),
      ]);

      if (!resMotores || !Array.isArray(resMotores.motores)) {
        throw new Error("Resposta inválida ao carregar os motores");
      }
      setStatusMotores(resMotores);
      if (resMotores.limits) {
        setLimites(resMotores.limits);
      }
      if (resLimites?.limites && typeof resLimites.limites === "object") {
        setLimites((prev) => ({ ...prev, ...resLimites.limites }));
      }
    } catch (err: unknown) {
      setStatusMotores(null);
      setLimites({});
      setErroCarregamento(err instanceof Error ? err.message : String(err));
    } finally {
      setCarregando(false);
    }
  }, [client]);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  const motores: MotorInfo[] = statusMotores?.motores || [];

  const motorAtual = motores.find((m) => m.id === motorSelecionado) || motores[0];
  const contasDoMotor: ContaMotor[] = (statusMotores?.contas || []).filter(
    (c: any) => c.motorId === motorAtual?.id
  );

  const testarMotor = async (motorId: string) => {
    setTestandoMotor(motorId);
    try {
      const res = await client.http.post<any>(
        `/api/motores/${encodeURIComponent(motorId)}/test`,
        {},
      );

      setResultadoTeste((prev) => ({ ...prev, [motorId]: res }));
      if (res?.ok && res?.health?.healthy) {
        const latencia = res.ms ?? res.health?.latencyMs ?? 0;
        showToast(`Motor ${motorId} respondendo (${latencia}ms)!`, "sucesso");
      } else {
        const causa = res?.health?.message || res?.health?.statusText || res?.error || "Diagnóstico sem causa informada";
        setResultadoTeste((prev) => ({
          ...prev,
          [motorId]: { ...res, ok: false, error: causa },
        }));
        showToast(`Falha no motor ${motorId}: ${causa}`, "erro");
      }
    } catch (err: unknown) {
      const causa = err instanceof Error ? err.message : String(err);
      setResultadoTeste((prev) => ({
        ...prev,
        [motorId]: { ok: false, error: causa },
      }));
      tratarErro(err, `Falha ao testar motor ${motorId}`);
    } finally {
      setTestandoMotor(null);
    }
  };

  const salvarTodosLimites = async () => {
    setSalvandoLimites(true);
    try {
      await client.http.put("/api/motores/limites", limites);
      showToast("Limites operacionais dos motores salvos!", "sucesso");
      await carregarDados();
    } catch (err: unknown) {
      tratarErro(err, "Erro ao salvar limites dos motores");
    } finally {
      setSalvandoLimites(false);
    }
  };

  const atualizarLimiteMotor = (motorId: string, campo: string, valor: any) => {
    setLimites((prev) => ({
      ...prev,
      [motorId]: {
        ...(prev[motorId] || {}),
        [campo]: valor,
      },
    }));
  };

  return (
    <div className="space-y-6 bg-transparent">
      {/* ─────────────────────────────────────────────────────────────
          ABA MOTORES & PROVEDORES
         ───────────────────────────────────────────────────────────── */}
      {abaAtiva === "motores" && (
        <div className="space-y-6 bg-transparent">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Bot size={16} className="text-orange-400" />
                Motores de Inferência & Provedores BYOK
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Runtimes de agentes autônomos, execução em sandbox e conexões com APIs de inteligência.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onGoToKeysTab && (
                <button
                  type="button"
                  onClick={onGoToKeysTab}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/40 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Key size={13} />
                  <span>Gerenciar Chaves</span>
                </button>
              )}
              <button
                type="button"
                disabled={carregando}
                onClick={carregarDados}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
                <span>Atualizar</span>
              </button>
            </div>
          </div>

          {erroCarregamento && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-rose-800/60 bg-rose-950/30 p-4 text-xs text-rose-200">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-400" />
                <div>
                  <p className="font-semibold">Falha ao carregar motores</p>
                  <p className="mt-0.5 text-rose-300/80">{erroCarregamento}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={carregando}
                onClick={carregarDados}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-rose-700/60 bg-rose-900/40 px-3 py-1.5 font-semibold text-rose-100 transition-colors hover:bg-rose-900/70 disabled:opacity-50"
              >
                <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
                Tentar novamente
              </button>
            </div>
          )}

          {/* Grid de Motores Cadastrados */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {motores.map((m) => {
              const isSel = m.id === motorAtual?.id;
              const isAutenticado = m.authStatus?.authenticated || m.contaAtiva || m.id === "opencode";

              return (
                <div
                  key={m.id}
                  onClick={() => setMotorSelecionado(m.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-2.5 ${
                    isSel
                      ? "bg-zinc-850/90 border-orange-500/80 shadow-md ring-1 ring-orange-500/30"
                      : "bg-zinc-900/40 border-zinc-850 hover:border-zinc-750 hover:bg-zinc-900/70"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-zinc-100 font-mono truncate">
                        {m.name}
                      </span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isAutenticado ? "bg-emerald-400" : "bg-zinc-600"
                        }`}
                      />
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1">
                      {m.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-[10px] font-mono text-zinc-500">
                    <span>{m.version || "ativo"}</span>
                    {isAutenticado ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <Check size={11} /> Conectado
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMotorSelecionado(m.id);
                          abrirModalAuth(m);
                        }}
                        className="text-orange-400 hover:text-orange-300 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <KeyRound size={11} />
                        <span>Autenticar</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Painel de Detalhes do Motor Selecionado */}
          {motorAtual && (
            <div className="p-4 sm:p-5 rounded-2xl border border-zinc-850 bg-zinc-900/40 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-orange-600/10 border border-orange-500/20 text-orange-400 shrink-0">
                    <Cpu size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">
                      {motorAtual.name}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {motorAtual.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => abrirModalAuth(motorAtual)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <KeyRound size={13} />
                    <span>
                      {motorAtual.authStatus?.authenticated || motorAtual.contaAtiva || motorAtual.id === "opencode"
                        ? "+ Adicionar Conta"
                        : "Autenticar / Conectar"}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={testandoMotor !== null}
                    onClick={() => testarMotor(motorAtual.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-200 border border-zinc-800 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {testandoMotor === motorAtual.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Play size={13} className="text-emerald-400" />
                    )}
                    <span>Testar Conexão</span>
                  </button>
                </div>
              </div>

              {resultadoTeste[motorAtual.id] && (
                <div
                  className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${
                    resultadoTeste[motorAtual.id]?.ok && resultadoTeste[motorAtual.id]?.health?.healthy
                      ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300"
                      : "border-rose-800/60 bg-rose-950/30 text-rose-300"
                  }`}
                >
                  {resultadoTeste[motorAtual.id]?.ok && resultadoTeste[motorAtual.id]?.health?.healthy ? (
                    <Check size={14} className="mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  )}
                  <span>
                    {resultadoTeste[motorAtual.id]?.health?.statusText ||
                      resultadoTeste[motorAtual.id]?.health?.message ||
                      resultadoTeste[motorAtual.id]?.error ||
                      "Diagnóstico do motor indisponível"}
                  </span>
                </div>
              )}

              {/* Contas / Perfis de Execução do Motor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">
                    Contas &amp; Instâncias Configuradas ({contasDoMotor.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => abrirModalAuth(motorAtual)}
                    className="text-xs font-semibold text-orange-400 hover:text-orange-300 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Adicionar Conta</span>
                  </button>
                </div>
                <div className="space-y-2">
                  {contasDoMotor.map((conta) => (
                    <div
                      key={conta.id}
                      className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-850 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-200 font-mono">
                            {conta.nome || conta.id}
                          </span>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.2 rounded border font-semibold ${
                              conta.ativa
                                ? "text-emerald-400 bg-emerald-950/40 border-emerald-800/40"
                                : "text-zinc-500 bg-zinc-900 border-zinc-800"
                            }`}
                          >
                            {conta.ativa ? "Ativa" : "Inativa"}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500">
                          {conta.previewChave || conta.authType || "autenticado"} · Cota: {conta.limits?.status_cota || "normal"}
                        </span>
                      </div>

                      <div className="text-right text-[11px] font-mono text-zinc-400">
                        <span>{conta.limits?.rate_limit_rpm || 60} RPM</span>
                        <span className="text-zinc-600 block">
                          Teto: ${conta.limits?.daily_cost_usd || 100}/dia
                        </span>
                      </div>
                    </div>
                  ))}

                  {contasDoMotor.length === 0 && (
                    <p className="text-xs text-zinc-500 py-3 text-center border border-dashed border-zinc-850 rounded-xl">
                      Nenhuma conta extra cadastrada para este motor. Utilizando autenticação nativa.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ABA LIMITES DOS MOTORES
         ───────────────────────────────────────────────────────────── */}
      {abaAtiva === "limites" && (
        <div className="space-y-6 bg-transparent">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Sliders size={16} className="text-purple-400" />
                Limites Operacionais &amp; Quotas dos Motores
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Defina timeouts, turns máximos por turno, rate limit de requisições e teto financeiro por motor.
              </p>
            </div>
            <button
              type="button"
              disabled={salvandoLimites}
              onClick={salvarTodosLimites}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shadow-sm self-start sm:self-center"
            >
              {salvandoLimites ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              <span>Salvar Todos os Limites</span>
            </button>
          </div>

          <div className="divide-y divide-zinc-850 border border-zinc-850 rounded-xl bg-zinc-900/30 overflow-hidden">
            {motores.map((m) => {
              const lim = limites[m.id] || {
                timeout_min: 20,
                max_turns: 40,
                rate_limit_rpm: 60,
                daily_cost_usd: 10,
              };

              return (
                <div
                  key={m.id}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-zinc-900/40 transition-colors"
                >
                  <div className="space-y-0.5 max-w-sm">
                    <span className="font-bold text-xs text-zinc-100 font-mono">
                      {m.name}
                    </span>
                    <p className="text-[11px] text-zinc-400">{m.description}</p>
                    <span className="text-[10px] font-mono text-zinc-500 block">
                      ID: {m.id}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-mono text-zinc-400 mb-1">
                        TIMEOUT (MIN)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="240"
                        value={lim.timeout_min ?? 20}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          atualizarLimiteMotor(m.id, "timeout_min", Number(e.target.value))
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs font-mono text-zinc-100 text-right focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-zinc-400 mb-1">
                        TURNS MÁX.
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={lim.max_turns ?? 40}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          atualizarLimiteMotor(m.id, "max_turns", Number(e.target.value))
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs font-mono text-zinc-100 text-right focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-zinc-400 mb-1">
                        RATE (RPM)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="300"
                        value={lim.rate_limit_rpm ?? 60}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          atualizarLimiteMotor(m.id, "rate_limit_rpm", Number(e.target.value))
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs font-mono text-zinc-100 text-right focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-zinc-400 mb-1">
                        CUSTO DIA (USD)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={lim.daily_cost_usd ?? 10}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          atualizarLimiteMotor(m.id, "daily_cost_usd", Number(e.target.value))
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs font-mono text-zinc-100 text-right focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de Autenticação de Motores e Credenciais */}
      <EngineAuthModal
        aberto={modalAuthAberto}
        motorId={motorSelecionadoAuth?.id || null}
        motorNome={motorSelecionadoAuth?.nome}
        aoFechar={() => {
          setModalAuthAberto(false);
          setMotorSelecionadoAuth(null);
        }}
        aoSalvarSucesso={() => {
          void carregarDados();
        }}
      />
    </div>
  );
};
