import { type Component, createSignal, onMount, Show, type Accessor } from "solid-js";
import { Coins, ShieldCheck, ShieldAlert, ShieldX, Save } from "lucide-solid";
import { Button } from "../../../ui/Button";
import { SettingRow } from "../SettingRow";
import { showToast } from "../../../ui/Toast";
import { fetchApi } from "../../../lib/context";
import { type TabConfigId, type EntradaSettingsRow } from "./types";

export interface TabSecurityBudgetProps {
  abaAtiva: Accessor<TabConfigId>;
  todasEntradas: Accessor<EntradaSettingsRow[]>;
  onSalvarChave: (chave: string, valor: unknown) => Promise<void>;
  salvando: Accessor<boolean>;
}

export const TabSecurityBudget: Component<TabSecurityBudgetProps> = (props) => {
  const [nivelSeguranca, setNivelSeguranca] = createSignal<"permissive" | "standard" | "strict">("permissive");
  const [allowlistRede, setAllowlistRede] = createSignal("pulso-diario.wp.crom.me, *.crom.me, *.wp.crom.me, github.com, registry.npmjs.org");
  const [salvandoSeg, setSalvandoSeg] = createSignal(false);

  const carregarSeguranca = async () => {
    try {
      const sec = await fetchApi<any>("/settings/security");
      if (sec) {
        if (sec.level) setNivelSeguranca(sec.level);
        if (Array.isArray(sec.network_allowlist)) setAllowlistRede(sec.network_allowlist.join(", "));
      }
    } catch {}
  };

  const salvarSeguranca = async () => {
    setSalvandoSeg(true);
    try {
      const listaRede = allowlistRede().split(",").map((s) => s.trim()).filter(Boolean);
      await fetchApi("/settings/security", {
        method: "PUT",
        body: JSON.stringify({
          level: nivelSeguranca(),
          network_allowlist: listaRede,
        }),
      });
      showToast("Política de segurança atualizada!", "sucesso");
    } catch (err: any) {
      showToast("Erro ao salvar: " + err.message, "erro");
    } finally {
      setSalvandoSeg(false);
    }
  };

  onMount(() => {
    void carregarSeguranca();
  });

  return (
    <div class="space-y-6 bg-transparent">
      {/* ─────────────────────────────────────────────────────────────
          ABA ORÇAMENTO
         ───────────────────────────────────────────────────────────── */}
      <Show when={props.abaAtiva() === "orcamento"}>
        <div class="space-y-6 bg-transparent">
          <div class="pb-1 border-b border-zinc-800/40">
            <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Coins size={15} class="text-zinc-400" />
              Limites de Gasto & Orçamento Financeiro
            </h2>
            <p class="text-xs text-zinc-400 mt-0.5">
              Controle de custos diários, tetos por agente e pausa preventiva ao estourar orçamento.
            </p>
          </div>

          <div class="divide-y divide-zinc-800/40">
            <SettingRow
              chave="budget.daily_usd"
              label="Teto Diário do Workspace (USD)"
              descricao="Limite financeiro total em dólares permitido por dia para todas as tarefas do workspace."
              tipo="number"
              step="0.5"
              min="0"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="budget.per_agent_usd"
              label="Teto por Agente (USD)"
              descricao="Custo máximo permitido para uma única execução de agente autônomo."
              tipo="number"
              step="0.25"
              min="0"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="budget.pause_on_exceed"
              label="Pausar Agentes ao Estourar"
              descricao="Interrompe imediatamente novas execuções ReAct caso o limite financeiro diário seja atingido."
              tipo="bool"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
          </div>
        </div>
      </Show>

      {/* ─────────────────────────────────────────────────────────────
          ABA SEGURANÇA & ISOLAMENTO
         ───────────────────────────────────────────────────────────── */}
      <Show when={props.abaAtiva() === "seguranca"}>
        <div class="space-y-6 bg-transparent">
          <div class="pb-1 border-b border-zinc-800/40">
            <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <ShieldCheck size={15} class="text-zinc-400" />
              Política de Segurança, Sandboxing e Permissões
            </h2>
            <p class="text-xs text-zinc-400 mt-0.5">
              Defina o grau de autonomia dos agentes, restrições de rede e comandos bloqueados.
            </p>
          </div>

          {/* Seletor Visual de Nível de Segurança */}
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div
              class={`p-3 rounded-lg border cursor-pointer transition-colors ${
                nivelSeguranca() === "permissive"
                  ? "bg-zinc-800/80 border-zinc-600 text-zinc-100"
                  : "bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
              onClick={() => setNivelSeguranca("permissive")}
            >
              <div class="font-semibold text-xs text-zinc-100 mb-1 flex items-center gap-1.5">
                <ShieldCheck size={13} class="text-zinc-300" /> Permissivo (Padrão)
              </div>
              <div class="text-[11px] leading-relaxed text-zinc-400">
                Executa ferramentas de rotina e requisições permitidas automaticamente.
              </div>
            </div>

            <div
              class={`p-3 rounded-lg border cursor-pointer transition-colors ${
                nivelSeguranca() === "standard"
                  ? "bg-zinc-800/80 border-zinc-600 text-zinc-100"
                  : "bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
              onClick={() => setNivelSeguranca("standard")}
            >
              <div class="font-semibold text-xs text-zinc-100 mb-1 flex items-center gap-1.5">
                <ShieldAlert size={13} class="text-zinc-300" /> Equilibrado
              </div>
              <div class="text-[11px] leading-relaxed text-zinc-400">
                Aprova comandos normais e pede confirmação apenas para ações sensíveis.
              </div>
            </div>

            <div
              class={`p-3 rounded-lg border cursor-pointer transition-colors ${
                nivelSeguranca() === "strict"
                  ? "bg-zinc-800/80 border-zinc-600 text-zinc-100"
                  : "bg-transparent border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
              onClick={() => setNivelSeguranca("strict")}
            >
              <div class="font-semibold text-xs text-zinc-100 mb-1 flex items-center gap-1.5">
                <ShieldX size={13} class="text-zinc-300" /> Restrito
              </div>
              <div class="text-[11px] leading-relaxed text-zinc-400">
                Pede confirmação humana (HITL) para qualquer comando bash ou rede.
              </div>
            </div>
          </div>

          {/* Allowlist de Rede */}
          <div class="space-y-2 pt-2 border-t border-zinc-800/40">
            <label class="block text-xs font-semibold text-zinc-200">
              Allowlist de Domínios de Rede (separados por vírgula)
            </label>
            <input
              type="text"
              value={allowlistRede()}
              onInput={(e) => setAllowlistRede(e.currentTarget.value)}
              class="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
            />
          </div>

          {/* Parâmetros de Blocklist e HITL */}
          <div class="pt-4 border-t border-zinc-800/40 space-y-1">
            <span class="text-xs font-semibold text-zinc-300 uppercase tracking-wider block mb-2">
              Filtros e Aprovação Humana (HITL)
            </span>
            <div class="divide-y divide-zinc-800/40">
              <SettingRow
                chave="security.blocklist"
                label="Comandos Bloqueados (Blocklist)"
                descricao="Comandos cujo disparo direto pelo terminal bash é terminantemente proibido (1 por linha)."
                tipo="textarea"
                todasEntradas={props.todasEntradas}
                onSalvar={props.onSalvarChave}
                salvando={props.salvando}
              />
              <SettingRow
                chave="security.hitl_patterns"
                label="Padrões que Exigem Aprovação Humana"
                descricao="Padrões que, se identificados no plano ou comando, pausarão o agente para aprovação humana (1 por linha)."
                tipo="textarea"
                todasEntradas={props.todasEntradas}
                onSalvar={props.onSalvarChave}
                salvando={props.salvando}
              />
            </div>
          </div>

          <div class="pt-2 flex justify-end">
            <Button size="sm" variant="primary" loading={salvandoSeg()} onClick={salvarSeguranca}>
              <Save size={13} class="mr-1.5" /> Salvar Política de Segurança
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
};
