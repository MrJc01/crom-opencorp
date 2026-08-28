import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ApprovalError } from "./errors.js";
import { writeFileAtomic } from "../utils/fs-safe.js";
import { readFile } from "node:fs/promises";

export type StatusPendencia = "pendente" | "aprovado" | "rejeitado";
export type OrigemPendencia = "pre-voo" | "pos-voo";

export interface Pendencia {
  id: string;
  ordem: string;
  agente: string;
  modelo: string;
  padrao: string;
  origem: OrigemPendencia;
  motivo_guard: string;
  workspace_id: string;
  workspace_path: string;
  exec_id: string;
  status: StatusPendencia;
  criado_em: string;
  resolvido_em: string | null;
  motivo_rejeicao: string | null;
  exec_reexecucao_id: string | null;
}

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function gerarId(): string {
  const agora = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const ts = `${agora.getFullYear()}${p2(agora.getMonth() + 1)}${p2(agora.getDate())}-${p2(agora.getHours())}${p2(agora.getMinutes())}${p2(agora.getSeconds())}`;
  return `aprov-${ts}-${randomUUID().slice(0, 4)}`;
}

export class ApprovalsStore {
  private dir(wsPath: string): string {
    return join(wsPath, ".opencorp", "approvals");
  }

  private caminho(wsPath: string, id: string): string {
    return join(this.dir(wsPath), `${id}.json`);
  }

  async criar(
    wsPath: string,
    dados: {
      ordem: string;
      agente: string;
      modelo: string;
      padrao: string;
      origem: OrigemPendencia;
      motivo_guard: string;
      workspace_id: string;
      workspace_path: string;
      exec_id: string;
    },
  ): Promise<Pendencia> {
    const pendencia: Pendencia = {
      id: gerarId(),
      ...dados,
      status: "pendente",
      criado_em: new Date().toISOString(),
      resolvido_em: null,
      motivo_rejeicao: null,
      exec_reexecucao_id: null,
    };
    await writeFileAtomic(this.caminho(wsPath, pendencia.id), `${JSON.stringify(pendencia, null, 2)}\n`);
    return pendencia;
  }

  async listar(wsPath: string): Promise<Pendencia[]> {
    const dir = this.dir(wsPath);
    if (!existsSync(dir)) return [];
    const saida: Pendencia[] = [];
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        saida.push(JSON.parse(await readFile(join(dir, f), "utf8")) as Pendencia);
      } catch {
        continue;
      }
    }
    return saida.sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  }

  async pendentes(wsPath: string): Promise<Pendencia[]> {
    return (await this.listar(wsPath)).filter((p) => p.status === "pendente");
  }

  async obter(wsPath: string, id: string): Promise<Pendencia> {
    const path = this.caminho(wsPath, id);
    if (!existsSync(path)) {
      throw new ApprovalError(`pendência "${id}" não encontrada — veja "opencorp approvals list"`);
    }
    try {
      return JSON.parse(await readFile(path, "utf8")) as Pendencia;
    } catch (erro) {
      throw new ApprovalError(`pendência "${id}" corrompida: ${msg(erro)}`, { exitCode: 2 });
    }
  }

  private async salvar(wsPath: string, pendencia: Pendencia): Promise<void> {
    await writeFileAtomic(this.caminho(wsPath, pendencia.id), `${JSON.stringify(pendencia, null, 2)}\n`);
  }

  async aprovar(wsPath: string, id: string): Promise<Pendencia> {
    const pendencia = await this.obter(wsPath, id);
    if (pendencia.status !== "pendente") {
      throw new ApprovalError(`pendência "${id}" já está "${pendencia.status}"`);
    }
    pendencia.status = "aprovado";
    pendencia.resolvido_em = new Date().toISOString();
    await this.salvar(wsPath, pendencia);
    return pendencia;
  }

  async rejeitar(wsPath: string, id: string, motivo: string): Promise<Pendencia> {
    const pendencia = await this.obter(wsPath, id);
    if (pendencia.status !== "pendente") {
      throw new ApprovalError(`pendência "${id}" já está "${pendencia.status}"`);
    }
    if (motivo.trim().length === 0) {
      throw new ApprovalError("motivo obrigatório no reject (--motivo \"...\")");
    }
    pendencia.status = "rejeitado";
    pendencia.resolvido_em = new Date().toISOString();
    pendencia.motivo_rejeicao = motivo.trim();
    await this.salvar(wsPath, pendencia);
    return pendencia;
  }
}
