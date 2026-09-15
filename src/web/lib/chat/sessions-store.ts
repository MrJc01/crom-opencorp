import type { SessaoResumo } from "../../components/chat/HistoricoModal";
import type { SessionTabItem } from "../../components/secretario/SessionTabs";

const STORAGE_KEY_SESSAO_ATIVA = "opencorp:secretario:sessao-ativa";

export function obterSessaoInicialUrl(): string | null {
  try {
    const url = new URL(window.location.href);
    const param = url.searchParams.get("sessao");
    if (param && param.trim()) return param.trim();
    return localStorage.getItem(STORAGE_KEY_SESSAO_ATIVA) || null;
  } catch {
    return null;
  }
}

export function sincronizarUrlSessao(id: string | null): void {
  try {
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set("sessao", id);
      localStorage.setItem(STORAGE_KEY_SESSAO_ATIVA, id);
    } else {
      url.searchParams.delete("sessao");
      localStorage.removeItem(STORAGE_KEY_SESSAO_ATIVA);
    }
    window.history.replaceState({}, "", url.toString());
  } catch {}
}

export function formatarParaTabs(sessoes: SessaoResumo[], sessaoAtivaId: string | null): SessionTabItem[] {
  return sessoes.slice(0, 10).map((s) => ({
    id: s.id,
    title: s.titulo || (s.primeiraMensagem ? s.primeiraMensagem.slice(0, 28) : `Sessão ${s.id.slice(0, 8)}`),
    active: s.id === sessaoAtivaId,
  }));
}
