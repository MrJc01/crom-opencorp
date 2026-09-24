import React, { useState, useEffect, type FC } from "react";
import { Search, Layers, Sparkles, Package, ExternalLink } from "lucide-react";
import { showToast } from "../../../shared/ui/Toast.js";

interface SkillItem {
  id: string;
  name: string;
  description: string;
  category?: string;
}

const SKILLS_PADRAO: SkillItem[] = [
  {
    id: "web-search",
    name: "Pesquisa na Web",
    description: "Permite aos agentes buscar documentações públicas, dados de APIs e notícias.",
    category: "Pesquisa",
  },
  {
    id: "git-ops",
    name: "Automação Git",
    description: "Criação de checkpoints, commits semânticos e reconciliação de branches.",
    category: "Desenvolvimento",
  },
  {
    id: "flow-orchestrator",
    name: "Orquestrador de Fluxos",
    description: "Execução determinística e DAG de fluxos com triggers cron e webhook.",
    category: "Automação",
  },
  {
    id: "model-governance",
    name: "Governança de Modelos",
    description: "Dimensionamento e roteamento de LLMs por faixa de complexidade xB.",
    category: "Governança",
  },
];

export const AtivosView: FC = () => {
  const [busca, setBusca] = useState("");
  const [skills, setSkills] = useState<SkillItem[]>(SKILLS_PADRAO);
  const [selecionadaId, setSelecionadaId] = useState<string>(SKILLS_PADRAO[0].id);

  useEffect(() => {
    fetch("/skills")
      .then((res) => {
        if (!res.ok) return { skills: [] };
        return res.json();
      })
      .then((data) => {
        if (data?.skills && data.skills.length > 0) {
          setSkills(data.skills);
          setSelecionadaId(data.skills[0].id);
        }
      })
      .catch(() => {
        // Usa lista padrão em caso de ambiente offline
      });
  }, []);

  const skillsFiltradas = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(busca.toLowerCase()) ||
      s.description.toLowerCase().includes(busca.toLowerCase()),
  );

  const skillAtiva = skills.find((s) => s.id === selecionadaId) || skills[0];

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
            Habilidades modulares e extensões de ferramentas disponíveis para os agentes do workspace.
          </p>
        </div>

        {/* Input de Busca */}
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
      </div>

      {/* Grid de Skills */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {skillsFiltradas.map((skill) => {
          const ativa = skill.id === selecionadaId;
          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => setSelecionadaId(skill.id)}
              className={`flex flex-col text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                ativa
                  ? "bg-emerald-950/40 border-emerald-700/60 shadow-lg shadow-emerald-950/30"
                  : "bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-900/80 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <span className="h-7 w-7 rounded-lg bg-zinc-800 flex items-center justify-center text-emerald-400">
                  <Package size={14} />
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                  {skill.category ?? "Geral"}
                </span>
              </div>
              <h3 className="text-xs font-semibold text-zinc-100">{skill.name}</h3>
              <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                {skill.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Detalhes da Skill Selecionada */}
      {skillAtiva && (
        <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-850 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
                <Sparkles size={20} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-zinc-100">{skillAtiva.name}</h2>
                <span className="text-[11px] font-mono text-zinc-500">ID: {skillAtiva.id}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => showToast(`Skill "${skillAtiva.name}" já está habilitada no Secretário`, "sucesso")}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-sm transition-all cursor-pointer"
            >
              Habilitar no Workspace
            </button>
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed max-w-2xl">
            {skillAtiva.description}
          </p>
        </div>
      )}
    </div>
  );
};
