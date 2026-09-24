/**
 * @module cli/ui/stream-renderer — Utilitários de renderização e formatação de texto para TTY
 */

/**
 * Remove blocos de raciocínio (<think>...</think> ou <thought>...</thought>) de respostas de IA.
 */
export function limparTagsPensamento(texto: string): string {
  return texto
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .trim();
}

/**
 * Extrai o raciocínio (<think>) separando da resposta final.
 */
export function extrairPensamento(texto: string): { pensamento: string; resposta: string } {
  const thinkMatches: string[] = [];
  const regex = /<(?:think|thought)>([\s\S]*?)<\/(?:think|thought)>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(texto)) !== null) {
    if (match[1]?.trim()) thinkMatches.push(match[1].trim());
  }

  const resposta = limparTagsPensamento(texto);
  return {
    pensamento: thinkMatches.join("\n\n"),
    resposta,
  };
}
