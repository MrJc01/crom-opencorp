import React, { useState, type FC } from "react";
import { Plus, Play, X, Send, Sparkles, Workflow, Bot } from "lucide-react";
import type { FluxoCompleto } from "../types.js";

export interface ModalNovoWorkflowProps {
  aberto: boolean;
  salvando: boolean;
  onClose: () => void;
  onCriarFluxo: (dados: {
    id: string;
    nome: string;
    descricao: string;
    template: "pipeline" | "fanout" | "review" | "debate";
  }) => Promise<void>;
}

export const ModalNovoWorkflow: FC<ModalNovoWorkflowProps> = ({
  aberto,
  salvando,
  onClose,
  onCriarFluxo,
}) => {
  const [nome, setNome] = useState("");
  const [id, setId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [template, setTemplate] = useState<"pipeline" | "fanout" | "review" | "debate">("pipeline");

  if (!aberto) return null;

  const fechar = () => {
    setNome("");
    setId("");
    setDescricao("");
    setTemplate("pipeline");
    onClose();
  };

  const handleNomeChange = (val: string) => {
    setNome(val);
    if (!id) {
      const slug = val
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setId(slug);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalId = id.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const finalNome = nome.trim();
    if (!finalId || !finalNome) return;

    await onCriarFluxo({
      id: finalId,
      nome: finalNome,
      descricao: descricao.trim(),
      template,
    });
    fechar();
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
      onClick={fechar}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400">
              <Plus size={16} />
            </div>
            <h3 className="text-sm font-bold text-zinc-100">Criar Novo Fluxo DAG</h3>
          </div>
          <button
            type="button"
            onClick={fechar}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-zinc-300 font-medium mb-1">
              Nome do Fluxo *
            </label>
            <input
              type="text"
              placeholder="ex: Produção de Conteúdo YouTube"
              value={nome}
              onChange={(e) => handleNomeChange(e.target.value)}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">
              ID do Fluxo (kebab-case) *
            </label>
            <input
              type="text"
              placeholder="ex: yt-producao-conteudo"
              value={id}
              onChange={(e) => setId(e.target.value)}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">
              Descrição (opcional)
            </label>
            <textarea
              rows={2}
              placeholder="Descreva a finalidade e o objetivo desta esteira..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-orange-500 transition-colors resize-none"
            />
          </div>

          {/* Templates Iniciais */}
          <div>
            <label className="block text-zinc-300 font-medium mb-1.5">
              Template Inicial de Nós
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "pipeline", label: "Pipeline Sequencial", desc: "Trigger ➔ Agente ➔ Saída" },
                { id: "fanout", label: "Fan-Out Paralelo", desc: "Múltiplos agentes paralelos" },
                { id: "review", label: "Review com Supervisor", desc: "Pipeline autor-revisor" },
                { id: "debate", label: "Debate Dialético", desc: "Deliberação e síntese" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplate(t.id as any)}
                  className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    template === t.id
                      ? "bg-orange-600/15 border-orange-500/50 text-white"
                      : "bg-zinc-950 border-zinc-850 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  <div className="font-semibold text-[11px]">{t.label}</div>
                  <div className="text-[10px] text-zinc-500 truncate mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={fechar}
              className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || !nome.trim() || !id.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs shadow-md shadow-orange-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles size={13} />
              <span>{salvando ? "Criando..." : "Criar no Studio"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export interface ModalExecutarWorkflowProps {
  aberto: boolean;
  fluxo: FluxoCompleto | null;
  executando: boolean;
  onClose: () => void;
  onConfirmar: (payloadJson?: any) => Promise<void>;
}

export const ModalExecutarWorkflow: FC<ModalExecutarWorkflowProps> = ({
  aberto,
  fluxo,
  executando,
  onClose,
  onConfirmar,
}) => {
  const [payloadText, setPayloadText] = useState("");
  const [erroSintaxe, setErroSintaxe] = useState<string | null>(null);

  if (!aberto || !fluxo) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsedPayload: any = undefined;
    if (payloadText.trim()) {
      try {
        parsedPayload = JSON.parse(payloadText);
      } catch (err: any) {
        setErroSintaxe(`JSON inválido: ${err.message}`);
        return;
      }
    }
    setErroSintaxe(null);
    await onConfirmar(parsedPayload);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Play size={15} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100">Disparar Execução</h3>
              <p className="text-[10px] text-zinc-400 font-mono">{fluxo.id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-zinc-300 font-medium mb-1">
              Payload / Contexto Inicial (JSON opcional)
            </label>
            <textarea
              rows={5}
              placeholder='{ "origem": "manual", "param": "valor" }'
              value={payloadText}
              onChange={(e) => {
                setPayloadText(e.target.value);
                setErroSintaxe(null);
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 font-mono text-[11px] text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
            />
            {erroSintaxe && (
              <p className="text-rose-400 text-[11px] font-mono mt-1">{erroSintaxe}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={executando}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Send size={13} />
              <span>{executando ? "Executando..." : "Disparar Agora"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
