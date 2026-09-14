import {
  type Component,
  createSignal,
  onMount,
  createEffect,
  untrack,
  Show,
} from "solid-js";
import { useSearchParams, useNavigate } from "@solidjs/router";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";
import { SecretarioView } from "./Secretario";
import {
  type NoGrafo,
  type ArestaGrafo,
  type FluxoCompleto,
  type MenuContextoState,
  TIPOS_NODE_CATALOGO,
  GraphCanvas,
  NodeConfigDrawer,
  ExecutionLogsPanel,
  ComponentPalette,
  WorkflowList,
  ModalNovoWorkflow,
  ModalExecutarWorkflow,
  WorkflowHeader,
} from "./fluxos";

export { TIPOS_NODE_CATALOGO };

export const FluxosView: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Estados Principais do Domínio
  const [fluxos, setFluxos] = createSignal<FluxoCompleto[]>([]);
  const [fluxoAtivo, setFluxoAtivo] = createSignal<FluxoCompleto | null>(null);
  const [noSelecionado, setNoSelecionado] = createSignal<NoGrafo | null>(null);
  const [agentes, setAgentes] = createSignal<any[]>([]);
  const [tasksExistentes, setTasksExistentes] = createSignal<any[]>([]);
  const [componentes, setComponentes] = createSignal<any[]>([]);
  const [jobsAgenda, setJobsAgenda] = createSignal<any[]>([]);
  const [statusFluxos, setStatusFluxos] = createSignal<Record<string, { status: string; execId: string }>>({});

  // Canvas / Studio State
  const [zoom, setZoom] = createSignal(1);
  const [pan, setPan] = createSignal({ x: 60, y: 60 });
  const [conectandoDeNoId, setConectandoDeNoId] = createSignal<string | null>(null);
  const [modoNdv, setModoNdv] = createSignal<"form" | "json">("form");
  const [modoExibicao, setModoExibicao] = createSignal<"canvas" | "split" | "chat">("canvas");

  // Telemetria e Logs
  const [painelLogsAberto, setPainelLogsAberto] = createSignal(false);
  const [logsExecucoes, setLogsExecucoes] = createSignal<any[]>([]);

  // Modais e Diálogos
  const [modalAdicionarNode, setModalAdicionarNode] = createSignal(false);
  const [modalNovoFluxo, setModalNovoFluxo] = createSignal(false);
  const [modalExecutar, setModalExecutar] = createSignal(false);
  const [salvandoNovoFluxo, setSalvandoNovoFluxo] = createSignal(false);
  const [executando, setExecutando] = createSignal(false);
  const [copiadoId, setCopiadoId] = createSignal<string | null>(null);

  // Menu de Contexto
  const [menuContexto, setMenuContexto] = createSignal<MenuContextoState>({
    aberto: false,
    x: 0,
    y: 0,
  });

  // ─────────────────────────────────────────────────────────────
  // CARREGAMENTO DE DADOS E SINCRONIZAÇÃO
  // ─────────────────────────────────────────────────────────────
  const carregarFluxos = async () => {
    try {
      const data = await fetchApi<FluxoCompleto[]>("/flows");
      setFluxos(Array.isArray(data) ? data : []);
      void carregarStatusFluxos(Array.isArray(data) ? data : []);
    } catch { setFluxos([]); }
  };
  const carregarAgentes = async () => {
    try { setAgentes(await fetchApi<any[]>("/agentes") || []); } catch { setAgentes([]); }
  };
  const carregarTasks = async () => {
    try { setTasksExistentes(await fetchApi<any[]>("/tasks") || []); } catch { setTasksExistentes([]); }
  };
  const carregarComponentes = async () => {
    try { setComponentes(await fetchApi<any[]>("/apps") || []); } catch { setComponentes([]); }
  };
  const carregarJobsAgenda = async () => {
    try { setJobsAgenda(await fetchApi<any[]>("/agenda") || []); } catch { setJobsAgenda([]); }
  };
  const carregarLogs = async (fluxoId: string) => {
    try {
      const data = await fetchApi<any[]>(`/flows/${encodeURIComponent(fluxoId)}/runs`);
      setLogsExecucoes(Array.isArray(data) ? data : []);
    } catch { setLogsExecucoes([]); }
  };
  const carregarStatusFluxos = async (listaFluxos: FluxoCompleto[]) => {
    const mapa: Record<string, { status: string; execId: string }> = {};
    await Promise.all(
      listaFluxos.map(async (f) => {
        try {
          const runs = await fetchApi<any[]>(`/flows/${encodeURIComponent(f.id)}/runs`);
          if (Array.isArray(runs) && runs.length > 0) {
            mapa[f.id] = { status: runs[0].status, execId: runs[0].exec_id || runs[0].id };
          }
        } catch {}
      })
    );
    setStatusFluxos(mapa);
  };

  // ─────────────────────────────────────────────────────────────
  // NAVEGAÇÃO E SELEÇÃO DE FLUXO
  // ─────────────────────────────────────────────────────────────
  let navegandoParaLista = false;

  const abrirEditorCanvas = async (id: string) => {
    try {
      const f = await fetchApi<FluxoCompleto>(`/flows/${encodeURIComponent(id)}`);
      setFluxoAtivo(f);
      setSearchParams({ fluxo: id });
      setNoSelecionado(null);
      void carregarLogs(id);
    } catch {
      showToast("Não foi possível carregar o fluxo", "erro");
    }
  };

  const voltarParaLista = () => {
    navegandoParaLista = true;
    setSearchParams({ fluxo: undefined }, { replace: true });
    navigate("/fluxos", { replace: true });
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("fluxo");
      window.history.replaceState(null, "", u.pathname + (u.search ? u.search : ""));
    } catch {}
    setFluxoAtivo(null);
    setNoSelecionado(null);
    setLogsExecucoes([]);
    setPainelLogsAberto(false);
    setModalAdicionarNode(false);
    void carregarFluxos();
    setTimeout(() => {
      navegandoParaLista = false;
    }, 150);
  };

  createEffect(() => {
    if (navegandoParaLista) return;
    const id = searchParams.fluxo as string | undefined;
    const ativo = untrack(() => fluxoAtivo());
    if (id) {
      if (!ativo || ativo.id !== id) {
        void abrirEditorCanvas(id);
      }
    } else if (ativo) {
      setFluxoAtivo(null);
      setNoSelecionado(null);
      setLogsExecucoes([]);
      setPainelLogsAberto(false);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // OPERAÇÕES DO WORKFLOW & GRAFO
  // ─────────────────────────────────────────────────────────────
  const salvarAlteracoesWorkflow = async (novoFluxo: any) => {
    try {
      const payload = { ...novoFluxo };
      if (typeof payload.nos === "number" || !Array.isArray(payload.nos)) delete payload.nos;
      if (typeof payload.arestas === "number" || !Array.isArray(payload.arestas)) delete payload.arestas;

      const res = await fetchApi<FluxoCompleto>(`/flows/${encodeURIComponent(novoFluxo.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setFluxoAtivo(res);
      setFluxos((prev) => prev.map((f) => (f.id === res.id ? { ...f, ...res } : f)));
      showToast("Alterações salvas!", "sucesso");
    } catch (err: any) {
      showToast(`Erro ao salvar: ${err.message}`, "erro");
    }
  };

  const salvarPosicaoNode = async (noId: string, x: number, y: number) => {
    const f = fluxoAtivo();
    if (!f) return;
    const novosNos = (f.nos || []).map((n) => (n.id === noId ? { ...n, x, y } : n));
    const atualizado = { ...f, nos: novosNos };
    setFluxoAtivo(atualizado);
    try {
      await fetchApi(`/flows/${encodeURIComponent(f.id)}`, {
        method: "PUT",
        body: JSON.stringify(atualizado),
      });
    } catch {}
  };

  const adicionarNodeAoWorkflow = async (tipo: string) => {
    const f = fluxoAtivo();
    if (!f) return;
    const cat = TIPOS_NODE_CATALOGO.find((t) => t.tipo === tipo);
    const count = (f.nos || []).filter((n) => n.tipo === tipo).length;
    const idSugerido = `${tipo}_${count + 1}`;

    const novoNode: NoGrafo = {
      id: idSugerido,
      tipo,
      x: 100 + (f.nos?.length || 0) * 40,
      y: 100 + (f.nos?.length || 0) * 30,
      config: cat ? { ...cat.padraoConfig } : {},
    };

    const atualizado = { ...f, nos: [...(f.nos || []), novoNode] };
    await salvarAlteracoesWorkflow(atualizado);
    setNoSelecionado(novoNode);
    setModalAdicionarNode(false);
  };

  const atualizarConfigNo = (campo: string, valor: any) => {
    const no = noSelecionado();
    const f = fluxoAtivo();
    if (!no || !f) return;

    const noAtualizado = {
      ...no,
      config: { ...(no.config || {}), [campo]: valor },
    };
    const novosNos = f.nos.map((n) => (n.id === no.id ? noAtualizado : n));
    const workflowAtualizado = { ...f, nos: novosNos };

    setFluxoAtivo(workflowAtualizado);
    setNoSelecionado(noAtualizado);
    void salvarAlteracoesWorkflow(workflowAtualizado);
  };

  const duplicarNode = async (noId: string) => {
    const f = fluxoAtivo();
    if (!f) return;
    const orig = f.nos.find((n) => n.id === noId);
    if (!orig) return;

    const copiaId = `${orig.id}_copia_${Date.now().toString(36).slice(-3)}`;
    const novoNode: NoGrafo = {
      ...orig,
      id: copiaId,
      x: (orig.x ?? 100) + 40,
      y: (orig.y ?? 100) + 40,
    };

    const atualizado = { ...f, nos: [...f.nos, novoNode] };
    await salvarAlteracoesWorkflow(atualizado);
    setNoSelecionado(novoNode);
  };

  const excluirNode = async (noId: string) => {
    const f = fluxoAtivo();
    if (!f) return;
    const novosNos = f.nos.filter((n) => n.id !== noId);
    const novasArestas = (f.arestas || []).filter((a) => a.de !== noId && a.para !== noId);
    const atualizado = { ...f, nos: novosNos, arestas: novasArestas };
    await salvarAlteracoesWorkflow(atualizado);
    if (noSelecionado()?.id === noId) setNoSelecionado(null);
  };

  const criarConexao = async (deId: string, paraId: string) => {
    const f = fluxoAtivo();
    if (!f || deId === paraId) {
      setConectandoDeNoId(null);
      return;
    }

    const jaExiste = (f.arestas || []).some((a) => a.de === deId && a.para === paraId);
    if (jaExiste) {
      showToast("Esta conexão já existe!", "aviso");
      setConectandoDeNoId(null);
      return;
    }

    const novaAresta: ArestaGrafo = { de: deId, para: paraId };
    const atualizado = { ...f, arestas: [...(f.arestas || []), novaAresta] };
    await salvarAlteracoesWorkflow(atualizado);
    setConectandoDeNoId(null);
  };

  const removerAresta = async (de: string, para: string) => {
    const f = fluxoAtivo();
    if (!f) return;
    const novasArestas = (f.arestas || []).filter((a) => !(a.de === de && a.para === para));
    await salvarAlteracoesWorkflow({ ...f, arestas: novasArestas });
  };

  // ─────────────────────────────────────────────────────────────
  // EXECUÇÃO E DISPACHO
  // ─────────────────────────────────────────────────────────────
  const dispararExecucao = async (entrada: string) => {
    const f = fluxoAtivo();
    if (!f) return;
    setExecutando(true);
    try {
      const res = await fetchApi<{ status?: string; exec_id?: string }>(`/flows/${encodeURIComponent(f.id)}/run`, {
        method: "POST",
        body: JSON.stringify({ entrada: entrada.trim() || undefined }),
      });
      showToast(`Execução do fluxo "${f.nome || f.id}" iniciada!`, "sucesso");
      setModalExecutar(false);
      setTimeout(() => void carregarLogs(f.id), 1500);
      if (res?.exec_id) {
        navigate(`/historico?run=${encodeURIComponent(res.exec_id)}`);
      }
    } catch (err: any) {
      showToast(`Erro ao rodar: ${err.message}`, "erro");
    } finally {
      setExecutando(false);
    }
  };

  const retomarExecucao = async (execId: string) => {
    const f = fluxoAtivo();
    if (!f) return;
    try {
      await fetchApi(`/flows/${encodeURIComponent(f.id)}/resume`, {
        method: "POST",
        body: JSON.stringify({ exec_id: execId }),
      });
      showToast("Execução retomada!", "sucesso");
      void carregarLogs(f.id);
    } catch (err: any) {
      showToast(`Erro ao retomar: ${err.message}`, "erro");
    }
  };

  const salvarNovoFluxo = async (dados: {
    id: string;
    nome: string;
    descricao: string;
    template: "pipeline" | "fanout" | "review" | "debate";
  }) => {
    setSalvandoNovoFluxo(true);
    try {
      await fetchApi("/flows", {
        method: "POST",
        body: JSON.stringify({
          id: dados.id,
          nome: dados.nome,
          descricao: dados.descricao || undefined,
          nos: [{ id: "gatilho", tipo: "manual", config: {} }],
          arestas: [],
        }),
      });
      setModalNovoFluxo(false);
      await carregarFluxos();
      void abrirEditorCanvas(dados.id);
    } catch (err: any) {
      showToast(`Erro ao criar fluxo: ${err.message}`, "erro");
    } finally {
      setSalvandoNovoFluxo(false);
    }
  };

  const excluirFluxo = async (id: string, nome?: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm(`Tem certeza que deseja excluir o fluxo "${nome || id}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await fetchApi(`/flows/${encodeURIComponent(id)}`, { method: "DELETE" });
      setFluxos((prev) => prev.filter((f) => f.id !== id));
      showToast("Fluxo removido com sucesso", "sucesso");
      if (fluxoAtivo()?.id === id) voltarParaLista();
      else await carregarFluxos();
    } catch (err: any) {
      showToast(`Erro ao excluir: ${err.message}`, "erro");
    }
  };

  const copiarWorkflowJson = (f: FluxoCompleto, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    void navigator.clipboard.writeText(JSON.stringify(f, null, 2));
    setCopiadoId(f.id);
    setTimeout(() => setCopiadoId(null), 2000);
    showToast("JSON do fluxo copiado!", "sucesso");
  };

  const exportarWorkflowJson = (f: FluxoCompleto, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(f, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `workflow-${f.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const importarWorkflowArquivo = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const conteudo = event.target?.result as string;
        const workflow = JSON.parse(conteudo);
        if (!workflow.id || !workflow.nos) throw new Error("JSON inválido: formato de fluxo não reconhecido.");
        await fetchApi("/flows", { method: "POST", body: JSON.stringify(workflow) });
        showToast(`Fluxo "${workflow.nome || workflow.id}" importado com sucesso!`, "sucesso");
        await carregarFluxos();
        void abrirEditorCanvas(workflow.id);
      } catch (err: any) {
        showToast(`Falha ao importar: ${err.message}`, "erro");
      }
    };
    reader.readAsText(file);
    input.value = "";
  };

  onMount(() => {
    void carregarFluxos();
    void carregarAgentes();
    void carregarTasks();
    void carregarComponentes();
    void carregarJobsAgenda();

    const paramFluxo = searchParams.fluxo as string;
    if (paramFluxo) void abrirEditorCanvas(paramFluxo);
  });

  return (
    <div class="flex flex-col h-full w-full overflow-hidden bg-zinc-950 select-none">
      {/* Listagem Principal de Workflows */}
      <Show when={!fluxoAtivo()}>
        <WorkflowList
          fluxos={fluxos}
          jobsAgenda={jobsAgenda}
          statusFluxos={statusFluxos}
          copiadoId={copiadoId}
          onAbrirEditor={abrirEditorCanvas}
          onCarregarFluxos={carregarFluxos}
          onExcluirFluxo={excluirFluxo}
          onCopiarJson={copiarWorkflowJson}
          onExportarJson={exportarWorkflowJson}
          onImportarArquivo={importarWorkflowArquivo}
          onSalvarAlteracoes={salvarAlteracoesWorkflow}
          onAbrirModalNovo={() => setModalNovoFluxo(true)}
        />
      </Show>

      {/* Studio do Workflow (Canvas + Toolbar + Drawers) */}
      <Show when={fluxoAtivo()}>
        <div class="flex flex-col h-full w-full overflow-hidden">
          <WorkflowHeader
            fluxo={fluxoAtivo}
            zoom={zoom}
            setZoom={setZoom}
            onResetView={() => { setZoom(1); setPan({ x: 60, y: 60 }); }}
            modoExibicao={modoExibicao}
            setModoExibicao={setModoExibicao}
            logsCount={() => logsExecucoes().length}
            onToggleLogs={() => {
              void carregarLogs(fluxoAtivo()!.id);
              setPainelLogsAberto(!painelLogsAberto());
            }}
            onVoltar={voltarParaLista}
            onAdicionarNode={() => setModalAdicionarNode(true)}
            onSalvarAlteracoes={salvarAlteracoesWorkflow}
            onExportar={() => exportarWorkflowJson(fluxoAtivo()!)}
            onAbrirExecutar={() => setModalExecutar(true)}
            onExcluir={(e) => excluirFluxo(fluxoAtivo()!.id, fluxoAtivo()!.nome, e)}
          />

          {/* Container Principal: Split-View ou Foco */}
          <div class="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden relative">
            <Show when={modoExibicao() === "split" || modoExibicao() === "chat"}>
              <div
                class={`${
                  modoExibicao() === "chat" ? "w-full" : "w-full md:w-96 lg:w-[420px]"
                } h-full border-r border-zinc-800 flex flex-col bg-zinc-950 shrink-0 z-10`}
              >
                <SecretarioView />
              </div>
            </Show>

            <Show when={modoExibicao() === "split" || modoExibicao() === "canvas"}>
              <GraphCanvas
                fluxo={fluxoAtivo}
                noSelecionado={noSelecionado}
                onSelectNo={setNoSelecionado}
                conectandoDeNoId={conectandoDeNoId}
                onCancelConexao={() => setConectandoDeNoId(null)}
                onIniciarConexao={(origemId) => {
                  setConectandoDeNoId(origemId);
                  showToast(`Ligando a partir de "${origemId}": clique no nó de destino`, "info");
                }}
                onCompletarConexao={(destinoId) => {
                  const orig = conectandoDeNoId();
                  if (orig) criarConexao(orig, destinoId);
                }}
                onRemoverAresta={removerAresta}
                onContextMenuCanvas={(e, noId) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuContexto({ aberto: true, x: e.clientX, y: e.clientY, noId });
                  if (noId) {
                    const n = fluxoAtivo()?.nos.find((item) => item.id === noId);
                    if (n) setNoSelecionado(n);
                  }
                }}
                onSalvarPosicaoNode={salvarPosicaoNode}
                onAdicionarNodeAoWorkflow={adicionarNodeAoWorkflow}
                onDuplicarNode={duplicarNode}
                onExcluirNode={excluirNode}
                zoom={zoom}
                setZoom={setZoom}
                pan={pan}
                setPan={setPan}
                logsExecucoes={logsExecucoes}
              />
            </Show>

            <NodeConfigDrawer
              no={noSelecionado}
              fluxo={fluxoAtivo}
              agentes={agentes}
              tasksExistentes={tasksExistentes}
              fluxosExistentes={fluxos}
              componentes={componentes}
              modoNdv={modoNdv}
              setModoNdv={setModoNdv}
              onClose={() => setNoSelecionado(null)}
              onAtualizarConfigNo={atualizarConfigNo}
              onExcluirNode={excluirNode}
              onIniciarConexao={(origemId) => {
                setConectandoDeNoId(origemId);
                showToast(`Ligando a partir de "${origemId}": clique no nó de destino`, "info");
              }}
              onCriarConexao={criarConexao}
              onRemoverAresta={removerAresta}
            />
          </div>

          <ExecutionLogsPanel
            fluxoId={fluxoAtivo()?.id || ""}
            logs={logsExecucoes}
            aberto={painelLogsAberto}
            onToggleAberto={() => setPainelLogsAberto(!painelLogsAberto())}
            onRecarregar={() => void carregarLogs(fluxoAtivo()!.id)}
            onRetomarExecucao={retomarExecucao}
            visible={modoExibicao() === "canvas" || modoExibicao() === "split"}
          />
        </div>
      </Show>

      {/* Catálogo e Menu de Contexto */}
      <ComponentPalette
        aberto={modalAdicionarNode}
        onClose={() => setModalAdicionarNode(false)}
        onAdicionarNode={(tipo) => {
          if (tipo) void adicionarNodeAoWorkflow(tipo);
          else setModalAdicionarNode(true);
        }}
        menuContexto={menuContexto}
        onCloseMenuContexto={() => setMenuContexto((p) => ({ ...p, aberto: false }))}
        onResetView={() => { setZoom(1); setPan({ x: 60, y: 60 }); }}
        onCopiarJson={() => { if (fluxoAtivo()) void copiarWorkflowJson(fluxoAtivo()!); }}
        onAbrirNdv={(noId) => {
          const n = fluxoAtivo()?.nos.find((item) => item.id === noId);
          if (n) setNoSelecionado(n);
        }}
        onDuplicarNode={duplicarNode}
        onExcluirNode={excluirNode}
      />

      {/* Modais */}
      <ModalNovoWorkflow
        aberto={modalNovoFluxo}
        onClose={() => setModalNovoFluxo(false)}
        onCriarFluxo={salvarNovoFluxo}
        salvando={salvandoNovoFluxo}
      />

      <ModalExecutarWorkflow
        aberto={modalExecutar}
        fluxo={fluxoAtivo}
        executando={executando}
        onClose={() => setModalExecutar(false)}
        onExecutar={dispararExecucao}
      />
    </div>
  );
};

export default FluxosView;
