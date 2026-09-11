import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execa } from "execa";

export type TipoDriver = "sandbox" | "host" | "docker" | "podman";

export interface LimitesRecursos {
  ramMb?: number;
  cpuPct?: number;
  /** Quando true, isola a rede do sandbox (bwrap --unshare-net). Padrão: false (rede compartilhada). */
  redeIsolada?: boolean;
  /** Domínios permitidos (allowlist lógica; com rede isolada todo tráfego externo é bloqueado). */
  dominiosPermitidos?: string[];
}

export interface OpcoesPreparacaoDriver {
  binary: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  workspaceId: string;
  workspacePath: string;
  limites?: LimitesRecursos;
}

export interface ComandoPreparado {
  driver: TipoDriver;
  binary: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  aviso?: string;
}

export interface ExecutionDriver {
  readonly tipo: TipoDriver;
  disponivel(): Promise<boolean>;
  preparar(opts: OpcoesPreparacaoDriver): Promise<ComandoPreparado>;
}

/**
 * Driver Nativo Direto na Máquina (Host)
 */
export class HostDriver implements ExecutionDriver {
  readonly tipo: TipoDriver = "host";

  async disponivel(): Promise<boolean> {
    return true;
  }

  async preparar(opts: OpcoesPreparacaoDriver): Promise<ComandoPreparado> {
    // Se houver limites de recursos e systemd-run estiver disponível, envolve
    if ((opts.limites?.ramMb || opts.limites?.cpuPct) && (await checarBinario("systemd-run"))) {
      const scopeArgs = ["--user", "--scope", "--quiet"];
      if (opts.limites.ramMb) scopeArgs.push(`-p`, `MemoryMax=${opts.limites.ramMb}M`);
      if (opts.limites.cpuPct) scopeArgs.push(`-p`, `CPUQuota=${opts.limites.cpuPct}%`);

      return {
        driver: "host",
        binary: "systemd-run",
        args: [...scopeArgs, opts.binary, ...opts.args],
        cwd: opts.cwd,
        env: opts.env,
      };
    }

    return {
      driver: "host",
      binary: opts.binary,
      args: opts.args,
      cwd: opts.cwd,
      env: opts.env,
    };
  }
}

/**
 * Driver Seguro Ultraleve via Bubblewrap (Sandbox)
 * Isola o sistema de arquivos, monta /usr, /lib, /bin como read-only e protege o /home.
 */
export class SandboxDriver implements ExecutionDriver {
  readonly tipo: TipoDriver = "sandbox";

  async disponivel(): Promise<boolean> {
    return checarBinario("bwrap");
  }

  async preparar(opts: OpcoesPreparacaoDriver): Promise<ComandoPreparado> {
    const temBwrap = await this.disponivel();
    if (!temBwrap) {
      const host = new HostDriver();
      const prep = await host.preparar(opts);
      prep.aviso = "[SandboxDriver] bwrap não encontrado no sistema — fallback para modo host";
      return prep;
    }

    const bwrapArgs: string[] = [
      "--ro-bind", "/usr", "/usr",
      "--ro-bind", "/lib", "/lib",
      "--ro-bind", "/bin", "/bin",
      "--ro-bind", "/etc", "/etc",
      "--proc", "/proc",
      "--dev", "/dev",
      "--bind", opts.workspacePath, opts.workspacePath,
      "--chdir", opts.cwd,
      "--unshare-pid",
      "--unshare-uts",
      "--unshare-ipc",
      "--die-with-parent",
    ];

    // Isolamento de rede: allowlist lógica — sem domínios liberados, bloqueia rede via --unshare-net
    const temAllowlist = (opts.limites?.dominiosPermitidos?.length ?? 0) > 0;
    const redeIsolada = opts.limites?.redeIsolada ?? false;
    if (redeIsolada && !temAllowlist) {
      bwrapArgs.push("--unshare-net");
    }

    if (existsSync("/lib64")) {
      bwrapArgs.unshift("--ro-bind", "/lib64", "/lib64");
    }

    // Permite leitura de dependências globais ou symlinks comuns (ex: myvoice/piper, node_modules)
    const caminhosLeituraOpcionais = [
      "/home/j/Documentos/GitHub/crom-worker-opencode/node_modules",
      "/home/j/.local/share/myvoice",
      "/usr/local",
    ];
    for (const c of caminhosLeituraOpcionais) {
      if (existsSync(c)) {
        bwrapArgs.push("--ro-bind", c, c);
      }
    }

    let binFinal = "bwrap";
    let argsFinal = [...bwrapArgs, opts.binary, ...opts.args];

    // Se houver limites de memória ou CPU, encapsula o bwrap dentro do systemd-run
    if ((opts.limites?.ramMb || opts.limites?.cpuPct) && (await checarBinario("systemd-run"))) {
      const scopeArgs = ["--user", "--scope", "--quiet"];
      if (opts.limites.ramMb) scopeArgs.push(`-p`, `MemoryMax=${opts.limites.ramMb}M`);
      if (opts.limites.cpuPct) scopeArgs.push(`-p`, `CPUQuota=${opts.limites.cpuPct}%`);

      binFinal = "systemd-run";
      argsFinal = [...scopeArgs, "bwrap", ...argsFinal];
    }

    // Garante que o PATH dentro do sandbox encontre os binários padrão
    const envFinal: Record<string, string | undefined> = {
      ...opts.env,
      PATH: opts.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    };

    return {
      driver: "sandbox",
      binary: binFinal,
      args: argsFinal,
      cwd: opts.cwd,
      env: envFinal,
    };
  }
}

