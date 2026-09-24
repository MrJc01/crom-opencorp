import React, { type FC } from "react";
import {
  Settings,
  Clock,
  Folder,
  CircleCheck,
  Users,
  Shield,
  Zap,
} from "lucide-react";
import { SettingRow } from "../SettingRow.js";
import type { TabConfigId, EntradaSettingsRow } from "../../types.js";

export interface TabGeneralProps {
  abaAtiva: TabConfigId;
  todasEntradas: EntradaSettingsRow[];
  onSalvarChave: (chave: string, valor: unknown) => Promise<void>;
  salvando: boolean;
}

export const TabGeneral: FC<TabGeneralProps> = ({
  abaAtiva,
  todasEntradas,
  onSalvarChave,
  salvando,
}) => {
  return (
    <div className="space-y-6 bg-transparent">
      {/* ─────────────────────────────────────────────────────────────
          ABA WORKSPACE & DIRETÓRIOS
         ───────────────────────────────────────────────────────────── */}
      {abaAtiva === "workspace" && (
        <div className="space-y-6 bg-transparent">
          <div className="pb-3 border-b border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Folder size={16} className="text-blue-400" />
              Diretórios & Estrutura de Workspaces
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Localização física onde residem as empresas, repositórios de código e artefatos de execução.
            </p>
          </div>

          <div className="divide-y divide-zinc-850 border border-zinc-850 rounded-xl bg-zinc-900/30 p-4">
            <SettingRow
              chave="paths.workspaces_root"
              label="Diretório Raiz dos Workspaces"
              descricao="Caminho base no disco onde novas empresas e workspaces são criados e clonados."
              tipo="text"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
          </div>

          <div className="pt-2 space-y-3">
            <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">
              Caminhos Padrão do Sistema Operacional
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-zinc-900/30 border border-zinc-850 space-y-1">
                <span className="text-zinc-200 font-semibold block">Home OpenCorp</span>
                <p className="text-[11px] font-mono text-zinc-400">~/.opencorp</p>
              </div>
              <div className="p-3.5 rounded-xl bg-zinc-900/30 border border-zinc-850 space-y-1">
                <span className="text-zinc-200 font-semibold block">Ledger & Registries</span>
                <p className="text-[11px] font-mono text-zinc-400">registries/corp.db</p>
              </div>
              <div className="p-3.5 rounded-xl bg-zinc-900/30 border border-zinc-850 space-y-1">
                <span className="text-zinc-200 font-semibold block">Relatórios de Testes</span>
                <p className="text-[11px] font-mono text-zinc-400">.opencorp/reports/testes</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ABA SCHEDULER & SUPERVISOR
         ───────────────────────────────────────────────────────────── */}
      {abaAtiva === "scheduler" && (
        <div className="space-y-6 bg-transparent">
          <div className="pb-3 border-b border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Clock size={16} className="text-amber-400" />
              Supervisor em Segundo Plano & Scheduler
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Manutenção preventiva de rotinas, limpeza de locks zumbis e resgate de tarefas agendadas.
            </p>
          </div>

          <div className="divide-y divide-zinc-850 border border-zinc-850 rounded-xl bg-zinc-900/30 p-4">
            <SettingRow
              chave="supervisor.enabled"
              label="Supervisor Ativo"
              descricao="Executa rotina contínua de auditoria que limpa processos zumbis e reencaixa ordens travadas."
              tipo="bool"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="supervisor.interval_minutes"
              label="Intervalo de Ciclo do Supervisor (minutos)"
              descricao="Frequência em minutos com que o supervisor audita os locks e o estado da empresa."
              tipo="number"
              min="1"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="supervisor.max_orders_per_tick"
              label="Máximo de Ordens por Ciclo"
              descricao="Quantidade máxima de tarefas que o supervisor pode disparar em uma mesma verificação."
              tipo="number"
              min="1"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="scheduler.catch_up"
              label="Catch-up de Tarefas Atrasadas"
              descricao="Se o daemon reiniciar ou a máquina suspender, executa tarefas que perderam a janela de agendamento."
              tipo="bool"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="scheduler.catch_up_max_min"
              label="Janela Máxima de Catch-up (minutos)"
              descricao="Teto máximo em minutos para resgatar uma tarefa atrasada antes de descartá-la com log."
              tipo="number"
              min="1"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="scheduler.timezone"
              label="Fuso Horário dos Agendamentos (IANA)"
              descricao="Relógio usado para interpretar crons e exibir horários. Ex.: America/Sao_Paulo, America/Bahia, UTC."
              tipo="text"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ABA TESTES CEGOS & BENCHMARKS
         ───────────────────────────────────────────────────────────── */}
      {abaAtiva === "testes" && (
        <div className="space-y-6 bg-transparent">
          <div className="pb-3 border-b border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <CircleCheck size={16} className="text-emerald-400" />
              Testes Cegos & Avaliação de Agentes
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Modelos juízes e auditorias automatizadas para aferir conformidade e qualidade dos agentes.
            </p>
          </div>

          <div className="divide-y divide-zinc-850 border border-zinc-850 rounded-xl bg-zinc-900/30 p-4">
            <SettingRow
              chave="tests.blind"
              label="Testes Cegos Ativos"
              descricao="Executa avaliações cegas onde um modelo juiz independente valida a entrega do agente."
              tipo="bool"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="tests.test_model"
              label="Modelo Juiz Principal"
              descricao="Identificador provider/modelo utilizado para inspecionar saídas e emitir vereditos."
              tipo="text"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="tests.rotation"
              label="Rotação de Juízes de Teste"
              descricao="Lista de modelos alternativos para revezamento na avaliação dos testes (1 por linha)."
              tipo="textarea"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="tests.timeout_minutes"
              label="Timeout dos Testes (minutos)"
              descricao="Tempo limite máximo para cada sessão de teste cego ou benchmark."
              tipo="number"
              min="1"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ABA REUNIÕES & AUTO-HEALING
         ───────────────────────────────────────────────────────────── */}
      {abaAtiva === "reunioes" && (
        <div className="space-y-6 bg-transparent">
          <div className="pb-3 border-b border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Users size={16} className="text-purple-400" />
              Salas de Reunião & Auto-Healing de Falhas
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Governança para reuniões autônomas entre múltiplos agentes e recuperação automática de erros.
            </p>
          </div>

          <div className="divide-y divide-zinc-850 border border-zinc-850 rounded-xl bg-zinc-900/30 p-4">
            <SettingRow
              chave="healing.enabled"
              label="Auto-Cura / Healing de Falhas"
              descricao="Ao encontrar erros de execução ou sintaxe, dispara rotina de reparação imediata."
              tipo="bool"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="healing.max_retries"
              label="Máximo de Tentativas de Auto-Healing"
              descricao="Número de vezes que o sistema tentará consertar um agente antes de registrar falha definitiva."
              tipo="number"
              min="0"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="meeting.moderator"
              label="Agente Moderador da Reunião"
              descricao="Agente responsável por abrir a pauta, coordenar as falas e encerrar a sessão."
              tipo="text"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="meeting.max_minutes"
              label="Duração Máxima da Reunião (minutos)"
              descricao="Tempo limite após o qual a reunião é finalizada compulsoriamente gerando a ata."
              tipo="number"
              min="1"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="meeting.max_turns"
              label="Máximo de Turnos por Reunião"
              descricao="Quantidade máxima de mensagens trocadas entre agentes em uma mesma sessão."
              tipo="number"
              min="1"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="meeting.per_agent_usd"
              label="Orçamento por Agente na Reunião (USD)"
              descricao="Limite de custo de inferência alocado para cada participante durante a reunião."
              tipo="number"
              step="0.1"
              min="0"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="meeting.ata_model_rotation"
              label="Modelos para Síntese da Ata"
              descricao="Rotação de modelos utilizados para transcrever e resumir a ata final da reunião (1 por linha)."
              tipo="textarea"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ABA GERAL & OPERACIONAL
         ───────────────────────────────────────────────────────────── */}
      {abaAtiva === "geral" && (
        <div className="space-y-6 bg-transparent">
          <div className="pb-3 border-b border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Settings size={16} className="text-zinc-400" />
              Parâmetros Gerais, Nuvem & Operacional
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Sincronização em nuvem, tema da interface e timeouts operacionais do sistema.
            </p>
          </div>

          <div className="divide-y divide-zinc-850 border border-zinc-850 rounded-xl bg-zinc-900/30 p-4">
            <SettingRow
              chave="cloud.enabled"
              label="Sincronização em Nuvem / Backup"
              descricao="Ativa rotinas de backup e sincronização dos dados da empresa."
              tipo="bool"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="cloud.mode"
              label="Modo de Nuvem"
              descricao="Estratégia de backup e contingência remota."
              tipo="select"
              opcoes={[
                { valor: "backup-local", label: "Backup Local (Sem Nuvem)" },
                { valor: "backup-nuvem", label: "Backup em Nuvem" },
                { valor: "mirror-remoto", label: "Mirror Remoto Contínuo" },
              ]}
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="cloud.targets"
              label="Alvos de Sincronização Remota"
              descricao="Lista de endpoints ou destinos remotos de backup (1 por linha)."
              tipo="textarea"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="ui.theme"
              label="Tema da Interface Web"
              descricao="Aparência visual do painel OpenCorp."
              tipo="select"
              opcoes={[
                { valor: "dark", label: "Escuro (Dark)" },
                { valor: "light", label: "Claro (Light)" },
              ]}
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
            <SettingRow
              chave="ui.verbose"
              label="Modo Verboso / Detalhado"
              descricao="Emite detalhes estendidos nos logs do servidor e no console do navegador."
              tipo="bool"
              todasEntradas={todasEntradas}
              onSalvar={onSalvarChave}
              salvando={salvando}
            />
          </div>

          <div className="pt-2 space-y-3">
            <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">
              Timeouts e Proteções Globais
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-zinc-900/30 border border-zinc-850 space-y-1">
                <span className="text-zinc-200 font-semibold block">Fast-Fail de Stream (35s)</span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Encerra requisições de stream que congelarem por mais de 35 segundos sem gerar novos tokens.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/30 border border-zinc-850 space-y-1">
                <span className="text-zinc-200 font-semibold block">Watchdog Global (20 min)</span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Teto máximo absoluto de segurança para qualquer turno de agente autônomo.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
