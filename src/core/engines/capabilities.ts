// Matriz de capabilities de sessao por harness (F1-T01).
// Somente dados + tipos, sem efeito colateral.
// Fontes: leitura de src/core/engines/drivers/*.ts (prepareExecution) + --help
// dos binarios reais em ~/.opencorp/bin/ (opencode, claude, agy, copilot,
// codex, cursor-agent/agent, crom-agente; aider ausente) e /usr/bin/cursor (IDE).

export interface CapacidadeHarness {
  continuaNativo: boolean;
  duplicaNativo: boolean;
  como: string;
  flags?: string[];
}

export type HarnessId =
  | "opencode"
  | "claude-code"
  | "antigravity"
  | "copilot"
  | "codex"
  | "cursor"
  | "crom-agente"
  | "aider";

const SEM_SUPORTE: CapacidadeHarness = {
  continuaNativo: false,
  duplicaNativo: false,
  como: "sem suporte nativo; reidratar com transcript (fallback agnostico)",
};

export const CAPACIDADES: Record<HarnessId, CapacidadeHarness> = {
  // Driver usa `run --format json`; binario tem -c/--continue, -s/--session e
  // --fork (opencode run --help). Continuacao tambem via servidor API.
  "opencode": {
    continuaNativo: true,
    duplicaNativo: true,
    como: "API/servidor + CLI `opencode run --session <id> | --continue [--fork]`",
    flags: ["--continue", "--session", "--fork"],
  },
  // Driver usa `-p <prompt>` sem flags de sessao; binario tem
  // -c/--continue, -r/--resume [id] e --fork-session (claude --help).
  "claude-code": {
    continuaNativo: true,
    duplicaNativo: true,
    como: "CLI `claude --resume [id] | --continue [--fork-session]`",
    flags: ["--continue", "--resume", "--fork-session"],
  },
  // Driver usa `-p --dangerously-skip-permissions`; binario tem -c/--continue
  // e --conversation <id> (agy --help). Sem fork nativo.
  "antigravity": {
    continuaNativo: true,
    duplicaNativo: false,
    como: "CLI `agy --conversation <id> | --continue`",
    flags: ["--continue", "--conversation"],
  },
  // Driver usa `-p --silent --allow-all`; binario tem --continue,
  // -r/--resume[=id], --session-id <id> e --connect[=id] (copilot --help).
  "copilot": {
    continuaNativo: true,
    duplicaNativo: false,
    como: "CLI `copilot --resume[=id] | --continue | --session-id <id> | --connect[=id]`",
    flags: ["--continue", "--resume", "--session-id", "--connect"],
  },
  // Driver usa `exec --sandbox workspace-write`; binario tem subcomandos
  // `resume [SESSION_ID]` e `fork [SESSION_ID]` (codex --help).
  "codex": {
    continuaNativo: true,
    duplicaNativo: true,
    como: "CLI `codex resume [id] | codex fork [id]` (subcomandos, com --last)",
    flags: ["resume", "fork"],
  },
  // Driver usa `agent -p --force`; binario agent tem --resume [chatId] e
  // --continue (agent --help). Sem fork nativo.
  "cursor": {
    continuaNativo: true,
    duplicaNativo: false,
    como: "CLI `agent --resume [chatId] | --continue`",
    flags: ["--resume", "--continue"],
  },
  // Driver ja repassa --session quando opts.sessionId existe; binario tem
  // flag global --session <id> (crom-agente --help e run --help). Sem fork nativo.
  "crom-agente": {
    continuaNativo: true,
    duplicaNativo: false,
    como: "CLI `crom-agente run <tarefa> --session <id>`",
    flags: ["--session"],
  },
  // Driver usa `--message --yes-always --no-auto-commits`; binario ausente
  // (~/.opencorp/bin e PATH); sem resume/continue nativo.
  "aider": { ...SEM_SUPORTE },
};

export function CapabilitiesPara(id: string): CapacidadeHarness {
  const chave = id.trim().toLowerCase() as HarnessId;
  return CAPACIDADES[chave] ?? { ...SEM_SUPORTE };
}
