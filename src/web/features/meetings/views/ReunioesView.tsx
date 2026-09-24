import React, { useState, type FC } from "react";
import { MessagesSquare, Users, Sparkles, CheckCircle2, Clock, Plus, FileText } from "lucide-react";
import { showToast } from "../../../shared/ui/Toast.js";

interface ReuniaoItem {
  id: string;
  titulo: string;
  participantes: string[];
  ataResumo: string;
  data: string;
  consenso: boolean;
}

const REUNIOES_MOCK: ReuniaoItem[] = [
  {
    id: "reu-01",
    titulo: "Deliberação Arquitetural: Migração para React 19 + Assistant-UI",
    participantes: ["secretario", "arquiteto", "dev-frontend", "qa"],
    ataResumo:
      "Aprovado por unanimidade o padrão Trampolim (Strangler Fig). Backend e suíte de testes mantidos 100% verdes sem quebra de contratos.",
    data: "Hoje, 05:30",
    consenso: true,
  },
  {
    id: "reu-02",
    titulo: "Alinhamento de Governança e Dimensionamento de Inferência xB",
    participantes: ["secretario", "financas", "operacoes"],
    ataResumo:
      "Fixado uso de modelos < 14B para triagem, 14B-35B para redação e > 70B exclusivamente para o Secretário e diagnósticos forenses.",
    data: "Ontem, 16:45",
    consenso: true,
  },
];

export const ReunioesView: FC = () => {
  const [reunioes] = useState<ReuniaoItem[]>(REUNIOES_MOCK);

  return (
    <div className="flex flex-col h-full w-full p-6 md:p-8 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <MessagesSquare className="text-emerald-400" size={20} />
            Comitê de Reuniões & Deliberações Autônomas
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Reuniões multi-agente para alinhamento estratégico, atas consolidadas e votações de consenso.
          </p>
        </div>

        <button
          type="button"
          onClick={() => showToast("Convocação de reunião multi-agente enviada ao Secretário", "sucesso")}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer self-start md:self-auto"
        >
          <Plus size={14} />
          <span>Convocar Reunião</span>
        </button>
      </div>

      {/* Lista de Atas de Reunião */}
      <div className="space-y-4 max-w-4xl">
        {reunioes.map((item) => (
          <div
            key={item.id}
            className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-850 hover:border-zinc-750 transition-all space-y-3.5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[11px] font-mono text-zinc-500 flex items-center gap-1">
                  <Clock size={11} />
                  {item.data}
                </span>
                <h3 className="text-sm font-semibold text-zinc-100">{item.titulo}</h3>
              </div>

              <span className="flex items-center gap-1 text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-300">
                <CheckCircle2 size={11} />
                Consenso Atingido
              </span>
            </div>

            {/* Participantes */}
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Users size={13} className="text-zinc-500" />
              <span className="text-zinc-500">Participantes:</span>
              <div className="flex flex-wrap gap-1">
                {item.participantes.map((p) => (
                  <span
                    key={p}
                    className="px-2 py-0.5 rounded-md bg-zinc-850 text-zinc-300 font-mono text-[10px]"
                  >
                    @{p}
                  </span>
                ))}
              </div>
            </div>

            {/* Ata Consolidada */}
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-850 text-xs text-zinc-300 leading-relaxed font-sans">
              <span className="font-semibold text-zinc-400 block mb-1 flex items-center gap-1.5">
                <FileText size={12} className="text-emerald-400" />
                Ata e Decisão Executiva:
              </span>
              {item.ataResumo}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
