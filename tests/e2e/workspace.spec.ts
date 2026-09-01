import { test, expect } from "@playwright/test";
import { logado, esperarNavegacao } from "./helpers.js";

/**
 * Workspace estilo VS Code (PLANO-PAINEL-V2 Etapa 3 · P-08/P-09/P-10).
 * Workspace dedicado criado com perfil editorial → .opencorp/projeto.json
 * existe sempre (server grava no POST /workspaces com perfil).
 */
const WS = "ws-arquivos";
const AUTH = { authorization: "Bearer test-e2e", "content-type": "application/json" };
const ARQ = ".opencorp/projeto.json";

test.describe("View Workspace (Etapa 3)", () => {
  test.beforeAll(async ({ request }) => {
    // ignora 4xx (workspace de run anterior); perfil → projeto.json na criação
    await request.post("/workspaces", {
      headers: AUTH,
      data: { id: WS, perfil: { empresa: "E2E Files", nicho: "teste" } },
    }).catch(() => {});
    // conteúdo canônico (idempotente) — arquivo existe (criação via perfil)
    await request.put(`/files?workspace=${WS}&path=${encodeURIComponent(ARQ)}`, {
      headers: AUTH,
      data: { conteudo: '{\n  "empresa": "E2E Files",\n  "nicho": "teste"\n}\n' },
    }).catch(() => {});
  });

  /** Navega à view e expande .opencorp até o projeto.json ficar visível. */
  async function abrirProjeto(page: import("@playwright/test").Page): Promise<void> {
    logado(page, "test-e2e", WS);
    await esperarNavegacao(page, "workspace");
    const dir = page.locator('.tree-dir[data-path=".opencorp"]');
    await expect(dir).toBeVisible();
    await dir.click();
    await expect(page.locator(`.tree-arquivo[data-path="${ARQ}"]`)).toBeVisible();
  }

  test("(a) árvore lista os arquivos semeados do workspace", async ({ page }) => {
    logado(page, "test-e2e", WS);
    await esperarNavegacao(page, "workspace");
    const dir = page.locator('.tree-dir[data-path=".opencorp"]');
    await expect(dir).toBeVisible();
    // fechado: chevron ▸; clique alterna (Etapa 3.2)
    await expect(dir).toContainText("▸");
    await dir.click();
    await expect(dir).toHaveClass(/tree-aberto/);
    await expect(dir).toContainText("▾");
    await expect(page.locator(`.tree-arquivo[data-path="${ARQ}"]`)).toBeVisible();
    // subpastas do template também entram na árvore (dirs primeiro, alfabética)
    await page.locator('.tree-dir[data-path=".opencorp/agents"]').click();
    await expect(page.locator('#view-workspace .tree-arquivo').first()).toBeVisible();
  });

  test("(b) abrir projeto.json → tab abre no modo padrão (json → Editor) com conteúdo", async ({ page }) => {
    await abrirProjeto(page);
    await page.locator(`.tree-arquivo[data-path="${ARQ}"]`).click();

    await expect(page.locator("#ws-tabs-arq .ui-tab")).toHaveCount(1);
    await expect(page.locator("#ws-tabs-arq .ui-tab").first()).toContainText("projeto.json");
    // .md → Preview; demais → Editor (json cai no Editor)
    await expect(page.locator("#ws-editor")).toBeVisible();
    await expect(page.locator("#ws-editor")).toHaveValue(/E2E Files/);
    // salvar desabilitado (limpo) e botão "Lado a lado" não existe para .json
    await expect(page.locator("#ws-btn-salvar")).toBeDisabled();
    await expect(page.locator('.ws-modo[data-modo="split"]')).toHaveCount(0);
  });

  test("(c) editar + Salvar → PUT grava no server e badge de sujo some", async ({ page }) => {
    await abrirProjeto(page);
    await page.locator(`.tree-arquivo[data-path="${ARQ}"]`).click();

    const editor = page.locator("#ws-editor");
    await editor.fill('{\n  "empresa": "E2E Editada",\n  "nicho": "teste"\n}\n');
    await expect(page.locator("#ws-btn-salvar")).toBeEnabled();
    await expect(page.locator("#ws-arq-nome")).toContainText("●");
    await expect(page.locator("#ws-tabs-arq .ui-tab").first()).toContainText("●");

    await page.click("#ws-btn-salvar");
    await expect(page.locator("#toast-container")).toContainText("Salvo", { timeout: 10000 });
    // badge limpo após salvar
    await expect(page.locator("#ws-btn-salvar")).toBeDisabled();
    await expect(page.locator("#ws-arq-nome")).not.toContainText("●");

    // conteúdo novo confirmado pelo GET /files
    const resp = await page.request.get(`/files?workspace=${WS}&path=${encodeURIComponent(ARQ)}`, {
      headers: { authorization: "Bearer test-e2e" },
    });
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as { conteudo: string };
    expect(body.conteudo).toContain("E2E Editada");
  });

  test("(d) terminal: rodar 'task list' (whitelist) e comando fora da whitelist mostra erro", async ({ page }) => {
    logado(page, "test-e2e", WS);
    await esperarNavegacao(page, "workspace");

    await page.click("#ws-btn-term-novo");
    await expect(page.locator("#ws-tabs-term .ui-tab")).toHaveCount(1);
    await expect(page.locator("#ws-tabs-term .ui-tab").first()).toContainText("term-1");

    const log = page.locator("#ws-term-log");
    await page.fill("#ws-term-cmd", "task list");
    await page.click("#ws-term-rodar");
    await expect(log).toContainText("ws$ task list", { timeout: 20000 });
    await expect(log).toContainText("[ok]", { timeout: 20000 });

    // fora da whitelist → mensagem de erro aparece no log do tab
    await page.fill("#ws-term-cmd", "rm -rf /");
    await page.click("#ws-term-rodar");
    await expect(log).toContainText("fora da whitelist", { timeout: 10000 });
  });

  test("(e) right-click no arquivo → 'Enviar como contexto @' abre o drawer com @caminho", async ({ page }) => {
    await abrirProjeto(page);
    await page.locator(`.tree-arquivo[data-path="${ARQ}"]`).click({ button: "right" });

    const menu = page.locator(".ctx-menu");
    await expect(menu).toBeVisible();
    await expect(menu.locator(".palette-item", { hasText: "Abrir" })).toBeVisible();

    await menu.locator(".palette-item", { hasText: "Enviar como contexto @" }).click();
    await expect(page.locator("#chat-drawer")).toHaveClass(/open/);
    await expect(page.locator("#lat-input")).toHaveValue(`@${ARQ}`);
  });
});
