/**
 * Store Svelte do Secretário — writable stores + helpers puros.
 * Mantém compatibilidade com src/web/views/secretario.ts (1484 linhas)
 * e com src/web/chat-lateral.ts. Usado por Secretario.svelte (Svelte 5).
 */

import { writable, derived, get } from "svelte/store";
import { api, q, toast } from "../api.js";
import { getWsAtivo } from "../state.js";
import { getRascunho, setRascunho, limparRascunho } from "../rascunho.js";
import { parsearComposer, COMANDOS_OPCORP } from "../composer-comandos.js";
import { pararPollingSala } from "../views/reunioes.js";
import {
  agruparSessoes,
  dataSessao,
  tempoRelativo,
  tituloSessao,
  type SessaoChat,
} from "../sessoes-utils.js";

export type { SessaoChat } from "../sessoes-utils.js";

export interface SecretarioStatus {
  rodando: boolean;
  porta?: number;
  agentes?: number;
  configurado?: boolean;
}

export interface MensagemChat {
  role: "user" | "assistant";
  content: string;
  criado_em?: string;
  concluida?: boolean;
  pensamento?: string;
  terminal?: string;
  acoes?: AcaoChat[];
  imagens?: string[];
}

export interface AcaoChat {
  tool: string;
  status: string;
  resumo?: string;
}

export interface AnexoImg {
  nome: string;
  mime: string;
  url: string;
}

export interface HitlItem {
  id: string;
  ordem: string;
  agente: string;
  motivo_guard: string;
  status: string;
}

// ── Helpers puros (testáveis) ──────────────────────────────────────────

export function urlsDeImagem(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  return urls.filter(
    (u): u is string => typeof u === "string" && u.startsWith("data:image/"),
  );
}

export function filtrarSessoes(
  sessoes: SessaoChat[],
  busca: string,
  sessaoAtivaId: string | null,
): SessaoChat[] {
  const b = busca.toLowerCase();
  return sessoes.filter(
    (s) =>
      (s.id === sessaoAtivaId || !s.sem_conteudo) &&
      (!b || tituloSessao(s).toLowerCase().includes(b)),
  );
}

// ── Stores ─────────────────────────────────────────────────────────────

export const sessoesStore = writable<SessaoChat[]>([]);
export const sessaoAtivaIdStore = writable<string | null>(null);
export const mensagensStore = writable<MensagemChat[]>([]);
export const agenteSelecionadoStore = writable<"secretario" | "secretario-exec">(
  "secretario-exec",
);
export const carregandoStore = writable(false);
export const buscaStore = writable("");
export const anexosStore = writable<AnexoImg[]>([]);
export const acoesEmAndamentoStore = writable(0);
export const hitlPendentesStore = writable<HitlItem[]>([]);
export const statusSecretarioStore = writable<SecretarioStatus | null>(null);
export const erroCarregamentoStore = writable<string | null>(null);
export const decorridoSegundosStore = writable(0);
export const abaAtivaStore = writable<"conversa" | "reunioes">("conversa");
export const pertoDoFundoStore = writable(true);

// derived
export const sessoesFiltradasStore = derived(
  [sessoesStore, buscaStore, sessaoAtivaIdStore],
  ([$sessoes, $busca, $id]) => filtrarSessoes($sessoes, $busca, $id),
);

export const gruposSessoesStore = derived(sessoesFiltradasStore, ($filtradas) =>
  agruparSessoes($filtradas),
);

// compatibilidade com componente que espera variáveis síncronas via get()
let _sessoes: SessaoChat[] = [];
let _sessaoAtivaId: string | null = null;
let _mensagens: MensagemChat[] = [];
let _carregando = false;
let _anexos: AnexoImg[] = [];
let _acoesEmAndamento = 0;
let _decorrido = 0;

sessoesStore.subscribe((v) => (_sessoes = v));
sessaoAtivaIdStore.subscribe((v) => (_sessaoAtivaId = v));
mensagensStore.subscribe((v) => (_mensagens = v));
carregandoStore.subscribe((v) => (_carregando = v));
anexosStore.subscribe((v) => (_anexos = v));
acoesEmAndamentoStore.subscribe((v) => (_acoesEmAndamento = v));
decorridoSegundosStore.subscribe((v) => (_decorrido = v));

