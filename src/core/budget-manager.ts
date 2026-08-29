import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BudgetError } from "./errors.js";
import { RegistryStore } from "./registry-store.js";
import { SettingsStore } from "./settings-store.js";
import { writeFileAtomic } from "../utils/fs-safe.js";

export interface EstadoBudget {
  dia: string;
  workspace_usd_hoje: number;
  por_agente: Record<string, number>;
  precos?: Record<string, number>;
}

export interface LimitesBudget {
  daily_usd: number;
  per_agent_usd: number;
  pause_on_exceed: boolean;
}

const PRECOS_POR_TURNO: Record<string, number> = {
  "opencode/grok-code": 0.0025,
  "opencode/mimo-v2.5-free": 0.0005,
  "opencode/hy3-free": 0.0005,
  "opencode/nemotron-3-ultra-free": 0.0005,
};
const PRECO_TURNO_PADRAO = 0.004;

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export class BudgetManager {
  private readonly store: SettingsStore;
  private readonly registros = new RegistryStore();

  constructor(opts: { homeDir?: string; cwd?: string } = {}) {
    this.store = new SettingsStore({ homeDir: opts.homeDir, cwd: opts.cwd });
  }

  caminho(wsPath: string): string {
    return join(wsPath, ".opencorp", "budget.json");
  }

  async carregar(wsPath: string): Promise<EstadoBudget> {
    const path = this.caminho(wsPath);
    let estado: EstadoBudget;
    if (existsSync(path)) {
      let bruto: string;
      try {
        bruto = await readFile(path, "utf8");
      } catch (erro) {
        throw new BudgetError(`não foi possível ler ${path}: ${msg(erro)}`, { exitCode: 2 });
      }
      try {
        const dados = JSON.parse(bruto) as Partial<EstadoBudget>;
        estado = {
          dia: typeof dados.dia === "string" ? dados.dia : hoje(),
          workspace_usd_hoje: typeof dados.workspace_usd_hoje === "number" ? dados.workspace_usd_hoje : 0,
          por_agente: dados.por_agente ?? {},
          precos: dados.precos,
        };
      } catch (erro) {
        throw new BudgetError(`budget.json inválido em ${path}: ${msg(erro)}`, { exitCode: 2 });
      }
    } else {
      estado = { dia: hoje(), workspace_usd_hoje: 0, por_agente: {} };
    }
    if (estado.dia !== hoje()) {
      estado = { dia: hoje(), workspace_usd_hoje: 0, por_agente: {}, precos: estado.precos };
      await this.gravar(wsPath, estado);
    }
    return estado;
  }

  private async gravar(wsPath: string, estado: EstadoBudget): Promise<void> {
    await writeFileAtomic(this.caminho(wsPath), `${JSON.stringify(estado, null, 2)}\n`);
  }

  precoPorTurno(estado: EstadoBudget, modelo: string): number {
    return estado.precos?.[modelo] ?? PRECOS_POR_TURNO[modelo] ?? PRECO_TURNO_PADRAO;
  }

  contarTurnos(captura: string): number {
    const linhas = captura.split("\n").filter((l) => /^\s*←/.test(l)).length;
    return linhas + 1;
  }

  estimarCusto(estado: EstadoBudget, modelo: string, duracaoMs: number, captura: string): number {
    void duracaoMs;
    const turnos = this.contarTurnos(captura);
    return Math.round(turnos * this.precoPorTurno(estado, modelo) * 1e6) / 1e6;
  }

  async limites(wsPath: string, overrides?: Partial<LimitesBudget>): Promise<LimitesBudget> {
    const daily = await this.store.get("budget.daily_usd", { workspaceDir: wsPath });
    const perAgent = await this.store.get("budget.per_agent_usd", { workspaceDir: wsPath });
    const pause = await this.store.get("budget.pause_on_exceed", { workspaceDir: wsPath });
    return {
      daily_usd: Number(daily.valor),
      per_agent_usd: Number(perAgent.valor),
      pause_on_exceed: Boolean(pause.valor),
      ...overrides,
    };
  }

  async podeExecutar(
    wsPath: string,
    agente: string,
    overrides?: Partial<LimitesBudget>,
  ): Promise<{ ok: boolean; motivo?: string }> {
    const estado = await this.carregar(wsPath);
    const limites = await this.limites(wsPath, overrides);
    if (!limites.pause_on_exceed) return { ok: true };
    const menorPreco = Math.min(
      ...Object.values(PRECOS_POR_TURNO),
      PRECO_TURNO_PADRAO,
    );
    const residualWorkspace = limites.daily_usd - estado.workspace_usd_hoje;
    if (residualWorkspace < menorPreco) {
      return {
        ok: false,
        motivo: `orçamento diário do workspace esgotado (US$ ${estado.workspace_usd_hoje.toFixed(6)} de US$ ${limites.daily_usd.toFixed(6)}) — residual não cobre nem 1 turno; pause_on_exceed ativo`,
      };
    }
    const doAgente = estado.por_agente[agente] ?? 0;
    const residualAgente = limites.per_agent_usd - doAgente;
    if (residualAgente < menorPreco) {
      return {
        ok: false,
        motivo: `orçamento diário do agente "${agente}" esgotado (US$ ${doAgente.toFixed(6)} de US$ ${limites.per_agent_usd.toFixed(6)}) — residual não cobre nem 1 turno; pause_on_exceed ativo`,
      };
    }
    return { ok: true };
  }

  async registrarConsumo(
    wsPath: string,
    agente: string,
    custoUsd: number,
    meta: { modelo: string; duracao_ms: number },
  ): Promise<{ estado: EstadoBudget; aviso80: boolean }> {
    const estado = await this.carregar(wsPath);
    const limites = await this.limites(wsPath);
    const antes = Math.max(
      estado.workspace_usd_hoje / Math.max(limites.daily_usd, 1e-9),
      (estado.por_agente[agente] ?? 0) / Math.max(limites.per_agent_usd, 1e-9),
    );
    estado.workspace_usd_hoje = Math.round((estado.workspace_usd_hoje + custoUsd) * 1e6) / 1e6;
    estado.por_agente[agente] = Math.round(((estado.por_agente[agente] ?? 0) + custoUsd) * 1e6) / 1e6;
    await this.gravar(wsPath, estado);

    const dia = estado.dia;
    await this.registros.garantirRegistro(wsPath, {
      categoria: "custos",
      id: `custo-${dia}`,
      descricao: `consumo estimado do workspace em ${dia}`,
      criadoPor: "opencorp",
    });
    await this.registros.anexarEvento(wsPath, "custos", `custo-${dia}`, {
      ts: new Date().toISOString(),
      por: agente,
      evento: "sessao",
      modelo: meta.modelo,
      duracao_ms: meta.duracao_ms,
      custo_usd: custoUsd,
      resumo: `custo estimado US$ ${custoUsd.toFixed(6)} (${meta.modelo})`,
    });

    const depois = Math.max(
      estado.workspace_usd_hoje / Math.max(limites.daily_usd, 1e-9),
      estado.por_agente[agente] / Math.max(limites.per_agent_usd, 1e-9),
    );
    const aviso80 = antes < 0.8 && depois >= 0.8;
    if (aviso80) {
      await this.registros.anexarEvento(wsPath, "custos", `custo-${dia}`, {
        ts: new Date().toISOString(),
        por: agente,
        evento: "aviso_80",
        resumo: `consumo atingiu ${(depois * 100).toFixed(1)}% do orçamento (workspace/agent)`,
      });
    }
    return { estado, aviso80 };
  }

  async acumuladoPorAgente(wsPath: string, agente: string): Promise<{ total: number; dias: number; media: number; hoje: number }> {
    const estado = await this.carregar(wsPath);
    const custoDir = join(wsPath, ".opencorp", "registries", "custos");
    let total = 0;
    let dias = 0;
    if (existsSync(custoDir)) {
      for (const entrada of readdirSyncSafe(custoDir)) {
        const journalPath = join(custoDir, entrada, "journal.jsonl");
        if (!existsSync(journalPath)) continue;
        let temAgente = false;
        const bruto = await readFile(journalPath, "utf8");
        for (const linha of bruto.split("\n")) {
          if (linha.trim().length === 0) continue;
          try {
            const ev = JSON.parse(linha) as { evento?: string; por?: string; custo_usd?: number };
            if (ev.evento === "sessao" && ev.por === agente) {
              total += ev.custo_usd ?? 0;
              temAgente = true;
            }
          } catch {
            continue;
          }
        }
        if (temAgente) dias += 1;
      }
    }
    return {
      total: Math.round(total * 1e6) / 1e6,
      dias,
      media: dias > 0 ? Math.round((total / dias) * 1e6) / 1e6 : 0,
      hoje: estado.por_agente[agente] ?? 0,
    };
  }
}

function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir).filter((d) => /^custo-\d{4}-\d{2}-\d{2}$/.test(d));
  } catch {
    return [];
  }
}
