import type { SecurityPolicy } from "../schemas/security-policy.js";

export type NivelAgente = "level-1" | "level-2" | "level-3";
export type Acao = "permitido" | "bloqueado" | "hitl";

export interface Avaliacao {
  acao: Acao;
  motivo: string;
  padrao?: string;
}

const BASE_ALLOWLIST = [
  "echo", "cat", "ls", "pwd", "node", "npm", "npx", "python3", "pip", "pip3", "pytest",
  "git", "mkdir", "touch", "cp", "mv", "sed", "awk", "grep", "rg", "head", "tail", "wc",
  "tar", "unzip", "find", "sort", "uniq", "diff", "date", "basename", "dirname", "true",
  "false", "test", "printf", "sleep", "tee", "which", "whoami", "env", "xxd", "base64", "jq",
];

const REDE_EXECUTAVEIS = ["curl", "wget", "npm", "npx", "pip", "pip3", "git"];

export function casaPadrao(padrao: string, texto: string): boolean {
  const escapado = padrao
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[\\s\\S]*");
  return new RegExp(escapado, "i").test(texto);
}

function primeiroExecutavel(comando: string): string {
  const limpo = comando.trim().replace(/^\S+[&|;]\s*/, "");
  const m = /^\s*([^\s|;&]+)/.exec(limpo);
  return (m?.[1] ?? "").toLowerCase();
}

export function extrairHosts(comando: string): string[] {
  const hosts = new Set<string>();
  for (const m of comando.matchAll(/(?:https?|ssh|git):\/\/([^\/\s'"@]+(?:@[^\/\s'"]+)?)/gi)) {
    hosts.add(m[1]!.split("@").pop()!.toLowerCase());
  }
  for (const m of comando.matchAll(/[\s'"]([\w.-]+\.[a-z]{2,})(?:[\/\s:'"]|$)/gi)) {
    hosts.add(m[1]!.toLowerCase());
  }
  const exec = primeiroExecutavel(comando);
  if (exec === "npm" || exec === "npx") hosts.add("registry.npmjs.org");
  if (exec === "pip" || exec === "pip3") hosts.add("pypi.org");
  return [...hosts];
}

function verificarRede(comando: string, policy: SecurityPolicy): Avaliacao | null {
  const exec = primeiroExecutavel(comando);
  const usaRede = REDE_EXECUTAVEIS.includes(exec) || /https?:\/\//i.test(comando);
  if (!usaRede) return null;
  if (policy.network_allowlist.length === 0) return null;
  const fora = extrairHosts(comando).filter(
    (h) => !policy.network_allowlist.some((permitido) => h === permitido || h.endsWith(`.${permitido}`)),
  );
  if (fora.length === 0) return null;
  return {
    acao: "hitl",
    motivo: `acesso de rede fora da allowlist (${fora.join(", ")}) — requer aprovação humana`,
    padrao: fora.join(","),
  };
}

/** Verbos que, na ordem EM SI, caracterizam pedido de execução de comando. */
const VERBOS_PEDIDO_EXECUCAO = /\b(execute|executar|rode|rodar|bash)\b/i;

/** Pedido de execução = verbo na primeira linha útil da ordem, ou seja, a ordem
 *  EM SI é um pedido de comando ("execute: rm -rf /x"). Palavras como
 *  "executar"/"bash" no corpo de textos longos — pauta, transcript, memória ou
 *  prompt de reunião entregue como mensagem de chat (bug 31/08: turno do
 *  secretario level-1 derrubado por "executar" citado no conteúdo) — são
 *  CONTEÚDO, não pedido. O enforcement real de "level-1 não roda bash" segue no
 *  opencode (permission bash:deny) e na blocklist/hitl_patterns abaixo, que
 *  varrem o texto inteiro. */
function pedeExecucao(comando: string): boolean {
  for (const linha of comando.split("\n")) {
    const t = linha.trim();
    if (t.length === 0) continue;
    return VERBOS_PEDIDO_EXECUCAO.test(t);
  }
  return false;
}

export function avaliar(
  comando: string,
  policy: SecurityPolicy,
  nivelAgente: NivelAgente,
): Avaliacao {
  if (nivelAgente === "level-1" && pedeExecucao(comando)) {
    return {
      acao: "bloqueado",
      motivo: `agente level-1 (leitura) não executa comandos — pedido: ${comando.slice(0, 120)}`,
      padrao: "level-1",
    };
  }
  for (const padrao of policy.blocklist) {
    if (casaPadrao(padrao, comando)) {
      return {
        acao: "bloqueado",
        motivo: `comando casa com a blocklist ("${padrao}")`,
        padrao,
      };
    }
  }
  if (policy.level !== "permissive") {
    for (const padrao of policy.hitl_patterns) {
      if (casaPadrao(padrao, comando)) {
        return {
          acao: "hitl",
          motivo: `comando casa com hitl_patterns ("${padrao}") — aguarda aprovação humana`,
          padrao,
        };
      }
    }
  }
  if (policy.level === "strict") {
    const exec = primeiroExecutavel(comando);
    const permitidos = [...BASE_ALLOWLIST, ...policy.allowlist_extra];
    if (!permitidos.includes(exec)) {
      return {
        acao: "bloqueado",
        motivo: `policy strict: executável "${exec}" fora da allowlist (base + allowlist_extra)`,
        padrao: "strict-allowlist",
      };
    }
  }
  if (policy.level !== "permissive") {
    const rede = verificarRede(comando, policy);
    if (rede) return rede;
  }
  return { acao: "permitido", motivo: policy.level };
}
