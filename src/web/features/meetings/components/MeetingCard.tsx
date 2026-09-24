import React, { type FC } from "react";
import { Users, FileText, ArrowRight, MessageSquare, Clock, CheckCircle2 } from "lucide-react";
import type { SalaReuniao } from "../types.js";

export interface MeetingCardProps {
  reuniao: SalaReuniao;
  ativa: boolean;
  aoSelecionar: (r: SalaReuniao) => void;
  aoVerAta?: (r: SalaReuniao) => void;
}

export const MeetingCard: FC<MeetingCardProps> = ({
  reuniao,
  ativa,
  aoSelecionar,
  aoVerAta,
}) => {
  const normStatus = (s: unknown) => String(s || "").replace(/-/g, "_");
  const st = normStatus(reuniao.status);
  const isAoVivo = st === "em_andamento" || st === "agendando";
  const isConcluida = st === "encerrada" || st === "concluida";

  const participantes = Array.isArray(reuniao.participantes)
    ? reuniao.participantes.map((p: any) => (typeof p === "string" ? p : p.id || p.nome))
    : [];

  const totalMensagens = reuniao.mensagens?.length || 0;

  return (
    <div
      onClick={() => aoSelecionar(reuniao)}
      className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 group shadow-xs ${
        ativa
          ? "bg-zinc-850/90 border-purple-500/80 ring-1 ring-purple-500/30"
          : "bg-zinc-900/40 border-zinc-800/90 hover:border-zinc-700 hover:bg-zinc-900/80"
      }`}
    >
      <div>
        {/* Topo: Ícone, Status e Data */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-xl bg-purple-950/60 border border-purple-800/50 flex items-center justify-center text-purple-300 shrink-0 group-hover:bg-purple-900/60 transition-colors">
              <Users size={15} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-xs text-zinc-100 truncate group-hover:text-purple-300 transition-colors">
                {reuniao.pauta || "Deliberação Colegiada"}
              </h3>
              <span className="text-[10px] font-mono text-zinc-500 block truncate mt-0.5">
                ID: {reuniao.id}
              </span>
            </div>
          </div>

          <span
            className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase shrink-0 ${
              isAoVivo
                ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 animate-pulse"
                : isConcluida
                ? "bg-zinc-800 text-zinc-400 border border-zinc-700"
                : "bg-amber-950/80 text-amber-400 border border-amber-800/60"
            }`}
          >
            {isAoVivo ? "Ao Vivo" : isConcluida ? "Concluída" : "Agendada"}
          </span>
        </div>

        {/* Participantes presentes */}
        <div className="mt-3 space-y-1">
          <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider block">
            Membros Presentes ({participantes.length})
          </span>
          <div className="flex flex-wrap gap-1">
            {participantes.map((ag) => (
              <span
                key={ag}
                className="text-[10px] font-mono text-purple-300/90 bg-purple-950/40 px-1.5 py-0.2 rounded border border-purple-800/40"
              >
                @{ag}
              </span>
            ))}
            {participantes.length === 0 && (
              <span className="text-[10px] text-zinc-500 italic">
                Nenhum agente alocado
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Rodapé: Estatísticas & Ações */}
      <div className="pt-2.5 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
        <div className="flex items-center gap-2 text-zinc-500">
          <span className="flex items-center gap-1">
            <MessageSquare size={11} /> {totalMensagens} msgs
          </span>
          {reuniao.turno_atual !== undefined && (
            <span>· Turno {reuniao.turno_atual}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {reuniao.ata && aoVerAta && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                aoVerAta(reuniao);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-[10px] font-medium transition-colors cursor-pointer"
            >
              <FileText size={11} className="text-orange-400" />
              <span>Ver Ata</span>
            </button>
          )}

          <button
            type="button"
            className="flex items-center gap-1 text-[11px] text-purple-400 group-hover:text-purple-300 font-semibold"
          >
            <span>Entrar</span>
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};
