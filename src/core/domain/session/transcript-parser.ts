/**
 * @module core/domain/session/transcript-parser
 *
 * Módulo puro de domínio para processamento, sanitização de ANSI e parsing
 * de transcripts de sessões e subprocessos.
 *
 * Princípios:
 * - Funções puras e determinísticas (Zero I/O, Zero SQL, Zero dependências externas).
 * - Imutabilidade e segurança de tipos estrita.
 *
 * @see docs/PADRONIZACAO_ARQUITETURAL_OPENCORP.md (Passo 6)
 */

// ── Expressões Regulares de Controle Terminal ─────────────────────────────────

// ── Expressões Regulares de Controle Terminal ─────────────────────────────────

/**
 * Sequências OSC (Operating System Command): títulos de janela e metadados (\x1b]...\x07 ou \x1b]...\x1b\)
 */
const OSC_REGEX = /\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g;

/**
 * Sequências CSI (Control Sequence Introducer) e códigos de controle ANSI de 2 caracteres:
 * - Cores 16, 256 e TrueColor (SGR)
 * - Comandos de cursor e tela (CSI)
 * - Modos privados
 */
const CSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

// ── Funções Puras de Domínio ──────────────────────────────────────────────────

/**
 * Remove todos os códigos de controle e cores ANSI do terminal de forma robusta.
 *
 * Suporta:
 * - Cores básicas (30-37, 40-47, 90-97, 100-107)
 * - Modificadores (negrito, itálico, sublinhado, reset \x1b[0m)
 * - Cores 256 (38;5;n / 48;5;n)
 * - Cores TrueColor RGB (38;2;r;g;b / 48;2;r;g;b)
 * - Movimentação e limpeza de cursor (\x1b[2J, \x1b[H, \x1b[K)
 * - Títulos de janela OSC (\x1b]0;...\x07)
 */
export function limparAnsi(texto: string): string {
  if (!texto) return "";
  return texto.replace(OSC_REGEX, "").replace(CSI_REGEX, "");
}

/**
 * Padroniza quebras de linha do sistema operacional, convertendo CRLF (`\r\n`)
 * e CR (`\r`) isolados para LF (`\n`).
 */
export function normalizarQuebrasDeLinha(texto: string): string {
  if (!texto) return "";
  return texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Sanitiza a saída bruta de stdout/stderr de processos, eliminando caracteres
 * de controle nulos e sequências ANSI, enquanto preserva estritamente a
 * legibilidade do Markdown, JSONs estruturados e acentuação UTF-8.
 */
export function sanitizarTranscript(rawOutput: string): string {
  if (!rawOutput) return "";

  // 1. Remove caracteres de controle nulos e indesejados (mantendo tabs \t e quebras \n)
  const semControles = rawOutput.replace(/[\u0000\u0008\u000B\u000C]/g, "");

  // 2. Normaliza quebras de linha para LF
  const normalizado = normalizarQuebrasDeLinha(semControles);

  // 3. Remove sequências de escape ANSI
  return limparAnsi(normalizado);
}

/**
 * Calcula com segurança o novo fragmento de texto gerado para streaming reativo
 * entre dois estados de buffer consecutivos, sem duplicar caracteres.
 *
 * @param bufferAnterior - Conteúdo já transmitido/acumulado anteriormente.
 * @param bufferAtual - Conteúdo acumulado mais recente.
 * @returns Apenas o delta (novos caracteres gerados).
 */
export function extrairDeltaTexto(bufferAnterior: string, bufferAtual: string): string {
  if (!bufferAtual) return "";
  if (!bufferAnterior) return bufferAtual;

  // Caso mais comum: bufferAtual expandiu a partir do bufferAnterior
  if (bufferAtual.startsWith(bufferAnterior)) {
    return bufferAtual.slice(bufferAnterior.length);
  }

  // Se o buffer anterior e atual forem idênticos, delta é vazio
  if (bufferAnterior === bufferAtual) {
    return "";
  }

  // Caso de overlap parcial (se houve truncamento ou chunking intermediário)
  const maxOverlap = Math.min(bufferAnterior.length, bufferAtual.length);
  for (let i = maxOverlap; i > 0; i--) {
    if (bufferAnterior.endsWith(bufferAtual.slice(0, i))) {
      return bufferAtual.slice(i);
    }
  }

  // Fallback seguro: se não há prefixo comum nem overlap, retorna o buffer atual
  return bufferAtual;
}

/**
 * Extrai uma linha de resumo concisa de erro a partir de um transcript de falha.
 *
 * Procura padrões comuns de erro (Error, Quota, Rate Limit, etc.) ou seleciona
 * a última linha significativa do log de execução.
 */
export function extrairResumoErro(textoCaptura: string, exitCode?: number | null): string {
  if (!textoCaptura || !textoCaptura.trim()) {
    return `Processo encerrou com exit code ${exitCode ?? "desconhecido"}`;
  }

  const limpo = sanitizarTranscript(textoCaptura);

  // 1. Procura por erros declarados expressos
  const matchErro = /(?:Error|erro|Rate limit|Quota|Exception|status code \d+)[:\s]+([^\n\r]+)/i.exec(limpo);
  if (matchErro && matchErro[0]?.trim()) {
    return matchErro[0].trim();
  }

  // 2. Fallback: última linha que não seja comentário ou prompt
  const linhas = limpo
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(">") && !l.startsWith("#"));

  if (linhas.length > 0) {
    return linhas[linhas.length - 1]!;
  }

  return `Processo encerrou com exit code ${exitCode ?? "desconhecido"}`;
}
