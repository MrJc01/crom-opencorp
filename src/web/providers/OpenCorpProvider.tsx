import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
  type FC,
  type ReactNode,
} from "react";
import { OpenCorpClient, ProblemDetailsError } from "@opencorp/sdk";
import { showToast } from "../shared/ui/Toast.js";

export interface OpenCorpContextValue {
  client: OpenCorpClient;
  workspaceId: string;
  definirWorkspaceId: (id: string) => void;
  tratarErro: (erro: unknown, fallbackTitulo?: string) => void;
  notificacoesNaoLidas: number;
  recarregarNotificacoes: () => Promise<void>;
  marcarNotificacaoComoLida: (id: string) => Promise<void>;
  marcarTodasComoLidas: () => Promise<void>;
  limparTodasNotificacoes: () => Promise<void>;
  sseConectado: boolean;
}

const OpenCorpContext = createContext<OpenCorpContextValue | null>(null);

export interface OpenCorpProviderProps {
  token?: string;
  workspaceId?: string;
  children: ReactNode;
}

export const OpenCorpProvider: FC<OpenCorpProviderProps> = ({
  token,
  workspaceId: propWorkspaceId,
  children,
}) => {
  const [wsAtivo, setWsAtivo] = useState<string>(() => {
    if (propWorkspaceId) return propWorkspaceId;
    if (typeof window !== "undefined") {
      const salvo =
        localStorage.getItem("oc-ws") ||
        localStorage.getItem("opencorp_workspace_id");
      if (salvo && salvo.trim().length > 0) {
        return salvo.trim();
      }
      return "yt-factory-01";
    }
    return "yt-factory-01";
  });

  const [notificacoesNaoLidas, setNotificacoesNaoLidas] = useState<number>(0);
  const [sseConectado, setSseConectado] = useState<boolean>(false);

  const authToken =
    token ||
    (typeof window !== "undefined"
      ? localStorage.getItem("oc-token") ||
        localStorage.getItem("opencorp_token") ||
        ""
      : "");

  const definirWorkspaceId = useCallback((id: string) => {
    const limpo = id ? id.trim() : "";
    setWsAtivo(limpo);
    if (typeof window !== "undefined") {
      if (limpo) {
        localStorage.setItem("oc-ws", limpo);
        localStorage.setItem("opencorp_workspace_id", limpo);
      } else {
        localStorage.removeItem("oc-ws");
        localStorage.removeItem("opencorp_workspace_id");
      }
    }
  }, []);

  const client = useMemo(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:4100";

    return new OpenCorpClient({
      baseUrl: origin,
      token: authToken,
      workspaceId: wsAtivo || "default",
      timeoutMs: 25_000,
    });
  }, [authToken, wsAtivo]);

  const tratarErro = useCallback((erro: unknown, fallbackTitulo = "Erro na Operação") => {
    if (erro instanceof ProblemDetailsError) {
      if (erro.status === 422 && erro.invalidParams && erro.invalidParams.length > 0) {
        const lista = erro.invalidParams
          .map((p) => `• ${p.name}: ${p.reason}`)
          .join("\n");
        showToast(`${erro.title}:\n${lista}`, "erro");
        return;
      }
      showToast(
        `[${erro.status}] ${erro.title}: ${erro.detail ?? ""}`.trim(),
        "erro",
      );
      return;
    }
    const msg = erro instanceof Error ? erro.message : "Erro inesperado";
    showToast(`${fallbackTitulo}: ${msg}`, "erro");
  }, []);

  const recarregarNotificacoes = useCallback(async () => {
    try {
      const res = await client.http.get<any>("/notifications?nao_lidas=1", {
        headers: wsAtivo ? { "x-opencorp-workspace": wsAtivo } : undefined,
      });
      if (res && res.resumo && typeof res.resumo.nao_lidas === "number") {
        setNotificacoesNaoLidas(res.resumo.nao_lidas);
      } else if (Array.isArray(res?.notificacoes)) {
        setNotificacoesNaoLidas(res.notificacoes.length);
      } else if (Array.isArray(res)) {
        setNotificacoesNaoLidas(res.length);
      } else {
        setNotificacoesNaoLidas(0);
      }
    } catch {
      // Ignora erro em polling silencioso de contagem
    }
  }, [client, wsAtivo]);

  const marcarNotificacaoComoLida = useCallback(
    async (id: string) => {
      try {
        await client.http.post(
          `/notifications/${encodeURIComponent(id)}/lida`,
          {},
          {
            headers: wsAtivo ? { "x-opencorp-workspace": wsAtivo } : undefined,
          }
        );
        setNotificacoesNaoLidas((prev) => Math.max(0, prev - 1));
        void recarregarNotificacoes();
      } catch (err: unknown) {
        tratarErro(err, "Erro ao marcar notificação como lida");
      }
    },
    [client, wsAtivo, recarregarNotificacoes, tratarErro]
  );

  const marcarTodasComoLidas = useCallback(async () => {
    try {
      await client.http.post(
        "/notifications/lidas",
        {},
        {
          headers: wsAtivo ? { "x-opencorp-workspace": wsAtivo } : undefined,
        }
      );
      setNotificacoesNaoLidas(0);
      void recarregarNotificacoes();
    } catch (err: unknown) {
      tratarErro(err, "Erro ao marcar todas as notificações como lidas");
    }
  }, [client, wsAtivo, recarregarNotificacoes, tratarErro]);

  const limparTodasNotificacoes = useCallback(async () => {
    try {
      await client.http.delete("/notifications", {
        headers: wsAtivo ? { "x-opencorp-workspace": wsAtivo } : undefined,
      });
      setNotificacoesNaoLidas(0);
      void recarregarNotificacoes();
    } catch (err: unknown) {
      tratarErro(err, "Erro ao limpar notificações");
    }
  }, [client, wsAtivo, recarregarNotificacoes, tratarErro]);

  // Carrega contagem ao montar ou alternar workspace
  useEffect(() => {
    void recarregarNotificacoes();
  }, [recarregarNotificacoes]);

  // Conexão SSE em tempo real com /events
  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = authToken
      ? `/events?token=${encodeURIComponent(authToken)}`
      : "/events";

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(url);
    } catch {
      setSseConectado(false);
      return;
    }

    eventSource.onopen = () => {
      setSseConectado(true);
    };

    eventSource.onerror = () => {
      setSseConectado(false);
    };

    const tratarDadosEvento = (ev: any) => {
      if (!ev) return;
      const tipoEvento = ev.tipo || "";
      const payload = ev.dados || ev;

      if (tipoEvento === "notificacao.nova" || tipoEvento === "notificacao") {
        setNotificacoesNaoLidas((prev) => prev + 1);
        void recarregarNotificacoes();
        const titulo = payload.titulo || payload.resumo || "Nova notificação recebida";
        const tipoToast =
          payload.tipo === "erro"
            ? "erro"
            : payload.tipo === "aviso"
            ? "aviso"
            : payload.tipo === "sucesso"
            ? "sucesso"
            : "info";
        showToast(`Alerta: ${titulo}`, tipoToast);
      } else if (tipoEvento === "run-fim") {
        const ag = payload.agente || "Agente";
        const st = payload.status || "finalizado";
        showToast(
          `Execução @${ag} finalizada (${st})`,
          st === "concluido" ? "sucesso" : "aviso"
        );
        void recarregarNotificacoes();
      } else if (
        tipoEvento === "secretario.mensagem" ||
        tipoEvento === "secretario:mensagem"
      ) {
        window.dispatchEvent(
          new CustomEvent("secretario:mensagem", { detail: payload })
        );
      }
    };

    const handleMessage = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        tratarDadosEvento(parsed);
      } catch {}
    };

    eventSource.onmessage = handleMessage;
    eventSource.addEventListener("notificacao", handleMessage);
    eventSource.addEventListener("notificacao.nova", handleMessage);
    eventSource.addEventListener("run-fim", handleMessage);

    return () => {
      if (eventSource) {
        try {
          eventSource.close();
        } catch {}
      }
    };
  }, [authToken, recarregarNotificacoes]);

  return (
    <OpenCorpContext.Provider
      value={{
        client,
        workspaceId: wsAtivo,
        definirWorkspaceId,
        tratarErro,
        notificacoesNaoLidas,
        recarregarNotificacoes,
        marcarNotificacaoComoLida,
        marcarTodasComoLidas,
        limparTodasNotificacoes,
        sseConectado,
      }}
    >
      {children}
    </OpenCorpContext.Provider>
  );
};

export function useOpenCorp(): OpenCorpContextValue {
  const ctx = useContext(OpenCorpContext);
  if (!ctx) {
    throw new Error(
      "useOpenCorp deve ser utilizado dentro de um <OpenCorpProvider>",
    );
  }
  return ctx;
}