// timers não reativos
let controller: AbortController | null = null;
let pollRespostaTimer: ReturnType<typeof setTimeout> | null = null;
let pollRespostaSessao: string | null = null;
let decorrendoTimer: ReturnType<typeof setInterval> | null = null;
let decorrendoInicio = 0;

let ultimoSyncRemoto = 0;
let timerSyncRemoto: ReturnType<typeof setTimeout> | null = null;

export const POLL_RESPOSTA_INTERVALO_MS = 2000;
export const POLL_RESPOSTA_CAP_MS = 15 * 60 * 1000;
export const SEM_RESPOSTA_CAP_MS = 60 * 1000;

// ── URL helpers ────────────────────────────────────────────────────────

function getWindow(): Window | null {
  try {
    if (typeof window !== "undefined") return window;
    const g = globalThis as unknown as { window?: Window };
    return g.window ?? null;
  } catch {
    return null;
  }
}

export function sincronizarHashSessao(): void {
  try {
    const w = getWindow();
    if (!w) return;
    const alvo = _sessaoAtivaId
      ? "/secretario?sessao=" + encodeURIComponent(_sessaoAtivaId)
      : "/secretario";
    const atual = w.location.pathname + w.location.search;
    if (atual !== alvo) w.history.replaceState(null, "", alvo);
  } catch {
    /* sem history */
  }
}

export function sessaoDaUrl(): string | null {
  const w = getWindow();
  if (!w) return null;
  const hashQ = w.location.hash.split("?")[1] ?? "";
  if (hashQ) return new URLSearchParams(hashQ).get("sessao");
  return new URLSearchParams(w.location.search).get("sessao");
}

// ── Sessões / mensagens ────────────────────────────────────────────────

export async function carregarSessoes(): Promise<void> {
  try {
    const st = await q<SecretarioStatus>("/secretario/status").catch(() => null);
    if (st && !st.rodando) {
      sessoesStore.set([]);
      return;
    }
    const data = await q<SessaoChat[]>("/secretario/sessoes");
    sessoesStore.set(data);
  } catch {
    sessoesStore.set([]);
  }
}

export async function carregarMensagens(sessaoId: string): Promise<boolean> {
  try {
    const msgs = await q<MensagemChat[]>(
      `/secretario/sessoes/${encodeURIComponent(sessaoId)}/mensagens`,
    );
    mensagensStore.set(msgs || []);
    return true;
  } catch {
    mensagensStore.set([]);
    return false;
  }
}

export async function carregarStatus(): Promise<SecretarioStatus | null> {
  try {
    const st = await q<SecretarioStatus>("/secretario/status");
    statusSecretarioStore.set(st);
    erroCarregamentoStore.set(null);
    return st;
  } catch (e) {
    erroCarregamentoStore.set((e as Error).message);
    return null;
  }
}

export async function carregarHitlPendentes(): Promise<void> {
  try {
    const ws = getWsAtivo();
    const qs = ws ? `?workspace=${encodeURIComponent(ws)}` : "";
    const pendentes = await q<HitlItem[]>("/approvals" + qs);
    hitlPendentesStore.set(
      (pendentes ?? []).filter((p) => p.status === "pendente"),
    );
  } catch {
    hitlPendentesStore.set([]);
  }
}

export async function aprovarHitl(id: string): Promise<void> {
  const ws = getWsAtivo();
  const qs = ws ? `?workspace=${encodeURIComponent(ws)}` : "";
  await q("/approvals/" + encodeURIComponent(id) + "/approve" + qs, {
    method: "POST",
  });
  toast("Aprovado — o agente retoma em instantes", "ok");
  await carregarHitlPendentes();
}

export async function rejeitarHitl(id: string, motivo: string): Promise<void> {
  const ws = getWsAtivo();
  const qs = ws ? `?workspace=${encodeURIComponent(ws)}` : "";
  await q("/approvals/" + encodeURIComponent(id) + "/reject" + qs, {
    method: "POST",
    body: JSON.stringify({ motivo }),
  });
  toast("Rejeitado", "ok");
  await carregarHitlPendentes();
}

// ── Polling / decorrendo ───────────────────────────────────────────────

function iniciarDecorrendo(): void {
  pararDecorrendo();
  decorrendoInicio = Date.now();
  decorridoSegundosStore.set(0);
  decorrendoTimer = setInterval(() => {
    decorridoSegundosStore.set(
      Math.floor((Date.now() - decorrendoInicio) / 1000),
    );
  }, 1000);
}