/**
 * Driver de Container Completo OCI (Docker / Podman)
 */
export class ContainerDriver implements ExecutionDriver {
  readonly tipo: TipoDriver;
  private readonly cli: "docker" | "podman";
  private readonly imagem: string;

  constructor(tipo: "docker" | "podman" = "docker", imagem = "opencorp/workspace-base:latest") {
    this.tipo = tipo;
    this.cli = tipo;
    this.imagem = imagem;
  }

  async disponivel(): Promise<boolean> {
    return checarBinario(this.cli);
  }

  async preparar(opts: OpcoesPreparacaoDriver): Promise<ComandoPreparado> {
    const disponivel = await this.disponivel();
    if (!disponivel) {
      const sand = new SandboxDriver();
      const prep = await sand.preparar(opts);
      prep.aviso = `[ContainerDriver] ${this.cli} não encontrado — fallback para sandbox`;
      return prep;
    }

    const containerArgs = [
      "run",
      "--rm",
      "-i",
      "-v", `${resolve(opts.workspacePath)}:${resolve(opts.workspacePath)}:rw`,
      "-w", opts.cwd,
    ];

    if (this.cli === "podman") {
      containerArgs.push("--userns=keep-id");
    }

    if (opts.limites?.ramMb) {
      containerArgs.push(`--memory=${opts.limites.ramMb}m`);
    }
    if (opts.limites?.cpuPct) {
      containerArgs.push(`--cpus=${(opts.limites.cpuPct / 100).toFixed(1)}`);
    }

    for (const [k, v] of Object.entries(opts.env)) {
      if (v !== undefined && k !== "PATH") {
        containerArgs.push("-e", `${k}=${v}`);
      }
    }

    return {
      driver: this.tipo,
      binary: this.cli,
      args: [...containerArgs, this.imagem, opts.binary, ...opts.args],
      cwd: opts.cwd,
      env: opts.env,
    };
  }
}

/**
 * Utilitário para verificar a presença de um executável no PATH
 */
async function checarBinario(bin: string): Promise<boolean> {
  try {
    const res = await execa("which", [bin], { reject: false });
    return res.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Resolve o driver com precedência: agente > workspace > global.
 * `container` é alias de `docker` para compatibilidade com frontmatter legado.
 */
export function escolherPreferenciaDriver(agentDriver?: string, workspaceDriver?: string, globalDriver = "sandbox"): string {
  const norm = (v?: string) => (v ?? "").toLowerCase().trim();
  const a = norm(agentDriver);
  if (a === "container") return "docker";
  if (a === "sandbox" || a === "host" || a === "docker" || a === "podman") return a;
  const w = norm(workspaceDriver);
  if (w === "container") return "docker";
  if (w) return w;
  return norm(globalDriver) || "sandbox";
}

/**
 * Resolve o driver adequado conforme preferências do workspace ou globais
 */
export async function resolverDriverExecucao(
  preferencia: string = "sandbox",
  imagemContainer?: string,
): Promise<ExecutionDriver> {
  const normalizada = preferencia.toLowerCase().trim();

  if (normalizada === "host") {
    return new HostDriver();
  }

  if (normalizada === "docker") {
    const d = new ContainerDriver("docker", imagemContainer);
    if (await d.disponivel()) return d;
  }

  if (normalizada === "podman") {
    const p = new ContainerDriver("podman", imagemContainer);
    if (await p.disponivel()) return p;
  }

  // Padrão de fábrica: Sandbox (Bubblewrap)
  const sandbox = new SandboxDriver();
  if (await sandbox.disponivel()) {
    return sandbox;
  }

  // Fallback seguro se bwrap não estiver presente no OS
  return new HostDriver();
}
