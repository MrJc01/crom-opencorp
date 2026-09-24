import React, { useState, useEffect, useMemo, type FC } from "react";
import {
  X,
  Trash2,
  Check,
  Code,
  Sliders,
  Cpu,
  Clock,
  Terminal,
  Layers,
  HelpCircle,
  Copy,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import type { NoGrafo, FluxoCompleto } from "../types.js";
import { obterItemCatalogo } from "../catalog.js";
import { showToast } from "../../../shared/ui/Toast.js";

export interface NodeConfigDrawerProps {
  no: NoGrafo | null;
  fluxo: FluxoCompleto | null;
  agentes: any[];
  fluxosExistentes: FluxoCompleto[];
  onClose: () => void;
  onSalvarNo: (noAtualizado: NoGrafo) => void;
  onExcluirNo: (noId: string) => void;
}

export const NodeConfigDrawer: FC<NodeConfigDrawerProps> = ({
  no,
  fluxo,
  agentes,
  fluxosExistentes,
  onClose,
  onSalvarNo,
  onExcluirNo,
}) => {
  const [modo, setModo] = useState<"form" | "json">("form");
  const [noEditado, setNoEditado] = useState<NoGrafo | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [jsonErro, setJsonErro] = useState<string | null>(null);

  // Sincroniza estado quando o nó selecionado muda
  useEffect(() => {
    if (no) {
      setNoEditado(JSON.parse(JSON.stringify(no)));
      setJsonText(JSON.stringify(no, null, 2));
      setJsonErro(null);
    } else {
      setNoEditado(null);
    }
  }, [no]);

  // Lista de antecessores para o session_from
  const antecessores = useMemo(() => {
    if (!fluxo || !no) return [];
    return (fluxo.arestas || [])
      .filter((a) => a.para === no.id)
      .map((a) => a.de);
  }, [fluxo, no]);

  if (!no || !noEditado) return null;

  const catalogo = obterItemCatalogo(noEditado.tipo);
  const Icone = catalogo.icone;
  const config = noEditado.config || {};

  const atualizarConfig = (campo: string, valor: any) => {
    const novoNo = {
      ...noEditado,
      config: {
        ...(noEditado.config || {}),
        [campo]: valor,
      },
    };
    setNoEditado(novoNo);
    setJsonText(JSON.stringify(novoNo, null, 2));
  };

  const atualizarCampoRaiz = (campo: keyof NoGrafo, valor: any) => {
    const novoNo = {
      ...noEditado,
      [campo]: valor,
    };
    setNoEditado(novoNo);
    setJsonText(JSON.stringify(novoNo, null, 2));
  };

  const handleSalvar = () => {
    if (modo === "json") {
      try {
        const parsed = JSON.parse(jsonText);
        if (!parsed.id || !parsed.tipo) {
          setJsonErro("O nó precisa conter os campos obrigatórios 'id' e 'tipo'.");
          return;
        }
        onSalvarNo(parsed);
        showToast(`Nó "${parsed.id}" atualizado com sucesso!`, "sucesso");
      } catch (err: any) {
        setJsonErro(`Erro de sintaxe JSON: ${err.message}`);
        return;
      }
    } else {
      onSalvarNo(noEditado);
      showToast(`Nó "${noEditado.id}" atualizado com sucesso!`, "sucesso");
    }
  };

  return (
    <aside className="absolute top-0 right-0 bottom-0 w-full sm:w-[420px] md:w-[440px] max-w-full z-40 bg-zinc-950/95 backdrop-blur-md border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-150">
        {/* Topo da Gaveta */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-2 rounded-lg border ${catalogo.bg} ${catalogo.borderCor} ${catalogo.cor} shrink-0`}>
              <Icone size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-zinc-100 font-mono truncate">
                {noEditado.id}
              </h3>
              <p className="text-[10px] text-zinc-400 font-mono">
                Tipo: <span className="text-orange-400 uppercase font-bold">{noEditado.tipo}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Alternador Form vs JSON */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs font-mono">
              <button
                type="button"
                onClick={() => setModo("form")}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 ${
                  modo === "form" ? "bg-zinc-800 text-white font-bold shadow-xs" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Sliders size={12} />
                <span>Form</span>
              </button>
              <button
                type="button"
                onClick={() => setModo("json")}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 ${
                  modo === "json" ? "bg-zinc-800 text-white font-bold shadow-xs" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Code size={12} />
                <span>JSON</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 transition-colors cursor-pointer"
              title="Fechar Gaveta"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin text-xs">
          {modo === "json" ? (
            /* Modo RAW JSON */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-zinc-300 font-semibold flex items-center gap-1.5">
                  <Code size={14} className="text-orange-400" />
                  Estrutura JSON do Nó
                </label>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(jsonText);
                    showToast("JSON copiado para a área de transferência", "info");
                  }}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  <Copy size={12} />
                  <span>Copiar</span>
                </button>
              </div>

              {jsonErro && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs font-mono">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{jsonErro}</span>
                </div>
              )}

              <textarea
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  setJsonErro(null);
                }}
                rows={18}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-[11px] text-zinc-200 focus:outline-none focus:border-orange-500 leading-relaxed scrollbar-thin resize-none"
                spellCheck={false}
              />
            </div>
          ) : (
            /* Modo Formulário Tipado */
            <div className="space-y-4">
              {/* Identificação Geral */}
              <div className="space-y-3 p-3 rounded-xl bg-zinc-900/40 border border-zinc-850">
                <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Identificação do Nó
                </h4>
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    ID do Nó (kebab-case)
                  </label>
                  <input
                    type="text"
                    value={noEditado.id}
                    onChange={(e) =>
                      atualizarCampoRaiz(
                        "id",
                        e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-")
                      )
                    }
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>

                {/* Barreira de Junção Join */}
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">
                    Barreira de Junção (Join)
                  </label>
                  <select
                    value={noEditado.join || "all"}
                    onChange={(e) =>
                      atualizarCampoRaiz("join", e.target.value as "all" | "any")
                    }
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-orange-500"
                  >
                    <option value="all">all — Aguardar todas as entradas antes de disparar</option>
                    <option value="any">any — Executar imediatamente a cada entrada</option>
                  </select>
                </div>
              </div>

              {/* Campos Contextuais por Tipo */}
              {/* GATILHO CRON */}
              {noEditado.tipo === "cron" && (
                <div className="space-y-3 p-3 rounded-xl bg-sky-950/20 border border-sky-800/40">
                  <h4 className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock size={13} />
                    Configuração de Agendamento Cron
                  </h4>
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Expressão Cron (5 ou 6 campos)
                    </label>
                    <input
                      type="text"
                      placeholder="ex: 0 */3 * * * ou */15 * * * *"
                      value={config.cron || config.expressao || ""}
                      onChange={(e) => atualizarConfig("cron", e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sky-300 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  {/* Presets Rápidos */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { label: "A cada 15 min", cron: "*/15 * * * *" },
                      { label: "A cada hora", cron: "0 * * * *" },
                      { label: "A cada 3 horas", cron: "0 */3 * * *" },
                      { label: "Todo dia às 09:00", cron: "0 9 * * *" },
                    ].map((p) => (
                      <button
                        key={p.cron}
                        type="button"
                        onClick={() => atualizarConfig("cron", p.cron)}
                        className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-mono text-zinc-300 cursor-pointer"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* AGENTE IA */}
              {(noEditado.tipo === "agente" ||
                noEditado.tipo === "fanout" ||
                noEditado.tipo === "review" ||
                noEditado.tipo === "debate") && (
                <div className="space-y-3 p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/40">
                  <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu size={13} />
                    Configuração do Agente IA
                  </h4>

                  {/* Seleção do Agente */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Agente Especializado
                    </label>
                    <select
                      value={config.agente || config.agent || ""}
                      onChange={(e) => atualizarConfig("agente", e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Selecione um agente...</option>
                      {agentes.map((ag) => (
                        <option key={ag.id} value={ag.id}>
                          {ag.nome || ag.id} (@{ag.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Modelo */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Modelo LLM
                    </label>
                    <input
                      type="text"
                      placeholder="ex: nvidia/nemotron-3-super-120b ou gemini-2.5-pro"
                      value={config.modelo || config.model || "nemotron-3-super-120b"}
                      onChange={(e) => atualizarConfig("modelo", e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono text-[11px] focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Ordem / Prompt */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Instrução / Ordem da Tarefa
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Descreva detalhadamente o objetivo e contexto que o agente deve executar..."
                      value={config.ordem || config.prompt || config.instrucao || ""}
                      onChange={(e) => atualizarConfig("ordem", e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
                    />
                  </div>

                  {/* Herança de Sessão (session_from) */}
                  {antecessores.length > 0 && (
                    <div>
                      <label className="block text-zinc-300 font-medium mb-1">
                        Herdar Sessão do Nó Antecessor (session_from)
                      </label>
                      <select
                        value={config.session_from || ""}
                        onChange={(e) =>
                          atualizarConfig("session_from", e.target.value || undefined)
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Nova sessão independente</option>
                        {antecessores.map((antId) => (
                          <option key={antId} value={antId}>
                            Herdar de: {antId}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* LÓGICA / CONDIÇÃO / DECISÃO */}
              {(noEditado.tipo === "condicao" || noEditado.tipo === "decisao") && (
                <div className="space-y-3 p-3 rounded-xl bg-amber-950/20 border border-amber-800/40">
                  <h4 className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <HelpCircle size={13} />
                    Regra Condicional (Se-Então)
                  </h4>
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Expressão Booleana
                    </label>
                    <input
                      type="text"
                      placeholder="ex: ctx.total > 0 ou ctx.status === 'aprovado'"
                      value={config.expressao || config.condicao || ""}
                      onChange={(e) => atualizarConfig("expressao", e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-amber-300 font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Se a expressão for verdadeira, o fluxo seguirá pela saída verde <span className="text-emerald-400 font-bold">então</span>; senão, pela saída vermelha <span className="text-rose-400 font-bold">senão</span>.
                  </p>
                </div>
              )}

              {/* SCRIPT / INTEGRAÇÃO */}
              {noEditado.tipo === "script" && (
                <div className="space-y-3 p-3 rounded-xl bg-cyan-950/20 border border-cyan-800/40">
                  <h4 className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal size={13} />
                    Execução de Script Local
                  </h4>
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Runtime
                    </label>
                    <select
                      value={config.runtime || "python"}
                      onChange={(e) => atualizarConfig("runtime", e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="python">Python (python3)</option>
                      <option value="bash">Bash / Shell (/bin/bash)</option>
                      <option value="node">Node.js (node)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Comando ou Caminho do Script
                    </label>
                    <input
                      type="text"
                      placeholder="ex: scripts/analisar_pautas.py ou curl -s ..."
                      value={config.comando || config.script || ""}
                      onChange={(e) => atualizarConfig("comando", e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-cyan-300 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Timeout (ms)
                    </label>
                    <input
                      type="number"
                      value={config.timeout_ms || 30000}
                      onChange={(e) =>
                        atualizarConfig("timeout_ms", parseInt(e.target.value, 10) || 30000)
                      }
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              )}

              {/* CRIAR TAREFA KANBAN */}
              {noEditado.tipo === "task_create" && (
                <div className="space-y-3 p-3 rounded-xl bg-blue-950/20 border border-blue-800/40">
                  <h4 className="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers size={13} />
                    Criação de Tarefa no Kanban
                  </h4>
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Título da Tarefa
                    </label>
                    <input
                      type="text"
                      placeholder="ex: Revisar Roteiro do Vídeo"
                      value={config.titulo || ""}
                      onChange={(e) => atualizarConfig("titulo", e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-zinc-300 font-medium mb-1">
                        Coluna
                      </label>
                      <select
                        value={config.coluna || "backlog"}
                        onChange={(e) => atualizarConfig("coluna", e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="backlog">Backlog</option>
                        <option value="todo">A Fazer</option>
                        <option value="in_progress">Em Andamento</option>
                        <option value="done">Concluído</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-zinc-300 font-medium mb-1">
                        Prioridade
                      </label>
                      <select
                        value={config.prioridade || "media"}
                        onChange={(e) => atualizarConfig("prioridade", e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="baixa">Baixa</option>
                        <option value="media">Média</option>
                        <option value="alta">Alta</option>
                        <option value="urgente">Urgente</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBFLOW */}
              {noEditado.tipo === "subflow" && (
                <div className="space-y-3 p-3 rounded-xl bg-purple-950/20 border border-purple-800/40">
                  <h4 className="text-[11px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={13} />
                    Invocação de Sub-Fluxo
                  </h4>
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Fluxo a Invocar
                    </label>
                    <select
                      value={config.flow || config.fluxo_id || ""}
                      onChange={(e) => atualizarConfig("flow", e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-purple-500"
                    >
                      <option value="">Selecione um fluxo...</option>
                      {fluxosExistentes
                        .filter((f) => f.id !== fluxo?.id)
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.nome || f.id} ({f.id})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé com Ações */}
        <div className="p-4 border-t border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-900/60">
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Deseja realmente remover o nó "${noEditado.id}"?`)) {
                onExcluirNo(noEditado.id);
                onClose();
              }
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/60 text-xs transition-colors cursor-pointer"
          >
            <Trash2 size={13} />
            <span>Excluir Nó</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSalvar}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs shadow-md transition-colors cursor-pointer"
            >
              <Check size={14} />
              <span>Salvar Alterações</span>
            </button>
          </div>
        </div>
      </aside>
  );
};
