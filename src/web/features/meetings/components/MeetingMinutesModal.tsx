import React, { useState, type FC } from "react";
import {
  FileText,
  X,
  Copy,
  Download,
  Check,
  CheckCircle2,
  Kanban,
  Sparkles,
  Loader2,
} from "lucide-react";
import { showToast } from "../../../shared/ui/Toast.js";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";

export interface MeetingMinutesModalProps {
  aberto: boolean;
  onClose: () => void;
  ata: string | null;
  pauta?: string;
  salaId?: string;
}

export const MeetingMinutesModal: FC<MeetingMinutesModalProps> = ({
  aberto,
  onClose,
  ata,
  pauta,
  salaId,
}) => {
  const { client, tratarErro } = useOpenCorp();
  const [copiado, setCopiado] = useState(false);
  const [gerandoTarefas, setGerandoTarefas] = useState(false);

  if (!aberto || !ata) return null;

  const handleCopiar = () => {
    void navigator.clipboard.writeText(ata);
    setCopiado(true);
    showToast("Ata da reunião copiada para a área de transferência!", "sucesso");
    setTimeout(() => setCopiado(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([ata], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ata-reuniao-${salaId || "deliberacao"}.md`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Download do arquivo Markdown iniciado!", "sucesso");
  };

  const handleConverterEmTarefas = async () => {
    setGerandoTarefas(true);
    try {
      // Extrai possíveis tarefas do texto da ata ou cria tarefa de execução
      const linhas = ata.split("\n");
      const tarefasDetectadas: string[] = [];

      linhas.forEach((l) => {
        const m = /^[-*]\s*\[?\s*\]?\s*(.+)$/.exec(l.trim());
        if (m && m[1] && m[1].length > 5) {
          tarefasDetectadas.push(m[1].trim());
        }
      });

      if (tarefasDetectadas.length > 0) {
        for (const t of tarefasDetectadas.slice(0, 5)) {
          await client.tasks.criar({
            titulo: t,
            descricao: `Gerada automaticamente a partir da Ata da Reunião ${salaId || ""}: "${pauta || ""}"`,
            coluna: "a_fazer",
          });
        }
        showToast(
          `${Math.min(tarefasDetectadas.length, 5)} tarefas criadas no Kanban com sucesso!`,
          "sucesso"
        );
      } else {
        await client.tasks.criar({
          titulo: `Executar deliberações da reunião: ${pauta || salaId}`,
          descricao: `Ata da Reunião:\n\n${ata.slice(0, 500)}...`,
          coluna: "a_fazer",
        });
        showToast("Tarefa consolidada criada no Kanban com sucesso!", "sucesso");
      }
    } catch (err: unknown) {
      tratarErro(err, "Falha ao gerar tarefas no Kanban");
    } finally {
      setGerandoTarefas(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl rounded-2xl bg-zinc-950 border border-zinc-850 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Topo do Modal */}
        <div className="p-4 border-b border-zinc-850 flex items-center justify-between shrink-0 bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-600/10 border border-orange-500/20 text-orange-400">
              <FileText size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100">
                Ata Oficial da Reunião &amp; Deliberações
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5 truncate max-w-md">
                {pauta || salaId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopiar}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 text-xs font-medium transition-colors cursor-pointer"
              title="Copiar Markdown"
            >
              {copiado ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copiado ? "Copiado!" : "Copiar"}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 text-xs font-medium transition-colors cursor-pointer"
              title="Baixar .md"
            >
              <Download size={13} />
              <span>Baixar</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Conteúdo Markdown da Ata */}
        <div className="p-6 overflow-y-auto flex-1 select-text scrollbar-thin bg-zinc-950/80">
          <div className="prose prose-invert prose-xs max-w-none text-zinc-300 leading-relaxed space-y-3 font-sans">
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-850 whitespace-pre-wrap font-mono text-xs text-zinc-200 leading-relaxed">
              {ata}
            </div>
          </div>
        </div>

        {/* Rodapé com Ações Executivas */}
        <div className="p-4 border-t border-zinc-850 bg-zinc-900/50 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-zinc-500 font-mono">
            {salaId ? `Deliberação ID: ${salaId}` : "Conselho Multi-Agente"}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={gerandoTarefas}
              onClick={handleConverterEmTarefas}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer disabled:opacity-50"
            >
              {gerandoTarefas ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Kanban size={13} />
              )}
              <span>Converter em Tarefas no Kanban</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
