import { readFileSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { opencorpHome } from "../../../utils/paths.js";
import { writeFileAtomic } from "../../../utils/fs-safe.js";
import {
  dirOpencodeHome,
  authOpencodePath,
  authOverridesPathWorkspace,
  mascararChave,
  fundirAuth,
  PROVEEDOR_RE,
  type EntradaAuth,
} from "../../../core/contexts/execution/opencode-server.js";
import type { RouteContext } from "../types.js";

export async function handleKeysRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, url, rota, lerCorpo, enviar, homeDir } = ctx;
  const home = homeDir ?? opencorpHome();

  // ─────────────────────────────────────────────────────────────────────
  // OPENCODE-CONFIG (/opencode-config)
  // ─────────────────────────────────────────────────────────────────────
  if (rota === "/opencode-config" && req.method === "GET") {
    const configPath = join(dirOpencodeHome(home), "opencode.json");
    const bruto = await readFile(configPath, "utf8").catch((erro: NodeJS.ErrnoException) => {
      if (erro?.code === "ENOENT") return null;
      throw erro;
    });
    if (bruto === null) {
      enviar(res, 404, { erro: "configuração do motor ainda não existe (inicie o secretário)", path: configPath });
      return true;
    }
    try {
      enviar(res, 200, { config: JSON.parse(bruto), path: configPath });
    } catch {
      enviar(res, 500, { erro: "config existente não é JSON válido", path: configPath });
    }
    return true;
  }

  if (rota === "/opencode-config" && req.method === "PUT") {
    const configPath = join(dirOpencodeHome(home), "opencode.json");
    let corpo: { config?: unknown };
    try {
      corpo = (await lerCorpo(req, 256 * 1024)) as { config?: unknown };
    } catch {
      enviar(res, 400, { erro: "corpo inválido (JSON malformado ou excede o limite)" });
      return true;
    }
    const config = corpo?.config;
    if (config === null || typeof config !== "object" || Array.isArray(config)) {
      enviar(res, 400, { erro: "campo 'config' deve ser um objeto JSON" });
      return true;
    }
    const obj = { ...(config as Record<string, unknown>) };
    if (typeof obj.$schema !== "string" || !obj.$schema) {
      const schemaAtual = await readFile(configPath, "utf8")
        .then((t) => (JSON.parse(t) as { $schema?: unknown }).$schema)
        .catch(() => undefined);
      obj.$schema = typeof schemaAtual === "string" && schemaAtual ? schemaAtual : "https://opencode.ai/config.json";
    }
    const texto = `${JSON.stringify(obj, null, 2)}\n`;
    if (Buffer.byteLength(texto, "utf8") > 64 * 1024) {
      enviar(res, 400, { erro: "config excede o limite de 64KB" });
      return true;
    }
    try {
      await writeFileAtomic(configPath, texto, { encoding: "utf8" });
    } catch (erro) {
      enviar(res, 500, { erro: `falha ao gravar configuração: ${erro instanceof Error ? erro.message : String(erro)}` });
      return true;
    }
    enviar(res, 200, { ok: true, path: configPath });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // PROVIDER-KEYS (/provider-keys)
  // ─────────────────────────────────────────────────────────────────────
  const escopoChaves = (): { home: string; ws: string | null } => ({
    home,
    ws: url.searchParams.get("workspace"),
  });
  const lerAuth = (path: string): { auth: Record<string, EntradaAuth>; existe: boolean } => {
    try {
      const auth = JSON.parse(readFileSync(path, "utf8")) as Record<string, EntradaAuth>;
      return { auth, existe: Object.keys(auth).length > 0 };
    } catch { return { auth: {}, existe: false }; }
  };
  const chavesDe = (auth: Record<string, EntradaAuth>): Array<{ provider: string; tipo: string; preview: string }> =>
    Object.entries(auth)
      .filter(([, v]) => v && typeof v === "object")
      .map(([provider, v]) => ({
        provider,
        tipo: v.type ?? "api",
        preview: typeof v.key === "string" && v.key ? mascararChave(v.key) : "—",
      }));

  if (rota === "/provider-keys" && req.method === "GET") {
    const { home: h, ws } = escopoChaves();
    const gPath = authOpencodePath(h);
    const g = lerAuth(gPath);
    const gChaves = chavesDe(g.auth);
    let workspace: { id: string | null; existe: boolean; chaves: ReturnType<typeof chavesDe>; herdadas: ReturnType<typeof chavesDe> } = { id: null, existe: false, chaves: [], herdadas: [] };
    if (ws) {
      const wPath = authOverridesPathWorkspace(h, ws);
      const w = lerAuth(wPath);
      const wChaves = chavesDe(w.auth);
      const herdadas = gChaves.filter((gk) => !wChaves.some((wk) => wk.provider === gk.provider));
      workspace = { id: ws, existe: w.existe, chaves: wChaves, herdadas };
    }
    enviar(res, 200, { global: { existe: g.existe, chaves: gChaves, path: gPath }, workspace });
    return true;
  }

  if (rota === "/provider-keys" && req.method === "PUT") {
    const corpo = (await lerCorpo(req)) as { provider?: string; key?: string; escopo?: string };
    const provider = String(corpo.provider ?? "").trim();
    const key = String(corpo.key ?? "").trim();
    const { home: h, ws } = escopoChaves();
    const escopo = corpo.escopo === "workspace" ? "workspace" : "global";
    if (escopo === "workspace" && !ws) {
      enviar(res, 400, { erro: "escopo workspace exige um workspace ativo" });
      return true;
    }
    if (!PROVEEDOR_RE.test(provider) || !provider) {
      enviar(res, 400, { erro: "provider inválido — use letras/números/hífen (ex.: opencode-go, openrouter, anthropic, openai)" });
      return true;
    }
    if (key.length < 8) {
      enviar(res, 400, { erro: "chave muito curta" });
      return true;
    }
    const authPath = escopo === "workspace"
      ? authOverridesPathWorkspace(h, ws!)
      : authOpencodePath(h);
    const { auth } = lerAuth(authPath);
    try {
      await writeFileAtomic(authPath, `${JSON.stringify(fundirAuth(auth, provider, key), null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
    } catch (erro) {
      enviar(res, 500, { erro: `falha ao gravar auth.json: ${erro instanceof Error ? erro.message : String(erro)}` });
      return true;
    }
    enviar(res, 200, { ok: true, provider, escopo, preview: mascararChave(key) });
    return true;
  }

  const mChaveDel = /^\/provider-keys\/([^/]+)$/.exec(rota);
  if (mChaveDel && req.method === "DELETE") {
    const provider = decodeURIComponent(mChaveDel[1]!).trim();
    const { home: h, ws } = escopoChaves();
    const escopo = url.searchParams.get("escopo") === "workspace" ? "workspace" : "global";
    if (escopo === "workspace" && !ws) {
      enviar(res, 400, { erro: "escopo workspace exige um workspace ativo" });
      return true;
    }
    const authPath = escopo === "workspace"
      ? authOverridesPathWorkspace(h, ws!)
      : authOpencodePath(h);
    const { auth } = lerAuth(authPath);
    if (!(provider in auth)) {
      enviar(res, 404, { erro: `provedor "${provider}" não configurado neste escopo` });
      return true;
    }
    const { [provider]: _removida, ...resto } = auth;
    try {
      if (Object.keys(resto).length === 0) rmSync(authPath, { force: true });
      else {
        await writeFileAtomic(authPath, `${JSON.stringify(resto, null, 2)}\n`, {
          encoding: "utf8",
          mode: 0o600,
        });
      }
    } catch (erro) {
      enviar(res, 500, { erro: `falha ao gravar auth.json: ${erro instanceof Error ? erro.message : String(erro)}` });
      return true;
    }
    enviar(res, 200, { ok: true, provider, escopo });
    return true;
  }

  return false;
}
