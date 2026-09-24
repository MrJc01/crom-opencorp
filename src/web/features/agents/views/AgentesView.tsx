import React, { useState, useEffect, useCallback, useMemo, type FC } from "react";
import { useSearchParams } from "react-router-dom";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import {
  type AgentResumo,
  type TeamSpec,
} from "@opencorp/sdk";
import { showToast } from "../../../shared/ui/Toast.js";
import { AgentFilters } from "../components/AgentFilters.js";
import { AgentCard } from "../components/AgentCard.js";
import { TeamCard } from "../components/TeamCard.js";
import { AgentInspectDrawer } from "../components/AgentInspectDrawer.js";
import { AgentCreateModal } from "../components/AgentCreateModal.js";
import { TeamManageModal } from "../components/TeamManageModal.js";
import { AgentRunModal, type AlvoExecucao } from "../components/AgentRunModal.js";
import { MODELOS_DISPONIVEIS } from "../constants.js";
import { Cpu, X } from "lucide-react";

export const AgentesView: FC = () => {
  const { client, tratarErro } = useOpenCorp();
  const [searchParams, setSearchParams] = useSearchParams();

  const [agentes, setAgentes] = useState<AgentResumo[]>([]);
  const [teams, setTeams] = useState<TeamSpec[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Filtros
  const [abaAtiva, setAbaAtiva] = useState<"todos" | "agentes" | "equipes">("todos");
  const [busca, setBusca] = useState("");

  // Modais e Drawers
  const [agenteInspecionado, setAgenteInspecionado] = useState<AgentResumo | null>(null);
  const [teamParaEditar, setTeamParaEditar] = useState<TeamSpec | null>(null);
  const [modalCriarAgente, setModalCriarAgente] = useState(false);
  const [modalGerenciarTeam, setModalGerenciarTeam] = useState(false);
  const [alvoRun, setAlvoRun] = useState<AlvoExecucao | null>(null);

  // Modal Modelo Global
  const [modalModeloGlobal, setModalModeloGlobal] = useState(false);
  const [modeloGlobalSelecionado, setModeloGlobalSelecionado] = useState(
    MODELOS_DISPONIVEIS[0]?.id || "",
  );
  const [aplicandoModelo, setAplicandoModelo] = useState(false);

  // Carregamento de dados
  const carregarDados = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const [listaAgentes, listaTeams] = await Promise.all([
        client.agents.listar(),
        client.teams.listar().catch(() => []),
      ]);
      setAgentes(listaAgentes || []);
      setTeams(listaTeams || []);
    } catch (err) {
      if (!silencioso) {
        tratarErro(err, "Falha ao carregar catálogo de agentes e equipes");
      }
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, [client, tratarErro]);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  // Deep-linking (?agente=<id> ou ?team=<id>)
  const agenteUrl = searchParams.get("agente");
  const teamUrl = searchParams.get("team");

  useEffect(() => {
    if (agenteUrl && agentes.length > 0) {
      const ag = agentes.find((a) => a.id === agenteUrl);
      if (ag) setAgenteInspecionado(ag);
    } else if (!agenteUrl && agenteInspecionado) {
      setAgenteInspecionado(null);
    }
  }, [agenteUrl, agentes]);

  useEffect(() => {
    if (teamUrl && teams.length > 0) {
      const tm = teams.find((t) => t.id === teamUrl);
      if (tm) {
        setTeamParaEditar(tm);
        setModalGerenciarTeam(true);
      }
    }
  }, [teamUrl, teams]);

  // Ações de Agentes
  const salvarAgente = async (agenteAtualizado: AgentResumo) => {
    try {
      await client.agents.atualizar(agenteAtualizado.id, agenteAtualizado);
      setAgentes((prev) =>
        prev.map((a) => (a.id === agenteAtualizado.id ? agenteAtualizado : a)),
      );
      setAgenteInspecionado(agenteAtualizado);
    } catch (err) {
      tratarErro(err, "Erro ao salvar agente");
      throw err;
    }
  };

  const criarAgente = async (novo: Partial<AgentResumo> & { id: string }) => {
    try {
      const criado = await client.agents.salvar(novo);
      setAgentes((prev) => [...prev, criado]);
      showToast(`Agente @${criado.id} criado com sucesso!`, "sucesso");
    } catch (err) {
      tratarErro(err, "Erro ao criar agente");
      throw err;
    }
  };

  const excluirAgente = async (id: string) => {
    try {
      await client.agents.excluir(id);
      setAgentes((prev) => prev.filter((a) => a.id !== id));
      if (agenteInspecionado?.id === id) {
        setAgenteInspecionado(null);
        setSearchParams({});
      }
      showToast(`Agente @${id} excluído`, "sucesso");
    } catch (err) {
      tratarErro(err, "Erro ao excluir agente");
    }
  };

  const alternarAtivoAgente = async (agente: AgentResumo, ativo: boolean) => {
    try {
      await client.agents.atualizar(agente.id, { ativo });
      setAgentes((prev) =>
        prev.map((a) => (a.id === agente.id ? { ...a, ativo, active: ativo } : a)),
      );
      showToast(`Agente @${agente.id} ${ativo ? "ativado" : "desativado"}`, "info");
    } catch (err) {
      tratarErro(err, "Erro ao alterar status do agente");
    }
  };

  // Ações de Teams
  const salvarTeam = async (spec: TeamSpec) => {
    try {
      const existe = teams.some((t) => t.id === spec.id);
      if (existe) {
        await client.teams.atualizar(spec.id, spec);
        setTeams((prev) => prev.map((t) => (t.id === spec.id ? spec : t)));
        showToast(`Equipe "${spec.titulo || spec.id}" atualizada!`, "sucesso");
      } else {
        await client.teams.criar(spec);
        setTeams((prev) => [...prev, spec]);
        showToast(`Equipe "${spec.titulo || spec.id}" criada com sucesso!`, "sucesso");
      }
      setModalGerenciarTeam(false);
      setTeamParaEditar(null);
      setSearchParams({});
    } catch (err) {
      tratarErro(err, "Erro ao salvar equipe");
      throw err;
    }
  };

  const excluirTeam = async (id: string) => {
    try {
      await client.teams.excluir(id);
      setTeams((prev) => prev.filter((t) => t.id !== id));
      showToast(`Equipe "${id}" excluída`, "sucesso");
    } catch (err) {
      tratarErro(err, "Erro ao excluir equipe");
    }
  };

  // Disparo de Ordem
  const dispararOrdem = async (alvo: AlvoExecucao, ordem: string) => {
    try {
      if (alvo.tipo === "agente") {
        const res = await client.agents.executar(alvo.item.id, { ordem });
        showToast(`Execução disparada para @${alvo.item.id}!`, "sucesso");
        return res;
      } else {
        const res = await client.teams.executar(alvo.item.id, { ordem });
        showToast(`Orquestração disparada para equipe "${alvo.item.titulo}"!`, "sucesso");
        return res;
      }
    } catch (err) {
      tratarErro(err, "Erro ao disparar execução");
    }
  };

  // Aplicação de Modelo Global
  const aplicarModeloGlobal = async () => {
    setAplicandoModelo(true);
    try {
      const res = await client.agents.aplicarModeloGlobal(modeloGlobalSelecionado);
      showToast(
        `Modelo padronizado com sucesso! ${res.alterados || 0} agentes atualizados.`,
        "sucesso",
      );
      setModalModeloGlobal(false);
      void carregarDados(true);
    } catch (err) {
      tratarErro(err, "Erro ao aplicar modelo global");
    } finally {
      setAplicandoModelo(false);
    }
  };

  const semearCatalogo = async () => {
    try {
      await client.agents.semearCatalogo();
      showToast("Catálogo padrão de agentes semeado com sucesso!", "sucesso");
      void carregarDados();
    } catch (err) {
      tratarErro(err, "Erro ao semear catálogo");
    }
  };

  // Filtros
  const agentesFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    if (!termo) return agentes;
    return agentes.filter((a) => {
      const nome = (a.nome || a.name || "").toLowerCase();
      const id = a.id.toLowerCase();
      const papel = (a.role || a.descricao || a.description || "").toLowerCase();
      const modelo = (a.modelo || a.model || "").toLowerCase();
      const temSkill = a.skills?.some((s) => s.toLowerCase().includes(termo));
      return nome.includes(termo) || id.includes(termo) || papel.includes(termo) || modelo.includes(termo) || temSkill;
    });
  }, [agentes, busca]);

  const teamsFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    if (!termo) return teams;
    return teams.filter((t) => {
      const titulo = (t.titulo || "").toLowerCase();
      const id = t.id.toLowerCase();
      const padrao = t.padrao.toLowerCase();
      return titulo.includes(termo) || id.includes(termo) || padrao.includes(termo);
    });
  }, [teams, busca]);

  return (
    <div className="flex flex-col h-full w-full p-6 md:p-8 space-y-6 overflow-y-auto">
      {/* Filtros e Ações */}
      <AgentFilters
        abaAtiva={abaAtiva}
        aoMudarAba={setAbaAtiva}
        busca={busca}
        aoMudarBusca={setBusca}
        totalAgentes={agentes.length}
        totalEquipes={teams.length}
        aoNovoAgente={() => setModalCriarAgente(true)}
        aoNovaEquipe={() => {
          setTeamParaEditar(null);
          setModalGerenciarTeam(true);
        }}
        aoAplicarModeloGlobal={() => setModalModeloGlobal(true)}
        aoSemearCatalogo={semearCatalogo}
        aoAtualizar={() => void carregarDados()}
        carregando={carregando}
      />

      {/* Grid de Conteúdo */}
      <div className="space-y-6">
        {/* Seção Agentes */}
        {(abaAtiva === "todos" || abaAtiva === "agentes") && (
          <div className="space-y-3">
            {abaAtiva === "todos" && (
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Agentes Autônomos ({agentesFiltrados.length})
              </h2>
            )}

            {agentesFiltrados.length === 0 && (
              <div className="p-8 text-center bg-zinc-900/30 rounded-2xl border border-zinc-850 text-xs text-zinc-500">
                Nenhum agente encontrado com os filtros atuais.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {agentesFiltrados.map((ag) => (
                <AgentCard
                  key={ag.id}
                  agente={ag}
                  aoInspecionar={(agente) => {
                    setAgenteInspecionado(agente);
                    setSearchParams({ agente: agente.id });
                  }}
                  aoDisparar={(agente) => setAlvoRun({ tipo: "agente", item: agente })}
                  aoAlternarAtivo={alternarAtivoAgente}
                />
              ))}
            </div>
          </div>
        )}

        {/* Seção Equipes Multi-Agente */}
        {(abaAtiva === "todos" || abaAtiva === "equipes") && (
          <div className="space-y-3 pt-2">
            {abaAtiva === "todos" && (
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Equipes & Squads Multi-Agente ({teamsFiltrados.length})
              </h2>
            )}

            {teamsFiltrados.length === 0 && (
              <div className="p-8 text-center bg-zinc-900/30 rounded-2xl border border-zinc-850 text-xs text-zinc-500">
                Nenhuma equipe configurada no momento. Clique em "+ Nova Equipe" para criar fluxos de colaboração.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teamsFiltrados.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  aoEditar={(tm) => {
                    setTeamParaEditar(tm);
                    setModalGerenciarTeam(true);
                    setSearchParams({ team: tm.id });
                  }}
                  aoDisparar={(tm) => setAlvoRun({ tipo: "equipe", item: tm })}
                  aoExcluir={excluirTeam}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Drawer Lateral de Inspeção & Edição do Agente */}
      <AgentInspectDrawer
        agente={agenteInspecionado}
        aoFechar={() => {
          setAgenteInspecionado(null);
          setSearchParams({});
        }}
        aoSalvar={salvarAgente}
        aoExcluir={excluirAgente}
      />

      {/* Modal de Criação de Agente */}
      <AgentCreateModal
        aberto={modalCriarAgente}
        agentesExistentes={agentes}
        aoFechar={() => setModalCriarAgente(false)}
        aoCriar={criarAgente}
      />

      {/* Modal de Gerenciamento de Equipes */}
      <TeamManageModal
        aberto={modalGerenciarTeam}
        teamParaEditar={teamParaEditar}
        agentes={agentes}
        aoFechar={() => {
          setModalGerenciarTeam(false);
          setTeamParaEditar(null);
          setSearchParams({});
        }}
        aoSalvar={salvarTeam}
      />

      {/* Modal de Disparo de Ordem */}
      <AgentRunModal
        aberto={!!alvoRun}
        alvo={alvoRun}
        aoFechar={() => setAlvoRun(null)}
        aoDisparar={dispararOrdem}
      />

      {/* Modal de Aplicação de Modelo Global */}
      {modalModeloGlobal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setModalModeloGlobal(false)}
        >
          <div
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Cpu size={16} className="text-cyan-400" />
                <span>Aplicar Modelo Global em Lote</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalModeloGlobal(false)}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Esta ação alterará o modelo de inferência configurado para todos os{" "}
              <strong className="text-zinc-200">{agentes.length} agentes</strong> registrados no workspace ativo.
            </p>

            <div>
              <label className="block text-zinc-300 text-xs font-medium mb-1">
                Selecione o Modelo Alvo
              </label>
              <select
                value={modeloGlobalSelecionado}
                onChange={(e) => setModeloGlobalSelecionado(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                {MODELOS_DISPONIVEIS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalModeloGlobal(false)}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={aplicandoModelo}
                onClick={aplicarModeloGlobal}
                className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-md transition-colors cursor-pointer disabled:opacity-50"
              >
                {aplicandoModelo ? "Aplicando..." : "Confirmar & Aplicar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