function pararDecorrendo(): void {
  if (decorrendoTimer) {
    clearInterval(decorrendoTimer);
    decorrendoTimer = null;
  }
}

export function pararPollResposta(): void {
  if (pollRespostaTimer !== null) {
    clearTimeout(pollRespostaTimer);
    pollRespostaTimer = null;
  }
  pollRespostaSessao = null;
}

function entrarModoCarregando(): void {
  if (_carregando) return;
  carregandoStore.set(true);
  controller = new AbortController();
  iniciarDecorrendo();
}

function sairModoCarregando(): void {
  carregandoStore.set(false);
  controller = null;
  pararDecorrendo();
  if (pollRespostaTimer !== null) {
    clearTimeout(pollRespostaTimer);
    pollRespostaTimer = null;
  }
  pollRespostaSessao = null;
}

export function _resetPollState(): void {
  pararPollResposta();
  pararDecorrendo();
  carregandoStore.set(false);
  controller = null;
  ultimoSyncRemoto = 0;
  if (timerSyncRemoto) {
    clearTimeout(timerSyncRemoto);
    timerSyncRemoto = null;
  }
}

function talvezPollResposta(sessaoId: string): void {
  const ultima = _mensagens[_mensagens.length - 1];
  if (!sessaoId || !ultima) return;
  if (ultima.role === "user") {
    talvezAvisarSemResposta(sessaoId);
    return;
  }
  if (ultima.concluida !== false) return;
  entrarModoCarregando();
  pararPollResposta();
  pollRespostaSessao = sessaoId;
  const inicio = Date.now();
  const tick = async (): Promise<void> => {
    if (
      pollRespostaSessao !== sessaoId ||
      _sessaoAtivaId !== sessaoId ||
      Date.now() - inicio > POLL_RESPOSTA_CAP_MS
    ) {
      sairModoCarregando();
      return;
    }
    const antes = [..._mensagens];
    const ok = await carregarMensagens(sessaoId);
    if (!ok) mensagensStore.set(antes);
    if (pollRespostaSessao !== sessaoId || _sessaoAtivaId !== sessaoId) {
      sairModoCarregando();
      return;
    }
    const ult = _mensagens[_mensagens.length - 1];
    if (!ult || ult.role !== "assistant") {
      sairModoCarregando();
      return;
    }
    if (ult.concluida !== false) {
      sairModoCarregando();
      return;
    }
    pollRespostaTimer = setTimeout(() => {
      void tick();
    }, POLL_RESPOSTA_INTERVALO_MS);
  };
  pollRespostaTimer = setTimeout(() => {
    void tick();
  }, POLL_RESPOSTA_INTERVALO_MS);
}

function talvezAvisarSemResposta(sessaoId: string): void {
  entrarModoCarregando();
  pararPollResposta();
  pollRespostaSessao = sessaoId;
  const inicio = Date.now();
  const tick = async (): Promise<void> => {
    if (
      pollRespostaSessao !== sessaoId ||
      _sessaoAtivaId !== sessaoId ||
      Date.now() - inicio > SEM_RESPOSTA_CAP_MS
    ) {
      toast("A última mensagem ficou sem resposta — reenvie", "aviso");
      sairModoCarregando();
      return;
    }
    const antes = [..._mensagens];
    const ok = await carregarMensagens(sessaoId);
    if (!ok) mensagensStore.set(antes);
    if (pollRespostaSessao !== sessaoId || _sessaoAtivaId !== sessaoId) {
      sairModoCarregando();
      return;
    }
    const ult = _mensagens[_mensagens.length - 1];
    if (ult && ult.role === "assistant") {
      talvezPollResposta(sessaoId);
      return;
    }
    pollRespostaTimer = setTimeout(() => {
      void tick();
    }, 3000);
  };
  pollRespostaTimer = setTimeout(() => {
    void tick();
  }, 3000);
}

// ── SSE cross-tab sync ─────────────────────────────────────────────────

