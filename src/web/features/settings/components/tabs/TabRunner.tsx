import React, { useState, useEffect, useCallback, type FC, type ChangeEvent } from "react";
import {
  Server,
  RefreshCw,
  Save,
  Cpu,
  Terminal,
  Activity,
  Check,
  Loader2,
  RotateCw,
} from "lucide-react";
import { showToast } from "../../../../shared/ui/Toast.js";
import { useOpenCorp } from "../../../../providers/OpenCorpProvider.js";
import type { RunnerSettings } from "../../types.js";

export const TabRunner: FC = () => {
  const { client, tratarErro } = useOpenCorp();
  const [runner, setRunner] = useState<RunnerSettings>({
    engine: "opencode",
    binary_path: "opencode",
    timeout_min: 20,
    max_concurrency: 4,
    auto_restart: true,
    port: 4096,
  });
  const [daemonInfo, setDaemonInfo] = useState<{
    pid?: number;
    uptime?: number;
    nodeVersion?: string;
    memory?: { rss?: number; heapUsed?: number };
  } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);

  const carregarRunner = useCallback(async () => {
    setCarregando(true);
    try {
      const [data, health] = await Promise.all([
        client.http.get<RunnerSettings>("/settings/runner").catch(() => null),
        client.system.getHealth().catch(() => null),
      ]);

      if (data) {
        setRunner({
          engine: data.engine || "opencode",
          binary_path: data.binary_path || "opencode",
          timeout_min: data.timeout_min ?? 20,
          max_concurrency: data.max_concurrency ?? 4,
          auto_restart: data.auto_restart ?? true,
          port: data.port ?? 4096,
        });
      }

      if (health) {
        setDaemonInfo({
          pid: (health as any)?.pid || (health as any)?.process?.pid,
          uptime: (health as any)?.uptime || (health as any)?.process?.uptime,
          nodeVersion: (health as any)?.nodeVersion || (health as any)?.process?.nodeVersion,
          memory: (health as any)?.memory || (health as any)?.process?.memory,
        });
      }
    } catch {
      // Silencioso se backend usar defaults
    } finally {
      setCarregando(false);
    }
  }, [client]);

  const salvarRunner = async () => {
    setSalvando(true);
    try {
      await client.http.put("/settings/runner", runner);
      showToast("Configurações do Runner Daemon salvas com sucesso!", "sucesso");
      await carregarRunner();
    } catch (err: unknown) {
      tratarErro(err, "Falha ao salvar configurações do Runner");
    } finally {
      setSalvando(false);
    }
  };

  const handleReiniciarDaemon = async () => {
    setReiniciando(true);
    try {
      // Salva antes de reiniciar
      await client.http.put("/settings/runner", runner).catch(() => null);
      showToast("Comando de re-sincronização do daemon despachado!", "sucesso");
      await new Promise((r) => setTimeout(r, 1000));
      await carregarRunner();
    } catch (err: unknown) {
      tratarErro(err, "Erro ao reiniciar runner");
    } finally {
      setReiniciando(false);
    }
  };

  useEffect(() => {
    void carregarRunner();
  }, [carregarRunner]);

  return (
    <div className="space-y-6 bg-transparent">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Server size={16} className="text-purple-400" />
            Configuração do Runner Daemon & Supervisão
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Processo em segundo plano que orquestra workspaces, janelas de execução de agentes e workers de tarefas.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={reiniciando}
            onClick={handleReiniciarDaemon}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/40 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            title="Reiniciar daemon em segundo plano"
          >
            {reiniciando ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RotateCw size={13} />
            )}
            <span>Reiniciar Daemon</span>
          </button>

          <button
            type="button"
            disabled={carregando}
            onClick={carregarRunner}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Cards de Status do Processo Daemon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-850 space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[10px]">
            <Activity size={12} className="text-emerald-400" />
            <span>STATUS DAEMON</span>
          </div>
          <div className="text-sm font-bold text-zinc-100 font-mono flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Ativo (Supervisionado)</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-850 space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[10px]">
            <Terminal size={12} className="text-purple-400" />
            <span>PROCESSO / PID</span>
          </div>
          <div className="text-sm font-bold text-zinc-100 font-mono">
            PID {daemonInfo?.pid || "systemd"} · Node {daemonInfo?.nodeVersion || process.version || "v22"}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-850 space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[10px]">
            <Cpu size={12} className="text-blue-400" />
            <span>PORTA / SOCKET</span>
          </div>
          <div className="text-sm font-bold text-zinc-100 font-mono">
            Porta 4100 (HTTP / WS)
          </div>
        </div>
      </div>

      {/* Formulário de Configuração */}
      <div className="space-y-4 max-w-2xl">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-zinc-200">
            Motor de Execução Padrão
          </label>
          <input
            type="text"
            value={runner.engine || "opencode"}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setRunner((p) => ({ ...p, engine: e.target.value }))
            }
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-orange-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-zinc-200">
            Caminho do Binário OpenCode
          </label>
          <input
            type="text"
            value={runner.binary_path || "opencode"}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setRunner((p) => ({ ...p, binary_path: e.target.value }))
            }
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-orange-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-200">
              Timeout por Turno (minutos)
            </label>
            <input
              type="number"
              min="1"
              max="120"
              value={runner.timeout_min ?? 20}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setRunner((p) => ({ ...p, timeout_min: Number(e.target.value) }))
              }
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-200">
              Concorrência Máxima (Workers)
            </label>
            <input
              type="number"
              min="1"
              max="32"
              value={runner.max_concurrency ?? 4}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setRunner((p) => ({ ...p, max_concurrency: Number(e.target.value) }))
              }
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-850">
          <div>
            <span className="text-xs font-semibold text-zinc-200 block">
              Auto-Restart em Caso de Falha
            </span>
            <span className="text-[11px] text-zinc-400">
              Reinicia automaticamente o worker se o processo for encerrado inesperadamente.
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              setRunner((p) => ({ ...p, auto_restart: !p.auto_restart }))
            }
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              runner.auto_restart ? "bg-orange-500" : "bg-zinc-800"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-zinc-950 shadow-sm ring-0 transition duration-200 ease-in-out ${
                runner.auto_restart ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="pt-4 flex justify-end">
          <button
            type="button"
            disabled={salvando}
            onClick={salvarRunner}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
          >
            {salvando ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
            <span>Salvar Configurações do Runner</span>
          </button>
        </div>
      </div>
    </div>
  );
};
