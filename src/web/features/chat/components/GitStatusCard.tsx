import React, { useState, type FC } from "react";
import { GitBranch, RotateCcw, ExternalLink, Check, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface GitArquivoAlterado {
  arquivo: string;
  status: "M" | "A" | "D" | "?" | "R";
}

export interface GitStatusCardProps {
  workspaceId: string;
  arquivos: GitArquivoAlterado[];
  branch?: string;
  onArquivoRestaurado?: (arquivo: string) => void;
}

export function parsearSaidaGitStatus(texto: string): GitArquivoAlterado[] {
  if (!texto) return [];
  const linhas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const arquivos: GitArquivoAlterado[] = [];

  for (const linha of linhas) {
    // Formato git status short: "M src/file.ts", "?? novo.txt", "A index.ts", "D antiga.ts"
    const match = linha.match(/^(\?\?|[MADRCU])\s+(.+)$/);
    if (match) {
      const tipoBruto = match[1];
      const arq = match[2]?.trim();
      if (!arq) continue;

      let status: GitArquivoAlterado["status"] = "M";
      if (tipoBruto === "??" || tipoBruto === "A") status = "A";
      else if (tipoBruto === "D") status = "D";
      else if (tipoBruto === "R") status = "R";
      else status = "M";

      arquivos.push({ arquivo: arq, status });
    }
  }

  return arquivos;
}

export const GitStatusCard: FC<GitStatusCardProps> = ({
  workspaceId,
  arquivos,
  branch,
  onArquivoRestaurado,
}) => {
  const navigate = useNavigate();
  const [descartando, setDescartando] = useState<Record<string, boolean>>({});
  const [sucessos, setSucessos] = useState<Record<string, boolean>>({});
  const [erros, setErros] = useState<Record<string, string>>({});

  if (!arquivos || arquivos.length === 0) return null;

  const descartarArquivo = async (caminho: string) => {
    setDescartando((prev) => ({ ...prev, [caminho]: true }));
    setErros((prev) => {
      const c = { ...prev };
      delete c[caminho];
      return c;
    });

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (typeof window !== "undefined") {
        const token =
          localStorage.getItem("oc-token") ||
          localStorage.getItem("opencorp_token");
        if (token) headers["Authorization"] = `Bearer ${token.trim()}`;
      }

      const res = await fetch(
        `/workspaces/git/restore?workspace=${encodeURIComponent(workspaceId)}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ arquivo: caminho }),
        },
      );

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.sucesso !== false) {
        setSucessos((prev) => ({ ...prev, [caminho]: true }));
        onArquivoRestaurado?.(caminho);
        setTimeout(() => {
          setSucessos((prev) => {
            const c = { ...prev };
            delete c[caminho];
            return c;
          });
        }, 3000);
      } else {
        setErros((prev) => ({
          ...prev,
          [caminho]: data.erro || "Falha ao restaurar",
        }));
      }
    } catch (err: any) {
      setErros((prev) => ({
        ...prev,
        [caminho]: err.message || "Erro de conexão",
      }));
    } finally {
      setDescartando((prev) => ({ ...prev, [caminho]: false }));
    }
  };

  const abrirNoWorkspace = (caminho: string) => {
    navigate(`/w/${encodeURIComponent(workspaceId)}/workspace?file=${encodeURIComponent(caminho)}`);
  };

  const badgeConfig = (st: GitArquivoAlterado["status"]) => {
    switch (st) {
      case "M":
        return {
          rotulo: "M",
          titulo: "Modificado",
          classe: "bg-amber-950/60 text-amber-300 border-amber-800/60",
        };
      case "A":
      case "?":
        return {
          rotulo: "A",
          titulo: "Novo / Adicionado",
          classe: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60",
        };
      case "D":
        return {
          rotulo: "D",
          titulo: "Deletado",
          classe: "bg-rose-950/60 text-rose-300 border-rose-800/60",
        };
      case "R":
        return {
          rotulo: "R",
          titulo: "Renomeado",
          classe: "bg-blue-950/60 text-blue-300 border-blue-800/60",
        };
    }
  };

  return (
    <div className="my-2.5 rounded-xl border border-zinc-800 bg-zinc-950/90 text-xs overflow-hidden shadow-lg">
      <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900/80 border-b border-zinc-800/80 text-[11px] font-mono">
        <div className="flex items-center gap-2 text-zinc-300">
          <GitBranch size={13} className="text-emerald-400" />
          <span className="font-semibold text-zinc-100">Git Status</span>
          {branch && (
            <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
              {branch}
            </span>
          )}
        </div>
        <span className="text-zinc-500">
          {arquivos.length} {arquivos.length === 1 ? "arquivo alterado" : "arquivos alterados"}
        </span>
      </div>

      <div className="divide-y divide-zinc-800/50 max-h-64 overflow-y-auto font-mono text-[11px]">
        {arquivos.map((item) => {
          const cfg = badgeConfig(item.status);
          const isCarregando = descartando[item.arquivo];
          const isSucesso = sucessos[item.arquivo];
          const msgErro = erros[item.arquivo];

          return (
            <div
              key={item.arquivo}
              className="flex items-center justify-between px-3.5 py-2 hover:bg-zinc-900/40 transition-colors gap-2"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span
                  title={cfg.titulo}
                  className={`h-4.5 w-4.5 rounded flex items-center justify-center font-bold text-[10px] border shrink-0 ${cfg.classe}`}
                >
                  {cfg.rotulo}
                </span>
                <span className="text-zinc-200 truncate" title={item.arquivo}>
                  {item.arquivo}
                </span>
                {msgErro && (
                  <span className="text-[10px] text-rose-400 flex items-center gap-0.5 truncate">
                    <AlertCircle size={10} /> {msgErro}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => abrirNoWorkspace(item.arquivo)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer text-[10px]"
                  title="Abrir no editor do workspace"
                >
                  <ExternalLink size={11} />
                  <span>Abrir</span>
                </button>

                <button
                  type="button"
                  disabled={isCarregando || isSucesso}
                  onClick={() => descartarArquivo(item.arquivo)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors cursor-pointer text-[10px] border ${
                    isSucesso
                      ? "bg-emerald-950/50 text-emerald-300 border-emerald-800/60"
                      : "bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 hover:text-rose-100 border-rose-900/40"
                  }`}
                  title="Descartar alterações (git restore)"
                >
                  {isSucesso ? (
                    <>
                      <Check size={11} className="text-emerald-400" />
                      <span>Descartado</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw
                        size={11}
                        className={isCarregando ? "animate-spin" : ""}
                      />
                      <span>{isCarregando ? "Revertendo..." : "Descartar"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
