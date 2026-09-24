import React, { useState, useRef, useEffect, useCallback, type FC } from "react";
import { Terminal, Plus, X, Trash2, Play } from "lucide-react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { showToast } from "../../../shared/ui/Toast.js";

export interface TabTerminal {
  id: string;
  nome: string;
  log: string;
  historico: string[];
  histIdx: number;
}

export interface WorkspaceTerminalsProps {
  altura?: string | number;
}

export const WorkspaceTerminals: FC<WorkspaceTerminalsProps> = ({ altura = "12rem" }) => {
  const { workspaceId, client } = useOpenCorp();
  const [terminais, setTerminais] = useState<TabTerminal[]>([
    {
      id: "term-1",
      nome: "Terminal 1",
      log: "opencorp workspace shell v0.7.0 — digite comandos (ex: tasks list, doctor, flow list)\n",
      historico: [],
      histIdx: -1,
    },
  ]);
  const [terminalAtivo, setTerminalAtivo] = useState<string>("term-1");
  const [terminalInput, setTerminalInput] = useState<string>("");
  const [rodandoCmd, setRodandoCmd] = useState<boolean>(false);

  const termLogRef = useRef<HTMLPreElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll do terminal ativo
  const rolarParaFim = useCallback(() => {
    if (termLogRef.current) {
      termLogRef.current.scrollTop = termLogRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    rolarParaFim();
  }, [terminais, terminalAtivo, rolarParaFim]);

  // Criar nova aba (máximo 4)
  const criarTerminal = () => {
    if (terminais.length >= 4) {
      showToast("Limite de 4 abas de terminal atingido", "aviso");
      return;
    }
    const proxNum = terminais.length + 1;
    const novoId = `term-${Date.now().toString(36).slice(-4)}`;
    const novaAba: TabTerminal = {
      id: novoId,
      nome: `Terminal ${proxNum}`,
      log: `opencorp shell (Terminal ${proxNum}) inicializado no workspace ${workspaceId || "padrão"}\n`,
      historico: [],
      histIdx: -1,
    };
    setTerminais((prev) => [...prev, novaAba]);
    setTerminalAtivo(novoId);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Fechar aba de terminal
  const fecharTerminal = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (terminais.length <= 1) {
      showToast("Não é possível fechar a última aba do terminal", "aviso");
      return;
    }
    const idx = terminais.findIndex((t) => t.id === id);
    const rest = terminais.filter((t) => t.id !== id);
    setTerminais(rest);
    if (terminalAtivo === id) {
      const proximo = rest[Math.min(idx, rest.length - 1)]?.id || rest[0].id;
      setTerminalAtivo(proximo);
    }
  };

  // Limpar log da aba ativa
  const limparTerminalAtivo = () => {
    setTerminais((prev) =>
      prev.map((t) => (t.id === terminalAtivo ? { ...t, log: "" } : t)),
    );
  };

  // Executar comando via POST /terminal
  const rodarTerminal = async () => {
    const cmd = terminalInput.trim();
    if (!cmd || rodandoCmd) return;

    setTerminalInput("");
    setRodandoCmd(true);

    const tid = terminalAtivo;
    setTerminais((prev) =>
      prev.map((t) => {
        if (t.id !== tid) return t;
        const novoHist = [...t.historico, cmd];
        return {
          ...t,
          log: t.log + `\nws$ ${cmd}\n`,
          historico: novoHist,
          histIdx: novoHist.length,
        };
      }),
    );

    setTimeout(rolarParaFim, 20);

    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:4100";
      const resp = await fetch(`${origin}/terminal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(workspaceId ? { "x-opencorp-workspace": workspaceId } : {}),
        },
        body: JSON.stringify({
          comando: cmd,
          workspace: workspaceId,
        }),
      });

      const res = (await resp.json()) as { saida?: string; erro?: string; codigo?: number };
      const saida = res.saida || res.erro || "(sem saída)";
      const statusStr = res.codigo === 0 ? "✓ [ok]" : `✗ [código ${res.codigo ?? 1}]`;

      setTerminais((prev) =>
        prev.map((t) =>
          t.id === tid
            ? { ...t, log: t.log + saida + `\n${statusStr}\n` }
            : t,
        ),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTerminais((prev) =>
        prev.map((t) =>
          t.id === tid ? { ...t, log: t.log + `erro de conexão: ${msg}\n` } : t,
        ),
      );
    } finally {
      setRodandoCmd(false);
      setTimeout(rolarParaFim, 50);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  };

  // Navegação no Histórico com Setas ↑ e ↓
  const tratarTeclasInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !rodandoCmd) {
      e.preventDefault();
      void rodarTerminal();
      return;
    }

    const t = terminais.find((x) => x.id === terminalAtivo);
    if (!t || t.historico.length === 0) return;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      const novoIdx = t.histIdx <= 0 ? 0 : t.histIdx - 1;
      setTerminais((prev) =>
        prev.map((term) => (term.id === terminalAtivo ? { ...term, histIdx: novoIdx } : term)),
      );
      setTerminalInput(t.historico[novoIdx] || "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const novoIdx = t.histIdx >= t.historico.length - 1 ? t.historico.length : t.histIdx + 1;
      setTerminais((prev) =>
        prev.map((term) => (term.id === terminalAtivo ? { ...term, histIdx: novoIdx } : term)),
      );
      if (novoIdx >= t.historico.length) {
        setTerminalInput("");
      } else {
        setTerminalInput(t.historico[novoIdx] || "");
      }
    }
  };

  const termAtual = terminais.find((t) => t.id === terminalAtivo);

  return (
    <div
      style={{ height: typeof altura === "number" ? `${altura}px` : altura }}
      className="border-t border-zinc-850 bg-zinc-950 flex flex-col flex-shrink-0 select-none overflow-hidden"
    >
      {/* Barra de Tabs dos Terminais */}
      <div className="h-8 px-3 border-b border-zinc-850/80 flex items-center justify-between text-xs bg-zinc-900/60">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          <Terminal size={13} className="text-emerald-400 mr-1.5 shrink-0" />
          {terminais.map((term) => {
            const ativo = terminalAtivo === term.id;
            return (
              <div
                key={term.id}
                onClick={() => setTerminalAtivo(term.id)}
                className={`group flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-mono cursor-pointer transition-colors ${
                  ativo
                    ? "bg-zinc-800 text-zinc-100 font-semibold border border-zinc-700/60"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
                }`}
              >
                <span>{term.nome}</span>
                {terminais.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => fecharTerminal(term.id, e)}
                    className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-0.5 rounded transition-opacity"
                    title="Fechar terminal"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            );
          })}

          {terminais.length < 4 && (
            <button
              type="button"
              onClick={criarTerminal}
              title="Nova aba de Terminal"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <Plus size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-zinc-500 shrink-0">
          <button
            type="button"
            onClick={limparTerminalAtivo}
            className="flex items-center gap-1 text-[10px] hover:text-zinc-300 font-mono px-2 py-0.5 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Limpar saída do terminal ativo"
          >
            <Trash2 size={11} />
            <span>Limpar</span>
          </button>
        </div>
      </div>

      {/* Saída de Log do Terminal Ativo */}
      <pre
        ref={termLogRef}
        className="flex-1 p-2.5 overflow-y-auto font-mono text-[11px] text-zinc-300 select-text whitespace-pre-wrap leading-relaxed scrollbar-thin bg-zinc-950"
      >
        {termAtual?.log || ""}
      </pre>

      {/* Linha de Prompt e Entrada de Comando */}
      <div className="h-9 px-3 border-t border-zinc-850/80 flex items-center gap-2 bg-zinc-950">
        <span className="text-emerald-400 font-mono text-xs font-bold select-none">ws$</span>
        <input
          ref={inputRef}
          type="text"
          placeholder="Digite um comando (ex: tasks list, doctor, flow list)..."
          value={terminalInput}
          onChange={(e) => setTerminalInput(e.target.value)}
          onKeyDown={tratarTeclasInput}
          disabled={rodandoCmd}
          className="flex-1 bg-transparent text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none disabled:opacity-50 select-text"
        />
        {rodandoCmd && (
          <span className="text-[10px] text-amber-400 font-mono animate-pulse shrink-0">
            executando...
          </span>
        )}
      </div>
    </div>
  );
};
