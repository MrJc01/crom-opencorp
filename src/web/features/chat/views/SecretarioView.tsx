import React, { useState, useEffect, useCallback, type FC } from "react";
import { useSearchParams } from "react-router-dom";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import {
  OpenCodeTabsHeader,
  type ChatTab,
} from "../components/OpenCodeTabsHeader.js";
import { HistoricoModal } from "../components/HistoricoModal.js";
import { SecretarioChat } from "../components/SecretarioChat.js";

/**
 * Lê as abas salvas do workspace no localStorage.
 */
export function carregarAbasWorkspace(workspaceId: string): ChatTab[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(`oc-secretario-abas:${workspaceId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((t) => t && typeof t.id === "string");
      }
    }
  } catch {}
  return [];
}

/**
 * Persiste as abas do workspace no localStorage.
 */
export function salvarAbasWorkspace(workspaceId: string, abas: ChatTab[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      `oc-secretario-abas:${workspaceId}`,
      JSON.stringify(abas),
    );
  } catch {}
}

export const SecretarioView: FC = () => {
  const { workspaceId } = useOpenCorp();
  const wsId = workspaceId || "default";

  const [searchParams, setSearchParams] = useSearchParams();
  const sessaoParam = searchParams.get("sessao");

  const [abas, setAbas] = useState<ChatTab[]>(() => {
    const salvas = carregarAbasWorkspace(wsId);
    if (salvas.length > 0) return salvas;
    const novoId = `sessao-${Date.now()}`;
    const inicial: ChatTab = {
      id: novoId,
      titulo: "Nova conversa",
      criadoEm: Date.now(),
    };
    salvarAbasWorkspace(wsId, [inicial]);
    return [inicial];
  });

  const sessaoAtivaId = sessaoParam || abas[0]?.id || null;
  const [historicoAberto, setHistoricoAberto] = useState<boolean>(false);

  // Sincroniza abas e URL ao montar ou mudar de workspaceId
  useEffect(() => {
    const salvas = carregarAbasWorkspace(wsId);
    let atualizadas = salvas;

    if (atualizadas.length === 0) {
      const novoId = `sessao-${Date.now()}`;
      const inicial: ChatTab = {
        id: novoId,
        titulo: "Nova conversa",
        criadoEm: Date.now(),
      };
      atualizadas = [inicial];
      salvarAbasWorkspace(wsId, atualizadas);
    }

    setAbas(atualizadas);

    if (sessaoParam) {
      const existe = atualizadas.some((a) => a.id === sessaoParam);
      if (!existe) {
        const novaAba: ChatTab = {
          id: sessaoParam,
          titulo: "Conversa",
          criadoEm: Date.now(),
        };
        const novaLista = [...atualizadas, novaAba];
        setAbas(novaLista);
        salvarAbasWorkspace(wsId, novaLista);
      }
      localStorage.setItem(`oc-secretario-sessao-ativa:${wsId}`, sessaoParam);
    } else if (atualizadas[0]) {
      const idPadrao = atualizadas[0].id;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("sessao", idPadrao);
          return next;
        },
        { replace: true },
      );
      localStorage.setItem(`oc-secretario-sessao-ativa:${wsId}`, idPadrao);
    }
  }, [wsId]);

  // Se o param da URL mudar externamente, assegura presença na lista e atualiza storage
  useEffect(() => {
    if (!sessaoParam) return;
    localStorage.setItem(`oc-secretario-sessao-ativa:${wsId}`, sessaoParam);
    setAbas((prev) => {
      if (prev.some((a) => a.id === sessaoParam)) return prev;
      const nova: ChatTab = {
        id: sessaoParam,
        titulo: "Conversa",
        criadoEm: Date.now(),
      };
      const proximo = [...prev, nova];
      salvarAbasWorkspace(wsId, proximo);
      return proximo;
    });
  }, [sessaoParam, wsId]);

  const aoSelecionarAba = useCallback(
    (id: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("sessao", id);
          return next;
        },
        { replace: false },
      );
      localStorage.setItem(`oc-secretario-sessao-ativa:${wsId}`, id);
    },
    [setSearchParams, wsId],
  );

  const aoNovaAba = useCallback(() => {
    const novoId = `sessao-${Date.now()}`;
    const novaAba: ChatTab = {
      id: novoId,
      titulo: "Nova conversa",
      criadoEm: Date.now(),
    };

    setAbas((prev) => {
      const proximo = [...prev, novaAba];
      salvarAbasWorkspace(wsId, proximo);
      return proximo;
    });

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("sessao", novoId);
        return next;
      },
      { replace: false },
    );
    localStorage.setItem(`oc-secretario-sessao-ativa:${wsId}`, novoId);
  }, [setSearchParams, wsId]);

  const aoFecharAba = useCallback(
    (idParaFechar: string) => {
      setAbas((prev) => {
        const idx = prev.findIndex((a) => a.id === idParaFechar);
        const restantes = prev.filter((a) => a.id !== idParaFechar);

        if (restantes.length === 0) {
          const novoId = `sessao-${Date.now()}`;
          const inicial: ChatTab = {
            id: novoId,
            titulo: "Nova conversa",
            criadoEm: Date.now(),
          };
          salvarAbasWorkspace(wsId, [inicial]);
          setSearchParams(
            (p) => {
              const next = new URLSearchParams(p);
              next.set("sessao", novoId);
              return next;
            },
            { replace: true },
          );
          localStorage.setItem(`oc-secretario-sessao-ativa:${wsId}`, novoId);
          return [inicial];
        }

        salvarAbasWorkspace(wsId, restantes);

        // Se a aba fechada era a que estava ativa na URL, foca na vizinha
        if (sessaoAtivaId === idParaFechar) {
          const proxIdx = Math.max(0, Math.min(idx - 1, restantes.length - 1));
          const proximoId = restantes[proxIdx]!.id;
          setSearchParams(
            (p) => {
              const next = new URLSearchParams(p);
              next.set("sessao", proximoId);
              return next;
            },
            { replace: true },
          );
          localStorage.setItem(`oc-secretario-sessao-ativa:${wsId}`, proximoId);
        }

        return restantes;
      });
    },
    [sessaoAtivaId, setSearchParams, wsId],
  );

  const aoAtualizarTitulo = useCallback(
    (sid: string, novoTitulo: string) => {
      setAbas((prev) => {
        const idx = prev.findIndex((a) => a.id === sid);
        if (idx === -1) return prev;
        const copia = [...prev];
        copia[idx] = { ...copia[idx]!, titulo: novoTitulo };
        salvarAbasWorkspace(wsId, copia);
        return copia;
      });
    },
    [wsId],
  );

  const aoSessaoCriada = useCallback(
    (sidBackend: string) => {
      if (!sessaoAtivaId || sessaoAtivaId === sidBackend) return;
      setAbas((prev) => {
        const idx = prev.findIndex((a) => a.id === sessaoAtivaId);
        if (idx === -1) return prev;
        const copia = [...prev];
        copia[idx] = { ...copia[idx]!, id: sidBackend };
        salvarAbasWorkspace(wsId, copia);
        return copia;
      });

      setSearchParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.set("sessao", sidBackend);
          return next;
        },
        { replace: true },
      );
      localStorage.setItem(`oc-secretario-sessao-ativa:${wsId}`, sidBackend);
    },
    [sessaoAtivaId, setSearchParams, wsId],
  );

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 overflow-hidden relative">
      <OpenCodeTabsHeader
        abas={abas}
        sessaoAtivaId={sessaoAtivaId}
        aoSelecionarAba={aoSelecionarAba}
        aoFecharAba={aoFecharAba}
        aoNovaAba={aoNovaAba}
        workspaceId={wsId}
        onAbrirHistorico={() => setHistoricoAberto(true)}
      />
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <SecretarioChat
          key={sessaoAtivaId || "default"}
          sessaoId={sessaoAtivaId || undefined}
          aoAtualizarTitulo={aoAtualizarTitulo}
          aoSessaoCriada={aoSessaoCriada}
        />
      </div>
      <HistoricoModal
        open={historicoAberto}
        onOpenChange={setHistoricoAberto}
        sessoes={abas.map((a) => ({
          id: a.id,
          titulo: a.titulo,
          criado_em: a.criadoEm,
        }))}
        sessaoAtivaId={sessaoAtivaId}
        onSelecionarSessao={aoSelecionarAba}
        onNovaConversa={aoNovaAba}
        onExcluirSessao={aoFecharAba}
      />
    </div>
  );
};
