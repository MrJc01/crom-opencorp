import { type Component, Show, type Accessor } from "solid-js";
import { Settings, Clock, Folder, CircleCheck, Users } from "lucide-solid";
import { SettingRow } from "../SettingRow";
import { type TabConfigId, type EntradaSettingsRow } from "./types";

export interface TabGeneralProps {
  abaAtiva: Accessor<TabConfigId>;
  todasEntradas: Accessor<EntradaSettingsRow[]>;
  onSalvarChave: (chave: string, valor: unknown) => Promise<void>;
  salvando: Accessor<boolean>;
}

export const TabGeneral: Component<TabGeneralProps> = (props) => {
  return (
    <div class="space-y-6 bg-transparent">
      {/* ─────────────────────────────────────────────────────────────
          ABA WORKSPACE & DIRETÓRIOS
         ───────────────────────────────────────────────────────────── */}
      <Show when={props.abaAtiva() === "workspace"}>
        <div class="space-y-6 bg-transparent">
          <div class="pb-1 border-b border-zinc-800/40">
            <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Folder size={15} class="text-zinc-400" />
              Diretórios & Estrutura de Workspaces
            </h2>
            <p class="text-xs text-zinc-400 mt-0.5">
              Localização física onde residem as empresas, repositórios de código e artefatos de execução.
            </p>
          </div>

          <div class="divide-y divide-zinc-800/40">
            <SettingRow
              chave="paths.workspaces_root"
              label="Diretório Raiz dos Workspaces"
              descricao="Caminho base no disco onde novas empresas e workspaces são criados e clonados."
              tipo="text"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
          </div>

          <div class="pt-4 border-t border-zinc-800/40 space-y-3">
            <span class="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">
              Caminhos Padrão do Sistema Operacional
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div class="p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/60 space-y-1">
                <span class="text-zinc-200 font-medium block">Home OpenCorp</span>
                <p class="text-[11px] font-mono text-zinc-400">~/.opencorp</p>
              </div>
              <div class="p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/60 space-y-1">
                <span class="text-zinc-200 font-medium block">Ledger & Registries</span>
                <p class="text-[11px] font-mono text-zinc-400">registries/corp.db</p>
              </div>
              <div class="p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/60 space-y-1">
                <span class="text-zinc-200 font-medium block">Relatórios de Testes</span>
                <p class="text-[11px] font-mono text-zinc-400">.opencorp/reports/testes</p>
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* ─────────────────────────────────────────────────────────────
          ABA SCHEDULER & SUPERVISOR
         ───────────────────────────────────────────────────────────── */}
      <Show when={props.abaAtiva() === "scheduler"}>
        <div class="space-y-6 bg-transparent">
          <div class="pb-1 border-b border-zinc-800/40">
            <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Clock size={15} class="text-zinc-400" />
              Supervisor em Segundo Plano & Scheduler
            </h2>
            <p class="text-xs text-zinc-400 mt-0.5">
              Manutenção preventiva de rotinas, limpeza de locks zumbis e resgate de tarefas agendadas.
            </p>
          </div>

          <div class="divide-y divide-zinc-800/40">
            <SettingRow
              chave="supervisor.enabled"
              label="Supervisor Ativo"
              descricao="Executa rotina contínua de auditoria que limpa processos zumbis e reencaixa ordens travadas."
              tipo="bool"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="supervisor.interval_minutes"
              label="Intervalo de Ciclo do Supervisor (minutos)"
              descricao="Frequência em minutos com que o supervisor audita os locks e o estado da empresa."
              tipo="number"
              min="1"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="supervisor.max_orders_per_tick"
              label="Máximo de Ordens por Ciclo"
              descricao="Quantidade máxima de tarefas que o supervisor pode disparar em uma mesma verificação."
              tipo="number"
              min="1"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="scheduler.catch_up"
              label="Catch-up de Tarefas Atrasadas"
              descricao="Se o daemon reiniciar ou a máquina suspender, executa tarefas que perderam a janela de agendamento."
              tipo="bool"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="scheduler.catch_up_max_min"
              label="Janela Máxima de Catch-up (minutos)"
              descricao="Teto máximo em minutos para resgatar uma tarefa atrasada antes de descartá-la com log."
              tipo="number"
              min="1"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="scheduler.timezone"
              label="Fuso Horário dos Agendamentos (IANA)"
              descricao="Relógio usado para interpretar crons e exibir horários. Ex.: America/Sao_Paulo, America/Bahia, UTC. Use o seletor Global ⇄ Workspace no topo para definir por workspace."
              tipo="text"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
          </div>
        </div>
      </Show>

      {/* ─────────────────────────────────────────────────────────────
          ABA TESTES CEGOS & BENCHMARKS
         ───────────────────────────────────────────────────────────── */}
      <Show when={props.abaAtiva() === "testes"}>
        <div class="space-y-6 bg-transparent">
          <div class="pb-1 border-b border-zinc-800/40">
            <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <CircleCheck size={15} class="text-zinc-400" />
              Testes Cegos & Avaliação de Agentes
            </h2>
            <p class="text-xs text-zinc-400 mt-0.5">
              Modelos juízes e auditorias automatizadas para aferir conformidade e qualidade dos agentes.
            </p>
          </div>

          <div class="divide-y divide-zinc-800/40">
            <SettingRow
              chave="tests.blind"
              label="Testes Cegos Ativos"
              descricao="Executa avaliações cegas onde um modelo juiz independente valida a entrega do agente."
              tipo="bool"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="tests.test_model"
              label="Modelo Juiz Principal"
              descricao="Identificador provider/modelo utilizado para inspecionar saídas e emitir vereditos."
              tipo="text"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="tests.rotation"
              label="Rotação de Juízes de Teste"
              descricao="Lista de modelos alternativos para revezamento na avaliação dos testes (1 por linha)."
              tipo="textarea"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="tests.timeout_minutes"
              label="Timeout dos Testes (minutos)"
              descricao="Tempo limite máximo para cada sessão de teste cego ou benchmark."
              tipo="number"
              min="1"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
          </div>
        </div>
      </Show>

      {/* ─────────────────────────────────────────────────────────────
          ABA REUNIÕES & AUTO-HEALING
         ───────────────────────────────────────────────────────────── */}
      <Show when={props.abaAtiva() === "reunioes"}>
        <div class="space-y-6 bg-transparent">
          <div class="pb-1 border-b border-zinc-800/40">
            <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Users size={15} class="text-zinc-400" />
              Salas de Reunião & Auto-Healing de Falhas
            </h2>
            <p class="text-xs text-zinc-400 mt-0.5">
              Governança para reuniões autônomas entre múltiplos agentes e recuperação automática de erros.
            </p>
          </div>

          <div class="divide-y divide-zinc-800/40">
            <SettingRow
              chave="healing.enabled"
              label="Auto-Cura / Healing de Falhas"
              descricao="Ao encontrar erros de execução ou sintaxe, dispara rotina de reparação imediata."
              tipo="bool"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="healing.max_retries"
              label="Máximo de Tentativas de Auto-Healing"
              descricao="Número de vezes que o sistema tentará consertar um agente antes de registrar falha definitiva."
              tipo="number"
              min="0"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="meeting.moderator"
              label="Agente Moderador da Reunião"
              descricao="Agente responsável por abrir a pauta, coordenar as falas e encerrar a sessão."
              tipo="text"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="meeting.max_minutes"
              label="Duração Máxima da Reunião (minutos)"
              descricao="Tempo limite após o qual a reunião é finalizada compulsoriamente gerando a ata."
              tipo="number"
              min="1"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="meeting.max_turns"
              label="Máximo de Turnos por Reunião"
              descricao="Quantidade máxima de mensagens trocadas entre agentes em uma mesma sessão."
              tipo="number"
              min="1"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="meeting.per_agent_usd"
              label="Orçamento por Agente na Reunião (USD)"
              descricao="Limite de custo de inferência alocado para cada participante durante a reunião."
              tipo="number"
              step="0.1"
              min="0"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="meeting.ata_model_rotation"
              label="Modelos para Síntese da Ata"
              descricao="Rotação de modelos utilizados para transcrever e resumir a ata final da reunião (1 por linha)."
              tipo="textarea"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
          </div>
        </div>
      </Show>

      {/* ─────────────────────────────────────────────────────────────
          ABA GERAL & OPERACIONAL
         ───────────────────────────────────────────────────────────── */}
      <Show when={props.abaAtiva() === "geral"}>
        <div class="space-y-6 bg-transparent">
          <div class="pb-1 border-b border-zinc-800/40">
            <h2 class="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Settings size={15} class="text-zinc-400" />
              Parâmetros Gerais, Nuvem & Operacional
            </h2>
            <p class="text-xs text-zinc-400 mt-0.5">
              Sincronização em nuvem, tema da interface e timeouts operacionais do sistema.
            </p>
          </div>

          <div class="divide-y divide-zinc-800/40">
            <SettingRow
              chave="cloud.enabled"
              label="Sincronização em Nuvem / Backup"
              descricao="Ativa rotinas de backup e sincronização dos dados da empresa."
              tipo="bool"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
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
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="cloud.targets"
              label="Alvos de Sincronização Remota"
              descricao="Lista de endpoints ou destinos remotos de backup (1 por linha)."
              tipo="textarea"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
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
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
            <SettingRow
              chave="ui.verbose"
              label="Modo Verboso / Detalhado"
              descricao="Emite detalhes estendidos nos logs do servidor e no console do navegador."
              tipo="bool"
              todasEntradas={props.todasEntradas}
              onSalvar={props.onSalvarChave}
              salvando={props.salvando}
            />
          </div>

          <div class="pt-4 border-t border-zinc-800/40 space-y-3">
            <span class="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">
              Timeouts e Proteções Globais
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div class="p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/60 space-y-1">
                <span class="text-zinc-200 font-medium block">Fast-Fail de Stream (35s)</span>
                <p class="text-[11px] text-zinc-400 leading-relaxed">
                  Encerra requisições de stream que congelarem por mais de 35 segundos sem gerar novos tokens.
                </p>
              </div>

              <div class="p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/60 space-y-1">
                <span class="text-zinc-200 font-medium block">Watchdog Global (20 min)</span>
                <p class="text-[11px] text-zinc-400 leading-relaxed">
                  Teto máximo absoluto de segurança para qualquer turno de agente autônomo.
                </p>
              </div>

              <div class="p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/60 space-y-1">
                <span class="text-zinc-200 font-medium block">Diretório de Configurações</span>
                <p class="text-[11px] font-mono text-zinc-400">~/.opencorp</p>
              </div>

              <div class="p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/60 space-y-1">
                <span class="text-zinc-200 font-medium block">Banco de Dados Ledger</span>
                <p class="text-[11px] font-mono text-zinc-400">registries/corp.db</p>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
