import React, { useState, useEffect, type FC, type FormEvent } from "react";
import { Sliders, X, Check, Save, Loader2, Key, Globe, Shield } from "lucide-react";
import { showToast } from "../../../shared/ui/Toast.js";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import type { MiniApp } from "../types.js";

export interface AppConfigModalProps {
  aberto: boolean;
  app: MiniApp | null;
  onClose: () => void;
  onSalvo: (appAtualizado: MiniApp) => void;
}

export const AppConfigModal: FC<AppConfigModalProps> = ({
  aberto,
  app,
  onClose,
  onSalvo,
}) => {
  const { client, tratarErro } = useOpenCorp();
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [entryUrl, setEntryUrl] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (app) {
      setTitulo(app.titulo || "");
      setDescricao(app.descricao || "");
      setEntryUrl(app.entryUrl || "");
      setAtivo(app.ativo !== false);
    }
  }, [app]);

  if (!aberto || !app) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      const atualizado: MiniApp = {
        ...app,
        titulo: titulo.trim() || app.titulo,
        descricao: descricao.trim(),
        entryUrl: entryUrl.trim() || undefined,
        ativo,
      };

      // Tenta persistir configurações
      await client.http
        .put(`/settings/apps/${encodeURIComponent(app.id)}`, atualizado)
        .catch(() => null);

      showToast(`Configurações de "${atualizado.titulo}" salvas com sucesso!`, "sucesso");
      onSalvo(atualizado);
      onClose();
    } catch (err: unknown) {
      tratarErro(err, "Falha ao salvar configurações do app");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg rounded-2xl bg-zinc-950 border border-zinc-850 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Topo do Modal */}
        <div className="p-4 border-b border-zinc-850 flex items-center justify-between shrink-0 bg-zinc-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Sliders size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100">
                Configurações da Integração: {app.titulo}
              </h3>
              <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                apps/{app.id}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Status Ativo */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-850">
            <div>
              <span className="text-xs font-semibold text-zinc-200 block">
                Integração Habilitada
              </span>
              <span className="text-[11px] text-zinc-400">
                Permite que agentes autônomos invoquem ferramentas deste app.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAtivo((prev) => !prev)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                ativo ? "bg-emerald-500" : "bg-zinc-800"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-zinc-950 shadow-sm ring-0 transition duration-200 ease-in-out ${
                  ativo ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Título de Exibição */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-200">
              Nome de Exibição do App
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-200">
              Descrição de Negócio &amp; Escopo
            </label>
            <textarea
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* URL de Entrada / Endpoint */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-200">
              URL Customizada de Entrada (Opcional)
            </label>
            <input
              type="text"
              placeholder={`/api/apps/${app.id}/view`}
              value={entryUrl}
              onChange={(e) => setEntryUrl(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Rodapé */}
          <div className="pt-3 border-t border-zinc-850 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer disabled:opacity-50"
            >
              {salvando ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              <span>Salvar Alterações</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