export function eventoRemotoSecretario(ev: Record<string, unknown>): void {
  const dados = (ev.dados ?? ev) as {
    sessao_id?: unknown;
    fase?: unknown;
  };
  const sessao = typeof dados.sessao_id === "string" ? dados.sessao_id : "";
  const fase = typeof dados.fase === "string" ? dados.fase : "";
  if (fase === "hitl") {
    void carregarHitlPendentes();
    void carregarSessoes();
    return;
  }
  if (!sessao) return;
  if (_carregando && sessao === _sessaoAtivaId && !pollRespostaSessao) return;

  if (
    sessao === _sessaoAtivaId &&
    (fase === "inicio" || fase === "delta" || fase === "pensamento")
  ) {
    if (!_carregando) entrarModoCarregando();
    const agora = Date.now();
    if (timerSyncRemoto) return;
    const esperar = Math.max(0, 1500 - (agora - ultimoSyncRemoto));
    timerSyncRemoto = setTimeout(() => {
      timerSyncRemoto = null;
      ultimoSyncRemoto = Date.now();
      void carregarMensagens(sessao);
    }, esperar);
    return;
  }
  if (sessao === _sessaoAtivaId && (fase === "fim" || fase === "erro")) {
    void carregarMensagens(sessao).then(() => {
      if (_carregando) sairModoCarregando();
    });
    void carregarSessoes();
    return;
  }
  if (fase === "inicio" || fase === "fim" || fase === "erro") {
    void carregarSessoes();
  }
}

// ── Ações de conversa ──────────────────────────────────────────────────

export function novaConversa(): void {
  if (_carregando) {
    controller?.abort();
    sairModoCarregando();
    toast("Conversa anterior interrompida — nova conversa iniciada", "aviso");
  }
  sessaoAtivaIdStore.set(null);
  mensagensStore.set([]);
  acoesEmAndamentoStore.set(0);
  pararPollResposta();
  sincronizarHashSessao();
  limparRascunho();
}

export async function selecionarSessao(id: string): Promise<void> {
  if (_carregando) return;
  sessaoAtivaIdStore.set(id);
  sincronizarHashSessao();
  await carregarMensagens(id);
  talvezPollResposta(id);
}

export async function iniciarSecretario(): Promise<void> {
  await api("/secretario/start", { method: "POST" });
  toast("Secretário iniciado", "ok");
  const st = await carregarStatus();
  if (st?.rodando) await carregarSessoes();
}

export function atualizarRascunho(valor: string): void {
  setRascunho(valor);
}

export function obterRascunho(): string {
  return getRascunho();
}

export function adicionarAnexos(files: FileList | null): void {
  if (!files) return;
  for (const f of Array.from(files)) {
    const reader = new FileReader();
    if (f.type.startsWith("image/")) {
      reader.onload = () => {
        anexosStore.update((prev) => [
          ...prev,
          { nome: f.name, mime: f.type, url: String(reader.result) },
        ]);
      };
      reader.readAsDataURL(f);
    } else {
      reader.onload = () => {
        const conteudo = String(reader.result ?? "");
        const texto =
          conteudo.length > 120_000
            ? conteudo.slice(0, 120_000) + "\n…(truncado)"
            : conteudo;
        const atual = getRascunho();
        const novo =
          (atual ? atual + "\n\n" : "") +
          `--- arquivo: ${f.name} ---\n${texto}\n--- fim: ${f.name} ---`;
        setRascunho(novo);
      };
      reader.readAsText(f);
    }
  }
}

export function removerAnexo(idx: number): void {
  anexosStore.update((prev) => prev.filter((_, i) => i !== idx));
}

// ── Envio principal (streaming SSE + fallback) ─────────────────────────

