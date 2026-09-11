import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export interface LinhaRegistro {
  id: string;
  categoria: string;
  descricao: string;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
  tags: string;
  conteudo: string;
}

export interface LinhaEvento {
  registro_id: string;
  categoria: string;
  ts: string;
  por: string;
  evento: string;
  resumo: string;
}

export interface LinhaSessao {
  id: string;
  agente: string;
  modelo: string;
  inicio: string;
  fim: string | null;
  custo_usd: number | null;
  status: string;
}

export interface LinhaMensagem {
  id: string;
  sessao_id: string;
  agente: string;
  role: string;
  conteudo: string;
  criado_em: string | null;
}

/** Linha do ledger unificado de execuções (PLANO-UNIFICACAO) — toda ativação de agente, de qualquer motor. */
export interface LinhaExecucao {
  id: string;
  agente: string;
  modelo: string;
  gatilho_tipo: string;
  gatilho_origem: string;
  status: string;
  inicio: string;
  fim: string | null;
  duracao_ms: number | null;
  custo_usd: number | null;
  exit_code: number | null;
  erro?: string | null;
}

/** Linha granular de ação/passo de um agente — telemetria com trace context (OpenTelemetry-inspired). */
export interface LinhaAcaoAgente {
  id: string;
  trace_id: string;
  span_id: string;
  parent_span_id?: string | null;
  sessao_id: string;
  agente: string;
  modelo: string;
  workspace: string;
  tipo_acao: "tool" | "pensamento" | "resposta" | "erro";
  ferramenta?: string | null;
  comando_resumo?: string | null;
  input_json?: string | null;
  output_json?: string | null;
  status: "sucesso" | "falhou" | "timeout" | "abortado";
  duracao_ms?: number;
  tokens_prompt?: number;
  tokens_saida?: number;
  custo_usd?: number;
  erro?: string | null;
  criado_em: string;
}

export interface FiltroExecucoes {
  agente?: string;
  gatilho_tipo?: string;
  gatilho_origem?: string;
  status?: string;
  limite?: number;
}

export interface FiltroTelemetria {
  sessao_id?: string;
  trace_id?: string;
  agente?: string;
  ferramenta?: string;
  status?: string;
  desde?: string;
  ate?: string;
  limite?: number;
}

