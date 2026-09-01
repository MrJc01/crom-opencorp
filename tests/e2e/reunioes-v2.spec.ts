import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { logado, seederEmpresaBasica, api, esperarNavegacao, esperarElementoTexto } from "./helpers.js";

/** Suíte Etapa 6 — Reuniões v2. NÃO executa reunião real: (a) asserta o id na
 *  resposta da API; (b) semeia uma sala fake direto no registro do workspace
 *  e valida o painel Sala ao vivo; (c) valida agendamento + exclusão. */
test.describe("Reuniões v2 (sala ao vivo + agendamento)", () => {
  const sufixo = Date.now().toString(36);

  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
    await page.evaluate(() => { window.location.hash = "#/reunioes"; });
    await page.waitForURL("**/#/reunioes");
    await esperarElementoTexto(page, "Reuniões");
  });

  test("(a) Convocar pela UI e POST /meetings responde com id", async ({ page }) => {
    await page.fill("#reuniao-pauta", `Pauta v2 e2e-${sufixo}`);
    await page.locator('button:has-text("Convocar")').click();

    // compat: form limpa após 202 (padrão do crud-ui.spec)
    await expect(page.locator("#reuniao-pauta")).toHaveValue("");

    // assertion de API: resposta tem id consultável
    const resp = await api(page).post("/meetings?workspace=e2e-corp", {
      headers: { authorization: "Bearer test-e2e", "content-type": "application/json" },
      data: { pauta: `Pauta v2 API e2e-${sufixo}` },
    });
    expect(resp.status()).toBe(202);
    const corpo = await resp.json();
    expect(corpo.status).toBe("iniciado");
    expect(String(corpo.id)).toMatch(/^reuniao-/);
  });

  test("(b) Sala fake em-andamento: card com Sala ao vivo abre painel com cabeçalho e feed", async ({ page }) => {
    const salaId = "reuniao-e2e-viva";
    const dir = join("/tmp/opencorp-e2e", ".opencorp", "workspaces", "e2e-corp", ".opencorp", "registries", "chats", salaId);
    await mkdir(dir, { recursive: true });
    const meta = {
      id: salaId,
      categoria: "chats",
      descricao: "Reunião: pauta da sala viva e2e",
      criado_por: "opencorp",
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
      permissoes: { leitura: ["*"], escrita: ["opencorp"], modificacao_meta: [] },
      tags: ["reuniao"],
      referencias: [],
      extras: {
        tipo: "reuniao",
        pauta: "pauta da sala viva e2e",
        participantes: ["ag-alice", "ag-beto"],
        moderator: "secretario",
        moderacao: "rotacao-fixa",
        modelo: "(modelo de cada agente)",
        max_turnos: 12,
        turno: 2,
        status: "em-andamento",
        motivo_fim: null,
        encerrada_em: null,
        ata: null,
      },
    };
    const conteudo = [
      `# Reunião ${salaId}`,
      "",
      "- Pauta: pauta da sala viva e2e",
      "",
      "## Turno 1 — ag-alice",
      "",
      "Acho que devemos cortar custos de nuvem.",
      "",
      "## Turno 2 — ag-beto",
      "",
      "Concordo, a proposta de corte foi enviada.",
      "",
    ].join("\n");
    await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
    await writeFile(join(dir, "conteudo.md"), conteudo, "utf8");

    await page.reload();
    await esperarElementoTexto(page, "Reuniões");
    await esperarElementoTexto(page, "pauta da sala viva e2e");

    const card = page.locator("#reunioes-lista .card", { hasText: salaId }).first();
    await expect(card).toBeVisible();
    await expect(card).toContainText("em-andamento");

    await card.locator('button:has-text("Sala ao vivo")').click();

    const painel = page.locator("#reuniao-sala");
    await expect(painel).toBeVisible();
    await expect(painel).toContainText("Sala ao vivo");
    await expect(painel).toContainText("pauta da sala viva e2e");
    await expect(painel).toContainText("ag-alice, ag-beto");
    await expect(painel).toContainText("0/2 pediram encerrar");
    await expect(painel).toContainText("cortar custos de nuvem");
    await expect(painel).toContainText("proposta de corte foi enviada");
    await expect(painel.locator('button:has-text("Fechar painel")')).toBeVisible();
  });

  test("(c) Agendar reunião automática cria rotina e Excluir remove (API + UI)", async ({ page }) => {
    const pauta = `revisao agendada e2e-${sufixo}`;
    await page.fill("#reuniao-ag-pauta", pauta);
    await page.selectOption("#reuniao-ag-freq", "intervalo");
    await page.fill("#reuniao-ag-valor", "120");
    await page.locator('button:has-text("Agendar")').click();

    // rotina aparece na lista de rotinas de reunião
    const item = page.locator("#reuniao-agenda-lista .card", { hasText: "meeting iniciar" }).first();
    await expect(item).toBeVisible();
    await expect(item).toContainText("intervalo_min");

    // e existe no GET /schedules com comando headless
    const resp = await api(page).get("/schedules?workspace=e2e-corp", {
      headers: { authorization: "Bearer test-e2e" },
    });
    expect(resp.status()).toBe(200);
    const jobs = (await resp.json()) as Array<{ id: string; args: string[] }>;
    const rotina = jobs.find((j) => Array.isArray(j.args) && j.args[0] === "meeting");
    expect(rotina).toBeTruthy();
    expect(rotina!.args).toContain("--nao-interativo");
    expect(rotina!.args).toContain(pauta);

    // excluir via UI (modal) → some da lista
    await item.locator('button:has-text("Excluir")').click();
    await expect(page.locator(".modal-ok")).toBeVisible();
    await page.locator(".modal-ok").click();
    await expect(page.locator("#reuniao-agenda-lista .card", { hasText: "meeting iniciar" })).toHaveCount(0);
  });
});