export async function enviarMensagem(textoBruto: string): Promise<void> {
  if (_carregando) {
    if (textoBruto.trim()) {
      toast(
        "Resposta em andamento — aguarde ou interrompa para enviar",
        "aviso",
      );
      return;
    }
    controller?.abort();
    sairModoCarregando();
    toast(
      "Parado — a geração continua no servidor; reabra a conversa para retomar",
      "aviso",
    );
    return;
  }

  const texto = textoBruto.trim();
  if (!texto) return;

  const parse = parsearComposer(texto);
  if (parse.terminal) {
    await enviarTerminalLocal(parse.terminal.comando, texto);
    return;
  }
  if (
    parse.comando &&
    COMANDOS_OPCORP.some((c) => c.nome === parse.comando!.nome)
  ) {
    await enviarComandoLocal(parse.comando);
    return;
  }

  carregandoStore.set(true);
  iniciarDecorrendo();
  controller = new AbortController();
  acoesEmAndamentoStore.set(0);
  pararPollResposta();

  const idxAssistant = _mensagens.length + 1;
  mensagensStore.update((prev) => [
    ...prev,
    {
      role: "user",
      content: texto,
      imagens: _anexos.length ? _anexos.map((a) => a.url) : undefined,
    },
    { role: "assistant", content: "" },
  ]);
  limparRascunho();
  const imagensEnviar = _anexos.length ? [..._anexos] : undefined;

  try {
    const { headers } = await import("../api.js");
    const ws = getWsAtivo();
    const qs = ws ? "?workspace=" + encodeURIComponent(ws) : "";
    const res = await fetch("/secretario/conversa/stream" + qs, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        mensagem: parse.textoLimpo || texto,
        sessao_id: _sessaoAtivaId || undefined,
        agente: get(agenteSelecionadoStore),
        imagens: imagensEnviar,
        contexto: parse.contexto.length ? parse.contexto : undefined,
      }),
      signal: controller.signal,
    });
    anexosStore.set([]);
    const tipo = res.headers.get("content-type") ?? "";
    if (!res.ok || !tipo.includes("text/event-stream")) {
      if (res.ok) {
        const data = (await res.json()) as {
          resposta: string;
          sessao_id: string;
        };
        mensagensStore.update((prev) => {
          const copy = [...prev];
          if (copy[idxAssistant]) copy[idxAssistant]!.content = data.resposta;
          return copy;
        });
        sessaoAtivaIdStore.set(data.sessao_id);
      } else {
        const corpo = (await res.json().catch(() => ({}))) as {
          erro?: string;
        };
        throw new Error(corpo.erro ?? `HTTP ${res.status}`);
      }
    } else {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fim = false;
      while (!fim) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const partes = buffer.split("\n\n");
        buffer = partes.pop() ?? "";
        for (const parte of partes) {
          let evento = "message";
          let dados = "";
          for (const linha of parte.split("\n")) {
            if (linha.startsWith("event:")) evento = linha.slice(6).trim();
            else if (linha.startsWith("data:"))
              dados += linha.slice(5).trim();
          }
          if (!dados) continue;
          const payload = JSON.parse(dados) as {
            sessao_id?: string;
            delta?: string;
            resposta?: string;
            erro?: string;
            acoes?: number;
            itens?: AcaoChat[];
          };
          if (evento === "inicio") {
            if (payload.sessao_id) {
              sessaoAtivaIdStore.set(payload.sessao_id);
              sincronizarHashSessao();
            }
          } else if (evento === "acao") {
            if (payload.acoes !== undefined)
              acoesEmAndamentoStore.set(payload.acoes);
            if (payload.itens) {
              mensagensStore.update((prev) => {
                const copy = [...prev];
                if (copy[idxAssistant]) copy[idxAssistant]!.acoes = payload.itens!;
                return copy;
              });
            }
          } else if (evento === "pensamento") {
            mensagensStore.update((prev) => {
              const copy = [...prev];
              const m = copy[idxAssistant];
              if (m) {
                if (!m.pensamento) m.pensamento = "";
                m.pensamento += payload.delta ?? "";
              }
              return copy;
            });
          } else if (evento === "delta") {
            mensagensStore.update((prev) => {
              const copy = [...prev];
              if (copy[idxAssistant]) copy[idxAssistant]!.content += payload.delta ?? "";
              return copy;
            });
          } else if (evento === "fim") {
            if (payload.resposta) {
              mensagensStore.update((prev) => {
                const copy = [...prev];
                if (copy[idxAssistant]) copy[idxAssistant]!.content = payload.resposta!;
                return copy;
              });
            }
            if (payload.sessao_id) {
              sessaoAtivaIdStore.set(payload.sessao_id);
              sincronizarHashSessao();
            }
            fim = true;
          } else if (evento === "erro") {
            throw new Error(payload.erro ?? "erro no stream");
          }
        }
      }
      const curMens = get(mensagensStore);
      if (!curMens[idxAssistant]?.content)
        throw new Error("resposta vazia do servidor");
    }

    await carregarSessoes();
  } catch (e) {
    const err = e as Error;
    if (err.name === "AbortError") {
      toast(
        "Interrompido — o processamento continua no servidor; reabra a conversa para ver a resposta completa",
        "aviso",
      );
    } else {
      toast(err.message, "erro");
      if (!_sessaoAtivaId)
        mensagensStore.update((prev) => prev.slice(0, -2));
      else mensagensStore.update((prev) => prev.slice(0, -1));
    }
  } finally {
    carregandoStore.set(false);
    controller = null;
    pararDecorrendo();
  }
}

