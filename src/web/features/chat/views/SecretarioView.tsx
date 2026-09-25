import React, { useState, useEffect, useCallback, type FC } from "react";
import { useSearchParams } from "react-router-dom";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import {
  OpenCodeTabsHeader,
  type ChatTab,
} from "../components/OpenCodeTabsHeader.js";
import { HistoricoModal } from "../components/HistoricoModal.js";
import { SecretarioChat } from "../components/SecretarioChat.js";
import { SecretarioSettingsDrawer } from "../components/SecretarioSettingsDrawer.js";
import { obterAuthHeaders } from "../runtime/secretary-runtime-adapter.js";

export function gerarTabKey(): string {
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Mantém uma única aba por sessão e por identidade visual persistente. */
export function deduplicarAbas(abas: ChatTab[]): ChatTab[] {
  const ids = new Set<string>();
  const tabKeys = new Set<string>();

  return abas.filter((aba) => {
    if (!aba || typeof aba.id !== "string" || !aba.id.trim()) return false;
    const tabKey = aba.tabKey || `tab_${aba.id}`;
    if (ids.has(aba.id) || tabKeys.has(tabKey)) return false;
    ids.add(aba.id);
    tabKeys.add(tabKey);
    return true;
  });
}

/**
 * Promove/atualiza a aba ativa sem criar uma conversa implicitamente.
 * Novas abas são responsabilidade exclusiva do botão `+`.
 */
export function atualizarAbaAtiva(
  abas: ChatTab[],
  sessaoAtivaId: string | null,
  mudancas: Partial<Pick<ChatTab, "id" | "titulo">>,
): ChatTab[] {
  if (abas.length === 0) return abas;
  let idx = sessaoAtivaId
    ? abas.findIndex((aba) => aba.id === sessaoAtivaId)
    : -1;
  if (idx < 0) {
    idx = abas.findIndex(
      (aba) => aba.id.startsWith("sessao-") || aba.id.startsWith("draft-"),
    );
  }
  if (idx < 0) idx = 0;

  const copia = [...abas];
  copia[idx] = { ...copia[idx]!, ...mudancas };
  return deduplicarAbas(copia);
}

/**
 * Lê as abas salvas do workspace no localStorage.
 */
export function carregarAbasWorkspace(workspaceId: string): ChatTab[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const chaveVersao = `oc-secretario-abas-schema:${workspaceId}`;
    const versaoAtual = localStorage.getItem(chaveVersao);
    const raw = localStorage.getItem(`oc-secretario-abas:${workspaceId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const normalizadas = parsed
          .filter((t) => t && typeof t.id === "string")
          .map((t) => ({
            ...t,
            tabKey: t.tabKey || `tab_${t.id}`,
          }));
        let unicas = deduplicarAbas(normalizadas);

        // Migração única: versões antigas criavam uma aba a cada promoção de
        // sessão. Preserva a aba ativa; as demais sessões seguem no histórico.
        if (versaoAtual !== "2" && unicas.length > 1) {
          const ativaId = localStorage.getItem(
            `oc-secretario-sessao-ativa:${workspaceId}`,
          );
          const ativa = unicas.find((aba) => aba.id === ativaId) || unicas.at(-1)!;
          unicas = [ativa];
        }
        salvarAbasWorkspace(workspaceId, unicas);
        return unicas;
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
      JSON.stringify(deduplicarAbas(abas)),
    );
    localStorage.setItem(`oc-secretario-abas-schema:${workspaceId}`, "2");
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
      tabKey: gerarTabKey(),
      titulo: "Nova conversa",
      criadoEm: Date.now(),
    };
    salvarAbasWorkspace(wsId, [inicial]);
    return [inicial];
  });

  const sessaoAtivaId = sessaoParam || abas[0]?.id || null;
  const [historicoAberto, setHistoricoAberto] = useState<boolean>(false);
  const [configLateralAberta, setConfigLateralAberta] = useState<boolean>(false);
  const [gitBranch, setGitBranch] = useState<string>("main");
  const [modeloAtivo, setModeloAtivo] = useState<string>("opencode/nemotron-3.5-lightning-free");

  // Sincroniza branch git do workspace
  useEffect(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:4100";
    fetch(`${origin}/workspaces/git/status?workspace=${encodeURIComponent(wsId)}`, {
      headers: {
        ...obterAuthHeaders(),
        ...(wsId ? { "x-opencorp-workspace": wsId } : {}),
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.branch) setGitBranch(data.branch);
      })
      .catch(() => {});
  }, [wsId]);

  // Sincroniza abas e URL ao montar ou mudar de workspaceId
  useEffect(() => {
    const salvas = carregarAbasWorkspace(wsId);
    let atualizadas = salvas;

    if (atualizadas.length === 0) {
      const novoId = `sessao-${Date.now()}`;
      const inicial: ChatTab = {
        id: novoId,
        tabKey: gerarTabKey(),
        titulo: "Nova conversa",
        criadoEm: Date.now(),
      };
      atualizadas = [inicial];
      salvarAbasWorkspace(wsId, atualizadas);
    }

    setAbas(atualizadas);

    if (sessaoParam) {
      if (!atualizadas.some((a) => a.id === sessaoParam)) {
        atualizadas = atualizarAbaAtiva(atualizadas, null, { id: sessaoParam });
        setAbas(atualizadas);
        salvarAbasWorkspace(wsId, atualizadas);
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

  // Se a URL mudar externamente, promove a aba ativa; nunca cria uma aba implícita.
  useEffect(() => {
    if (!sessaoParam) return;
    localStorage.setItem(`oc-secretario-sessao-ativa:${wsId}`, sessaoParam);
    setAbas((prev) => {
      if (prev.some((a) => a.id === sessaoParam)) return prev;
      const idPersistido = localStorage.getItem(
        `oc-secretario-sessao-ativa:${wsId}`,
      );
      const proximo = atualizarAbaAtiva(
        prev,
        idPersistido && idPersistido !== sessaoParam ? idPersistido : null,
        { id: sessaoParam },
      );
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
      tabKey: gerarTabKey(),
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
            tabKey: gerarTabKey(),
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
        const copia = atualizarAbaAtiva(prev, sid || sessaoAtivaId, {
          titulo: novoTitulo,
        });
        salvarAbasWorkspace(wsId, copia);
        return copia;
      });
    },
    [sessaoAtivaId, wsId],
  );

  const aoSessaoCriada = useCallback(
    (sidBackend: string) => {
      const realId = String(sidBackend || "").trim();
      if (!realId || sessaoAtivaId === realId) return;

      setAbas((prev) => {
        const copia = atualizarAbaAtiva(prev, sessaoAtivaId, { id: realId });
        salvarAbasWorkspace(wsId, copia);
        return copia;
      });

      setSearchParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.set("sessao", realId);
          return next;
        },
        { replace: true },
      );
      localStorage.setItem(`oc-secretario-sessao-ativa:${wsId}`, realId);
    },
    [sessaoAtivaId, setSearchParams, wsId],
  );

  const abaAtiva = abas.find((a) => a.id === sessaoAtivaId) || abas[0];
  const chatKey = abaAtiva?.tabKey || abaAtiva?.id || "default";

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 overflow-hidden relative">
      <OpenCodeTabsHeader
        abas={abas}
        sessaoAtivaId={sessaoAtivaId}
        aoSelecionarAba={aoSelecionarAba}
        aoFecharAba={aoFecharAba}
        aoNovaAba={aoNovaAba}
        workspaceId={wsId}
        gitBranch={gitBranch}
        modeloAtivo={modeloAtivo}
        onAbrirHistorico={() => setHistoricoAberto(true)}
        onAbrirConfiguracoes={() => setConfigLateralAberta(true)}
      />
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <SecretarioChat
          key={chatKey}
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
      <SecretarioSettingsDrawer
        aberto={configLateralAberta}
        onFechar={() => setConfigLateralAberta(false)}
        workspaceId={wsId}
        modeloAtivo={modeloAtivo}
        onAplicarModelo={(m) => setModeloAtivo(m)}
      />
    </div>
  );
};
