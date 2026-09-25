import React from "react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { GitStatusCard, type GitArquivoAlterado } from "./GitStatusCard.js";
import { HitlOptionsView } from "./HitlOptionsView.js";

/**
 * Tool UI Nativa: git_status
 * Renderiza o card interativo com botões de descarte e diff
 */
export const GitStatusToolUI = makeAssistantToolUI<
  { arquivos?: GitArquivoAlterado[]; workspaceId?: string },
  any
>({
  toolName: "git_status",
  render: ({ args, result }) => {
    const arquivos: GitArquivoAlterado[] =
      args?.arquivos ??
      (typeof result === "object" && result && "arquivos" in result
        ? (result as any).arquivos
        : []);
    return (
      <div className="my-2">
        <GitStatusCard
          arquivos={arquivos}
          workspaceId={args?.workspaceId ?? "default"}
        />
      </div>
    );
  },
});

/**
 * Tool UI Nativa: hitl_approval / pergunta_opcoes
 * Renderiza os botões interativos de opções de escolha para o usuário
 */
export const HitlApprovalToolUI = makeAssistantToolUI<
  { opcoes?: string[]; pergunta?: string },
  any
>({
  toolName: "hitl_approval",
  render: ({ args }) => {
    const texto =
      args?.pergunta ||
      (args?.opcoes
        ? args.opcoes.map((o: string, idx: number) => `${idx + 1}. ${o}`).join("\n")
        : "");
    return (
      <HitlOptionsView
        texto={texto}
        onSelecionarOpcao={(opt) => {
          const inputEl = document.getElementById("chat-input") as HTMLTextAreaElement | null;
          if (inputEl) {
            const protoSetter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype,
              "value",
            )?.set;
            if (protoSetter) {
              protoSetter.call(inputEl, opt);
            } else {
              inputEl.value = opt;
            }
            inputEl.dispatchEvent(new Event("input", { bubbles: true }));
            inputEl.dispatchEvent(new Event("change", { bubbles: true }));
            setTimeout(() => {
              const btn = document.getElementById("btn-enviar") as HTMLButtonElement | null;
              btn?.click();
            }, 50);
          }
        }}
      />
    );
  },
});

/**
 * Tool UI Nativa: terminal_exec
 * Renderiza o container monospace de saída do terminal
 */
export const TerminalExecToolUI = makeAssistantToolUI<
  { comando?: string; saida?: string },
  any
>({
  toolName: "terminal_exec",
  render: ({ args, result }) => {
    const cmd = args?.comando || "";
    const out = String(result ?? args?.saida ?? "");
    return (
      <div className="bg-zinc-950 text-emerald-400 font-mono p-3 rounded-lg border border-zinc-800 text-xs overflow-x-auto whitespace-pre leading-relaxed shadow-inner my-2">
        {cmd ? `$ !${cmd}\n` : ""}
        {out}
      </div>
    );
  },
});
