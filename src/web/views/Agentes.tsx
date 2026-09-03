import { type Component, createSignal, onMount, createEffect, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import {
  Play,
  Power,
  Copy,
  Bot,
  Search,
  RefreshCw,
  X,
  Shield,
  Wrench,
  Eye,
  Send,
  Users,
  Layers,
  Plus,
  Edit3,
  Trash2,
  Check,
  ArrowRight,
  Sparkles,
  Sliders,
  RotateCcw,
  MessageSquare,
  Clock,
  FileText,
  Wand2,
  Loader2,
} from "lucide-solid";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { showToast } from "../ui/Toast";
import { fetchApi } from "../lib/context";

export interface Agente {
  id: string;
  name?: string;
  role?: string;
  description?: string;
  model?: string;
  ativo?: boolean;
  system_prompt?: string;
  corpo_prompt?: string;
  tools?: string[];
  permissions?: "level-1" | "level-2" | "level-3";
  category?: string;
  harness?: string;
  harness_fallback?: string[];
  rotation?: string[];
  model_fallback?: string[];
}

export interface TeamPasso {
  agente: string;
  ordem: string;
}

export interface TeamSpec {
  id: string;
  titulo: string;
  padrao: "pipeline" | "fanout" | "review" | "debate";
  passos?: TeamPasso[];
  paralelos?: TeamPasso[];
  sintese?: TeamPasso;
  executor?: TeamPasso;
  revisor?: TeamPasso;
  turnos?: number;
  proponentes?: TeamPasso[];
  moderador?: { agente: string };
  max_mensagens_auto_h?: number;
  criado_em?: string;
}

export const MODELOS_DISPONIVEIS = [
  { id: "openrouter/google/gemini-3.8-flash", label: "⚡ Google Gemini 3.8 Flash (BYOK Custo $0) — Recomendado" },
  { id: "openrouter/nvidia/nemotron-3.5-lightning:free", label: "NVIDIA Nemotron 3.5 Lightning (Gratuito / Rápido)" },
  { id: "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free", label: "NVIDIA Nemotron 3 Ultra 550B (Gratuito / Robusto)" },
  { id: "openrouter/minimax/minimax-m3:free", label: "MiniMax M3 (Gratuito)" },
  { id: "openrouter/google/gemini-2.5-flash", label: "Google Gemini 2.5 Flash" },
  { id: "openrouter/anthropic/claude-3.5-haiku", label: "Anthropic Claude 3.5 Haiku" },
  { id: "opencode-go/glm-5.3-flash", label: "OpenCode-Go GLM 5.3 Flash" },
];

export const AgentesView: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [agentes, setAgentes] = createSignal<Agente[]>([]);
  const [teams, setTeams] = createSignal<TeamSpec[]>([]);
  const [filtroAba, setFiltroAba] = createSignal<"todos" | "agentes" | "grupos">("todos");
  const [busca, setBusca] = createSignal("");
  const [carregando, setCarregando] = createSignal(false);

  // Modelos Globais e Acesso do Workspace
  const [modeloPadraoGlobal, setModeloPadraoGlobal] = createSignal("openrouter/nvidia/nemotron-3.5-lightning:free");
  const [globalFullAccess, setGlobalFullAccess] = createSignal(false);

  // Modal de Execução de Agente ou Grupo
  const [alvoExecucao, setAlvoExecucao] = createSignal<{ tipo: "agente" | "grupo"; item: any } | null>(null);
  const [ordemTexto, setOrdemTexto] = createSignal("");
  const [disparando, setDisparando] = createSignal(false);

  // Modal de Inspeção e Edição de Agente
  const [agenteInspecionado, setAgenteInspecionado] = createSignal<Agente | null>(null);
  const [editandoAgente, setEditandoAgente] = createSignal(false);
  const [salvandoAgente, setSalvandoAgente] = createSignal(false);
  // Form de edição do Agente
  const [formAgenteRole, setFormAgenteRole] = createSignal("");
  const [formAgenteModelSelect, setFormAgenteModelSelect] = createSignal("");
  const [formAgenteModelCustom, setFormAgenteModelCustom] = createSignal("");
  const [formAgenteHarness, setFormAgenteHarness] = createSignal("");
  const [formAgenteRotation, setFormAgenteRotation] = createSignal("");
  const [formAgentePerm, setFormAgentePerm] = createSignal<"level-1" | "level-2" | "level-3">("level-2");
  const [formAgentePrompt, setFormAgentePrompt] = createSignal("");
  const [formAgenteAtivo, setFormAgenteAtivo] = createSignal(true);

  // Modal de Criação de Novo Agente
  const [modalCriarAgenteAberto, setModalCriarAgenteAberto] = createSignal(false);
  const [criarAbaAtiva, setCriarAbaAtiva] = createSignal<"ia" | "manual" | "clonar">("ia");
  const [criandoAgente, setCriandoAgente] = createSignal(false);
  const [novoAgenteId, setNovoAgenteId] = createSignal("");
  const [novoAgenteRole, setNovoAgenteRole] = createSignal("");
  const [novoAgenteModelSelect, setNovoAgenteModelSelect] = createSignal("");
  const [novoAgenteModelCustom, setNovoAgenteModelCustom] = createSignal("");
  const [novoAgentePerm, setNovoAgentePerm] = createSignal<"level-1" | "level-2" | "level-3">("level-2");
  const [novoAgentePromptManual, setNovoAgentePromptManual] = createSignal("");
  // IA Assistente
  const [iaDescricao, setIaDescricao] = createSignal("");
  const [iaPromptGerado, setIaPromptGerado] = createSignal("");
  const [gerandoPromptIA, setGerandoPromptIA] = createSignal(false);
  // Clonar
  const [clonarOrigem, setClonarOrigem] = createSignal("");

  // Modal de Criação / Edição de Grupo (Team)
  const [modalGrupoAberto, setModalGrupoAberto] = createSignal(false);
  const [salvandoGrupo, setSalvandoGrupo] = createSignal(false);
  const [grupoId, setGrupoId] = createSignal("");
  const [grupoTitulo, setGrupoTitulo] = createSignal("");
  const [grupoPadrao, setGrupoPadrao] = createSignal<"pipeline" | "fanout" | "review" | "debate">("pipeline");
  const [grupoTurnos, setGrupoTurnos] = createSignal(3);
  const [grupoMaxMsgs, setGrupoMaxMsgs] = createSignal(30);

  // Participantes do Grupo
  const [passosPipeline, setPassosPipeline] = createSignal<TeamPasso[]>([
    { agente: "", ordem: "Processar etapa inicial" },
    { agente: "", ordem: "Revisar e concluir" },
  ]);
  const [executorReview, setExecutorReview] = createSignal<TeamPasso>({ agente: "", ordem: "Criar rascunho completo" });
  const [revisorReview, setRevisorReview] = createSignal<TeamPasso>({ agente: "", ordem: "Avaliar critérios e aprovar ou devolver" });
  const [paralelosFanout, setParalelosFanout] = createSignal<TeamPasso[]>([
    { agente: "", ordem: "Análise técnica" },
    { agente: "", ordem: "Análise de impacto" },
  ]);
  const [sinteseFanout, setSinteseFanout] = createSignal<TeamPasso>({ agente: "", ordem: "Consolidar todas as análises em parecer único" });
  const [proponentesDebate, setProponentesDebate] = createSignal<TeamPasso[]>([
    { agente: "", ordem: "Defender proposta A" },
    { agente: "", ordem: "Apresentar contraponto B" },
  ]);
  const [moderadorDebate, setModeradorDebate] = createSignal("");

  const carregarTudo = async () => {
    try {
      setCarregando(true);
      const [listaAgentes, listaTeams, modInfo] = await Promise.all([
        fetchApi<Agente[]>("/agents").catch(() => []),
        fetchApi<TeamSpec[]>("/teams").catch(() => []),
        fetchApi<any>("/settings/modelos").catch(() => null),
      ]);
      setAgentes(listaAgentes || []);
      setTeams(listaTeams || []);
      if (modInfo?.default_model) setModeloPadraoGlobal(modInfo.default_model);
      if (modInfo?.global_full_access !== undefined) setGlobalFullAccess(Boolean(modInfo.global_full_access));

      if (listaAgentes && listaAgentes.length > 0) {
        const primId = listaAgentes[0].id;
        const segId = listaAgentes.length > 1 ? listaAgentes[1].id : primId;
        if (!passosPipeline()[0].agente) {
          setPassosPipeline([
            { agente: primId, ordem: "Processar etapa inicial da instrução" },
            { agente: segId, ordem: "Refinar e entregar resultado final" },
          ]);
        }
        if (!executorReview().agente) setExecutorReview({ agente: primId, ordem: "Criar conteúdo/código principal" });
        if (!revisorReview().agente) setRevisorReview({ agente: segId, ordem: "Auditar rigorosamente e aprovar ou solicitar ajustes" });
        if (!paralelosFanout()[0].agente) {
          setParalelosFanout([
            { agente: primId, ordem: "Perspectiva técnica e testes" },
            { agente: segId, ordem: "Perspectiva de negócio e usabilidade" },
          ]);
        }
        if (!sinteseFanout().agente) setSinteseFanout({ agente: primId, ordem: "Compilar síntese conclusiva" });
        if (!proponentesDebate()[0].agente) {
          setProponentesDebate([
            { agente: primId, ordem: "Argumentar tese principal" },
            { agente: segId, ordem: "Questionar premissas e propor alternativas" },
          ]);
        }
        if (!moderadorDebate()) setModeradorDebate(listaAgentes[0].id);
      }
    } catch (e: any) {
      showToast("Erro ao carregar dados: " + (e.message || e), "erro");
    } finally {
      setCarregando(false);
    }
  };

  onMount(() => {
    void carregarTudo();
  });

  const abrirInspecaoAgente = async (ag: Agente) => {
    try {
      setEditandoAgente(false);
      // Carrega detalhe completo do agente (incluindo corpo_prompt)
      const detalhe = await fetchApi<Agente>(`/agents/${encodeURIComponent(ag.id)}`);
      const completo = { ...ag, ...detalhe };
      setAgenteInspecionado(completo);
      setFormAgenteRole(completo.role || completo.description || "");

      const m = completo.model || "";
      const ehSugerido = MODELOS_DISPONIVEIS.some((item) => item.id === m);
      if (!m || m === "padrao" || m === "default" || m === modeloPadraoGlobal()) {
        setFormAgenteModelSelect("");
        setFormAgenteModelCustom("");
      } else if (ehSugerido) {
        setFormAgenteModelSelect(m);
        setFormAgenteModelCustom("");
      } else {
        setFormAgenteModelSelect("__custom__");
        setFormAgenteModelCustom(m);
      }

      setFormAgentePerm(completo.permissions || "level-2");
      setFormAgentePrompt(completo.corpo_prompt || completo.system_prompt || "");
      setFormAgenteAtivo(completo.ativo !== false);
      setFormAgenteHarness(completo.harness || "");
      const rot = completo.rotation || completo.model_fallback || [];
      setFormAgenteRotation(Array.isArray(rot) ? rot.join("\n") : "");
    } catch (err: any) {
      showToast("Erro ao carregar detalhes do agente: " + err.message, "erro");
    }
  };

  const salvarEdicaoAgente = async () => {
    const ag = agenteInspecionado();
    if (!ag) return;
    setSalvandoAgente(true);

    const modelFinal = formAgenteModelSelect() === "__custom__"
      ? formAgenteModelCustom().trim()
      : (formAgenteModelSelect().trim() || modeloPadraoGlobal());

    const rotLista = formAgenteRotation()
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await fetchApi(`/agents/${encodeURIComponent(ag.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          role: formAgenteRole().trim(),
          model: modelFinal,
          permissions: formAgentePerm(),
          ativo: formAgenteAtivo(),
          corpo_prompt: formAgentePrompt(),
          harness: formAgenteHarness().trim() || undefined,
          rotation: rotLista.length > 0 ? rotLista : undefined,
        }),
      });

      showToast(`Agente @${ag.id} atualizado com sucesso!`, "sucesso");
      setEditandoAgente(false);
      await carregarTudo();
      await abrirInspecaoAgente(ag);
    } catch (err: any) {
      showToast(`Erro ao salvar agente: ${err.message}`, "erro");
    } finally {
      setSalvandoAgente(false);
    }
  };

  const toggleAtivo = async (agente: Agente) => {
    const novoStatus = !(agente.ativo !== false);
    try {
      await fetchApi(`/agents/${encodeURIComponent(agente.id)}`, {
        method: "PUT",
        body: JSON.stringify({ ativo: novoStatus }),
      });
      setAgentes((prev) =>
        prev.map((a) => (a.id === agente.id ? { ...a, ativo: novoStatus } : a))
      );
      showToast(`${agente.name || agente.id} ${novoStatus ? "ativado" : "desativado"}`, "info");
    } catch (err: any) {
      showToast("Erro ao alterar status: " + err.message, "erro");
    }
  };

  const excluirAgente = async (id: string, nome?: string) => {
    if (!confirm(`Tem certeza que deseja excluir o agente @${id} (${nome || id})? Esta ação removerá a especificação do agente.`)) return;
    try {
      await fetchApi(`/agents/${encodeURIComponent(id)}`, { method: "DELETE" });
      setAgentes((prev) => prev.filter((a) => a.id !== id));
      if (agenteInspecionado()?.id === id) {
        setAgenteInspecionado(null);
      }
      showToast(`Agente @${id} excluído com sucesso!`, "sucesso");
    } catch (err: any) {
      showToast(`Erro ao excluir agente: ${err.message}`, "erro");
    }
  };

  const dispararExecucao = async () => {
    const alvo = alvoExecucao();
    const texto = ordemTexto().trim();
    if (!alvo || !texto) return;
    setDisparando(true);

    try {
      if (alvo.tipo === "agente") {
        await fetchApi(`/agents/${encodeURIComponent(alvo.item.id)}/run`, {
          method: "POST",
          body: JSON.stringify({ ordem: texto }),
        });
        showToast(`Execução de @${alvo.item.id} iniciada!`, "sucesso");
      } else {
        await fetchApi(`/teams/${encodeURIComponent(alvo.item.id)}/run`, {
          method: "POST",
          body: JSON.stringify({ entrada: texto }),
        });
        showToast(`Execução do grupo "${alvo.item.titulo || alvo.item.id}" iniciada!`, "sucesso");
      }
      setAlvoExecucao(null);
    } catch (err: any) {
      showToast(`Erro na execução: ${err.message}`, "erro");
    } finally {
      setDisparando(false);
    }
  };

  const salvarNovoGrupo = async () => {
    const id = grupoId().trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const titulo = grupoTitulo().trim();
    const padrao = grupoPadrao();

    if (!id || !titulo) {
      showToast("Preencha o ID e o título do grupo", "aviso");
      return;
    }

    setSalvandoGrupo(true);

    try {
      const payload: any = {
        id,
        titulo,
        padrao,
        max_mensagens_auto_h: grupoMaxMsgs(),
      };

      if (padrao === "pipeline") {
        const p = passosPipeline().filter((x) => x.agente.trim());
        if (p.length < 1) throw new Error("Adicione pelo menos 1 passo no pipeline");
        payload.passos = p;
      } else if (padrao === "fanout") {
        const par = paralelosFanout().filter((x) => x.agente.trim());
        if (par.length < 2) throw new Error("Fanout requer pelo menos 2 agentes paralelos");
        payload.paralelos = par;
        payload.sintese = sinteseFanout();
      } else if (padrao === "review") {
        if (!executorReview().agente || !revisorReview().agente) {
          throw new Error("Defina o agente executor e o revisor");
        }
        payload.executor = executorReview();
        payload.revisor = revisorReview();
        payload.turnos = grupoTurnos();
      } else if (padrao === "debate") {
        const prop = proponentesDebate().filter((x) => x.agente.trim());
        if (prop.length < 2 || !moderadorDebate()) {
          throw new Error("Debate requer 2 debatedores e 1 moderador");
        }
        payload.proponentes = prop;
        payload.moderador = { agente: moderadorDebate() };
        payload.turnos = grupoTurnos();
      }

      await fetchApi("/teams", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      showToast(`Grupo "${titulo}" criado com sucesso!`, "sucesso");
      setModalGrupoAberto(false);
      await carregarTudo();
    } catch (err: any) {
      showToast(`Erro ao criar grupo: ${err.message}`, "erro");
    } finally {
      setSalvandoGrupo(false);
    }
  };

  const excluirGrupo = async (id: string) => {
    if (!confirm(`Tem certeza que deseja excluir o grupo "${id}"?`)) return;
    try {
      await fetchApi(`/teams/${encodeURIComponent(id)}`, { method: "DELETE" });
      setTeams((prev) => prev.filter((t) => t.id !== id));
      showToast("Grupo excluído com sucesso", "sucesso");
    } catch (err: any) {
      showToast(`Erro ao excluir grupo: ${err.message}`, "erro");
    }
  };

  const resetarModalCriar = () => {
    setNovoAgenteId("");
    setNovoAgenteRole("");
    setNovoAgenteModelSelect("");
    setNovoAgenteModelCustom("");
    setNovoAgentePerm("level-2");
    setNovoAgentePromptManual("");
    setIaDescricao("");
    setIaPromptGerado("");
    setClonarOrigem(agentes().length > 0 ? agentes()[0].id : "");
    setCriarAbaAtiva("ia");
  };

  const abrirModalCriar = () => {
    resetarModalCriar();
    setModalCriarAgenteAberto(true);
  };

  const abrirModalClonar = (agenteOrigem: Agente) => {
    resetarModalCriar();
    setCriarAbaAtiva("clonar");
    setClonarOrigem(agenteOrigem.id);
    setNovoAgenteId(agenteOrigem.id + "-copia");
    setNovoAgenteRole(agenteOrigem.role || agenteOrigem.description || "");

    const m = agenteOrigem.model || "";
    const ehSugerido = MODELOS_DISPONIVEIS.some((item) => item.id === m);
    if (!m || m === "padrao" || m === "default" || m === modeloPadraoGlobal()) {
      setNovoAgenteModelSelect("");
      setNovoAgenteModelCustom("");
    } else if (ehSugerido) {
      setNovoAgenteModelSelect(m);
      setNovoAgenteModelCustom("");
    } else {
      setNovoAgenteModelSelect("__custom__");
      setNovoAgenteModelCustom(m);
    }

    setNovoAgentePerm(agenteOrigem.permissions || "level-2");
    setModalCriarAgenteAberto(true);
  };

  const gerarPromptViaIA = async () => {
    const desc = iaDescricao().trim();
    if (!desc) {
      showToast("Descreva o que o agente deve fazer.", "aviso");
      return;
    }
    setGerandoPromptIA(true);
    try {
      const modelAlvo = novoAgenteModelSelect() === "__custom__"
        ? novoAgenteModelCustom().trim()
        : (novoAgenteModelSelect().trim() || modeloPadraoGlobal());

      const res = await fetchApi<{ prompt: string; modelo: string }>("/agents/gerar-prompt", {
        method: "POST",
        body: JSON.stringify({
          descricao: desc,
          modelo: modelAlvo,
        }),
      });

      if (res && res.prompt) {
        setIaPromptGerado(res.prompt);
        showToast(`System Prompt profissional gerado por IA (${res.modelo || "modelo padrão"})!`, "sucesso");
      } else {
        throw new Error("Resposta inválida da IA");
      }
    } catch (err: any) {
      showToast("Falha na chamada da IA: " + (err.message || err) + " — usando gerador estruturado", "aviso");
      setIaPromptGerado(gerarPromptLocal(desc));
    } finally {
      setGerandoPromptIA(false);
    }
  };

  // Gerador local de prompt estruturado a partir da descrição do usuário
  const gerarPromptLocal = (descricao: string): string => {
    const linhas: string[] = [];
    linhas.push(`# System Prompt: ${descricao.split("\n")[0]?.slice(0, 60) || "Agente Especialista"}\n`);
    linhas.push(`## Papel & Missão Principal`);
    linhas.push(`Você é um agente especialista autônomo com a seguinte missão: ${descricao}\n`);
    linhas.push(`## Regras de Comportamento`);
    linhas.push(`1. Sempre responda de forma clara, objetiva e profissional.`);
    linhas.push(`2. Use linguagem técnica quando apropriado, mas mantenha acessibilidade.`);
    linhas.push(`3. Estruture suas respostas com seções, listas e exemplos quando relevante.`);
    linhas.push(`4. Nunca invente informações — quando não tiver certeza, informe.`);
    linhas.push(`5. Priorize precisão sobre velocidade.\n`);
    linhas.push(`## Formato de Resposta`);
    linhas.push(`- Use markdown para estruturar as respostas`);
    linhas.push(`- Inclua cabeçalhos para seções longas`);
    linhas.push(`- Use listas numeradas para passos sequenciais`);
    linhas.push(`- Use blocos de código quando mostrar exemplos técnicos\n`);
    linhas.push(`## Contexto de Trabalho`);
    linhas.push(`Você opera dentro do workspace do OpenCorp e tem acesso aos registros,`);
    linhas.push(`documentos e ferramentas disponíveis no ambiente. Utilize-os sempre que`);
    linhas.push(`necessário para produzir resultados de alta qualidade.\n`);
    linhas.push(`## Restrições & Segurança`);
    linhas.push(`- Não execute ações destrutivas sem confirmação`);
    linhas.push(`- Respeite os limites operacionais configurados`);
    return linhas.join("\n");
  };

  const criarNovoAgente = async () => {
    const id = novoAgenteId().trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!id) {
      showToast("Informe o ID do agente (slug kebab-case).", "aviso");
      return;
    }

    const aba = criarAbaAtiva();
    let corpo_prompt = "";
    let from: string | undefined;

    if (aba === "ia") {
      corpo_prompt = iaPromptGerado().trim();
      if (!corpo_prompt) {
        showToast("Gere o prompt primeiro clicando em 'Gerar System Prompt com IA'.", "aviso");
        return;
      }
    } else if (aba === "manual") {
      corpo_prompt = novoAgentePromptManual().trim();
      if (!corpo_prompt) {
        showToast("Escreva o System Prompt do agente.", "aviso");
        return;
      }
    } else if (aba === "clonar") {
      from = clonarOrigem();
      if (!from) {
        showToast("Selecione o agente de origem para clonar.", "aviso");
        return;
      }
    }

    const modelFinal = novoAgenteModelSelect() === "__custom__"
      ? novoAgenteModelCustom().trim()
      : (novoAgenteModelSelect().trim() || modeloPadraoGlobal());

    setCriandoAgente(true);
    try {
      await fetchApi("/agents", {
        method: "POST",
        body: JSON.stringify({
          id,
          from,
          model: modelFinal,
          role: novoAgenteRole().trim() || undefined,
          corpo_prompt: corpo_prompt || undefined,
          permissions: novoAgentePerm(),
          ativo: true,
        }),
      });
      showToast(`Agente @${id} criado com sucesso!`, "sucesso");
      setModalCriarAgenteAberto(false);
      await carregarTudo();
    } catch (err: any) {
      showToast(`Erro ao criar agente: ${err.message}`, "erro");
    } finally {
      setCriandoAgente(false);
    }
  };

  const agentesFiltrados = () => {
    const q = busca().toLowerCase().trim();
    if (!q) return agentes();
    return agentes().filter(
      (a) =>
        a.id.toLowerCase().includes(q) ||
        (a.role || a.description || "").toLowerCase().includes(q) ||
        (a.model || "").toLowerCase().includes(q)
    );
  };

  const teamsFiltrados = () => {
    const q = busca().toLowerCase().trim();
    if (!q) return teams();
    return teams().filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        t.titulo.toLowerCase().includes(q) ||
        t.padrao.toLowerCase().includes(q)
    );
  };

  return (
    <div class="flex flex-col h-full w-full overflow-hidden p-4 sm:p-6 space-y-4 bg-zinc-950 text-zinc-100">
      {/* Topbar do Catálogo */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800 flex-shrink-0">
        <div>
          <div class="flex items-center gap-2.5">
            <h1 class="text-xl font-bold text-zinc-100 tracking-tight">Catálogo de Agentes & Grupos</h1>
            <span class="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 font-bold">
              {agentes().filter((a) => a.ativo !== false).length} agentes · {teams().length} grupos
            </span>
          </div>
          <p class="text-xs text-zinc-400 mt-0.5">
            Especialistas autônomos e grupos multi-agente para orquestração em pipeline, loop ou debate.
          </p>
        </div>

        <div class="flex items-center gap-2.5 flex-wrap">
          {/* Busca */}
          <div class="relative">
            <Search size={13} class="text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar agente ou grupo..."
              value={busca()}
              onInput={(e) => setBusca(e.currentTarget.value)}
              class="bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 w-52 sm:w-64"
            />
          </div>

          <Button size="sm" variant="primary" onClick={abrirModalCriar}>
            <Plus size={14} class="mr-1.5" /> + Novo Agente
          </Button>

          <Button size="sm" variant="secondary" onClick={() => setModalGrupoAberto(true)}>
            <Users size={14} class="mr-1.5 text-purple-400" /> + Novo Grupo
          </Button>

          <Button size="sm" variant="ghost" onClick={carregarTudo} title="Recarregar">
            <RefreshCw size={13} class={carregando() ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {/* Abas de Navegação (Todos | Agentes | Grupos) */}
      <div class="flex items-center gap-1.5 p-1 bg-zinc-900/60 border border-zinc-800/80 rounded-xl w-fit text-xs flex-shrink-0">
        <button
          type="button"
          onClick={() => setFiltroAba("todos")}
          class={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer font-medium ${
            filtroAba() === "todos"
              ? "!bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 shadow-xs"
              : "!bg-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Todos ({agentes().length + teams().length})
        </button>
        <button
          type="button"
          onClick={() => setFiltroAba("agentes")}
          class={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer font-medium flex items-center gap-1.5 ${
            filtroAba() === "agentes"
              ? "!bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 shadow-xs"
              : "!bg-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Bot size={13} />
          <span>Agentes Individuais ({agentes().length})</span>
        </button>
        <button
          type="button"
          onClick={() => setFiltroAba("grupos")}
          class={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer font-medium flex items-center gap-1.5 ${
            filtroAba() === "grupos"
              ? "!bg-purple-950/80 text-purple-300 border border-purple-500/50 shadow-xs"
              : "!bg-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Users size={13} />
          <span>Grupos de Agentes / Teams ({teams().length})</span>
        </button>
      </div>

      {/* LISTAGEM VERTICAL 100% WIDTH (Um em cima do outro) */}
      <div class="flex-1 overflow-y-auto pr-1 scrollbar-thin">
        <div class="flex flex-col space-y-3 w-full pb-8">
          {/* SEÇÃO DE GRUPOS DE AGENTES (TEAMS) */}
          <Show when={filtroAba() === "todos" || filtroAba() === "grupos"}>
            <For each={teamsFiltrados()}>
              {(grupo) => {
                const participantes = () => {
                  if (grupo.padrao === "pipeline") return grupo.passos?.map((p) => `@${p.agente}`) || [];
                  if (grupo.padrao === "fanout") return [...(grupo.paralelos?.map((p) => `@${p.agente}`) || []), `@${grupo.sintese?.agente} (síntese)`];
                  if (grupo.padrao === "review") return [`@${grupo.executor?.agente} (executor)`, `@${grupo.revisor?.agente} (revisor)`];
                  if (grupo.padrao === "debate") return [...(grupo.proponentes?.map((p) => `@${p.agente}`) || []), `@${grupo.moderador?.agente} (moderador)`];
                  return [];
                };

                const badgePadrao = () => {
                  switch (grupo.padrao) {
                    case "pipeline": return { rotulo: "PIPELINE SEQUENCIAL", cor: "bg-blue-950/70 border-blue-800/80 text-blue-300" };
                    case "fanout": return { rotulo: "SIMULTÂNEO / FANOUT", cor: "bg-purple-950/70 border-purple-800/80 text-purple-300" };
                    case "review": return { rotulo: "LOOP DE REVISÃO", cor: "bg-amber-950/70 border-amber-800/80 text-amber-300" };
                    case "debate": return { rotulo: "DEBATE MULTI-AGENTE", cor: "bg-emerald-950/70 border-emerald-800/80 text-emerald-300" };
                  }
                };

                return (
                  <div class="w-full p-4 rounded-xl border bg-purple-950/15 border-purple-900/40 hover:border-purple-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all shadow-xs group">
                    <div class="flex items-start gap-3.5 min-w-0 flex-1">
                      <div class="h-10 w-10 rounded-xl bg-purple-950/80 border border-purple-500/40 flex items-center justify-center text-purple-300 flex-shrink-0 shadow-sm">
                        <Users size={20} />
                      </div>
                      <div class="space-y-1 min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class={`text-[9px] font-mono px-2 py-0.5 rounded border uppercase font-bold ${badgePadrao().cor}`}>
                            {badgePadrao().rotulo}
                          </span>
                          <h2 class="text-sm font-bold text-zinc-100 truncate">{grupo.titulo}</h2>
                          <span class="text-xs text-purple-400 font-mono font-semibold">team:{grupo.id}</span>
                        </div>

                        {/* Participantes */}
                        <div class="flex items-center gap-1.5 text-xs text-zinc-300 flex-wrap pt-0.5">
                          <span class="text-zinc-500 text-[11px] font-medium">Agentes:</span>
                          <For each={participantes()}>
                            {(p, idx) => (
                              <span class="font-mono text-[11px] bg-zinc-900/90 text-zinc-300 px-2 py-0.5 rounded border border-zinc-800">
                                {p}
                              </span>
                            )}
                          </For>
                          <Show when={grupo.turnos}>
                            <span class="text-[10px] text-zinc-500 font-mono">
                              · máx {grupo.turnos} rodadas
                            </span>
                          </Show>
                        </div>
                      </div>
                    </div>

                    {/* Ações do Grupo */}
                    <div class="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                      <Button
                        size="xs"
                        variant="primary"
                        class="bg-purple-600 hover:bg-purple-500 text-white font-semibold"
                        onClick={() => {
                          setAlvoExecucao({ tipo: "grupo", item: grupo });
                          setOrdemTexto("");
                        }}
                      >
                        <Play size={11} class="mr-1 fill-current" /> Executar Grupo
                      </Button>

                      <IconButton
                        size="xs"
                        variant="ghost"
                        class="text-zinc-500 hover:text-rose-400"
                        onClick={() => excluirGrupo(grupo.id)}
                        title="Excluir Grupo"
                      >
                        <Trash2 size={13} />
                      </IconButton>
                    </div>
                  </div>
                );
              }}
            </For>
          </Show>

          {/* SEÇÃO DE AGENTES INDIVIDUAIS */}
          <Show when={filtroAba() === "todos" || filtroAba() === "agentes"}>
            <For each={agentesFiltrados()}>
              {(agente) => {
                const ativo = agente.ativo !== false;

                return (
                  <div
                    class={`w-full p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all shadow-xs ${
                      ativo
                        ? "bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700"
                        : "bg-zinc-950/40 border-zinc-900 opacity-60 hover:opacity-80"
                    }`}
                  >
                    {/* Informações Principais do Agente */}
                    <div class="flex items-start gap-3.5 min-w-0 flex-1">
                      <div
                        class={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm ${
                          ativo
                            ? "bg-emerald-950/70 border border-emerald-500/40 text-emerald-300"
                            : "bg-zinc-800 text-zinc-500"
                        }`}
                      >
                        <Bot size={20} />
                      </div>

                      <div class="space-y-1 min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                          <h2 class="text-sm font-bold text-zinc-100 truncate">
                            {agente.name || agente.id}
                          </h2>
                          <span class="text-xs text-emerald-400 font-mono font-semibold">@{agente.id}</span>
                          <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                            {agente.permissions || "level-2"}
                          </span>
                        </div>

                        {/* Descrição / Papel */}
                        <p class="text-xs text-zinc-300 line-clamp-2 leading-relaxed">
                          {agente.role || agente.description || "Agente especialista autônomo do workspace."}
                        </p>

                        {/* Modelo LLM */}
                        <div class="text-[11px] text-zinc-500 font-mono flex items-center gap-1.5 pt-0.5">
                          <span class="text-zinc-500">Modelo:</span>
                          <span class="text-zinc-400 font-semibold">{agente.model || "openrouter/nvidia/nemotron-3.5-lightning:free"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Ações e Controles à Direita */}
                    <div class="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                      <button
                        onClick={() => toggleAtivo(agente)}
                        class={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer ${
                          ativo
                            ? "bg-emerald-950/40 border-emerald-800 text-emerald-400 hover:bg-emerald-900/50"
                            : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                        }`}
                        title={ativo ? "Desativar agente" : "Ativar agente"}
                      >
                        <Power size={11} />
                        <span>{ativo ? "Ativo" : "Inativo"}</span>
                      </button>

                      <Button
                        size="xs"
                        variant="secondary"
                        class="border-zinc-800 text-zinc-300"
                        onClick={() => abrirInspecaoAgente(agente)}
                      >
                        <Eye size={12} class="mr-1" /> Inspecionar / Editar
                      </Button>

                      <IconButton
                        size="xs"
                        variant="ghost"
                        class="text-zinc-500 hover:text-purple-400"
                        onClick={() => abrirModalClonar(agente)}
                        title="Clonar este agente"
                      >
                        <Copy size={13} />
                      </IconButton>

                      <IconButton
                        size="xs"
                        variant="ghost"
                        class="text-zinc-500 hover:text-rose-400"
                        onClick={() => excluirAgente(agente.id, agente.name)}
                        title="Excluir este agente"
                      >
                        <Trash2 size={13} />
                      </IconButton>

                      <Button
                        size="xs"
                        variant="primary"
                        disabled={!ativo}
                        onClick={() => {
                          setAlvoExecucao({ tipo: "agente", item: agente });
                          setOrdemTexto("");
                        }}
                      >
                        <Play size={11} class="mr-1 fill-current" /> Executar
                      </Button>
                    </div>
                  </div>
                );
              }}
            </For>
          </Show>
        </div>
      </div>

      {/* MODAL DE EXECUÇÃO DIRETA (Agente ou Grupo) */}
      <Show when={alvoExecucao()}>
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 class="text-sm font-bold text-zinc-100">
                  Executar {alvoExecucao()!.tipo === "agente" ? `@${alvoExecucao()!.item.id}` : `Grupo "${alvoExecucao()!.item.titulo}"`}
                </h2>
                <span class="text-[11px] text-zinc-400 mt-0.5">
                  Insira a instrução inicial a ser processada.
                </span>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setAlvoExecucao(null)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-semibold text-zinc-300">
                Instrução de Entrada / Tarefa *
              </label>
              <textarea
                rows={4}
                placeholder="Descreva detalhadamente o objetivo a ser executado..."
                value={ordemTexto()}
                onInput={(e) => setOrdemTexto(e.currentTarget.value)}
                class="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 resize-none font-mono"
              />
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAlvoExecucao(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={disparando()}
                onClick={dispararExecucao}
              >
                <Send size={12} class="mr-1.5" /> Disparar Execução
              </Button>
            </div>
          </div>
        </div>
      </Show>

      {/* MODAL DE INSPEÇÃO & EDIÇÃO DO AGENTE */}
      <Show when={agenteInspecionado()}>
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-3xl w-full p-5 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3 flex-shrink-0">
              <div class="flex items-center gap-2.5">
                <div class="h-8 w-8 rounded-lg bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Bot size={18} />
                </div>
                <div>
                  <h2 class="text-sm font-bold text-zinc-100">
                    Especificação do Agente: @{agenteInspecionado()!.id}
                  </h2>
                  <span class="text-[11px] text-emerald-400 font-mono">
                    {agenteInspecionado()!.name || agenteInspecionado()!.id}
                  </span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <Button
                  size="xs"
                  variant={editandoAgente() ? "secondary" : "primary"}
                  onClick={() => setEditandoAgente(!editandoAgente())}
                >
                  <Edit3 size={12} class="mr-1" />
                  {editandoAgente() ? "Visualizar Leitura" : "Editar Agente"}
                </Button>
                <IconButton size="xs" variant="ghost" onClick={() => setAgenteInspecionado(null)}>
                  <X size={16} />
                </IconButton>
              </div>
            </div>

            {/* CONTEÚDO: MODO VISUALIZAÇÃO OU MODO EDIÇÃO */}
            <div class="space-y-4 text-xs overflow-y-auto pr-1 scrollbar-thin flex-1">
              <Show
                when={editandoAgente()}
                fallback={
                  /* MODO LEITURA */
                  <div class="space-y-4">
                    <div>
                      <span class="text-zinc-500 block text-[10px] uppercase font-bold mb-1">
                        Descrição do Papel / Role
                      </span>
                      <p class="text-zinc-200 leading-relaxed bg-zinc-950 p-3 rounded-xl border border-zinc-800 font-medium">
                        {agenteInspecionado()!.role || agenteInspecionado()!.description || "Sem descrição informada."}
                      </p>
                    </div>

                    <div>
                      <span class="text-zinc-500 block text-[10px] uppercase font-bold mb-1">
                        System Prompt (Instruções de Personalidade, Regras e Comportamento)
                      </span>
                      <pre class="bg-[#0c0e12] p-4 rounded-xl border border-zinc-800 text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto scrollbar-thin selection:bg-emerald-950 selection:text-emerald-300">
                        {agenteInspecionado()!.corpo_prompt || agenteInspecionado()!.system_prompt || "Instruções carregadas a partir de .opencorp/agents/"}
                      </pre>
                    </div>

                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div class="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                        <span class="text-zinc-500 block text-[10px] uppercase font-bold mb-0.5">Modelo LLM</span>
                        <span class="font-mono text-emerald-400 font-semibold text-xs truncate block">
                          {agenteInspecionado()!.model || "Padrão do Sistema"}
                        </span>
                      </div>
                      <div class="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                        <span class="text-zinc-500 block text-[10px] uppercase font-bold mb-0.5">Motor / Harness</span>
                        <span class="font-mono text-cyan-400 font-semibold text-xs truncate block">
                          {agenteInspecionado()!.harness || "opencode (Padrão)"}
                        </span>
                      </div>
                      <div class="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                        <span class="text-zinc-500 block text-[10px] uppercase font-bold mb-0.5">Permissões</span>
                        <span class="font-mono text-zinc-200 font-semibold text-xs">{agenteInspecionado()!.permissions || "level-2"}</span>
                      </div>
                      <div class="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                        <span class="text-zinc-500 block text-[10px] uppercase font-bold mb-0.5">Status</span>
                        <span class={`font-semibold text-xs ${agenteInspecionado()!.ativo !== false ? "text-emerald-400" : "text-zinc-500"}`}>
                          {agenteInspecionado()!.ativo !== false ? "🟢 Ativo" : "⚪ Desativado"}
                        </span>
                      </div>
                    </div>

                    <Show when={agenteInspecionado()!.rotation && agenteInspecionado()!.rotation!.length > 0}>
                      <div class="bg-zinc-950 p-3 rounded-xl border border-zinc-800 space-y-1">
                        <span class="text-zinc-500 block text-[10px] uppercase font-bold">
                          Rotação & Fallback Customizado deste Agente:
                        </span>
                        <div class="flex flex-wrap gap-1.5 pt-0.5">
                          <For each={agenteInspecionado()!.rotation!}>
                            {(rotMod) => (
                              <span class="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-purple-300">
                                {rotMod}
                              </span>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </div>
                }
              >
                {/* MODO FORMULÁRIO DE EDIÇÃO */}
                <div class="space-y-4">
                  <div>
                    <label class="block text-zinc-400 font-semibold mb-1">Papel / Descrição da Função *</label>
                    <input
                      type="text"
                      value={formAgenteRole()}
                      onInput={(e) => setFormAgenteRole(e.currentTarget.value)}
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div class="flex items-center justify-between mb-1">
                        <label class="block text-zinc-400 font-semibold">Modelo de IA *</label>
                        <Show when={formAgenteModelSelect() || formAgenteModelCustom()}>
                          <button
                            type="button"
                            class="text-[10px] text-cyan-400 hover:underline"
                            onClick={() => {
                              setFormAgenteModelSelect("");
                              setFormAgenteModelCustom("");
                            }}
                          >
                            Usar Padrão Global
                          </button>
                        </Show>
                      </div>
                      <select
                        value={formAgenteModelSelect()}
                        onChange={(e) => setFormAgenteModelSelect(e.currentTarget.value)}
                        class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="">
                          (Padrão do Sistema: {modeloPadraoGlobal().replace("openrouter/", "")})
                        </option>
                        <For each={MODELOS_DISPONIVEIS}>
                          {(item) => <option value={item.id}>{item.label}</option>}
                        </For>
                        <option value="__custom__">Outro / Personalizado (Digitar Manual)</option>
                      </select>

                      <Show when={formAgenteModelSelect() === "__custom__"}>
                        <input
                          type="text"
                          placeholder="provedor/modelo (ex: openrouter/google/gemini-2.5-flash)"
                          value={formAgenteModelCustom()}
                          onInput={(e) => setFormAgenteModelCustom(e.currentTarget.value)}
                          class="w-full mt-2 bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </Show>
                    </div>

                    <div>
                      <label class="block text-zinc-400 font-semibold mb-1">Nível de Permissão</label>
                      <select
                        value={formAgentePerm()}
                        onChange={(e) => setFormAgentePerm(e.currentTarget.value as any)}
                        class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="level-1">Level 1 — Somente Leitura (Sem Bash)</option>
                        <option value="level-2">Level 2 — Execução Padrão (Bash + Edição)</option>
                        <option value="level-3">Level 3 — Acesso Total (Web + Ferramentas)</option>
                      </select>

                      <Show when={globalFullAccess()}>
                        <span class="text-[10px] text-amber-400 flex items-center gap-1 mt-1 font-medium leading-tight">
                          <Shield size={11} class="shrink-0" />
                          Acesso Total Global ativo nas Configurações — sem restrição.
                        </span>
                      </Show>
                    </div>
                  </div>

                  {/* SEÇÃO AVANÇADA: MOTOR (HARNESS) & ROTAÇÃO PRÓPRIA */}
                  <div class="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                        <Cpu size={13} class="text-cyan-400" />
                        Motor de Execução (Harness) & Rotação deste Agente
                      </span>
                      <button
                        type="button"
                        class="text-[10px] text-zinc-400 hover:text-zinc-200"
                        onClick={() => {
                          setFormAgenteHarness("");
                          setFormAgenteRotation("");
                        }}
                      >
                        Limpar Overrides
                      </button>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label class="block text-[11px] font-medium text-zinc-400 mb-1">Motor / Runner</label>
                        <select
                          value={formAgenteHarness()}
                          onChange={(e) => setFormAgenteHarness(e.currentTarget.value)}
                          class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-cyan-500"
                        >
                          <option value="">(Padrão do Sistema: OpenCode)</option>
                          <option value="opencode">OpenCode Runtime</option>
                          <option value="claude-code">Claude Code CLI (Em breve)</option>
                          <option value="antigravity">Google Antigravity (Em breve)</option>
                        </select>
                      </div>

                      <div>
                        <label class="block text-[11px] font-medium text-zinc-400 mb-1">
                          Rotação Customizada (1 por linha)
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Deixe vazio para herdar a rotação do workspace"
                          value={formAgenteRotation()}
                          onInput={(e) => setFormAgenteRotation(e.currentTarget.value)}
                          class="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-purple-500 leading-tight scrollbar-thin"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label class="block text-zinc-400 font-semibold mb-1">
                      System Prompt Completo (Instruções & Regras do Agente) *
                    </label>
                    <textarea
                      rows={10}
                      value={formAgentePrompt()}
                      onInput={(e) => setFormAgentePrompt(e.currentTarget.value)}
                      class="w-full bg-[#0c0e12] border border-zinc-800 rounded-xl p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500 leading-relaxed scrollbar-thin"
                    />
                  </div>

                  <div class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="check-ativo"
                      checked={formAgenteAtivo()}
                      onChange={(e) => setFormAgenteAtivo(e.currentTarget.checked)}
                      class="rounded bg-zinc-950 border-zinc-700 cursor-pointer"
                    />
                    <label for="check-ativo" class="text-xs text-zinc-300 font-medium cursor-pointer">
                      Agente ativo e habilitado para execuções
                    </label>
                  </div>
                </div>
              </Show>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex items-center justify-between gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="ghost"
                class="text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 font-mono text-xs"
                onClick={() => excluirAgente(agenteInspecionado()!.id, agenteInspecionado()!.name)}
              >
                <Trash2 size={13} class="mr-1.5" /> Excluir Agente
              </Button>
              <div class="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setAgenteInspecionado(null)}>
                  Fechar
                </Button>
                <Show when={editandoAgente()}>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={salvandoAgente()}
                    onClick={salvarEdicaoAgente}
                  >
                    <Check size={13} class="mr-1.5" /> Salvar Alterações
                  </Button>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* MODAL DE CRIAÇÃO DE NOVO GRUPO (TEAM MULTI-AGENTE) */}
      <Show when={modalGrupoAberto()}>
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3 flex-shrink-0">
              <div class="flex items-center gap-2.5">
                <div class="h-8 w-8 rounded-lg bg-purple-950 border border-purple-500/40 flex items-center justify-center text-purple-400">
                  <Users size={18} />
                </div>
                <div>
                  <h2 class="text-sm font-bold text-zinc-100">Criar Novo Grupo Multi-Agente</h2>
                  <span class="text-[11px] text-zinc-400">
                    Defina o padrão de interação e encerramento entre os agentes.
                  </span>
                </div>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setModalGrupoAberto(false)}>
                <X size={16} />
              </IconButton>
            </div>

            <div class="space-y-4 text-xs overflow-y-auto pr-1 scrollbar-thin flex-1">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-zinc-400 font-semibold mb-1">ID do Grupo (slug kebab-case) *</label>
                  <input
                    type="text"
                    placeholder="ex: time-editorial-critico"
                    value={grupoId()}
                    onInput={(e) => setGrupoId(e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label class="block text-zinc-400 font-semibold mb-1">Nome / Título do Grupo *</label>
                  <input
                    type="text"
                    placeholder="ex: Comitê de Produção e Revisão"
                    value={grupoTitulo()}
                    onInput={(e) => setGrupoTitulo(e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* SELEÇÃO DO PADRÃO DE INTERAÇÃO */}
              <div>
                <label class="block text-zinc-400 font-semibold mb-2">
                  Padrão de Execução / Ordem de Conversa *
                </label>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setGrupoPadrao("pipeline")}
                    class={`p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-start min-h-[76px] ${
                      grupoPadrao() === "pipeline"
                        ? "bg-blue-950/60 border-blue-500 text-blue-200 ring-1 ring-blue-500/50 shadow-xs"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div class="font-bold text-xs mb-1 text-zinc-100 flex items-center gap-1.5">
                      <Layers size={13} class="text-blue-400" /> Pipeline (Sequencial)
                    </div>
                    <div class="text-[11px] text-zinc-400 font-normal leading-snug whitespace-normal break-words">
                      Passo 1 processa ➔ Passo 2 aprimora ➔ Conclusão em esteira
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGrupoPadrao("review")}
                    class={`p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-start min-h-[76px] ${
                      grupoPadrao() === "review"
                        ? "bg-amber-950/60 border-amber-500 text-amber-200 ring-1 ring-amber-500/50 shadow-xs"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div class="font-bold text-xs mb-1 text-zinc-100 flex items-center gap-1.5">
                      <RotateCcw size={13} class="text-amber-400" /> Loop de Revisão
                    </div>
                    <div class="text-[11px] text-zinc-400 font-normal leading-snug whitespace-normal break-words">
                      Executor cria ➔ Revisor avalia e aprova ou devolve para ajustes
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGrupoPadrao("fanout")}
                    class={`p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-start min-h-[76px] ${
                      grupoPadrao() === "fanout"
                        ? "bg-purple-950/60 border-purple-500 text-purple-200 ring-1 ring-purple-500/50 shadow-xs"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div class="font-bold text-xs mb-1 text-zinc-100 flex items-center gap-1.5">
                      <Users size={13} class="text-purple-400" /> Simultâneo (Fanout)
                    </div>
                    <div class="text-[11px] text-zinc-400 font-normal leading-snug whitespace-normal break-words">
                      Agentes executam ao mesmo tempo ➔ Síntese consolidada final
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGrupoPadrao("debate")}
                    class={`p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-start min-h-[76px] ${
                      grupoPadrao() === "debate"
                        ? "bg-emerald-950/60 border-emerald-500 text-emerald-200 ring-1 ring-emerald-500/50 shadow-xs"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div class="font-bold text-xs mb-1 text-zinc-100 flex items-center gap-1.5">
                      <MessageSquare size={13} class="text-emerald-400" /> Debate Multi-Agente
                    </div>
                    <div class="text-[11px] text-zinc-400 font-normal leading-snug whitespace-normal break-words">
                      Debatedores discutem hipóteses ➔ Moderador toma a decisão
                    </div>
                  </button>
                </div>
              </div>

              {/* REGRAS DE ENCERRAMENTO & LIMITES */}
              <div class="grid grid-cols-2 gap-3 p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <div>
                  <label class="block text-zinc-400 font-medium mb-1">
                    Máx. de Rodadas / Turnos de Loop
                  </label>
                  <select
                    value={grupoTurnos()}
                    onChange={(e) => setGrupoTurnos(parseInt(e.currentTarget.value, 10))}
                    class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none cursor-pointer"
                  >
                    <option value="1">1 rodada (Direto)</option>
                    <option value="2">2 rodadas</option>
                    <option value="3">3 rodadas (Recomendado)</option>
                    <option value="4">4 rodadas</option>
                    <option value="5">5 rodadas (Máx)</option>
                  </select>
                </div>

                <div>
                  <label class="block text-zinc-400 font-medium mb-1">
                    Limite de Mensagens Automáticas
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    value={grupoMaxMsgs()}
                    onInput={(e) => setGrupoMaxMsgs(parseInt(e.currentTarget.value, 10) || 30)}
                    class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
                  />
                </div>
              </div>

              {/* CONFIGURAÇÃO DOS PARTICIPANTES CONFORME O PADRÃO */}
              <Show when={grupoPadrao() === "pipeline"}>
                <div class="space-y-2.5 p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span class="text-zinc-300 font-bold block text-xs">Etapas Sequenciais do Pipeline</span>
                  <For each={passosPipeline()}>
                    {(passo, idx) => (
                      <div class="flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-lg bg-zinc-900/50 border border-zinc-800/80">
                        <span class="text-zinc-500 font-mono text-[10px] w-6 shrink-0">#{idx() + 1}</span>
                        <select
                          value={passo.agente}
                          onChange={(e) => {
                            const lista = [...passosPipeline()];
                            lista[idx()].agente = e.currentTarget.value;
                            setPassosPipeline(lista);
                          }}
                          class="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 w-full sm:w-48 cursor-pointer"
                        >
                          <For each={agentes()}>
                            {(a) => <option value={a.id}>@{a.id}</option>}
                          </For>
                        </select>
                        <input
                          type="text"
                          placeholder="Ordem específica para esta etapa..."
                          value={passo.ordem}
                          onInput={(e) => {
                            const lista = [...passosPipeline()];
                            lista[idx()].ordem = e.currentTarget.value;
                            setPassosPipeline(lista);
                          }}
                          class="w-full sm:flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
                        />
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={grupoPadrao() === "review"}>
                <div class="space-y-3 p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span class="text-zinc-300 font-bold block text-xs">Agente Executor & Agente Revisor</span>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-zinc-400 text-[11px] mb-1">Executor Principal</label>
                      <select
                        value={executorReview().agente}
                        onChange={(e) => setExecutorReview({ ...executorReview(), agente: e.currentTarget.value })}
                        class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 cursor-pointer"
                      >
                        <For each={agentes()}>
                          {(a) => <option value={a.id}>@{a.id}</option>}
                        </For>
                      </select>
                    </div>

                    <div>
                      <label class="block text-zinc-400 text-[11px] mb-1">Revisor / Auditor</label>
                      <select
                        value={revisorReview().agente}
                        onChange={(e) => setRevisorReview({ ...revisorReview(), agente: e.currentTarget.value })}
                        class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 cursor-pointer"
                      >
                        <For each={agentes()}>
                          {(a) => <option value={a.id}>@{a.id}</option>}
                        </For>
                      </select>
                    </div>
                  </div>
                </div>
              </Show>

              <Show when={grupoPadrao() === "fanout"}>
                <div class="space-y-3 p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span class="text-zinc-300 font-bold block text-xs">Executores Paralelos & Agente de Síntese</span>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-zinc-400 text-[11px] mb-1">Agente Paralelo 1</label>
                      <select
                        value={paralelosFanout()[0]?.agente}
                        onChange={(e) => {
                          const p = [...paralelosFanout()];
                          p[0] = { ...p[0], agente: e.currentTarget.value };
                          setParalelosFanout(p);
                        }}
                        class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 cursor-pointer"
                      >
                        <For each={agentes()}>
                          {(a) => <option value={a.id}>@{a.id}</option>}
                        </For>
                      </select>
                    </div>
                    <div>
                      <label class="block text-zinc-400 text-[11px] mb-1">Agente Paralelo 2</label>
                      <select
                        value={paralelosFanout()[1]?.agente}
                        onChange={(e) => {
                          const p = [...paralelosFanout()];
                          p[1] = { ...p[1], agente: e.currentTarget.value };
                          setParalelosFanout(p);
                        }}
                        class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 cursor-pointer"
                      >
                        <For each={agentes()}>
                          {(a) => <option value={a.id}>@{a.id}</option>}
                        </For>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label class="block text-zinc-400 text-[11px] mb-1">Agente que compilará a Síntese Final</label>
                    <select
                      value={sinteseFanout().agente}
                      onChange={(e) => setSinteseFanout({ ...sinteseFanout(), agente: e.currentTarget.value })}
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 cursor-pointer"
                    >
                      <For each={agentes()}>
                        {(a) => <option value={a.id}>@{a.id}</option>}
                      </For>
                    </select>
                  </div>
                </div>
              </Show>

              <Show when={grupoPadrao() === "debate"}>
                <div class="space-y-3 p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
                  <span class="text-zinc-300 font-bold block text-xs">Debatedores & Moderador</span>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-zinc-400 text-[11px] mb-1">Debatedor 1</label>
                      <select
                        value={proponentesDebate()[0]?.agente}
                        onChange={(e) => {
                          const p = [...proponentesDebate()];
                          p[0] = { ...p[0], agente: e.currentTarget.value };
                          setProponentesDebate(p);
                        }}
                        class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 cursor-pointer"
                      >
                        <For each={agentes()}>
                          {(a) => <option value={a.id}>@{a.id}</option>}
                        </For>
                      </select>
                    </div>

                    <div>
                      <label class="block text-zinc-400 text-[11px] mb-1">Debatedor 2</label>
                      <select
                        value={proponentesDebate()[1]?.agente}
                        onChange={(e) => {
                          const p = [...proponentesDebate()];
                          p[1] = { ...p[1], agente: e.currentTarget.value };
                          setProponentesDebate(p);
                        }}
                        class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 cursor-pointer"
                      >
                        <For each={agentes()}>
                          {(a) => <option value={a.id}>@{a.id}</option>}
                        </For>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label class="block text-zinc-400 text-[11px] mb-1">Agente Moderador (Decisão Final)</label>
                    <select
                      value={moderadorDebate()}
                      onChange={(e) => setModeradorDebate(e.currentTarget.value)}
                      class="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 cursor-pointer"
                    >
                      <For each={agentes()}>
                        {(a) => <option value={a.id}>@{a.id}</option>}
                      </For>
                    </select>
                  </div>
                </div>
              </Show>
            </div>

            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2 flex-shrink-0">
              <Button size="sm" variant="secondary" onClick={() => setModalGrupoAberto(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={salvandoGrupo()}
                onClick={salvarNovoGrupo}
              >
                <Check size={13} class="mr-1.5" /> Criar Grupo de Agentes
              </Button>
            </div>
          </div>
        </div>
      </Show>

      {/* MODAL DE CRIAÇÃO DE NOVO AGENTE — 3 Abas: IA Rápida / Manual / Clonar */}
      <Show when={modalCriarAgenteAberto()}>
        <div class="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[90vh] flex flex-col">
            {/* Cabeçalho */}
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3 flex-shrink-0">
              <div class="flex items-center gap-2.5">
                <div class="h-8 w-8 rounded-lg bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Plus size={18} />
                </div>
                <div>
                  <h2 class="text-sm font-bold text-zinc-100">Criar Novo Agente</h2>
                  <span class="text-[11px] text-zinc-400">
                    Escolha como montar o System Prompt do agente.
                  </span>
                </div>
              </div>
              <IconButton size="xs" variant="ghost" onClick={() => setModalCriarAgenteAberto(false)}>
                <X size={16} />
              </IconButton>
            </div>

            {/* Abas: IA Rápida | Manual | Clonar Existente */}
            <div class="flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-xl w-fit text-xs flex-shrink-0">
              <button
                type="button"
                onClick={() => setCriarAbaAtiva("ia")}
                class={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer font-medium flex items-center gap-1.5 ${
                  criarAbaAtiva() === "ia"
                    ? "!bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 shadow-xs"
                    : "!bg-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Wand2 size={12} />
                <span>IA Rápida</span>
              </button>
              <button
                type="button"
                onClick={() => setCriarAbaAtiva("manual")}
                class={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer font-medium flex items-center gap-1.5 ${
                  criarAbaAtiva() === "manual"
                    ? "!bg-blue-950/80 text-blue-300 border border-blue-500/50 shadow-xs"
                    : "!bg-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <FileText size={12} />
                <span>Manual</span>
              </button>
              <button
                type="button"
                onClick={() => setCriarAbaAtiva("clonar")}
                class={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer font-medium flex items-center gap-1.5 ${
                  criarAbaAtiva() === "clonar"
                    ? "!bg-purple-950/80 text-purple-300 border border-purple-500/50 shadow-xs"
                    : "!bg-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Copy size={12} />
                <span>Clonar Existente</span>
              </button>
            </div>

            {/* Conteúdo scrollável */}
            <div class="space-y-4 text-xs overflow-y-auto pr-1 scrollbar-thin flex-1">
              {/* Campos comuns: ID, Role, Modelo, Permissão */}
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-zinc-400 font-semibold mb-1">ID do Agente (slug kebab-case) *</label>
                  <input
                    type="text"
                    placeholder="ex: revisor-de-codigo"
                    value={novoAgenteId()}
                    onInput={(e) => setNovoAgenteId(e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label class="block text-zinc-400 font-semibold mb-1">Papel / Função Resumida</label>
                  <input
                    type="text"
                    placeholder="ex: Revisador de código especialista em TypeScript"
                    value={novoAgenteRole()}
                    onInput={(e) => setNovoAgenteRole(e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-zinc-400 font-semibold mb-1">Modelo de IA *</label>
                  <select
                    value={novoAgenteModelSelect()}
                    onChange={(e) => setNovoAgenteModelSelect(e.currentTarget.value)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="">
                      (Padrão do Sistema: {modeloPadraoGlobal().replace("openrouter/", "")})
                    </option>
                    <For each={MODELOS_DISPONIVEIS}>
                      {(item) => <option value={item.id}>{item.label}</option>}
                    </For>
                    <option value="__custom__">Outro / Personalizado (Digitar Manual)</option>
                  </select>

                  <Show when={novoAgenteModelSelect() === "__custom__"}>
                    <input
                      type="text"
                      placeholder="provedor/modelo (ex: openrouter/google/gemini-2.5-flash)"
                      value={novoAgenteModelCustom()}
                      onInput={(e) => setNovoAgenteModelCustom(e.currentTarget.value)}
                      class="w-full mt-2 bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </Show>
                </div>

                <div>
                  <label class="block text-zinc-400 font-semibold mb-1">Nível de Permissão</label>
                  <select
                    value={novoAgentePerm()}
                    onChange={(e) => setNovoAgentePerm(e.currentTarget.value as any)}
                    class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="level-1">Level 1 — Somente Leitura</option>
                    <option value="level-2">Level 2 — Execução Padrão</option>
                    <option value="level-3">Level 3 — Acesso Total</option>
                  </select>

                  <Show when={globalFullAccess()}>
                    <span class="text-[10px] text-amber-400 flex items-center gap-1 mt-1 font-medium leading-tight">
                      <Shield size={11} class="shrink-0" />
                      Acesso Total Global ativo nas Configurações — sem restrição.
                    </span>
                  </Show>
                </div>
              </div>

              {/* ── ABA: IA RÁPIDA ── */}
              <Show when={criarAbaAtiva() === "ia"}>
                <div class="p-4 rounded-xl bg-emerald-950/20 border border-emerald-900/40 space-y-3">
                  <div class="flex items-center gap-2 mb-1">
                    <Wand2 size={14} class="text-emerald-400" />
                    <span class="font-bold text-emerald-300 text-xs">
                      Descreva o agente que você quer e o prompt será gerado automaticamente
                    </span>
                  </div>

                  <div>
                    <label class="block text-zinc-300 font-medium mb-1">
                      Como deve ser esse agente? O que ele faz? *
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Ex: quero um agente que revise pull requests, verificando bugs, boas práticas de TypeScript e sugerindo melhorias de performance..."
                      value={iaDescricao()}
                      onInput={(e) => setIaDescricao(e.currentTarget.value)}
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 resize-none"
                    />
                  </div>

                  <Button
                    size="sm"
                    variant="secondary"
                    class="border-emerald-700 text-emerald-300 hover:bg-emerald-950/50"
                    onClick={gerarPromptViaIA}
                    loading={gerandoPromptIA()}
                  >
                    <Sparkles size={13} class="mr-1.5" />
                    {gerandoPromptIA() ? "Gerando..." : "Gerar System Prompt com IA"}
                  </Button>

                  <Show when={iaPromptGerado()}>
                    <div class="mt-2">
                      <label class="block text-zinc-300 font-medium mb-1">
                        System Prompt Gerado (edite à vontade antes de criar)
                      </label>
                      <textarea
                        rows={10}
                        value={iaPromptGerado()}
                        onInput={(e) => setIaPromptGerado(e.currentTarget.value)}
                        class="w-full bg-[#0c0e12] border border-zinc-800 rounded-xl p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500 leading-relaxed scrollbar-thin"
                      />
                    </div>
                  </Show>
                </div>
              </Show>

              {/* ── ABA: MANUAL ── */}
              <Show when={criarAbaAtiva() === "manual"}>
                <div class="p-4 rounded-xl bg-blue-950/20 border border-blue-900/40 space-y-3">
                  <div class="flex items-center gap-2 mb-1">
                    <FileText size={14} class="text-blue-400" />
                    <span class="font-bold text-blue-300 text-xs">
                      Escreva o System Prompt completo manualmente
                    </span>
                  </div>

                  <textarea
                    rows={12}
                    placeholder={"# Agente Especialista\n\n## Papel Principal\nVocê é um...\n\n## Regras de Comportamento\n1. Sempre...\n2. Nunca...\n\n## Formato de Resposta\n- Use markdown..."}
                    value={novoAgentePromptManual()}
                    onInput={(e) => setNovoAgentePromptManual(e.currentTarget.value)}
                    class="w-full bg-[#0c0e12] border border-zinc-800 rounded-xl p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-blue-500 leading-relaxed scrollbar-thin"
                  />
                </div>
              </Show>

              {/* ── ABA: CLONAR ── */}
              <Show when={criarAbaAtiva() === "clonar"}>
                <div class="p-4 rounded-xl bg-purple-950/20 border border-purple-900/40 space-y-3">
                  <div class="flex items-center gap-2 mb-1">
                    <Copy size={14} class="text-purple-400" />
                    <span class="font-bold text-purple-300 text-xs">
                      Use um agente existente como base — o novo agente herdará o prompt completo
                    </span>
                  </div>

                  <div>
                    <label class="block text-zinc-300 font-medium mb-1">
                      Agente de Origem *
                    </label>
                    <select
                      value={clonarOrigem()}
                      onChange={(e) => setClonarOrigem(e.currentTarget.value)}
                      class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-purple-500 cursor-pointer"
                    >
                      <For each={agentes()}>
                        {(a) => (
                          <option value={a.id}>
                            @{a.id} — {a.role || a.description || "Agente"}
                          </option>
                        )}
                      </For>
                    </select>
                  </div>

                  <div class="flex items-center gap-2 text-[11px] text-zinc-400 bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800">
                    <ArrowRight size={12} class="text-purple-400 flex-shrink-0" />
                    <span>
                      O novo agente <strong class="text-zinc-200">@{novoAgenteId() || "novo-id"}</strong> será
                      criado como cópia de <strong class="text-purple-300">@{clonarOrigem()}</strong> com
                      o mesmo System Prompt, modelo e configurações. Você poderá editá-lo depois.
                    </span>
                  </div>
                </div>
              </Show>
            </div>

            {/* Rodapé com ações */}
            <div class="pt-3 border-t border-zinc-800 flex justify-end gap-2 flex-shrink-0">
              <Button size="sm" variant="secondary" onClick={() => setModalCriarAgenteAberto(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={criandoAgente()}
                onClick={criarNovoAgente}
              >
                <Check size={13} class="mr-1.5" /> Criar Agente
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