async function enviarComandoLocal(comando: {
  nome: string;
  args: string;
}): Promise<void> {
  if (comando.nome === "limpar") {
    novaConversa();
    return;
  }
  mensagensStore.update((prev) => [
    ...prev,
    {
      role: "user",
      content: "/" + comando.nome + (comando.args ? " " + comando.args : ""),
    },
    { role: "assistant", content: "" },
  ]);
  const idx = get(mensagensStore).length - 1;
  limparRascunho();
  try {
    const conteudo = await resolverComandoProprio(comando.nome);
    mensagensStore.update((prev) => {
      const copy = [...prev];
      if (copy[idx]) copy[idx]!.content = conteudo;
      return copy;
    });
  } catch (e) {
    mensagensStore.update((prev) => {
      const copy = [...prev];
      if (copy[idx]) copy[idx]!.content = "⚠ " + (e as Error).message;
      return copy;
    });
  }
}

export async function resolverComandoProprio(nome: string): Promise<string> {
  switch (nome) {
    case "status": {
      const [st, ts] = await Promise.all([
        q<{ scheduler?: boolean; secretario?: boolean }>("/status").catch(
          () => null,
        ),
        q<Array<{ coluna: string }>>("/tasks").catch(() => null),
      ]);
      const porColuna = (ts ?? []).reduce<Record<string, number>>((acc, t) => {
        acc[t.coluna] = (acc[t.coluna] ?? 0) + 1;
        return acc;
      }, {});
      const total = Object.values(porColuna).reduce((a, b) => a + b, 0);
      return [
        "**Estado da empresa**",
        `- Scheduler: ${st?.scheduler ? "🟢 rodando" : "🔴 parado"}`,
        `- Secretário: ${st?.secretario ? "🟢 rodando" : "🔴 parado"}`,
        `- Tasks: ${total}` +
          (total
            ? ` — ${Object.entries(porColuna)
                .map(([c, n]) => `${c} ${n}`)
                .join(" · ")}`
            : ""),
      ].join("\n");
    }
    case "tasks": {
      const ts = await q<Array<{ coluna: string; titulo: string }>>("/tasks");
      if (!ts.length) return "Board vazio — nenhuma task.";
      const resto = ts.length > 8 ? `\n… +${ts.length - 8} tasks` : "";
      return (
        "**Board de tasks**\n" +
        ts
          .slice(0, 8)
          .map((t) => `- [${t.coluna}] ${t.titulo}`)
          .join("\n") +
        resto
      );
    }
    case "custos": {
      const b = await q<{
        estado?: { dia?: string; workspace_usd_hoje?: number };
        limites?: { daily_usd?: number };
      }>("/budget/status");
      const dia = b.estado?.dia ?? new Date().toISOString().slice(0, 10);
      return (
        `**Custos de hoje** (${dia})` +
        `\n- Workspace: $${(b.estado?.workspace_usd_hoje ?? 0).toFixed(4)}` +
        (b.limites?.daily_usd
          ? `\n- Limite diário: $${b.limites.daily_usd}`
          : "")
      );
    }
    case "fluxos": {
      const fs = await q<Array<{ id: string; nome?: string }>>("/flows");
      if (!fs.length) return "Nenhum flow disponível.";
      return (
        "**Flows**\n" +
        fs
          .map((f) => `- ${f.id}${f.nome && f.nome !== f.id ? " — " + f.nome : ""}`)
          .join("\n")
      );
    }
    case "agenda": {
      const jobs = await q<
        Array<{ nome: string; ativo: boolean; agenda: { tipo: string; valor: string | number } }>
      >("/schedules");
      if (!jobs.length) return "Nenhuma rotina agendada.";
      return (
        "**Rotinas agendadas**\n" +
        jobs
          .map(
            (j) =>
              `- ${j.nome} — ${j.agenda.tipo} ${j.agenda.valor} ${j.ativo ? "· ativa" : "· pausada"}`,
          )
          .join("\n")
      );
    }
    case "agentes": {
      const as = await q<Array<{ id: string; role?: string }>>("/agents");
      if (!as.length) return "Nenhum agente configurado.";
      return (
        "**Equipe**\n" +
        as.map((a) => `- **${a.id}**${a.role ? " — " + a.role : ""}`).join("\n")
      );
    }
    default:
      throw new Error(`comando /${nome} não suportado`);
  }
}