export class CorpDb {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.migrar();
  }

  static caminho(wsPath: string): string {
    return join(wsPath, ".opencorp", "corp.db");
  }

  private migrar(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS registros (
        id TEXT NOT NULL,
        categoria TEXT NOT NULL,
        descricao TEXT NOT NULL DEFAULT '',
        criado_por TEXT NOT NULL DEFAULT '',
        criado_em TEXT NOT NULL DEFAULT '',
        atualizado_em TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '',
        conteudo TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (categoria, id)
      );
      CREATE TABLE IF NOT EXISTS journal (
        registro_id TEXT NOT NULL,
        categoria TEXT NOT NULL,
        ts TEXT NOT NULL,
        por TEXT NOT NULL,
        evento TEXT NOT NULL,
        resumo TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessoes (
        id TEXT PRIMARY KEY,
        agente TEXT NOT NULL DEFAULT '',
        modelo TEXT NOT NULL DEFAULT '',
        inicio TEXT NOT NULL DEFAULT '',
        fim TEXT,
        custo_usd REAL,
        status TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS mensagens (
        id TEXT PRIMARY KEY,
        sessao_id TEXT NOT NULL,
        agente TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL,
        conteudo TEXT NOT NULL DEFAULT '',
        criado_em TEXT
      );
      CREATE TABLE IF NOT EXISTS execucoes (
        id TEXT PRIMARY KEY,
        agente TEXT NOT NULL DEFAULT '',
        modelo TEXT NOT NULL DEFAULT '',
        gatilho_tipo TEXT NOT NULL DEFAULT 'manual',
        gatilho_origem TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'executando',
        inicio TEXT NOT NULL DEFAULT '',
        fim TEXT,
        duracao_ms INTEGER,
        custo_usd REAL,
        exit_code INTEGER,
        erro TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_journal_registro ON journal (categoria, registro_id);
      CREATE INDEX IF NOT EXISTS idx_mensagens_sessao ON mensagens (sessao_id, criado_em);
      CREATE INDEX IF NOT EXISTS idx_execucoes_gatilho ON execucoes (gatilho_tipo, gatilho_origem);
      CREATE INDEX IF NOT EXISTS idx_execucoes_agente ON execucoes (agente, inicio);

      -- Tabela de telemetria granular: ações/passos dos agentes com trace context
      CREATE TABLE IF NOT EXISTS acoes_agentes (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        span_id TEXT NOT NULL,
        parent_span_id TEXT,
        sessao_id TEXT NOT NULL,
        agente TEXT NOT NULL,
        modelo TEXT NOT NULL DEFAULT '',
        workspace TEXT NOT NULL DEFAULT '',
        tipo_acao TEXT NOT NULL,
        ferramenta TEXT,
        comando_resumo TEXT,
        input_json TEXT,
        output_json TEXT,
        status TEXT NOT NULL DEFAULT 'sucesso',
        duracao_ms INTEGER DEFAULT 0,
        tokens_prompt INTEGER DEFAULT 0,
        tokens_saida INTEGER DEFAULT 0,
        custo_usd REAL DEFAULT 0.0,
        erro TEXT,
        criado_em TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_acoes_sessao ON acoes_agentes (sessao_id, criado_em);
      CREATE INDEX IF NOT EXISTS idx_acoes_agente ON acoes_agentes (agente, criado_em);
      CREATE INDEX IF NOT EXISTS idx_acoes_trace ON acoes_agentes (trace_id);
      CREATE INDEX IF NOT EXISTS idx_acoes_ferramenta ON acoes_agentes (ferramenta, status);
      CREATE INDEX IF NOT EXISTS idx_acoes_falhas ON acoes_agentes (status) WHERE status != 'sucesso';
    `);
    try {
      this.db.exec("ALTER TABLE execucoes ADD COLUMN erro TEXT;");
    } catch {
      /* coluna já existe */
    }
  }

  limpar(): void {
    this.db.exec(
      "DELETE FROM registros; DELETE FROM journal; DELETE FROM sessoes; DELETE FROM mensagens; DELETE FROM execucoes; DELETE FROM acoes_agentes;",
    );
  }

  upsertRegistro(r: LinhaRegistro): void {
    this.db
      .prepare(
        `INSERT INTO registros (id, categoria, descricao, criado_por, criado_em, atualizado_em, tags, conteudo)
         VALUES (@id, @categoria, @descricao, @criado_por, @criado_em, @atualizado_em, @tags, @conteudo)
         ON CONFLICT (categoria, id) DO UPDATE SET
           descricao = excluded.descricao,
           criado_por = excluded.criado_por,
           criado_em = excluded.criado_em,
           atualizado_em = excluded.atualizado_em,
           tags = excluded.tags,
           conteudo = excluded.conteudo`,
      )
      .run(r);
  }

  removerRegistro(categoria: string, id: string): void {
    this.db
      .prepare("DELETE FROM registros WHERE categoria = ? AND id = ?")
      .run(categoria, id);
    this.db
      .prepare("DELETE FROM journal WHERE categoria = ? AND registro_id = ?")
      .run(categoria, id);
  }

  inserirEvento(e: LinhaEvento): void {
    this.db.prepare(
      "INSERT INTO journal (registro_id, categoria, ts, por, evento, resumo) VALUES (@registro_id, @categoria, @ts, @por, @evento, @resumo)",
    ).run(e);
  }

  upsertSessao(s: LinhaSessao): void {
    this.db
      .prepare(
        `INSERT INTO sessoes (id, agente, modelo, inicio, fim, custo_usd, status)
         VALUES (@id, @agente, @modelo, @inicio, @fim, @custo_usd, @status)
         ON CONFLICT (id) DO UPDATE SET
           agente = excluded.agente,
           modelo = excluded.modelo,
           inicio = excluded.inicio,
           fim = excluded.fim,
           custo_usd = excluded.custo_usd,
           status = excluded.status`,
      )
      .run(s);
  }

  inserirMensagem(m: LinhaMensagem): void {
    this.db.prepare(
      `INSERT INTO mensagens (id, sessao_id, agente, role, conteudo, criado_em)
       VALUES (@id, @sessao_id, @agente, @role, @conteudo, @criado_em)
       ON CONFLICT (id) DO NOTHING`,
    ).run(m);
  }

  mensagensDaSessao(sessaoId: string): LinhaMensagem[] {
    return this.db
      .prepare("SELECT * FROM mensagens WHERE sessao_id = ? ORDER BY criado_em, rowid")
      .all(sessaoId) as LinhaMensagem[];
  }

  /** Fallback local: lista sessões gravadas no espelho SQLite (quando opencode está offline) */
  listarSessoesLocal(limite = 30): Array<{ id: string; agente: string; modelo: string; inicio: string; fim: string | null; status: string; titulo_real?: string }> {
    const sessoes = this.db
      .prepare(`SELECT * FROM sessoes ORDER BY inicio DESC LIMIT ?`)
      .all(limite) as Array<{ id: string; agente: string; modelo: string; inicio: string; fim: string | null; status: string }>;
    // Enriquecer com título real (1ª msg do usuário)
    const ids = sessoes.map((s) => s.id);
    if (ids.length) {
      const primeiras = this.primeirasMensagensUsuario(ids);
      const mapa = new Map<string, string>();
      for (const p of primeiras) {
        if (!mapa.has(p.sessao_id)) mapa.set(p.sessao_id, p.conteudo);
      }
      return sessoes.map((s) => ({
        ...s,
        titulo_real: mapa.get(s.id)?.slice(0, 70) || undefined,
      }));
    }
    return sessoes;
  }

  listarSessoes(filtro?: { agentePrefixo?: string; limite?: number }): LinhaSessao[] {
    const sql = `SELECT * FROM sessoes ${filtro?.agentePrefixo ? "WHERE agente LIKE ?" : ""}
                 ORDER BY COALESCE(NULLIF(inicio,''), '0000') DESC ${filtro?.limite ? "LIMIT " + Math.floor(filtro.limite) : ""}`;
    const rows = filtro?.agentePrefixo
      ? this.db.prepare(sql).all(filtro.agentePrefixo + "%")
      : this.db.prepare(sql).all();
    return rows as LinhaSessao[];
  }

  /** Grava/atualiza uma execução no ledger unificado (início: status "executando"; fim: status final). */
  upsertExecucao(e: LinhaExecucao): void {
    this.db
      .prepare(
        `INSERT INTO execucoes (id, agente, modelo, gatilho_tipo, gatilho_origem, status, inicio, fim, duracao_ms, custo_usd, exit_code, erro)
         VALUES (@id, @agente, @modelo, @gatilho_tipo, @gatilho_origem, @status, @inicio, @fim, @duracao_ms, @custo_usd, @exit_code, @erro)
         ON CONFLICT (id) DO UPDATE SET
           agente = excluded.agente,
           modelo = excluded.modelo,
           gatilho_tipo = excluded.gatilho_tipo,
           gatilho_origem = excluded.gatilho_origem,
           status = excluded.status,
           fim = excluded.fim,
           duracao_ms = excluded.duracao_ms,
           custo_usd = excluded.custo_usd,
           exit_code = excluded.exit_code,
           erro = excluded.erro`,
      )
      .run({ ...e, erro: e.erro ?? null });
  }

  /** Atualiza apenas status e fim de uma execução existente */
  atualizarStatusExecucao(id: string, status: string, fim?: string): void {
    try {
      this.db
        .prepare(`UPDATE execucoes SET status = @status, fim = COALESCE(@fim, datetime('now')) WHERE id = @id`)
        .run({ id, status, fim: fim ?? new Date().toISOString() });
    } catch {}
  }

  /** Consulta cross-motor do ledger: "o que rodou, por que rodou (gatilho), como terminou". */
  listarExecucoes(filtro?: FiltroExecucoes): LinhaExecucao[] {
    const condicoes: string[] = [];
    const params: Record<string, string | number> = {};
    if (filtro?.agente) {
      condicoes.push("agente = @agente");
      params.agente = filtro.agente;
    }
    if (filtro?.gatilho_tipo) {
      condicoes.push("gatilho_tipo = @gatilho_tipo");
      params.gatilho_tipo = filtro.gatilho_tipo;
    }
    if (filtro?.gatilho_origem) {
      condicoes.push("gatilho_origem = @gatilho_origem");
      params.gatilho_origem = filtro.gatilho_origem;
    }
    if (filtro?.status) {
      condicoes.push("status = @status");
      params.status = filtro.status;
    }
    const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
    const limite = filtro?.limite ? Math.max(1, Math.floor(filtro.limite)) : 100;
    return this.db
      .prepare(`SELECT * FROM execucoes ${where} ORDER BY COALESCE(NULLIF(inicio,''), '0000') DESC LIMIT ${limite}`)
      .all(params) as LinhaExecucao[];
  }

  /** Primeira mensagem do usuário por sessão (fonte de título real na lista de conversas) */
  primeirasMensagensUsuario(ids: string[]): Array<{ sessao_id: string; conteudo: string; criado_em: string | null }> {
    if (!ids.length) return [];
    const ph = ids.map(() => "?").join(",");
    return this.db
      .prepare(
        `SELECT sessao_id, conteudo, criado_em FROM mensagens
         WHERE role = 'user' AND sessao_id IN (${ph})
         ORDER BY criado_em ASC, rowid ASC`,
      )
      .all(...ids) as Array<{ sessao_id: string; conteudo: string; criado_em: string | null }>;
  }

  buscar(termo: string): { categoria: string; id: string; descricao: string }[] {
    const padrao = `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return this.db
      .prepare(
        `SELECT categoria, id, descricao FROM registros
         WHERE descricao LIKE @padrao ESCAPE '\\'
            OR conteudo LIKE @padrao ESCAPE '\\'
            OR tags LIKE @padrao ESCAPE '\\'
         ORDER BY categoria, id`,
      )
      .all({ padrao }) as { categoria: string; id: string; descricao: string }[];
  }

  // ─── Telemetria de Agentes ─────────────────────────────────

  /** Grava ações de agente em lote (batch insert otimizado para o ring buffer). */
  gravarAcoesEmLote(acoes: LinhaAcaoAgente[]): void {
    if (!acoes.length) return;
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO acoes_agentes
        (id, trace_id, span_id, parent_span_id, sessao_id, agente, modelo, workspace,
         tipo_acao, ferramenta, comando_resumo, input_json, output_json,
         status, duracao_ms, tokens_prompt, tokens_saida, custo_usd, erro, criado_em)
       VALUES
        (@id, @trace_id, @span_id, @parent_span_id, @sessao_id, @agente, @modelo, @workspace,
         @tipo_acao, @ferramenta, @comando_resumo, @input_json, @output_json,
         @status, @duracao_ms, @tokens_prompt, @tokens_saida, @custo_usd, @erro, @criado_em)`,
    );
    const tx = this.db.transaction((rows: LinhaAcaoAgente[]) => {
      for (const r of rows) {
        stmt.run({
          ...r,
          parent_span_id: r.parent_span_id ?? null,
          ferramenta: r.ferramenta ?? null,
          comando_resumo: r.comando_resumo ?? null,
          input_json: r.input_json ?? null,
          output_json: r.output_json ?? null,
          duracao_ms: r.duracao_ms ?? 0,
          tokens_prompt: r.tokens_prompt ?? 0,
          tokens_saida: r.tokens_saida ?? 0,
          custo_usd: r.custo_usd ?? 0,
          erro: r.erro ?? null,
        });
      }
    });
    tx(acoes);
  }

  /** Lista ações de uma sessão específica (linha do tempo cronológica). */
  listarAcoesSessao(sessaoId: string, limite = 500): LinhaAcaoAgente[] {
    return this.db
      .prepare(`SELECT * FROM acoes_agentes WHERE sessao_id = ? ORDER BY criado_em ASC LIMIT ?`)
      .all(sessaoId, limite) as LinhaAcaoAgente[];
  }

  /** Lista ações por trace_id (jornada completa: job → task → sessão → ações). */
  listarAcoesPorTrace(traceId: string): LinhaAcaoAgente[] {
    return this.db
      .prepare(`SELECT * FROM acoes_agentes WHERE trace_id = ? ORDER BY criado_em ASC`)
      .all(traceId) as LinhaAcaoAgente[];
  }

  /** Resumo de telemetria com métricas agregadas por ferramenta/agente. */
  resumoTelemetria(filtro?: FiltroTelemetria): {
    total_acoes: number;
    total_falhas: number;
    ferramentas: Array<{ ferramenta: string; total: number; falhas: number; media_ms: number; custo_usd: number }>;
    agentes: Array<{ agente: string; total: number; falhas: number; media_ms: number; custo_usd: number }>;
  } {
    const condicoes: string[] = [];
    const params: Record<string, string | number> = {};
    if (filtro?.sessao_id) { condicoes.push("sessao_id = @sessao_id"); params.sessao_id = filtro.sessao_id; }
    if (filtro?.trace_id) { condicoes.push("trace_id = @trace_id"); params.trace_id = filtro.trace_id; }
    if (filtro?.agente) { condicoes.push("agente = @agente"); params.agente = filtro.agente; }
    if (filtro?.ferramenta) { condicoes.push("ferramenta = @ferramenta"); params.ferramenta = filtro.ferramenta; }
    if (filtro?.status) { condicoes.push("status = @status"); params.status = filtro.status; }
    if (filtro?.desde) { condicoes.push("criado_em >= @desde"); params.desde = filtro.desde; }
    if (filtro?.ate) { condicoes.push("criado_em <= @ate"); params.ate = filtro.ate; }
    const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
    const whereFerr = condicoes.length > 0
      ? `WHERE ${condicoes.join(" AND ")} AND ferramenta IS NOT NULL`
      : "WHERE ferramenta IS NOT NULL";

    const totais = this.db.prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status != 'sucesso' THEN 1 ELSE 0 END) AS falhas FROM acoes_agentes ${where}`,
    ).get(params) as { total: number; falhas: number };

    const ferramentas = this.db.prepare(
      `SELECT ferramenta, COUNT(*) AS total,
              SUM(CASE WHEN status != 'sucesso' THEN 1 ELSE 0 END) AS falhas,
              ROUND(AVG(duracao_ms), 1) AS media_ms,
              ROUND(SUM(custo_usd), 6) AS custo_usd
       FROM acoes_agentes ${whereFerr}
       GROUP BY ferramenta ORDER BY total DESC`,
    ).all(params) as Array<{ ferramenta: string; total: number; falhas: number; media_ms: number; custo_usd: number }>;

    const agentes = this.db.prepare(
      `SELECT agente, COUNT(*) AS total,
              SUM(CASE WHEN status != 'sucesso' THEN 1 ELSE 0 END) AS falhas,
              ROUND(AVG(duracao_ms), 1) AS media_ms,
              ROUND(SUM(custo_usd), 6) AS custo_usd
       FROM acoes_agentes ${where}
       GROUP BY agente ORDER BY total DESC`,
    ).all(params) as Array<{ agente: string; total: number; falhas: number; media_ms: number; custo_usd: number }>;

    return { total_acoes: totais.total ?? 0, total_falhas: totais.falhas ?? 0, ferramentas, agentes };
  }

  /** Consulta flexível de ações de agentes com filtros combinados. */
  listarAcoes(filtro?: FiltroTelemetria): LinhaAcaoAgente[] {
    const condicoes: string[] = [];
    const params: Record<string, string | number> = {};
    if (filtro?.sessao_id) { condicoes.push("sessao_id = @sessao_id"); params.sessao_id = filtro.sessao_id; }
    if (filtro?.trace_id) { condicoes.push("trace_id = @trace_id"); params.trace_id = filtro.trace_id; }
    if (filtro?.agente) { condicoes.push("agente = @agente"); params.agente = filtro.agente; }
    if (filtro?.ferramenta) { condicoes.push("ferramenta = @ferramenta"); params.ferramenta = filtro.ferramenta; }
    if (filtro?.status) { condicoes.push("status = @status"); params.status = filtro.status; }
    if (filtro?.desde) { condicoes.push("criado_em >= @desde"); params.desde = filtro.desde; }
    if (filtro?.ate) { condicoes.push("criado_em <= @ate"); params.ate = filtro.ate; }
    const where = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
    const limite = filtro?.limite ? Math.max(1, Math.floor(filtro.limite)) : 200;
    return this.db
      .prepare(`SELECT * FROM acoes_agentes ${where} ORDER BY criado_em DESC LIMIT ${limite}`)
      .all(params) as LinhaAcaoAgente[];
  }

  fechar(): void {
    this.db.close();
  }
}
