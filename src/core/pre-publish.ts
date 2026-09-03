import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { eventBus } from "./event-bus.js";

export interface PrePublishValidacao {
  valido: boolean;
  erros: string[];
  avisos: string[];
}

export interface PrePublishPayload {
  titulo?: string;
  slug?: string;
  conteudo: string;
  tipo?: "post" | "pagina" | "documento" | "comunicado";
  minimoChars?: number;
  proibirScriptsSoltos?: boolean;
  checarDuplicidade?: boolean;
}

/**
 * Validador corporativo pré-publicação (ORC-01)
 * Garante qualidade editorial, ausência de scripts soltos que quebram o layout
 * e impede duplicatas de posts e páginas públicas em qualquer empresa.
 */
export async function validarPrePublicacao(
  wsPath: string,
  payload: PrePublishPayload,
): Promise<PrePublishValidacao> {
  const erros: string[] = [];
  const avisos: string[] = [];

  const conteudo = payload.conteudo ? payload.conteudo.trim() : "";
  const minimo = payload.minimoChars ?? (payload.tipo === "post" ? 250 : 50);

  // 1. Validação de Tamanho / Vazio
  if (!conteudo || conteudo.length === 0) {
    erros.push("Conteúdo vazio: a publicação não contém nenhum texto ou corpo.");
  } else if (conteudo.length < minimo) {
    erros.push(
      `Conteúdo muito curto (${conteudo.length} caracteres). Mínimo exigido para ${payload.tipo || "publicação"}: ${minimo} caracteres.`,
    );
  }

  // 2. Validação de Tags HTML Quebradas
  if (conteudo.includes("<p></p>") && conteudo.length < 100) {
    erros.push("Conteúdo contém apenas parágrafos vazios (<p></p>).");
  }
  if (conteudo.includes("<p></a>") || conteudo.includes("</p></a>")) {
    erros.push("HTML malformado detectado: link fechado dentro de parágrafo órfão (<p></a>).");
  }

  // 3. Validação de Scripts Soltos (Anti-Regressão GA4 / gtag texto visível)
  const proibirScripts = payload.proibirScriptsSoltos ?? true;
  if (proibirScripts) {
    // Detecta JavaScript IIFE ou snippet do Google Tag Manager solto fora de tags apropriadas
    const padroesScriptSolto = [
      /\(function\s*\(\)\s*\{[\s\S]*?googletagmanager\.com/i,
      /\(function\s*\(\)\s*\{[\s\S]*?gtag\(/i,
      /gtag\s*\(\s*["']config["']\s*,\s*["']G-[A-Z0-9]+["']\s*\)/i,
      /document\.createElement\s*\(\s*["']script["']\s*\)/i,
    ];

    for (const padrao of padroesScriptSolto) {
      if (padrao.test(conteudo)) {
        erros.push(
          "Código JavaScript solto detectado no corpo da publicação (possível snippet de tracking/analytics colado como texto visível).",
        );
        break;
      }
    }
  }

  // 4. Verificação de Duplicidade no Workspace
  const checarDup = payload.checarDuplicidade ?? true;
  if (checarDup && payload.titulo && payload.titulo.trim().length > 3) {
    const tituloNormalizado = payload.titulo.trim().toLowerCase();

    // Consulta em corp.db se disponível
    const dbPath = join(wsPath, ".opencorp", "corp.db");
    if (existsSync(dbPath)) {
      try {
        const db = new Database(dbPath, { readonly: true });
        const existente = db
          .prepare(
            "SELECT id, descricao, criado_em FROM registros WHERE lower(descricao) = ? OR lower(id) = ? LIMIT 1",
          )
          .get(tituloNormalizado, payload.slug?.toLowerCase() || "") as { id: string; descricao: string; criado_em: string } | undefined;
        db.close();

        if (existente) {
          erros.push(
            `Conteúdo duplicado: já existe um registro idêntico com este título/slug ("${existente.id}") criado em ${existente.criado_em}.`,
          );
        }
      } catch {}
    }

    // Consulta em .opencorp/registries/documentos
    const docsDir = join(wsPath, ".opencorp", "registries", "documentos");
    if (existsSync(docsDir)) {
      try {
        const files = readdirSync(docsDir).filter((f) => f.endsWith(".md") || f.endsWith(".json"));
        for (const file of files) {
          const nomeSemExt = file.replace(/\.[^/.]+$/, "").toLowerCase();
          if (payload.slug && nomeSemExt === payload.slug.toLowerCase()) {
            avisos.push(`Já existe um documento local com slug similar: ${file}`);
          }
        }
      } catch {}
    }
  }

  const valido = erros.length === 0;

  if (valido) {
    eventBus.emit("pre_publish.aprovado", {
      titulo: payload.titulo,
      slug: payload.slug,
      tipo: payload.tipo,
      workspace: wsPath.split("/").pop() || "padrao",
    });
  } else {
    eventBus.emit("pre_publish.bloqueado", {
      titulo: payload.titulo,
      slug: payload.slug,
      tipo: payload.tipo,
      erros,
      workspace: wsPath.split("/").pop() || "padrao",
    });
  }

  return {
    valido,
    erros,
    avisos,
  };
}
