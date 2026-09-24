export interface LogStepAction {
  id: string;
  tipo: "bash" | "read" | "write" | "edit" | "tool";
  comando: string;
  saida?: string;
}

export type LogEvento =
  | { kind: "texto"; conteudo: string }
  | { kind: "acao"; acao: LogStepAction };

export interface LogChatParsed {
  ordem: string;
  agente: string;
  modelo: string;
  pensamentos: string[];
  acoes: LogStepAction[];
  eventosCronologicos: LogEvento[];
  respostaFinal: string;
}

export function parseExecutionLog(rawLog: string): LogChatParsed {
  if (!rawLog) {
    return {
      ordem: "",
      agente: "",
      modelo: "",
      pensamentos: [],
      acoes: [],
      eventosCronologicos: [],
      respostaFinal: "",
    };
  }

  // Remove códigos ANSI de cor
  const limpo = rawLog.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");
  const linhas = limpo.split("\n");

  let ordem = "";
  let agente = "";
  let modelo = "";
  let capturandoOrdem = false;

  const eventos: LogEvento[] = [];
  const acoes: LogStepAction[] = [];
  const pensamentos: string[] = [];

  let acaoAtual: LogStepAction | null = null;
  const linhasSaida: string[] = [];
  let bufferTexto: string[] = [];
  let actionCounter = 0;

  const flushTexto = () => {
    if (bufferTexto.length === 0) return;
    const textoJunto = bufferTexto.join("\n").trim();
    if (textoJunto && !textoJunto.startsWith("Wrote file successfully")) {
      eventos.push({ kind: "texto", conteudo: textoJunto });
      pensamentos.push(textoJunto);
    }
    bufferTexto = [];
  };

  const flushAcao = () => {
    if (!acaoAtual) return;
    acaoAtual.saida = linhasSaida.join("\n").trim();
    acoes.push(acaoAtual);
    eventos.push({ kind: "acao", acao: acaoAtual });
    linhasSaida.length = 0;
    acaoAtual = null;
  };

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const trim = l.trim();

    // Headers do OpenCorp (# agente, # modelo, # ordem)
    if (trim.startsWith("# ")) {
      if (trim.startsWith("# agente:")) {
        const match = trim.match(/# agente:\s*([^·\n]+)(?:·\s*modelo:\s*([^·\n]+))?/);
        if (match) {
          agente = match[1]?.trim() || "";
          modelo = match[2]?.trim() || "";
        }
      } else if (trim.startsWith("# ordem:")) {
        ordem = trim.replace("# ordem:", "").trim();
        capturandoOrdem = true;
      } else if (trim.startsWith("#")) {
        capturandoOrdem = false;
      }
      continue;
    }

    if (capturandoOrdem) {
      if (trim.startsWith(">") || trim.startsWith("$") || trim.startsWith("→") || trim.startsWith("←")) {
        capturandoOrdem = false;
      } else {
        ordem += "\n" + l;
        continue;
      }
    }

    // CLI OpenCode prompts: > agente · modelo
    if (trim.startsWith("> ") && trim.includes("·")) {
      const match = trim.match(/^>\s*([^·\n]+)\s*·\s*(.+)$/);
      if (match) {
        if (!agente) agente = match[1]?.trim() || "";
        if (!modelo) modelo = match[2]?.trim() || "";
      }
      continue;
    }

    // Chamadas de ferramentas: $ comando, → Read, ← Write, → Edit
    if (trim.startsWith("$ ") || trim.startsWith("→ ") || trim.startsWith("← ")) {
      flushTexto();
      flushAcao();

      actionCounter++;
      let tipo: LogStepAction["tipo"] = "tool";
      let comando = "";

      if (trim.startsWith("$ ")) {
        tipo = "bash";
        comando = trim.slice(2).trim();
      } else if (trim.startsWith("→ Read ") || trim.startsWith("→ read ")) {
        tipo = "read";
        comando = trim.replace(/^→\s*read\s*/i, "").trim();
      } else if (trim.startsWith("← Write ") || trim.startsWith("← write ")) {
        tipo = "write";
        comando = trim.replace(/^←\s*write\s*/i, "").trim();
      } else if (trim.startsWith("→ Edit ") || trim.startsWith("→ edit ")) {
        tipo = "edit";
        comando = trim.replace(/^→\s*edit\s*/i, "").trim();
      } else {
        tipo = "tool";
        comando = trim.slice(2).trim();
      }

      acaoAtual = {
        id: `act-${actionCounter}`,
        tipo,
        comando,
      };
      continue;
    }

    // Se estivermos dentro de uma ação, acumula a saída
    if (acaoAtual) {
      linhasSaida.push(l);
    } else {
      bufferTexto.push(l);
    }
  }

  flushTexto();
  flushAcao();

  const respostaFinal = pensamentos.length > 0 ? pensamentos[pensamentos.length - 1] : "";

  return {
    ordem: ordem.trim(),
    agente: agente.trim(),
    modelo: modelo.trim(),
    pensamentos,
    acoes,
    eventosCronologicos: eventos,
    respostaFinal,
  };
}
