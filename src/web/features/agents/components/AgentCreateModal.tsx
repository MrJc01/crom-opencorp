import React, { useState, type FC } from "react";
import { type AgentResumo } from "@opencorp/sdk";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { showToast } from "../../../shared/ui/Toast.js";
import { MODELOS_DISPONIVEIS } from "../constants.js";
import { X, Sparkles, Sliders, Copy, Plus, Wand2, Loader2 } from "lucide-react";
import { ModelPicker } from "../../../shared/ui/ModelPicker.js";

export interface AgentCreateModalProps {
  aberto: boolean;
  agentesExistentes: AgentResumo[];
  aoFechar: () => void;
  aoCriar: (novoAgente: Partial<AgentResumo> & { id: string }) => Promise<void>;
}

export const AgentCreateModal: FC<AgentCreateModalProps> = ({
  aberto,
  agentesExistentes,
  aoFechar,
  aoCriar,
}) => {
  const { client, tratarErro } = useOpenCorp();
  const [abaAtiva, setAbaAtiva] = useState<"ia" | "manual" | "clonar">("ia");

  // Campos em comum
  const [id, setId] = useState("");
  const [role, setRole] = useState("");
  const [model, setModel] = useState(MODELOS_DISPONIVEIS[0]?.id || "");
  const [permissions, setPermissions] = useState<"level-1" | "level-2" | "level-3">("level-2");
  const [prompt, setPrompt] = useState("");

  // Modo IA
  const [iaDescricao, setIaDescricao] = useState("");
  const [gerandoIA, setGerandoIA] = useState(false);

  // Modo Clonar
  const [clonarOrigem, setClonarOrigem] = useState("");

  const [salvando, setSalvando] = useState(false);

  if (!aberto) return null;

  const handleGerarComIA = async () => {
    if (!iaDescricao.trim()) {
      showToast("Descreva o objetivo do agente para a IA", "aviso");
      return;
    }

    setGerandoIA(true);
    try {
      const res = await client.agents.gerarPrompt({
        descricao: iaDescricao.trim(),
        modelo: model,
      } as any);

      if (res && res.prompt) {
        setPrompt(res.prompt);
        if (!role) {
          setRole(iaDescricao.slice(0, 60));
        }
        if (!id) {
          const slug = iaDescricao
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 20);
          setId(slug || "novo-agente");
        }
        showToast("System Prompt gerado com sucesso pela IA!", "sucesso");
      }
    } catch (err) {
      tratarErro(err, "Falha ao gerar prompt com IA");
    } finally {
      setGerandoIA(false);
    }
  };

  const handleClonarChange = (origemId: string) => {
    setClonarOrigem(origemId);
    const ag = agentesExistentes.find((a) => a.id === origemId);
    if (ag) {
      setRole(ag.role || ag.descricao || "");
      setModel(ag.modelo || ag.model || MODELOS_DISPONIVEIS[0]?.id || "");
      setPermissions(ag.permissions || "level-2");
      setPrompt(ag.system_prompt || ag.corpo_prompt || ag.corpo || "");
      if (!id) {
        setId(`${origemId}-clone`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim()) {
      showToast("ID do agente é obrigatório", "aviso");
      return;
    }

    setSalvando(true);
    try {
      await aoCriar({
        id: id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
        role: role.trim() || undefined,
        model,
        permissions,
        corpo_prompt: prompt.trim() || undefined,
        ativo: true,
      });

      // Limpa estado
      setId("");
      setRole("");
      setPrompt("");
      setIaDescricao("");
      setClonarOrigem("");
      aoFechar();
    } catch (err) {
      tratarErro(err, "Falha ao criar agente");
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
        className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do Modal */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Plus size={16} className="text-emerald-400" />
            <span>Criar Novo Agente Autônomo</span>
          </h2>
          <button
            type="button"
            onClick={aoFechar}
            className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Abas de Criação: IA, Manual, Clonar */}
        <div className="flex rounded-xl bg-zinc-950 p-1 border border-zinc-850">
          <button
            type="button"
            onClick={() => setAbaAtiva("ia")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              abaAtiva === "ia"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sparkles size={13} />
            <span>Gerar com IA</span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva("manual")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              abaAtiva === "manual"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Sliders size={13} />
            <span>Manual (Do Zero)</span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva("clonar")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              abaAtiva === "clonar"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Copy size={13} />
            <span>Clonar Existente</span>
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Seção IA */}
          {abaAtiva === "ia" && (
            <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-800/40 space-y-2.5">
              <label className="block text-zinc-200 font-semibold flex items-center gap-1.5">
                <Wand2 size={13} className="text-emerald-400" />
                <span>O que este agente deve fazer?</span>
              </label>
              <textarea
                rows={3}
                value={iaDescricao}
                onChange={(e) => setIaDescricao(e.target.value)}
                placeholder="Ex: Auditor de segurança cibernética com foco em validação de inputs e sanitização de dados no backend..."
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 leading-relaxed resize-none"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={gerandoIA || !iaDescricao.trim()}
                  onClick={handleGerarComIA}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {gerandoIA ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  <span>Sintetizar com IA</span>
                </button>
              </div>
            </div>
          )}

          {/* Seção Clonar */}
          {abaAtiva === "clonar" && (
            <div>
              <label className="block text-zinc-300 font-medium mb-1">
                Agente Base para Clonagem
              </label>
              <select
                value={clonarOrigem}
                onChange={(e) => handleClonarChange(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="">Selecione um agente existente...</option>
                {agentesExistentes.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    @{ag.id} ({ag.role || ag.descricao || "Sem cargo"})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Campos Principais */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-300 font-medium mb-1">
                Identificador Único (slug) *
              </label>
              <input
                type="text"
                required
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="ex: redator-tecnico"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-zinc-300 font-medium mb-1">
                Nível de Permissão
              </label>
              <select
                value={permissions}
                onChange={(e) => setPermissions(e.target.value as any)}
                className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="level-1">Level 1 (Leitura)</option>
                <option value="level-2">Level 2 (Padrão)</option>
                <option value="level-3">Level 3 (Autônomo)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Papel / Especialidade (Role)</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Ex: Engenheiro de Prompt e Documentação"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Modelo de Inferência</label>
            <ModelPicker value={model} onChange={setModel} />
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">
              Prompt do Sistema (System Prompt)
            </label>
            <textarea
              rows={6}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="# System Prompt: Instruções estruturadas..."
              className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 font-mono text-xs leading-relaxed focus:outline-none focus:border-emerald-500 resize-y"
            />
          </div>

          {/* Footer */}
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
              <span>Criar Agente</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
