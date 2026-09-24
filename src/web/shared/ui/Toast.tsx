import React, { useState, useEffect, type FC } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export interface ToastItem {
  id: string;
  mensagem: string;
  tipo: "sucesso" | "erro" | "aviso" | "info";
}

type ToastListener = (toasts: ToastItem[]) => void;

let toastsMemoria: ToastItem[] = [];
const listeners: Set<ToastListener> = new Set();

function notificar() {
  const copia = [...toastsMemoria];
  listeners.forEach((l) => l(copia));
}

export function showToast(
  mensagem: string,
  tipo: "sucesso" | "erro" | "aviso" | "info" = "info",
  duracao = 4000,
): void {
  const id = Math.random().toString(36).slice(2, 9);
  toastsMemoria = [...toastsMemoria, { id, mensagem, tipo }];
  notificar();

  setTimeout(() => {
    toastsMemoria = toastsMemoria.filter((t) => t.id !== id);
    notificar();
  }, duracao);
}

export const ToastContainer: FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>(toastsMemoria);

  useEffect(() => {
    listeners.add(setToasts);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  const fechar = (id: string) => {
    toastsMemoria = toastsMemoria.filter((t) => t.id !== id);
    notificar();
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      {toasts.map((t) => {
        const estiloCor =
          t.tipo === "sucesso"
            ? "bg-emerald-950/80 border-emerald-800/80 text-emerald-200"
            : t.tipo === "erro"
            ? "bg-rose-950/80 border-rose-800/80 text-rose-200"
            : t.tipo === "aviso"
            ? "bg-amber-950/80 border-amber-800/80 text-amber-200"
            : "bg-zinc-900/90 border-zinc-800 text-zinc-200";

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-xl border shadow-xl text-xs backdrop-blur-md transition-all ${estiloCor}`}
          >
            <div className="flex-shrink-0 mt-0.5">
              {t.tipo === "sucesso" && <CheckCircle2 size={15} className="text-emerald-400" />}
              {t.tipo === "erro" && <AlertCircle size={15} className="text-rose-400" />}
              {t.tipo === "aviso" && <AlertCircle size={15} className="text-amber-400" />}
              {t.tipo === "info" && <Info size={15} className="text-zinc-400" />}
            </div>
            <div className="flex-1 font-medium leading-relaxed whitespace-pre-wrap">
              {t.mensagem}
            </div>
            <button
              type="button"
              onClick={() => fechar(t.id)}
              className="opacity-60 hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
