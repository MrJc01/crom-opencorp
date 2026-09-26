import React, { useCallback, useEffect, useState, type FC } from "react";
import { AlertCircle, Check, Loader2, RotateCcw } from "lucide-react";
import { useOpenCorp } from "../../../providers/OpenCorpProvider.js";
import { showToast } from "../../../shared/ui/Toast.js";

interface Mudanca {
  caminho: string;
  tipo: string;
  acao: "update" | "create" | "delete";
  campos: string[];
  transformacoes: string[];
  avisos: string[];
}

interface EstadoMigracao {
  pendente: boolean;
  primeiroAviso: string | null;
  removidoNaoAntesDe: string;
  versaoRemocao: string;
  mudancas: Mudanca[];
  avisos: string[];
  backups: Array<{ id: string; criadoEm: string; arquivos: number }>;
}

/**
 * Aviso não bloqueante de configuração legada (Etapa 14). Nunca migra sozinho:
 * mostra a prévia, exige confirmação e exibe o backup com opção de desfazer.
 */
export const LegacyConfigBanner: FC = () => {
  const { client } = useOpenCorp();
  const [estado, setEstado] = useState<EstadoMigracao | null>(null);
  const [previa, setPrevia] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [ultimoBackup, setUltimoBackup] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setEstado(await client.http.get<EstadoMigracao>("/api/config/migracao"));
    } catch {
      setEstado(null);
    }
  }, [client]);

  useEffect(() => { void carregar(); }, [carregar]);

  const aplicar = async () => {
    if (!confirm("Migrar as configurações legadas para o formato novo? Um backup é criado antes e pode ser restaurado.")) return;
    setOcupado(true);
    try {
      const r = await client.http.post<{ backup: string | null; aplicados: string[] }>("/api/config/migracao/aplicar", { confirmar: true });
      setUltimoBackup(r.backup);
      showToast(`Migração concluída (${r.aplicados.length} arquivo(s)). Backup: ${r.backup}`, "sucesso");
      setPrevia(false);
      await carregar();
    } catch (err) {
      showToast(`Migração não aplicada: ${err instanceof Error ? err.message : String(err)}`, "erro");
    } finally {
      setOcupado(false);
    }
  };

  const desfazer = async () => {
    if (!ultimoBackup || !confirm(`Restaurar as configurações a partir do backup ${ultimoBackup}?`)) return;
    setOcupado(true);
    try {
      await client.http.post("/api/config/migracao/rollback", { backup: ultimoBackup });
      showToast("Configurações restauradas do backup.", "sucesso");
      setUltimoBackup(null);
      await carregar();
    } catch (err) {
      showToast(`Falha ao restaurar: ${err instanceof Error ? err.message : String(err)}`, "erro");
    } finally {
      setOcupado(false);
    }
  };

  if (ultimoBackup) {
    return (
      <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-3 text-xs text-emerald-200">
        <span className="flex items-center gap-2"><Check size={14} aria-hidden="true" /> Configurações migradas. Backup: <code className="font-mono">{ultimoBackup}</code></span>
        <button type="button" disabled={ocupado} onClick={() => void desfazer()} className="flex items-center gap-1 rounded-md border border-emerald-800 px-2 py-1 hover:bg-emerald-900/40 disabled:opacity-50">
          <RotateCcw size={12} aria-hidden="true" /> Desfazer
        </button>
      </div>
    );
  }
  if (!estado?.pendente) return null;

  return (
    <div role="status" className="space-y-2 rounded-xl border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0 text-amber-400" aria-hidden="true" />
          Configuração em formato antigo detectada ({estado.mudancas.length} arquivo(s)). Continua funcionando até pelo menos {estado.removidoNaoAntesDe} (v{estado.versaoRemocao}).
        </span>
        <span className="flex gap-2">
          <button type="button" aria-expanded={previa} onClick={() => setPrevia((v) => !v)} className="rounded-md border border-amber-800 px-2 py-1 hover:bg-amber-900/30">
            {previa ? "Ocultar prévia" : "Ver prévia"}
          </button>
          <button type="button" disabled={ocupado} onClick={() => void aplicar()} className="flex items-center gap-1 rounded-md bg-amber-600 px-2 py-1 font-semibold text-white hover:bg-amber-500 disabled:opacity-50">
            {ocupado && <Loader2 size={12} className="animate-spin" aria-hidden="true" />} Migrar…
          </button>
        </span>
      </div>
      {previa && (
        <ul className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">
          {estado.mudancas.map((m) => (
            <li key={m.caminho}>
              <span className="font-mono text-zinc-200">{m.caminho}</span>{" "}
              <span className="text-zinc-500">({m.acao === "delete" ? "removido; vai para o backup" : m.acao === "create" ? "criado" : "atualizado"})</span>
              {m.transformacoes.map((t) => <div key={t} className="pl-3 text-zinc-400">→ {t}</div>)}
              {m.avisos.map((a) => <div key={a} className="pl-3 text-amber-300">⚠ {a}</div>)}
            </li>
          ))}
          {estado.avisos.map((a) => <li key={a} className="text-amber-300">⚠ {a}</li>)}
        </ul>
      )}
    </div>
  );
};
