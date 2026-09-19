import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarElementoTexto } from "../helpers.js";
import { ConsoleWatcher } from "./pom/base.js";

const HDR = { authorization: "Bearer test-e2e", "content-type": "application/json" };

test.describe("Web Fluxos: lista, canvas, NDV e execução", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/fluxos");
    await esperarElementoTexto(page, "Fluxos");
  });

  test("busca e filtros funcionam", async ({ page }) => {
    const watcher = new ConsoleWatcher(page);
    watcher.start();
    await page.locator('input[placeholder="Pesquisar fluxos..."]').fill("zzz-nada-999");
    await esperarElementoTexto(page, "Nenhum fluxo encontrado");
    await page.locator('input[placeholder="Pesquisar fluxos..."]').fill("");
    for (const filtro of ["Agendados (Cron)", "Todos"]) {
      await page.getByRole("button", { name: filtro }).first().click();
      await page.waitForTimeout(300);
    }
    watcher.stop();
    expect(watcher.limpos()).toEqual([]);
  });

  test("criar fluxo pelo modal abre o canvas", async ({ page }) => {
    const nome = `Web fluxo ${Date.now()}`;
    await page.getByRole("button", { name: "Adicionar Fluxo" }).click();
    await esperarElementoTexto(page, "Criar Novo Fluxo");
    await page.locator('input[placeholder="ex: Publicação Editorial de Conteúdo"]').fill(nome);
    await page.getByRole("button", { name: "Criar Fluxo" }).click();
    await esperarElementoTexto(page, "Voltar para Fluxos");
    await expect(page.getByText(nome).first()).toBeVisible({ timeout: 10000 });
  });

  test("canvas: zoom, NDV e voltar", async ({ page }) => {
    const fid = `flow-canvas-${Date.now().toString(36)}`;
    await api(page).post("/flows", {
      headers: HDR,
      data: { id: fid, nome: "Canvas", nos: [{ id: "inicio", tipo: "manual", config: {} }, { id: "fim", tipo: "registro", config: { categoria: "documentos" } }], arestas: [{ de: "inicio", para: "fim" }] },
    });
    await page.reload();
    await esperarElementoTexto(page, "Fluxos");
    await page.locator('input[placeholder="Pesquisar fluxos..."]').fill(fid);
    await page.locator('button:has-text("Abrir Canvas")').first().click();
    await expect(page.locator('[data-node-id="inicio"]').first()).toBeVisible({ timeout: 15000 });

    await page.locator('[data-node-id="fim"]').first().click();
    await expect(page.locator(".ndv-panel")).toBeVisible({ timeout: 10000 });
    for (const modo of ["JSON avançado", "formulário"]) {
      const btn = page.getByRole("button", { name: new RegExp(modo, "i") }).first();
      if (await btn.isVisible().catch(() => false)) await btn.click();
    }

    await page.getByRole("button", { name: /Voltar para Fluxos/ }).click();
    await esperarElementoTexto(page, "Fluxos");

    page.once("dialog", (d) => d.accept());
    await page.locator('button[title="Excluir fluxo"]').first().click();
  });

  test("executar pelo Studio navega ao histórico", async ({ page }) => {
    const fid = `flow-exec-${Date.now().toString(36)}`;
    await api(page).post("/flows", {
      headers: HDR,
      data: { id: fid, nome: "Exec", nos: [{ id: "inicio", tipo: "manual", config: {} }], arestas: [] },
    });
    await page.reload();
    await esperarElementoTexto(page, "Fluxos");
    await page.locator('input[placeholder="Pesquisar fluxos..."]').fill(fid);
    await page.locator('button:has-text("Abrir Canvas")').first().click();
    await expect(page.locator('[data-node-id="inicio"]').first()).toBeVisible({ timeout: 15000 });

    await page.locator("button.bg-orange-600").first().click();
    await esperarElementoTexto(page, "Executar Fluxo:");
    await page.getByRole("button", { name: "Iniciar Execução" }).click();
    await page.waitForURL("**/historico?run=*", { timeout: 20000 });
  });

  test("toggles de Ativo e Auto-agendar na lista atualizam sem erro 'nos: expected array'", async ({ page }) => {
    const fid = `flow-toggle-${Date.now().toString(36)}`;
    await api(page).post("/flows", {
      headers: HDR,
      data: {
        id: fid,
        nome: "Flow Toggle Test",
        nos: [{ id: "inicio", tipo: "manual", config: {} }],
        arestas: [],
        ativo: true,
      },
    });

    await page.reload();
    await esperarElementoTexto(page, "Fluxos");

    const watcher = new ConsoleWatcher(page);
    watcher.start();

    // Filtra pelo fluxo criado
    await page.locator('input[placeholder="Pesquisar fluxos..."]').fill(fid);
    await expect(page.getByText("Flow Toggle Test").first()).toBeVisible({ timeout: 10000 });

    // Clica no toggle Ativo (que envia PUT /flows/:id com os dados do card)
    const toggleAtivo = page.locator(`[data-testid="toggle-ativo-${fid}"]`);
    await expect(toggleAtivo).toBeVisible({ timeout: 5000 });
    await toggleAtivo.click();

    // Aguarda processamento
    await page.waitForTimeout(500);

    // Valida que nenhum toast de erro apareceu
    await expect(page.getByText(/campo "nos": Invalid input/i)).toHaveCount(0);
    await expect(page.getByText(/Sem conexão com o servidor/i)).toHaveCount(0);

    watcher.stop();
    expect(watcher.limpos()).toEqual([]);
  });
});
