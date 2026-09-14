import { type Component, createSignal, createMemo, For, Show } from "solid-js";
import {
  X,
  Trash2,
  GitBranch,
  Terminal,
} from "lucide-solid";
import { IconButton } from "../../ui/IconButton";
import { Button } from "../../ui/Button";
import { showToast } from "../../ui/Toast";
import { fetchApi } from "../../lib/context";
import { type NoGrafo, type FluxoCompleto } from "./types";
import { iconeDoNo } from "./GraphCanvas";

export interface NodeConfigDrawerProps {
  no: () => NoGrafo | null;
  fluxo: () => FluxoCompleto | null;
  agentes: () => any[];
  tasksExistentes: () => any[];
  fluxosExistentes: () => any[];
  componentes: () => any[];
  modoNdv: () => "form" | "json";
  setModoNdv: (m: "form" | "json") => void;
  onClose: () => void;
  onAtualizarConfigNo: (campo: string, valor: any) => void;
  onExcluirNode: (noId: string) => void;
  onIniciarConexao: (origemId: string) => void;
  onCriarConexao: (origemId: string, destinoId: string) => void;
  onRemoverAresta: (de: string, para: string) => void;
}

export const NodeConfigDrawer: Component<NodeConfigDrawerProps> = (props) => {
  const [novoDestinoLigacao, setNovoDestinoLigacao] = createSignal("");
  const [buscaTask, setBuscaTask] = createSignal("");
  const [entradaTesteComp, setEntradaTesteComp] = createSignal("");
  const [testandoComponente, setTestandoComponente] = createSignal(false);
  const [resultadoTesteComp, setResultadoTesteComp] = createSignal<any>(null);

  // Nós ancestrais para session_from
  const nosAncestrais = createMemo(() => {
    const f = props.fluxo();
    const no = props.no();
    if (!f || !no) return [] as NoGrafo[];
    const antecessoresDe = (id: string) =>
      (f.arestas || []).filter((a) => a.para === id).map((a) => a.de);
    const visitados = new Set<string>();
    const fila = [...antecessoresDe(no.id)];
    while (fila.length > 0) {
      const atual = fila.shift()!;
      if (visitados.has(atual)) continue;
      visitados.add(atual);
      for (const p of antecessoresDe(atual)) fila.push(p);
    }
    return (f.nos || []).filter((n) => visitados.has(n.id));
  });

  const testarComponenteAtual = async () => {
    const no = props.no();
    if (!no) return;
    setTestandoComponente(true);
    setResultadoTesteComp(null);
    try {
      if (no.config?.componente_id) {
        const res = await fetchApi<any>(`/components/${encodeURIComponent(no.config.componente_id)}/test`, {
          method: "POST",
          body: JSON.stringify({ entrada: entradaTesteComp() }),
        });
        setResultadoTesteComp(res);
      } else {
        setResultadoTesteComp({ ok: false, erro: "Selecione um componente do marketplace para testar" });
      }
    } catch (err: any) {
      setResultadoTesteComp({ ok: false, erro: err.message });
    } finally {
      setTestandoComponente(false);
    }
  };

  return (
    <Show when={props.no()}>
      <div class="ndv-panel absolute left-2 right-2 sm:left-auto sm:right-4 top-2 sm:top-4 bottom-2 sm:bottom-4 w-auto sm:w-[350px] md:w-96 bg-zinc-900/95 backdrop-blur-md border border-zinc-800 rounded-xl shadow-2xl flex flex-col z-30 transition-all">
        {/* Topo do NDV */}
        <div class="p-3.5 border-b border-zinc-800 flex items-center justify-between">
          <div class="flex items-center gap-2 min-w-0">
            <div class="p-1.5 rounded-lg bg-zinc-800 text-orange-400">
              {iconeDoNo(props.no()!.tipo)}
            </div>
            <div class="min-w-0">
              <h3 class="font-bold text-xs text-zinc-100 font-mono truncate">
                {props.no()!.id}
              </h3>
              <span class="text-[10px] uppercase font-mono text-zinc-500">
                Tipo: {props.no()!.tipo}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-1">
            {/* Toggle de Modos: Formulário Automático vs JSON */}
            <div class="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-[10px] font-mono">
              <button
                type="button"
                onClick={() => props.setModoNdv("form")}
                class={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  props.modoNdv() === "form" ? "bg-zinc-800 text-zinc-100 font-bold" : "text-zinc-400"
                }`}
              >
                Form
              </button>
              <button
                type="button"
                onClick={() => props.setModoNdv("json")}
                class={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  props.modoNdv() === "json" ? "bg-zinc-800 text-zinc-100 font-bold" : "text-zinc-400"
                }`}
              >
                JSON
              </button>
            </div>

            <IconButton size="xs" variant="ghost" onClick={props.onClose}>
              <X size={15} />
            </IconButton>
          </div>
        </div>

        {/* Conteúdo do NDV */}
        <div class="flex-1 overflow-y-auto p-4 space-y-4 text-xs scrollbar-thin">
          <Show
            when={props.modoNdv() === "form"}
            fallback={
              /* Versão Avançada JSON */
              <div class="space-y-2">
                <span class="text-[10px] font-bold uppercase text-zinc-500 block font-mono">
                  Configuração Estruturada (Raw JSON)
                </span>
                <pre class="p-3 rounded-lg bg-black border border-zinc-800 text-[11px] font-mono text-zinc-300 max-h-96 overflow-y-auto whitespace-pre-wrap scrollbar-thin select-text">
                  {JSON.stringify(props.no()!, null, 2)}
                </pre>
              </div>
            }
          >
            {/* FORMULÁRIO AUTOMÁTICO BASEADO NO TIPO DE NÓ */}
            <div class="space-y-3.5">
              {/* Nó Tipo Agente */}
              <Show when={props.no()!.tipo === "agente"}>
                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Agente Especialista *
                  </label>
                  <select
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500 font-mono"
                    value={props.no()!.config?.agente || ""}
                    onChange={(e) => props.onAtualizarConfigNo("agente", e.currentTarget.value)}
                  >
                    <For each={props.agentes()}>
                      {(ag) => <option value={ag.id}>@{ag.id} ({ag.role || ag.categoria || "agente"})</option>}
                    </For>
                  </select>
                </div>

                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Modo de Sessão / Memória
                  </label>
                  <select
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500 font-mono"
                    value={props.no()!.config?.session_mode || "nova"}
                    onChange={(e) => props.onAtualizarConfigNo("session_mode", e.currentTarget.value)}
                  >
                    <option value="nova">Nova Sessão a cada execução (Isolado)</option>
                    <option value="reaproveitar">Reaproveitar Sessão (Memória persistente / HLE)</option>
                  </select>
                  <p class="text-[10px] text-zinc-500">
                    Reaproveitar mantém o histórico das tentativas anteriores do agente dentro do mesmo fluxo ou loop de correção.
                  </p>
                </div>

                {/* Seletor session_from */}
                <Show when={props.no()!.config?.session_mode === "reaproveitar"}>
                  <div class="space-y-1">
                    <label class="text-[11px] font-medium text-zinc-300 block">
                      Herdar Sessão do Nó Ancestral (Opcional)
                    </label>
                    <select
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500 font-mono"
                      value={props.no()!.config?.session_from || ""}
                      onChange={(e) => props.onAtualizarConfigNo("session_from", e.currentTarget.value || undefined)}
                    >
                      <option value="">— Própria sessão do nó —</option>
                      <For each={nosAncestrais()}>
                        {(anc) => <option value={anc.id}>← {anc.id} ({anc.tipo})</option>}
                      </For>
                    </select>
                  </div>
                </Show>

                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Ordem / Instrução ao Agente *
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Instrução para a IA. Aceita {{entrada}} como dado anterior..."
                    value={props.no()!.config?.ordem || ""}
                    onInput={(e) => props.onAtualizarConfigNo("ordem", e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 font-mono focus:border-orange-500 resize-none leading-relaxed"
                  />
                </div>
              </Show>

              {/* Nó Tipo Loop / HLE */}
              <Show when={props.no()!.tipo === "loop"}>
                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Teto Máximo de Iterações (Segurança) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={props.no()!.config?.max_iteracoes ?? 3}
                    onInput={(e) => props.onAtualizarConfigNo("max_iteracoes", parseInt(e.currentTarget.value, 10) || 3)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500"
                  />
                  <p class="text-[10px] text-zinc-500">
                    Número máximo de voltas permitidas no ciclo para evitar sobrecarga de CPU/tokens.
                  </p>
                </div>

                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Condição de Parada (Texto ou Palavra-Chave)
                  </label>
                  <input
                    type="text"
                    placeholder="ex: SUCESSO ou CONCLUIDO"
                    value={props.no()!.config?.condicao_parada || ""}
                    onInput={(e) => props.onAtualizarConfigNo("condicao_parada", e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500"
                  />
                </div>

                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    ID do Nó para Retornar (Loop)
                  </label>
                  <input
                    type="text"
                    placeholder="ex: roteirista ou renderizar"
                    value={props.no()!.config?.retornar_para || ""}
                    onInput={(e) => props.onAtualizarConfigNo("retornar_para", e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500"
                  />
                </div>

                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    ID do Nó de Saída Final (Pós-Loop)
                  </label>
                  <input
                    type="text"
                    placeholder="ex: publicar ou registro_fim"
                    value={props.no()!.config?.saida_final || ""}
                    onInput={(e) => props.onAtualizarConfigNo("saida_final", e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500"
                  />
                </div>
              </Show>

              {/* Nó Tipo Gatilho Cron */}
              <Show when={props.no()!.tipo === "cron"}>
                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Expressão Cron *
                  </label>
                  <input
                    type="text"
                    placeholder="ex: 0 8 * * * (todo dia às 08:00)"
                    value={props.no()!.config?.expressao_cron || "0 8 * * *"}
                    onInput={(e) => props.onAtualizarConfigNo("expressao_cron", e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500"
                  />
                  <p class="text-[10px] text-zinc-500">
                    Dispara o fluxo automaticamente conforme a agenda definida, sem necessidade de crons cegos no sistema.
                  </p>
                </div>
              </Show>

              {/* Nó Tipo Gatilho Webhook */}
              <Show when={props.no()!.tipo === "webhook"}>
                <div class="space-y-2">
                  <div class="space-y-1">
                    <label class="text-[11px] font-medium text-zinc-300 block">
                      URL do Webhook (Endpoint de Entrada)
                    </label>
                    <div class="p-2 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-emerald-400 select-all break-all">
                      {window.location.origin}/flows/{props.fluxo()?.id}/webhook
                    </div>
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] text-zinc-400 block">
                      URL Destino (para webhook de saída HTTP, se aplicável)
                    </label>
                    <input
                      type="text"
                      placeholder="ex: https://api.exemplo.com/webhook"
                      value={props.no()!.config?.url || ""}
                      onInput={(e) => props.onAtualizarConfigNo("url", e.currentTarget.value)}
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500"
                    />
                  </div>
                  <p class="text-[10px] text-zinc-500">
                    Ao receber um POST com JSON, o payload é injetado diretamente na variável <code>$OPENCORP_INPUT</code> dos nós seguintes.
                  </p>
                </div>
              </Show>

              {/* Nó Tipo Componente Modular */}
              <Show when={props.no()!.tipo === "componente"}>
                <div class="space-y-3">
                  <div class="space-y-1">
                    <label class="text-[11px] font-medium text-zinc-300 flex items-center justify-between">
                      <span>Componente do Marketplace / Integrador</span>
                      <span class="text-[10px] text-orange-400 font-mono">{props.componentes().length} disponíveis</span>
                    </label>
                    <select
                      value={props.no()!.config?.componente_id || ""}
                      onChange={(e) => {
                        const val = e.currentTarget.value;
                        props.onAtualizarConfigNo("componente_id", val);
                        const selecionado = props.componentes().find((c) => c.id === val);
                        if (selecionado) {
                          props.onAtualizarConfigNo("runtime", selecionado.runtime);
                        }
                      }}
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500"
                    >
                      <option value="">— Personalizado (Arquivo ou Código Inline) —</option>
                      <For each={props.componentes()}>
                        {(c) => (
                          <option value={c.id}>
                            {c.builtin ? "📦 " : "🧩 "}
                            {c.nome} ({c.runtime})
                          </option>
                        )}
                      </For>
                    </select>
                  </div>

                  <Show
                    when={(() => {
                      const cId = props.no()!.config?.componente_id;
                      return props.componentes().find((c) => c.id === cId);
                    })()}
                  >
                    {(comp) => (
                      <div class="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-xs space-y-1.5">
                        <div class="flex items-center justify-between">
                          <span class="font-medium text-zinc-200">{comp().nome}</span>
                          <span class="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 font-mono">
                            v{comp().versao || "1.0.0"} · {comp().runtime}
                          </span>
                        </div>
                        <p class="text-[11px] text-zinc-400">{comp().descricao || "Sem descrição."}</p>
                      </div>
                    )}
                  </Show>

                  <Show when={!props.no()!.config?.componente_id}>
                    <div class="space-y-2 pt-1 border-t border-zinc-800/60">
                      <div class="flex gap-2">
                        <div class="flex-1 space-y-1">
                          <label class="text-[11px] font-medium text-zinc-300 block">Runtime</label>
                          <select
                            value={props.no()!.config?.runtime || "node"}
                            onChange={(e) => props.onAtualizarConfigNo("runtime", e.currentTarget.value)}
                            class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500"
                          >
                            <option value="node">Node.js (JavaScript)</option>
                            <option value="python">Python 3</option>
                            <option value="bash">Bash Script</option>
                          </select>
                        </div>
                        <div class="flex-1 space-y-1">
                          <label class="text-[11px] font-medium text-zinc-300 block">Arquivo (Opcional)</label>
                          <input
                            type="text"
                            placeholder="scripts/conversor.mjs"
                            value={props.no()!.config?.arquivo || ""}
                            onInput={(e) => props.onAtualizarConfigNo("arquivo", e.currentTarget.value)}
                            class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500"
                          />
                        </div>
                      </div>

                      <div class="space-y-1">
                        <label class="text-[11px] font-medium text-zinc-300 block">
                          Código Inline (se não usar arquivo)
                        </label>
                        <textarea
                          rows={5}
                          value={props.no()!.config?.codigo || ""}
                          onInput={(e) => props.onAtualizarConfigNo("codigo", e.currentTarget.value)}
                          class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500 resize-y"
                        />
                      </div>
                    </div>
                  </Show>

                  {/* Teste Interativo */}
                  <div class="space-y-2 pt-2 border-t border-zinc-800/80">
                    <label class="text-[11px] font-medium text-zinc-300 block">
                      Testar I/O do Componente
                    </label>
                    <textarea
                      rows={2}
                      value={entradaTesteComp()}
                      onInput={(e) => setEntradaTesteComp(e.currentTarget.value)}
                      placeholder='{"parametro": "valor"}'
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500 resize-none"
                    />
                    <div class="flex items-center justify-between">
                      <button
                        type="button"
                        disabled={testandoComponente() || !props.no()!.config?.componente_id}
                        onClick={testarComponenteAtual}
                        class="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <span>{testandoComponente() ? "Executando teste..." : "Executar Teste"}</span>
                      </button>
                    </div>

                    <Show when={resultadoTesteComp()}>
                      <div
                        class={`p-2.5 rounded-lg border text-xs font-mono space-y-1 ${
                          resultadoTesteComp().ok
                            ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                            : "bg-red-950/20 border-red-800/40 text-red-300"
                        }`}
                      >
                        <div class="flex items-center justify-between text-[10px]">
                          <span>{resultadoTesteComp().ok ? "✓ Sucesso" : "✕ Falhou"}</span>
                          <Show when={resultadoTesteComp().duracao_ms !== undefined}>
                            <span>{resultadoTesteComp().duracao_ms}ms</span>
                          </Show>
                        </div>
                        <pre class="whitespace-pre-wrap text-[11px] max-h-32 overflow-y-auto">
                          {resultadoTesteComp().ok
                            ? (resultadoTesteComp().json
                                ? JSON.stringify(resultadoTesteComp().json, null, 2)
                                : resultadoTesteComp().saida)
                            : resultadoTesteComp().erro}
                        </pre>
                      </div>
                    </Show>
                  </div>
                </div>
              </Show>

              {/* Nó Tipo Script */}
              <Show when={props.no()!.tipo === "script"}>
                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Caminho do Script (.js, .py, .sh)
                  </label>
                  <input
                    type="text"
                    placeholder="ex: scripts/processar-dados.sh"
                    value={props.no()!.config?.arquivo || ""}
                    onInput={(e) => props.onAtualizarConfigNo("arquivo", e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Comando Bash Alternativo
                  </label>
                  <input
                    type="text"
                    placeholder="ex: python3 script.py {{entrada}}"
                    value={props.no()!.config?.comando || ""}
                    onInput={(e) => props.onAtualizarConfigNo("comando", e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500"
                  />
                </div>
              </Show>

              {/* Nó Tipo Reunião */}
              <Show when={props.no()!.tipo === "reuniao"}>
                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Pauta da Reunião *
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Tema central para a deliberação dos agentes..."
                    value={props.no()!.config?.pauta || ""}
                    onInput={(e) => props.onAtualizarConfigNo("pauta", e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500 resize-none"
                  />
                </div>
              </Show>

              {/* Nó Tipo Decisão */}
              <Show when={props.no()!.tipo === "decisao"}>
                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Pergunta de Decisão *
                  </label>
                  <input
                    type="text"
                    placeholder="ex: Os critérios de qualidade foram atendidos?"
                    value={props.no()!.config?.pergunta || ""}
                    onInput={(e) => props.onAtualizarConfigNo("pergunta", e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500"
                  />
                </div>
              </Show>

              {/* Nó Tipo Task Create */}
              <Show when={props.no()!.tipo === "task_create"}>
                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Título da Tarefa no Kanban *
                  </label>
                  <input
                    type="text"
                    placeholder="ex: Publicar artigo aprovado na fila"
                    value={props.no()!.config?.titulo || ""}
                    onInput={(e) => props.onAtualizarConfigNo("titulo", e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500"
                  />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="text-[10px] text-zinc-400 block mb-1">Coluna</label>
                    <select
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-xs text-zinc-200 focus:border-orange-500"
                      value={props.no()!.config?.coluna || "backlog"}
                      onChange={(e) => props.onAtualizarConfigNo("coluna", e.currentTarget.value)}
                    >
                      <option value="backlog">Backlog</option>
                      <option value="fazer">A Fazer</option>
                      <option value="andamento">Em Andamento</option>
                      <option value="revisao">Revisão</option>
                    </select>
                  </div>
                  <div>
                    <label class="text-[10px] text-zinc-400 block mb-1">Prioridade</label>
                    <select
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-xs text-zinc-200 focus:border-orange-500"
                      value={props.no()!.config?.prioridade || "media"}
                      onChange={(e) => props.onAtualizarConfigNo("prioridade", e.currentTarget.value)}
                    >
                      <option value="baixa">Baixa</option>
                      <option value="media">Média</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>
                </div>

                {/* Selecionar Task Existente */}
                <div class="space-y-1.5 pt-2 border-t border-zinc-800 mt-2">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    ou Executar Task Existente (pesquisar por nome)
                  </label>
                  <input
                    type="text"
                    placeholder="Pesquisar tarefa existente pelo título ou descrição..."
                    value={buscaTask()}
                    onInput={(e) => setBuscaTask(e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500 font-mono"
                  />
                  <Show when={buscaTask().trim().length >= 2}>
                    <div class="max-h-32 overflow-y-auto space-y-1 scrollbar-thin">
                      <For
                        each={props.tasksExistentes().filter((t) => {
                          const q = buscaTask().toLowerCase();
                          return (
                            (t.titulo && t.titulo.toLowerCase().includes(q)) ||
                            (t.descricao && t.descricao.toLowerCase().includes(q)) ||
                            (t.id && t.id.toLowerCase().includes(q))
                          );
                        }).slice(0, 8)}
                        fallback={<div class="text-[10px] text-zinc-500 py-2 text-center">Nenhuma task encontrada.</div>}
                      >
                        {(t) => (
                          <div
                            onClick={() => {
                              props.onAtualizarConfigNo("titulo", t.titulo || t.id);
                              props.onAtualizarConfigNo("task_id", t.id);
                              props.onAtualizarConfigNo("coluna", t.coluna || "backlog");
                              props.onAtualizarConfigNo("prioridade", t.prioridade || "media");
                              setBuscaTask("");
                              showToast(`Task "${t.titulo || t.id}" selecionada!`, "sucesso");
                            }}
                            class="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-orange-500/60 cursor-pointer text-xs flex items-center justify-between gap-2 transition-colors"
                          >
                            <div class="min-w-0">
                              <span class="font-medium text-zinc-200 truncate block">{t.titulo || t.id}</span>
                              <span class="text-[10px] text-zinc-500 truncate block">{t.descricao || `coluna: ${t.coluna}`}</span>
                            </div>
                            <span class={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                              t.coluna === "feito" ? "bg-emerald-950/50 text-emerald-400" :
                              t.coluna === "fazendo" ? "bg-blue-950/50 text-blue-400" :
                              t.coluna === "bloqueado" ? "bg-amber-950/50 text-amber-400" :
                              "bg-zinc-900 text-zinc-400"
                            }`}>{t.coluna}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </Show>

              {/* Nó Tipo Sub-Fluxo */}
              <Show when={props.no()!.tipo === "subflow"}>
                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Fluxo a Executar *
                  </label>
                  <select
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500 font-mono"
                    value={props.no()!.config?.flow_id || ""}
                    onChange={(e) => props.onAtualizarConfigNo("flow_id", e.currentTarget.value)}
                  >
                    <option value="">— Selecione um fluxo —</option>
                    <For each={props.fluxosExistentes().filter((x) => x.id !== props.fluxo()?.id)}>
                      {(f) => <option value={f.id}>{f.nome || f.id}</option>}
                    </For>
                  </select>
                </div>
                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Entrada para o Sub-Fluxo
                  </label>
                  <input
                    type="text"
                    placeholder="ex: {{entrada}} ou texto fixo"
                    value={props.no()!.config?.entrada || "{{entrada}}"}
                    onInput={(e) => props.onAtualizarConfigNo("entrada", e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500"
                  />
                </div>
              </Show>

              {/* Nó Tipo HTTP Request */}
              <Show when={props.no()!.tipo === "http_request"}>
                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    URL do Endpoint *
                  </label>
                  <input
                    type="text"
                    placeholder="https://api.exemplo.com/v1/recurso"
                    value={props.no()!.config?.url || ""}
                    onInput={(e) => props.onAtualizarConfigNo("url", e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500"
                  />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div class="space-y-1">
                    <label class="text-[10px] text-zinc-400 block">Método HTTP</label>
                    <select
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-xs text-zinc-200 focus:border-orange-500 font-mono"
                      value={props.no()!.config?.metodo || "GET"}
                      onChange={(e) => props.onAtualizarConfigNo("metodo", e.currentTarget.value)}
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] text-zinc-400 block">Timeout (ms)</label>
                    <input
                      type="number"
                      min={1000}
                      max={120000}
                      value={props.no()!.config?.timeout_ms ?? 30000}
                      onInput={(e) => props.onAtualizarConfigNo("timeout_ms", parseInt(e.currentTarget.value, 10) || 30000)}
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-xs text-zinc-200 font-mono focus:border-orange-500"
                    />
                  </div>
                </div>
                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Headers (JSON, opcional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder='{"Authorization": "Bearer {{token}}"}'
                    value={props.no()!.config?.headers || ""}
                    onInput={(e) => props.onAtualizarConfigNo("headers", e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500 resize-none"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Body (JSON, para POST/PUT/PATCH)
                  </label>
                  <textarea
                    rows={3}
                    placeholder='{"dados": "{{entrada}}"}'
                    value={props.no()!.config?.body || ""}
                    onInput={(e) => props.onAtualizarConfigNo("body", e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500 resize-none"
                  />
                </div>
              </Show>

              {/* Nó Tipo Delay / Aguardar */}
              <Show when={props.no()!.tipo === "delay"}>
                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Tempo de Espera (segundos) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={86400}
                    value={props.no()!.config?.segundos ?? 30}
                    onInput={(e) => props.onAtualizarConfigNo("segundos", parseInt(e.currentTarget.value, 10) || 30)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-orange-500"
                  />
                </div>
              </Show>

              {/* Nó Tipo Registro / Documento */}
              <Show when={props.no()!.tipo === "registro" || props.no()!.tipo === "saida"}>
                <div class="space-y-1">
                  <label class="text-[11px] font-medium text-zinc-300 block">
                    Categoria do Registro
                  </label>
                  <input
                    type="text"
                    placeholder="ex: documentos, atas, relatorios"
                    value={props.no()!.config?.categoria || "documentos"}
                    onInput={(e) => props.onAtualizarConfigNo("categoria", e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:border-orange-500 font-mono"
                  />
                </div>
              </Show>
            </div>

            {/* ─────────────────────────────────────────────────────────
                SEÇÃO N8N: CONEXÕES DO NÓ (LIGAÇÕES DE ENTRADA & SAÍDA)
               ───────────────────────────────────────────────────────── */}
            <div class="pt-3 border-t border-zinc-800 space-y-2.5">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <GitBranch size={13} class="text-orange-400" /> Conexões & Ligações
                </span>
                <button
                  type="button"
                  onClick={() => props.onIniciarConexao(props.no()!.id)}
                  class="px-2 py-0.5 rounded bg-zinc-800 hover:bg-orange-600 hover:text-white text-zinc-300 text-[10px] font-medium transition-colors cursor-pointer"
                >
                  + Ligar no Canvas
                </button>
              </div>

              {/* Ligações de Entrada */}
              <div class="space-y-1">
                <span class="text-[10px] text-zinc-500 font-medium block">Entradas (ativado após):</span>
                <div class="flex flex-wrap gap-1">
                  <For
                    each={(props.fluxo()?.arestas || []).filter((a) => a.para === props.no()!.id)}
                    fallback={<span class="text-[10px] text-zinc-600 italic">Nenhum nó anterior (gatilho inicial)</span>}
                  >
                    {(aresta) => (
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-zinc-300">
                        ← {aresta.de}
                        <button
                          type="button"
                          onClick={() => props.onRemoverAresta(aresta.de, aresta.para)}
                          class="text-zinc-500 hover:text-rose-400 ml-0.5 cursor-pointer font-bold"
                          title="Remover conexão"
                        >
                          ✕
                        </button>
                      </span>
                    )}
                  </For>
                </div>
              </div>

              {/* Ligações de Saída */}
              <div class="space-y-1">
                <span class="text-[10px] text-zinc-500 font-medium block">Saídas (dispara em seguida):</span>
                <div class="flex flex-wrap gap-1">
                  <For
                    each={(props.fluxo()?.arestas || []).filter((a) => a.de === props.no()!.id)}
                    fallback={<span class="text-[10px] text-zinc-600 italic">Fim da esteira (nenhum nó seguinte)</span>}
                  >
                    {(aresta) => (
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-zinc-300">
                        → {aresta.para}
                        <button
                          type="button"
                          onClick={() => props.onRemoverAresta(aresta.de, aresta.para)}
                          class="text-zinc-500 hover:text-rose-400 ml-0.5 cursor-pointer font-bold"
                          title="Remover conexão"
                        >
                          ✕
                        </button>
                      </span>
                    )}
                  </For>
                </div>
              </div>

              {/* Adicionar Ligação por Dropdown */}
              <div class="flex items-center gap-1.5 pt-1">
                <select
                  value={novoDestinoLigacao()}
                  onChange={(e) => setNovoDestinoLigacao(e.currentTarget.value)}
                  class="flex-1 bg-zinc-950 border border-zinc-800 rounded p-1.5 text-[11px] text-zinc-200 focus:border-orange-500 font-mono"
                >
                  <option value="">Ligar este nó para...</option>
                  <For each={(props.fluxo()?.nos || []).filter((n) => n.id !== props.no()?.id)}>
                    {(outro) => <option value={outro.id}>→ {outro.id} ({outro.tipo})</option>}
                  </For>
                </select>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => {
                    const dest = novoDestinoLigacao();
                    if (!dest) {
                      showToast("Selecione um nó de destino", "aviso");
                      return;
                    }
                    props.onCriarConexao(props.no()!.id, dest);
                    setNovoDestinoLigacao("");
                  }}
                >
                  Ligar
                </Button>
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────
                SEÇÃO N8N: CONTEXTO DO NÓ ANTERIOR & VARIÁVEIS DE ENTRADA
               ───────────────────────────────────────────────────────── */}
            <div class="pt-3 border-t border-zinc-800 space-y-2">
              <span class="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Terminal size={13} class="text-cyan-400" /> Dados Anteriores & Variáveis (n8n)
              </span>
              <p class="text-[10px] text-zinc-400 leading-relaxed">
                O agente deste nó recebe automaticamente toda a resposta e saída do nó anterior no contexto de execução.
              </p>

              <div class="space-y-1">
                <span class="text-[10px] text-zinc-500 font-medium block">Variáveis disponíveis para interpolar na ordem:</span>
                <div class="flex flex-wrap gap-1 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => {
                      const ord = props.no()?.config?.ordem || "";
                      props.onAtualizarConfigNo("ordem", `${ord} {{entrada}}`.trim());
                      showToast("{{entrada}} adicionado à ordem", "info");
                    }}
                    class="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 hover:border-cyan-500 text-cyan-400 cursor-pointer"
                    title="Clique para adicionar à instrução"
                  >
                    {`{{entrada}}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const ord = props.no()?.config?.ordem || "";
                      props.onAtualizarConfigNo("ordem", `${ord} {{$input}}`.trim());
                      showToast("{{$input}} adicionado à ordem", "info");
                    }}
                    class="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 hover:border-cyan-500 text-cyan-400 cursor-pointer"
                    title="Clique para adicionar à instrução"
                  >
                    {`{{$input}}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const ord = props.no()?.config?.ordem || "";
                      props.onAtualizarConfigNo("ordem", `${ord} {{json}}`.trim());
                      showToast("{{json}} adicionado à ordem", "info");
                    }}
                    class="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 hover:border-cyan-500 text-cyan-400 cursor-pointer"
                    title="Clique para adicionar à instrução"
                  >
                    {`{{json}}`}
                  </button>
                </div>
              </div>
            </div>
          </Show>
        </div>

        {/* Rodapé do NDV com Ações de Salvar e Excluir Node */}
        <div class="p-3 border-t border-zinc-800 flex items-center justify-between">
          <Button
            size="xs"
            variant="ghost"
            class="text-rose-400 hover:text-rose-300 cursor-pointer"
            onClick={() => props.onExcluirNode(props.no()!.id)}
          >
            <Trash2 size={13} class="mr-1" /> Excluir Node
          </Button>

          <Button
            size="xs"
            variant="primary"
            class="bg-orange-600 hover:bg-orange-500 text-white font-bold cursor-pointer"
            onClick={props.onClose}
          >
            Concluir Edição
          </Button>
        </div>
      </div>
    </Show>
  );
};
