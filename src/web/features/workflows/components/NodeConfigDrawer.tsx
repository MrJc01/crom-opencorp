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
  Webhook,
  RefreshCw,
  Hourglass,
} from "lucide-react";
import type { NoGrafo, FluxoCompleto } from "../types.js";
import { obterItemCatalogo } from "../catalog.js";
import { showToast } from "../../../shared/ui/Toast.js";
import { CronBuilder } from "./CronBuilder.js";

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
                <div className="space-y-3 p-3.5 rounded-xl bg-sky-950/20 border border-sky-800/40">
                  <h4 className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock size={13} />
                    Configuração de Agendamento Cron
                  </h4>

                  <CronBuilder
                    value={config.cron || config.expressao || config.expressao_cron || "*/15 * * * *"}
                    onChange={(cron) => {
                      atualizarConfig("cron", cron);
                      atualizarConfig("expressao_cron", cron);
                    }}
                  />

                  {/* Fuso Horário */}
                  <div className="pt-2 border-t border-sky-900/30">
                    <label className="block text-zinc-300 font-medium mb-1 text-xs">
                      Fuso Horário
                    </label>
                    <input
                      type="text"
                      placeholder="America/Sao_Paulo"
                      value={config.timezone || config.fuso || "America/Sao_Paulo"}
                      onChange={(e) => atualizarConfig("timezone", e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-sky-500"
                    />
                    <span className="text-[10px] text-zinc-500 mt-1 block">
                      Referência de fuso horário avaliada pelo scheduler.
                    </span>
                  </div>
                </div>
              )}

              {/* GATILHO WEBHOOK */}
              {noEditado.tipo === "webhook" && (
                <div className="space-y-3 p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/40">
                  <h4 className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Webhook size={13} />
                    Gatilho Webhook (Entrada HTTP)
                  </h4>

                  {/* URL de Disparo */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 text-xs">
                      URL de Disparo do Webhook
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        readOnly
                        value={
                          typeof window !== "undefined" && fluxo?.id
                            ? `${window.location.origin}/flows/${fluxo.id}/webhook`
                            : `/flows/${fluxo?.id || "fluxo"}/webhook`
                        }
                        className="w-full bg-zinc-900/90 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-emerald-400 font-mono text-[11px] select-all focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== "undefined" && fluxo?.id) {
                            const url = `${window.location.origin}/flows/${fluxo.id}/webhook`;
                            navigator.clipboard.writeText(url);
                            showToast("URL do webhook copiada para a área de transferência!", "sucesso");
                          }
                        }}
                        className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer shrink-0"
                        title="Copiar URL do Webhook"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Chave Secreta de Validação */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 text-xs flex items-center justify-between">
                      <span>Chave Secreta / Token de Validação</span>
                      <span className="text-[10px] text-zinc-500 font-mono">opcional</span>
                    </label>
                    <input
                      type="text"
                      placeholder="ex: segredo-super-protegido-123"
                      value={config.secret || config.token || ""}
                      onChange={(e) => {
                        atualizarConfig("secret", e.target.value);
                        atualizarConfig("token", e.target.value);
                      }}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-[10px] text-zinc-500 mt-1 block">
                      Valida o cabeçalho <code>x-webhook-secret</code> ou parâmetro <code>?token=</code>.
                    </span>
                  </div>

                  {/* Método HTTP Permitido */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 text-xs">
                      Método HTTP Permitido
                    </label>
                    <select
                      value={config.metodo || "POST"}
                      onChange={(e) => atualizarConfig("metodo", e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-amber-500"
                    >
                      <option value="POST">POST (Padrão — aceita JSON)</option>
                      <option value="GET">GET (Query Parameters)</option>
                      <option value="ANY">ANY (Qualquer Método)</option>
                    </select>
                  </div>

                  {/* URL Destino opcional */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 text-xs flex items-center justify-between">
                      <span>URL Destino (para webhook reverso/saída)</span>
                      <span className="text-[10px] text-zinc-500 font-mono">opcional</span>
                    </label>
                    <input
                      type="text"
                      placeholder="ex: https://api.exemplo.com/webhook-callback"
                      value={config.url || ""}
                      onChange={(e) => atualizarConfig("url", e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Box Explicativo */}
                  <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-300/90 leading-relaxed">
                    💡 O corpo da requisição JSON recebida é injetado diretamente no fluxo como contexto inicial e fica acessível na variável <code>$OPENCORP_INPUT</code> e <code>{`{{entrada}}`}</code> para os nós seguintes.
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

              {/* CONTROLE DE LOOP / ITERAÇÃO */}
              {noEditado.tipo === "loop" && (
                <div className="space-y-3 p-3.5 rounded-xl bg-orange-950/20 border border-orange-800/40">
                  <h4 className="text-[11px] font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                    <RefreshCw size={13} />
                    Controle de Loop &amp; Iterador (Ciclo)
                  </h4>

                  {/* Teto Máximo de Segurança */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 text-xs flex items-center justify-between">
                      <span>Teto Máximo de Iterações (Segurança) *</span>
                      <span className="text-[10px] text-orange-400 font-mono">1 a 50 voltas</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={config.max_iteracoes ?? 3}
                      onChange={(e) =>
                        atualizarConfig(
                          "max_iteracoes",
                          Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), 50)
                        )
                      }
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-orange-500"
                    />
                    <span className="text-[10px] text-zinc-500 mt-1 block">
                      Proteção essencial contra loops infinitos de agentes e consumo descontrolado de tokens.
                    </span>
                  </div>

                  {/* Condição de Parada */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 text-xs">
                      Condição de Parada (Texto ou Expressão)
                    </label>
                    <input
                      type="text"
                      placeholder="ex: SUCESSO ou CONCLUIDO ou resultado.aprovado === true"
                      value={config.condicao_parada || ""}
                      onChange={(e) => atualizarConfig("condicao_parada", e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-orange-500"
                    />
                    <span className="text-[10px] text-zinc-500 mt-1 block">
                      O ciclo é encerrado se o contexto contiver este texto ou satisfizer a condição.
                    </span>
                  </div>

                  {/* Nó de Retorno */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 text-xs">
                      Nó de Retorno do Loop (Próxima Volta)
                    </label>
                    <select
                      value={config.retornar_para || ""}
                      onChange={(e) => atualizarConfig("retornar_para", e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500 font-mono"
                    >
                      <option value="">Selecione o nó para onde retornar...</option>
                      {(fluxo?.nos || [])
                        .filter((n) => n.id !== noEditado.id)
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.id} ({n.tipo})
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Nó de Saída Final */}
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 text-xs">
                      Nó de Saída Final (Após o Encerramento do Loop)
                    </label>
                    <select
                      value={config.saida_final || ""}
                      onChange={(e) => atualizarConfig("saida_final", e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500 font-mono"
                    >
                      <option value="">Selecione o nó para saída...</option>
                      {(fluxo?.nos || [])
                        .filter((n) => n.id !== noEditado.id)
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.id} ({n.tipo})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              {/* PAUSA / DELAY */}
              {noEditado.tipo === "delay" && (
                <div className="space-y-3 p-3.5 rounded-xl bg-yellow-950/20 border border-yellow-800/40">
                  <h4 className="text-[11px] font-bold text-yellow-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Hourglass size={13} />
                    Pausa Programada (Delay)
                  </h4>
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1 text-xs flex items-center justify-between">
                      <span>Tempo de Espera (segundos) *</span>
                      <span className="text-[10px] text-yellow-400 font-mono">
                        {config.segundos ?? 30}s
                        {Number(config.segundos ?? 30) >= 60 &&
                          ` (${(Number(config.segundos ?? 30) / 60).toFixed(1)} min)`}
                      </span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={3600}
                      value={config.segundos ?? 30}
                      onChange={(e) =>
                        atualizarConfig(
                          "segundos",
                          Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), 3600)
                        )
                      }
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-yellow-500"
                    />
                    <span className="text-[10px] text-zinc-500 mt-1 block">
                      Aguarda o tempo especificado de forma não-bloqueante antes de propagar o contexto para o próximo nó.
                    </span>
                  </div>

                  {/* Presets Rápidos de Pausa */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { label: "10 seg", seg: 10 },
                      { label: "30 seg", seg: 30 },
                      { label: "1 min", seg: 60 },
                      { label: "2 min", seg: 120 },
                      { label: "5 min", seg: 300 },
                    ].map((p) => (
                      <button
                        key={p.seg}
                        type="button"
                        onClick={() => atualizarConfig("segundos", p.seg)}
                        className={`px-2 py-1 rounded text-[10px] font-mono border transition-colors cursor-pointer ${
                          (config.segundos ?? 30) === p.seg
                            ? "bg-yellow-950 border-yellow-500 text-yellow-300 font-bold"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
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
