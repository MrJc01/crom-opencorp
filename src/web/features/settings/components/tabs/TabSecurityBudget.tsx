import React, { useState, useEffect, useCallback, type FC, type ChangeEvent } from "react";
import {
  Coins,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Save,
  Loader2,
  Lock,
} from "lucide-react";
import { SettingRow } from "../SettingRow.js";
import { showToast } from "../../../../shared/ui/Toast.js";
import { useOpenCorp } from "../../../../providers/OpenCorpProvider.js";
import type { TabConfigId, EntradaSettingsRow } from "../../types.js";

export interface TabSecurityBudgetProps {
  abaAtiva: TabConfigId;
  todasEntradas: EntradaSettingsRow[];
  onSalvarChave: (chave: string, valor: unknown) => Promise<void>;
  salvando: boolean;
}

export const TabSecurityBudget: FC<TabSecurityBudgetProps> = ({
  abaAtiva,
  todasEntradas,
  onSalvarChave,
  salvando,
}) => {
  const { client, tratarErro } = useOpenCorp();
  const [nivelSeguranca, setNivelSeguranca] = useState<"permissive" | "standard" | "strict">("permissive");
  const [allowlistRede, setAllowlistRede] = useState(
    "pulso-diario.wp.crom.me, *.crom.me, *.wp.crom.me, github.com, registry.npmjs.org"
  );
  const [salvandoSeg, setSalvandoSeg] = useState(false);

  const carregarSeguranca = useCallback(async () => {
    try {
      const sec = await client.http.get<any>("/settings/security");
      if (sec) {
        if (sec.level) setNivelSeguranca(sec.level);
        if (Array.isArray(sec.network_allowlist)) {
          setAllowlistRede(sec.network_allowlist.join(", "));
        }
      }
    } catch {
      // Usa defaults
    }
  }, [client]);

  const salvarSeguranca = async () => {
    setSalvandoSeg(true);
    try {
      const listaRede = allowlistRede
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await client.http.put("/settings/security", {
        level: nivelSeguranca,
        network_allowlist: listaRede,
      });
      showToast("Política de segurança atualizada com sucesso!", "sucesso");
    } catch (err: unknown) {
      tratarErro(err, "Erro ao salvar política de segurança");
    } finally {
      setSalvandoSeg(false);
    }
  };

  useEffect(() => {
    void carregarSeguranca();
  }, [carregarSeguranca]);

  return (
    <div className="space-y-6 bg-transparent">
      {/* ─────────────────────────────────────────────────────────────
          ABA ORÇAMENTO
         ───────────────────────────────────────────────────────────── */}
      {abaAtiva === "orcamento" && (
        <div className="space-y-6 bg-transparent">
          <div className="pb-3 border-b border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Coins size={16} className="text-amber-400" />
              Limites de Gasto & Orçamento Financeiro
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Controle de custos diários, tetos por execução de agente e pausa preventiva ao estourar orçamento.
            </p>
          </div>

          <div className="divide-y divide-zinc-850 border border-zinc-850 rounded-xl bg-zinc-900/30 p-4">
            <SettingRow
              chave="budget.daily_usd"
              label="Teto Diário do Workspace (USD)"
              descricao="Limite financeiro total em dólares permitido por dia para todas as tarefas do workspace."
              tipo="number"
              step="0.5"
              min="0"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="budget.per_agent_usd"
              label="Teto por Agente (USD)"
              descricao="Custo máximo permitido para uma única execução de agente autônomo."
              tipo="number"
              step="0.25"
              min="0"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="budget.pause_on_exceed"
              label="Pausar Agentes ao Estourar"
              descricao="Interrompe imediatamente novas execuções ReAct caso o limite financeiro diário seja atingido."
              tipo="bool"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ABA SEGURANÇA & ISOLAMENTO
         ───────────────────────────────────────────────────────────── */}
      {abaAtiva === "seguranca" && (
        <div className="space-y-6 bg-transparent">
          <div className="pb-3 border-b border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-400" />
              Política de Segurança, Sandboxing e Permissões
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Defina o grau de autonomia dos agentes, restrições de rede externa e comandos bloqueados.
            </p>
          </div>

          {/* Seletor Visual de Nível de Segurança */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div
              onClick={() => setNivelSeguranca("permissive")}
              className={`p-3.5 rounded-xl border cursor-pointer transition-colors ${
                nivelSeguranca === "permissive"
                  ? "bg-zinc-850/80 border-orange-500/60 text-zinc-100 shadow-xs"
                  : "bg-zinc-900/30 border-zinc-850 text-zinc-400 hover:border-zinc-750"
              }`}
            >
              <div className="font-semibold text-xs text-zinc-100 mb-1 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>Permissivo (Padrão)</span>
              </div>
              <div className="text-[11px] leading-relaxed text-zinc-400">
                Executa ferramentas de rotina, scripts python e requisições permitidas automaticamente.
              </div>
            </div>

            <div
              onClick={() => setNivelSeguranca("standard")}
              className={`p-3.5 rounded-xl border cursor-pointer transition-colors ${
                nivelSeguranca === "standard"
                  ? "bg-zinc-850/80 border-orange-500/60 text-zinc-100 shadow-xs"
                  : "bg-zinc-900/30 border-zinc-850 text-zinc-400 hover:border-zinc-750"
              }`}
            >
              <div className="font-semibold text-xs text-zinc-100 mb-1 flex items-center gap-1.5">
                <ShieldAlert size={14} className="text-amber-400" />
                <span>Standard (Equilibrado)</span>
              </div>
              <div className="text-[11px] leading-relaxed text-zinc-400">
                Requer confirmação para comandos bash com modificação em massa de arquivos ou git push.
              </div>
            </div>

            <div
              onClick={() => setNivelSeguranca("strict")}
              className={`p-3.5 rounded-xl border cursor-pointer transition-colors ${
                nivelSeguranca === "strict"
                  ? "bg-zinc-850/80 border-orange-500/60 text-zinc-100 shadow-xs"
                  : "bg-zinc-900/30 border-zinc-850 text-zinc-400 hover:border-zinc-750"
              }`}
            >
              <div className="font-semibold text-xs text-zinc-100 mb-1 flex items-center gap-1.5">
                <ShieldX size={14} className="text-rose-400" />
                <span>Estrito (Air-gapped)</span>
              </div>
              <div className="text-[11px] leading-relaxed text-zinc-400">
                Bloqueia chamadas de rede externa e exige aprovação humana para qualquer ferramenta de escrita.
              </div>
            </div>
          </div>

          {/* Allowlist de Domínios de Rede */}
          <div className="space-y-2 p-4 rounded-xl border border-zinc-850 bg-zinc-900/30">
            <label className="block text-xs font-semibold text-zinc-200">
              Allowlist de Rede dos Agentes (Hostnames Permitidos)
            </label>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Lista separada por vírgula de domínios externos que os agentes podem consultar via curl, python ou webhooks.
            </p>
            <input
              type="text"
              value={allowlistRede}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setAllowlistRede(e.target.value)
              }
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-orange-500"
            />
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                disabled={salvandoSeg}
                onClick={salvarSeguranca}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {salvandoSeg ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Save size={12} />
                )}
                <span>Salvar Política de Rede</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
