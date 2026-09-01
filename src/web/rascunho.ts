/**
 * Rascunho do chat — fonte única do texto não-enviado (PLANO-PAINEL-V2 Etapa 1.5).
 *
 * A MESMA instância alimenta o composer da página do Secretário e o chat
 * lateral (drawer): digitar em um atualiza o outro (sync via __chatRascunhoInput)
 * e o texto sobrevive a navegação e reload (localStorage, chave oc-*).
 *
 * Guard de ambiente: importado por testes em node (sem localStorage).
 */

const CHAVE = 'oc-chat-rascunho';

let memoria: string | null = null;

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null; // localStorage bloqueado (iframe/privacy) — segue só em memória
  }
}

/** Texto do rascunho atual ('' se vazio). */
export function getRascunho(): string {
  if (memoria !== null) return memoria;
  memoria = storage()?.getItem(CHAVE) ?? '';
  return memoria;
}

/** Salva o rascunho (memória + persistência). */
export function setRascunho(texto: string): void {
  memoria = texto;
  try {
    storage()?.setItem(CHAVE, texto);
  } catch {
    /* quota/privacidade — memória basta */
  }
}

/** Limpa o rascunho (após enviar ou "nova conversa"). */
export function limparRascunho(): void {
  memoria = '';
  try {
    storage()?.removeItem(CHAVE);
  } catch {
    /* idem */
  }
}
