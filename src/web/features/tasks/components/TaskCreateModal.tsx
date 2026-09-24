import React, { useState, type FC } from "react";
import { type AgentResumo, type CriarTaskInput } from "@opencorp/sdk";
import { X, Zap, Calendar, Clock, Plus, Loader2 } from "lucide-react";

export interface TaskCreateModalProps {
  aberto: boolean;
  agentes: AgentResumo[];
  colunaInicial?: string;
  aoFechar: () => void;
  aoCriar: (payload: CriarTaskInput) => Promise<void>;
}

export const TaskCreateModal: FC<TaskCreateModalProps> = ({
  aberto,
  agentes,
  colunaInicial = "backlog",
  aoFechar,
  aoCriar,
}) => {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [coluna, setColuna] = useState(colunaInicial);
  const [prioridade, setPrioridade] = useState<"baixa" | "media" | "alta" | "critica">("media");
  const [responsavel, setResponsavel] = useState("");
  const [executarImediato, setExecutarImediato] = useState(false);

  // Agendamento
  const [agendar, setAgendar] = useState(false);
  const [tipoAgendamento, setTipoAgendamento] = useState<"data_unica" | "recorrente">("data_unica");
  const [dataUnicaValor, setDataUnicaValor] = useState("");
  const [recorrenteFrequencia, setRecorrenteFrequencia] = useState("diario");
  const [cronCustomizado, setCronCustomizado] = useState("");
  const [salvando, setSalvando] = useState(false);

  if (!aberto) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;

    setSalvando(true);
    try {
      const payload: CriarTaskInput = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        coluna,
        prioridade,
        responsavel: responsavel.trim() || undefined,
        executar_agora: executarImediato,
      };

      if (agendar) {
        if (tipoAgendamento === "data_unica") {
          if (dataUnicaValor.trim()) payload.quando = dataUnicaValor.trim();
        } else {
          if (recorrenteFrequencia === "custom") {
            if (cronCustomizado.trim()) payload.cron = cronCustomizado.trim();
          } else {
            payload.repete = recorrenteFrequencia;
          }
        }
      }

      await aoCriar(payload);
      setTitulo("");
      setDescricao("");
      setResponsavel("");
      setExecutarImediato(false);
      setAgendar(false);
      setDataUnicaValor("");
      setCronCustomizado("");
      aoFechar();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={aoFechar}
    >
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do Modal */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Plus size={16} className="text-emerald-400" />
            <span>Criar Nova Tarefa</span>
          </h2>
          <button
            type="button"
            onClick={aoFechar}
            className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-zinc-300 font-medium mb-1">Título da Tarefa *</label>
            <input
              type="text"
              required
              placeholder="Ex: Auditoria técnica de endpoints ou refatoração"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Descrição Detalhada</label>
            <textarea
              rows={3}
              placeholder="Contexto, dependências e critério de aceite esperado..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-300 font-medium mb-1">Coluna Inicial</label>
              <select
                value={coluna}
                onChange={(e) => setColuna(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="backlog">Backlog</option>
                <option value="fazendo">Em Andamento</option>
                <option value="bloqueado">Bloqueado</option>
                <option value="feito">Concluído</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-300 font-medium mb-1">Prioridade</label>
              <select
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value as any)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Agente Responsável</label>
            <select
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="">Sem responsável definido</option>
              {agentes.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  @{ag.id} {ag.descricao ? `— ${ag.descricao.slice(0, 40)}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Toggle de Execução Imediata */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-zinc-950 border border-zinc-850">
            <input
              type="checkbox"
              id="checkImediato"
              checked={executarImediato}
              onChange={(e) => setExecutarImediato(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 cursor-pointer"
            />
            <label
              htmlFor="checkImediato"
              className="text-xs text-zinc-200 font-medium cursor-pointer select-none flex items-center gap-1.5"
            >
              <Zap size={13} className="text-emerald-400" />
              <span>Executar imediatamente com agente após a criação</span>
            </label>
          </div>

          {/* Seção de Agendamento OpenCorp Scheduler */}
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-850 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="checkAgendar"
                  checked={agendar}
                  onChange={(e) => setAgendar(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-amber-500 cursor-pointer"
                />
                <label
                  htmlFor="checkAgendar"
                  className="text-xs text-zinc-200 font-medium cursor-pointer select-none flex items-center gap-1.5"
                >
                  <Calendar size={13} className="text-amber-400" />
                  <span>Agendar Execução / Repetição</span>
                </label>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">OpenCorp Scheduler</span>
            </div>

            {agendar && (
              <div className="pt-2.5 border-t border-zinc-850 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTipoAgendamento("data_unica")}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border text-center transition-all cursor-pointer ${
                      tipoAgendamento === "data_unica"
                        ? "bg-amber-950/50 border-amber-600 text-amber-200"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Data / Horário Único
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoAgendamento("recorrente")}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border text-center transition-all cursor-pointer ${
                      tipoAgendamento === "recorrente"
                        ? "bg-amber-950/50 border-amber-600 text-amber-200"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Repetir (Recorrente)
                  </button>
                </div>

                {tipoAgendamento === "data_unica" && (
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Quando executar?</label>
                    <input
                      type="text"
                      placeholder="Ex: 14:30, +30m, +2h ou amanhã 09:00"
                      value={dataUnicaValor}
                      onChange={(e) => setDataUnicaValor(e.target.value)}
                      className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 font-mono text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}

                {tipoAgendamento === "recorrente" && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">
                        Frequência de Repetição
                      </label>
                      <select
                        value={recorrenteFrequencia}
                        onChange={(e) => setRecorrenteFrequencia(e.target.value)}
                        className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-200 text-xs focus:outline-none cursor-pointer"
                      >
                        <option value="diario">Diariamente (às 09:00)</option>
                        <option value="horario">A cada 1 hora (60 min)</option>
                        <option value="30m">A cada 30 minutos</option>
                        <option value="15m">A cada 15 minutos</option>
                        <option value="semanal">Semanalmente (Segunda às 09:00)</option>
                        <option value="custom">Expressão Cron Customizada</option>
                      </select>
                    </div>

                    {recorrenteFrequencia === "custom" && (
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1">
                          Expressão Cron (5 campos)
                        </label>
                        <input
                          type="text"
                          placeholder="0 9 * * 1-5"
                          value={cronCustomizado}
                          onChange={(e) => setCronCustomizado(e.target.value)}
                          className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 font-mono text-xs focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Ações do Footer */}
          <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
            <button
              type="button"
              disabled={salvando}
              onClick={aoFechar}
              className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md transition-colors cursor-pointer disabled:opacity-50"
            >
              {salvando && <Loader2 size={13} className="animate-spin" />}
              <span>Criar Tarefa</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
