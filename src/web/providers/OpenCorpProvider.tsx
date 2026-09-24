import React, {
  createContext,
  useContext,
  useMemo,
  type FC,
  type ReactNode,
} from "react";
import { OpenCorpClient, ProblemDetailsError } from "@opencorp/sdk";
import { showToast } from "../shared/ui/Toast.js";

export interface OpenCorpContextValue {
  client: OpenCorpClient;
  workspaceId: string;
  tratarErro: (erro: unknown, fallbackTitulo?: string) => void;
}

const OpenCorpContext = createContext<OpenCorpContextValue | null>(null);

export interface OpenCorpProviderProps {
  token?: string;
  workspaceId?: string;
  children: ReactNode;
}

export const OpenCorpProvider: FC<OpenCorpProviderProps> = ({
  token,
  workspaceId,
  children,
}) => {
  const wsAtivo =
    workspaceId ||
    (typeof window !== "undefined"
      ? localStorage.getItem("oc-ws") ||
        localStorage.getItem("opencorp_workspace_id") ||
        "default"
      : "default");

  const authToken =
    token ||
    (typeof window !== "undefined"
      ? localStorage.getItem("oc-token") ||
        localStorage.getItem("opencorp_token") ||
        ""
      : "");

  const client = useMemo(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:4100";

    return new OpenCorpClient({
      baseUrl: origin,
      token: authToken,
      workspaceId: wsAtivo,
      timeoutMs: 25_000,
    });
  }, [authToken, wsAtivo]);

  const tratarErro = (erro: unknown, fallbackTitulo = "Erro na Operação") => {
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
  };

  return (
    <OpenCorpContext.Provider
      value={{
        client,
        workspaceId: wsAtivo,
        tratarErro,
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
