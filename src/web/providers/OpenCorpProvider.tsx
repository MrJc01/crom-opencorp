import { createContext, useContext, createMemo, type ParentComponent, type Accessor } from "solid-js";
import { OpenCorpClient, ProblemDetailsError } from "@opencorp/sdk";
import { showToast } from "../ui/Toast";

export interface OpenCorpContextValue {
  client: Accessor<OpenCorpClient>;
  tratarErro: (erro: unknown, fallbackTitulo?: string) => void;
}

const OpenCorpContext = createContext<OpenCorpContextValue>();

export const OpenCorpProvider: ParentComponent<{ token?: () => string; workspaceId?: () => string }> = (props) => {
  const client = createMemo(() => {
    const t = props.token?.() || localStorage.getItem("oc-token") || localStorage.getItem("opencorp_token") || "";
    const w = props.workspaceId?.() || localStorage.getItem("oc-ws") || localStorage.getItem("opencorp_workspace_id") || undefined;
    return new OpenCorpClient({
      baseUrl: window.location.origin,
      token: t,
      workspaceId: w,
      timeoutMs: 25_000,
    });
  });

  const tratarErro = (erro: unknown, fallbackTitulo: string = "Erro na Operação") => {
    if (erro instanceof ProblemDetailsError) {
      if (erro.status === 422 && erro.invalidParams && erro.invalidParams.length > 0) {
        const lista = erro.invalidParams.map((p) => `• ${p.name}: ${p.reason}`).join("\n");
        showToast(`${erro.title}:\n${lista}`, "erro");
        return;
      }
      showToast(`[${erro.status}] ${erro.title}: ${erro.detail ?? ""}`, "erro");
      return;
    }
    const msg = erro instanceof Error ? erro.message : "Erro inesperado";
    showToast(`${fallbackTitulo}: ${msg}`, "erro");
  };

  return (
    <OpenCorpContext.Provider value={{ client, tratarErro }}>
      {props.children}
    </OpenCorpContext.Provider>
  );
};

export function useOpenCorp(): OpenCorpContextValue {
  const ctx = useContext(OpenCorpContext);
  if (!ctx) {
    throw new Error("useOpenCorp deve ser usado dentro de um <OpenCorpProvider>");
  }
  return ctx;
}