async function enviarTerminalLocal(
  comando: string,
  textoBruto: string,
): Promise<void> {
  mensagensStore.update((prev) => [
    ...prev,
    { role: "user", content: textoBruto },
    { role: "assistant", content: "" },
  ]);
  const idx = get(mensagensStore).length - 1;
  limparRascunho();
  try {
    const r = await api<{ saida: string; codigo: number }>("/terminal", {
      method: "POST",
      body: JSON.stringify({ comando }),
    });
    const saida = r.saida || "(sem saída)";
    mensagensStore.update((prev) => {
      const copy = [...prev];
      if (copy[idx]) {
        copy[idx]!.content = saida;
        copy[idx]!.terminal =
          `$ ${comando}\n${saida}` +
          (r.codigo !== 0 ? `\n[código de saída: ${r.codigo}]` : "");
      }
      return copy;
    });
  } catch (e) {
    mensagensStore.update((prev) => {
      const copy = [...prev];
      if (copy[idx]) copy[idx]!.content = "⚠ " + (e as Error).message;
      return copy;
    });
  }
}

// ── Compat helpers ─────────────────────────────────────────────────────

export async function inicializarSecretario(): Promise<void> {
  abaAtivaStore.set("conversa");
  pararPollingSala();
  const st = await carregarStatus();
  if (!st?.rodando) return;
  await carregarSessoes();
  const daUrl = sessaoDaUrl();
  const curSessoes = get(sessoesStore);
  const curId = get(sessaoAtivaIdStore);
  if (daUrl && daUrl !== curId && curSessoes.some((s) => s.id === daUrl)) {
    await selecionarSessao(daUrl);
  } else if (!daUrl && !curId) {
    await religarTurnoEmCurso();
  }
  void carregarHitlPendentes();
}

async function religarTurnoEmCurso(): Promise<void> {
  const cur = get(sessoesStore);
  const maisRecente = [...cur].sort(
    (a, b) => (dataSessao(b)?.getTime() ?? 0) - (dataSessao(a)?.getTime() ?? 0),
  )[0];
  if (!maisRecente) return;
  try {
    const msgs = await q<MensagemChat[]>(
      `/secretario/sessoes/${encodeURIComponent(maisRecente.id)}/mensagens`,
    );
    if (!msgs.length) return;
    const ultima = msgs[msgs.length - 1]!;
    const emCurso =
      (ultima.role === "assistant" && ultima.concluida === false) ||
      (ultima.role === "user" &&
        !!ultima.criado_em &&
        Date.now() - new Date(ultima.criado_em).getTime() < 10 * 60_000);
    await selecionarSessao(maisRecente.id);
    if (emCurso) toast("Resposta em andamento — conversa reaberta", "aviso");
  } catch {
    /* sessão sumiu */
  }
}

export async function copiarMensagem(idx: number): Promise<void> {
  const m = get(mensagensStore)[idx];
  if (!m) return;
  await navigator.clipboard.writeText(m.content);
}

export async function editarMensagem(idx: number): Promise<void> {
  const msgs = get(mensagensStore);
  const m = msgs[idx];
  if (!m || m.role !== "user") {
    toast("Só é possível editar prompts do usuário", "aviso");
    return;
  }
  if (get(carregandoStore)) {
    controller?.abort();
    sairModoCarregando();
    toast("Execução interrompida para edição", "aviso");
    await new Promise((r) => setTimeout(r, 600));
  }
  const texto = m.content;
  const imagens = m.imagens ? [...m.imagens] : [];
  const manter = idx;
  mensagensStore.set(msgs.slice(0, manter));
  const sid = get(sessaoAtivaIdStore);
  if (sid) {
    try {
      const { headers } = await import("../api.js");
      const resp = await fetch(
        `/secretario/sessoes/${encodeURIComponent(sid)}/truncar`,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ manter_ate: manter }),
        },
      );
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({ erro: `HTTP ${resp.status}` }));
        toast(j.erro || "Falha ao truncar histórico no servidor", "aviso");
      }
    } catch (e) {
      toast("Falha de rede ao truncar: " + (e as Error).message, "aviso");
    }
  }
  anexosStore.set(
    imagens.map((url, i) => {
      const mm = url.match(/^data:([^;]+);/);
      const mime = mm ? mm[1] : "image/png";
      return { nome: `imagem-${i + 1}.png`, mime, url };
    }),
  );
  setRascunho(texto);
}

export async function renderChatLateralCompat(): Promise<void> {
  if (!get(sessoesStore).length) await carregarSessoes();
  await carregarHitlPendentes();
}
