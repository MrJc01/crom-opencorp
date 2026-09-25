import React, { useState, useEffect, useCallback, useMemo, type FC } from "react";
import { useParams } from "react-router-dom";
import {
  Search,
  Layers,
  Sparkles,
  Package,
  CheckCircle2,
  Power,
  RefreshCw,
  Wrench,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { showToast } from "../../../shared/ui/Toast.js";

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  category?: string;
  allowed_tools?: string[];
  versao?: string;
  requires?: string[];
  ativa?: boolean;
}

export const AtivosView: FC = () => {
  const { client, workspaceId: ctxWorkspaceId, tratarErro } = useOpenCorp();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId || ctxWorkspaceId || "";

  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todas");
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [selecionadaId, setSelecionadaId] = useState<string>("");
  const [carregando, setCarregando] = useState(true);
  const [alternandoId, setAlternandoId] = useState<string | null>(null);

  // Carregamento de skills reais do backend
  const carregarSkills = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true);
      try {
        let data: unknown;
        if (client?.http?.get) {
          data = await client.http.get("/skills", {
            query: workspaceId ? { workspace: workspaceId } : undefined,
          });
        } else {
          const qs = workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : "";
          const res = await fetch(`/skills${qs}`, {
            headers: {
              Accept: "application/json",
              ...(workspaceId ? { "x-opencorp-workspace": workspaceId } : {}),
            },
          });
          if (!res.ok) throw new Error(`Falha HTTP ${res.status}`);
          data = await res.json();
        }

        // Parsing da API de skills reais
        const skillsBrutas: any[] = Array.isArray(data)
          ? data
          : Array.isArray((data as any)?.skills)
            ? (data as any).skills
            : [];

        const skillsReais: SkillItem[] = skillsBrutas.map((s) => ({
          id: s.id || s.name,
          name: s.name || s.id,
          description: s.description || "",
          category: s.category || "Geral",
          allowed_tools: Array.isArray(s.allowed_tools) ? s.allowed_tools : [],
          versao: s.versao,
          requires: Array.isArray(s.requires) ? s.requires : [],
          ativa: Boolean(s.ativa),
        }));

        setSkills(skillsReais);
        if (skillsReais.length > 0) {
          setSelecionadaId((prev) => {
            if (prev && skillsReais.some((s) => s.id === prev)) return prev;
            return skillsReais[0]!.id;
          });
        } else {
          setSelecionadaId("");
        }
      } catch (erro) {
        if (!silencioso) {
          tratarErro(erro, "Não foi possível carregar o catálogo de skills");
        }
        setSkills([]);
      } finally {
        if (!silencioso) setCarregando(false);
      }
    },
    [client, workspaceId, tratarErro],
  );

  useEffect(() => {
    void carregarSkills();
  }, [carregarSkills]);

  // Alternar ativação de skill no workspace
  const handleAlternarSkill = async (skill: SkillItem) => {
    const skillId = skill.id || skill.name;
    if (!skillId) return;

    setAlternandoId(skillId);
    try {
      let resultado: { ok?: boolean; ativa?: boolean; id?: string } | null = null;
      let resOk = false;

      // Dispara chamada HTTP real enviando o ID da skill e o workspaceId
      if (client?.http?.post) {
        try {
          resultado = await client.http.post<{ ok?: boolean; ativa?: boolean; id?: string }>(
            `/skills/${encodeURIComponent(skillId)}/toggle`,
            { workspace: workspaceId },
            { query: workspaceId ? { workspace: workspaceId } : undefined },
          );
          resOk = Boolean(resultado?.ok);
        } catch {
          resOk = false;
        }
      }

      if (!resOk) {
        const qs = workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : "";
        const res = await fetch(`/skills/${encodeURIComponent(skillId)}/toggle${qs}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(workspaceId ? { "x-opencorp-workspace": workspaceId } : {}),
          },
          body: JSON.stringify({
            id: skillId,
            workspace: workspaceId,
          }),
        });

        if (!res.ok) {
          const erroJson = await res.json().catch(() => ({}));
          throw new Error(
            erroJson.erro || erroJson.detail || erroJson.message || `Erro HTTP ${res.status}`,
          );
        }

        resultado = await res.json();
        resOk = true;
      }

      if (resOk && resultado) {
        const novoStatus = Boolean(resultado.ativa);
        // Atualiza imediatamente o estado visual do card
        setSkills((prev) =>
          prev.map((s) => (s.id === skillId ? { ...s, ativa: novoStatus } : s)),
        );

        const msgSucesso = novoStatus
          ? `Skill "${skill.name}" habilitada no workspace com sucesso!`
          : `Skill "${skill.name}" desativada do workspace com sucesso!`;
        showToast(msgSucesso, "sucesso");
      }
    } catch (erro) {
      const msgErro = erro instanceof Error ? erro.message : String(erro);
      showToast(`Falha ao alterar status da skill: ${msgErro}`, "erro");
      tratarErro(erro, "Erro ao alterar skill");
    } finally {
      setAlternandoId(null);
    }
  };

  // Categorias disponíveis para filtro
  const categorias = useMemo(() => {
    const lista = Array.from(new Set(skills.map((s) => s.category || "Geral")));
    return ["todas", ...lista.sort()];
  }, [skills]);

  // Filtro de busca e categoria
  const skillsFiltradas = useMemo(() => {
    return skills.filter((s) => {
      const matchBusca =
        s.name.toLowerCase().includes(busca.toLowerCase()) ||
        s.description.toLowerCase().includes(busca.toLowerCase()) ||
        s.id.toLowerCase().includes(busca.toLowerCase());
      const matchCat =
        categoriaFiltro === "todas" || (s.category || "Geral") === categoriaFiltro;
      return matchBusca && matchCat;
    });
  }, [skills, busca, categoriaFiltro]);

  const skillAtiva = skills.find((s) => s.id === selecionadaId) || skillsFiltradas[0] || null;

  return (
    <div className="flex flex-col h-full w-full p-6 md:p-8 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Layers className="text-emerald-400" size={20} />
            Loja de Skills & Ativos Operacionais
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Habilidades modulares, guardrails e extensões de ferramentas reais para os agentes do workspace.
          </p>
        </div>

        {/* Controles de Busca e Recarga */}
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <div className="relative w-full md:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar habilidades..."
              className="w-full pl-9 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60"
            />
          </div>

          <button
            type="button"
            onClick={() => void carregarSkills()}
            disabled={carregando}
            title="Recarregar catálogo"
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={carregando ? "animate-spin text-emerald-400" : ""} />
          </button>
        </div>
      </div>

      {/* Pílulas de Categoria */}
      {categorias.length > 2 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {categorias.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoriaFiltro(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer capitalize ${
                categoriaFiltro === cat
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "bg-zinc-900/60 text-zinc-400 border border-zinc-800/80 hover:bg-zinc-800/60 hover:text-zinc-200"
              }`}
            >
              {cat === "todas" ? "Todas as Categorias" : cat}
            </button>
          ))}
        </div>
      )}

      {/* Estado de Carregando */}
      {carregando && skills.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 p-4 space-y-3">
              <div className="h-7 w-7 rounded-lg bg-zinc-800" />
              <div className="h-4 w-28 bg-zinc-800 rounded" />
              <div className="h-3 w-full bg-zinc-800/60 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Estado Vazio Real */}
      {!carregando && skillsFiltradas.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800/60 space-y-3">
          <AlertCircle size={32} className="text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-200">Nenhuma skill encontrada</h3>
          <p className="text-xs text-zinc-400 max-w-md">
            {busca || categoriaFiltro !== "todas"
              ? "Nenhum resultado corresponde aos critérios de busca selecionados."
              : "Nenhuma skill instalada em .opencorp/skills ou encontrada no catálogo do sistema."}
          </p>
          {(busca || categoriaFiltro !== "todas") && (
            <button
              type="button"
              onClick={() => {
                setBusca("");
                setCategoriaFiltro("todas");
              }}
              className="text-xs text-emerald-400 hover:underline cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Grid de Skills Reais */}
      {skillsFiltradas.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {skillsFiltradas.map((skill) => {
            const selecionada = skill.id === (skillAtiva?.id || selecionadaId);
            const ativaNoWs = Boolean(skill.ativa);

            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => setSelecionadaId(skill.id)}
                className={`flex flex-col text-left p-4 rounded-2xl border transition-all cursor-pointer relative ${
                  selecionada
                    ? "bg-emerald-950/40 border-emerald-700/60 shadow-lg shadow-emerald-950/30"
                    : "bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-900/80 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2.5">
                  <span className="h-7 w-7 rounded-lg bg-zinc-800 flex items-center justify-center text-emerald-400">
                    <Package size={14} />
                  </span>

                  {/* Badge de Status no Workspace */}
                  {ativaNoWs ? (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <CheckCircle2 size={10} />
                      Ativa no Workspace
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                      Disponível
                    </span>
                  )}
                </div>

                <div className="flex items-baseline justify-between gap-1">
                  <h3 className="text-xs font-semibold text-zinc-100">{skill.name}</h3>
                  <span className="text-[9px] font-mono text-zinc-500 shrink-0">
                    {skill.category ?? "Geral"}
                  </span>
                </div>

                <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                  {skill.description}
                </p>

                {skill.allowed_tools && skill.allowed_tools.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-zinc-800/60 flex items-center gap-1 overflow-hidden">
                    <Wrench size={10} className="text-zinc-500 shrink-0" />
                    <span className="text-[10px] text-zinc-400 font-mono truncate">
                      {skill.allowed_tools.join(", ")}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Painel de Detalhes da Skill Selecionada */}
      {skillAtiva && (
        <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400 shrink-0">
                <Sparkles size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-zinc-100">{skillAtiva.name}</h2>
                  {skillAtiva.versao && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      v{skillAtiva.versao}
                    </span>
                  )}
                  {skillAtiva.ativa && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                      <CheckCircle2 size={10} />
                      Ativa
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500 font-mono">
                  <span>ID: {skillAtiva.id}</span>
                  <span>•</span>
                  <span>Categoria: {skillAtiva.category ?? "Geral"}</span>
                </div>
              </div>
            </div>

            {/* Botão de Habilitação / Desativação Real */}
            <button
              type="button"
              disabled={alternandoId === skillAtiva.id}
              onClick={() => void handleAlternarSkill(skillAtiva)}
              className={`px-4 py-2 rounded-xl text-xs font-medium shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                skillAtiva.ativa
                  ? "bg-zinc-800 hover:bg-red-500/20 text-zinc-200 hover:text-red-400 border border-zinc-700 hover:border-red-500/40"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40"
              }`}
            >
              {alternandoId === skillAtiva.id ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Processando...</span>
                </>
              ) : skillAtiva.ativa ? (
                <>
                  <Power size={14} />
                  <span>Desativar do Workspace</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>Habilitar no Workspace</span>
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed max-w-3xl">
            {skillAtiva.description}
          </p>

          {/* Ferramentas Permitidas e Pré-requisitos */}
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-zinc-800/80 text-xs text-zinc-400">
            {skillAtiva.allowed_tools && skillAtiva.allowed_tools.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Wrench size={13} className="text-zinc-500" />
                <span className="font-semibold text-zinc-300">Ferramentas:</span>
                <span className="font-mono text-zinc-400">{skillAtiva.allowed_tools.join(", ")}</span>
              </div>
            )}
            {skillAtiva.requires && skillAtiva.requires.length > 0 && (
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-zinc-500" />
                <span className="font-semibold text-zinc-300">Requer:</span>
                <span className="font-mono text-zinc-400">{skillAtiva.requires.join(", ")}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
