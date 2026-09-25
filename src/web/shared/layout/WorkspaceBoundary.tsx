import React, { useEffect, useState, type FC } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { FolderX, LoaderCircle } from "lucide-react";
import { ProblemDetailsError } from "@opencorp/sdk";
import { OpenCorpProvider, useOpenCorp } from "../../providers/OpenCorpProvider.js";
import { AppLayout } from "./AppLayout.js";

type EstadoValidacao = "carregando" | "valido" | "nao-encontrado" | "erro";

const WORKSPACE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function workspaceNaoEncontrado(erro: unknown): boolean {
  return (
    erro instanceof ProblemDetailsError &&
    (erro.status === 404 ||
      (erro.status === 422 && erro.detail?.toLowerCase().includes("workspace") === true &&
        erro.detail.toLowerCase().includes("não encontrado")))
  );
}

export const WorkspaceBoundary: FC = () => {
  const { workspaceId: workspaceIdParam } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const { client } = useOpenCorp();
  const workspaceId = workspaceIdParam?.trim() ?? "";
  const idValido = WORKSPACE_ID_RE.test(workspaceId) && workspaceId.length <= 64;
  const [estado, setEstado] = useState<EstadoValidacao>("carregando");

  useEffect(() => {
    if (!idValido) return;

    const controller = new AbortController();
    setEstado("carregando");

    void client.http
      .get(`/workspaces/${encodeURIComponent(workspaceId)}`, {
        signal: controller.signal,
      })
      .then(() => {
        if (controller.signal.aborted) return;
        setEstado("valido");
      })
      .catch((erro: unknown) => {
        if (controller.signal.aborted) return;
        if (workspaceNaoEncontrado(erro)) {
          setEstado("nao-encontrado");
          return;
        }
        setEstado("erro");
      });

    return () => controller.abort();
  }, [client.http, idValido, workspaceId]);

  if (!idValido) {
    return <Navigate to="/workspaces" replace />;
  }

  if (estado === "carregando") {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <div className="flex items-center gap-2 text-sm">
          <LoaderCircle size={18} className="animate-spin text-emerald-400" />
          <span>Validando workspace…</span>
        </div>
      </div>
    );
  }

  if (estado === "nao-encontrado") {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center shadow-2xl">
          <FolderX size={36} className="mx-auto mb-4 text-amber-400" />
          <h1 className="text-lg font-semibold">Workspace não encontrado</h1>
          <p className="mt-2 text-sm text-zinc-400">
            O projeto <span className="font-mono text-zinc-200">{workspaceId}</span> não está disponível.
          </p>
          <button
            type="button"
            onClick={() => navigate("/workspaces", { replace: true })}
            className="mt-6 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            Ir para a lista de projetos
          </button>
        </div>
      </div>
    );
  }

  if (estado === "erro") {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 p-6 text-center text-sm text-zinc-400">
        Não foi possível validar o workspace. Verifique a conexão e recarregue a página.
      </div>
    );
  }

  return (
    <OpenCorpProvider key={workspaceId} workspaceId={workspaceId}>
      <AppLayout />
    </OpenCorpProvider>
  );
};
