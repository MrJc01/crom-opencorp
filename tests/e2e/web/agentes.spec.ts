import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarElementoTexto } from "../helpers.js";
import { ConsoleWatcher } from "./pom/base.js";

const HDR = { authorization: "Bearer test-e2e", "content-type": "application/json" };

test.describe("Web Agentes: abas, toggle, inspeção e grupos", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await api(page).post("/agents/semear-catalogo", { headers: HDR });
    await page.goto("/agentes");
    await esperarElementoTexto(page, "Catálogo de Agentes & Grupos");
  });

  test("abas Todos/Agentes/Grupos filtram", async ({ page }) => {
    const watcher = new ConsoleWatcher(page);
    watcher.start();
    await page.getByRole("button", { name: /Agentes Individuais/ }).click();
    await expect(page.getByText("@executor-padrao").first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /Grupos de Agentes/ }).click();
    await expect(page.getByText("team:e2e-pipe").first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /^Todos/ }).click();
    watcher.stop();
    expect(watcher.limpos()).toEqual([]);
  });

  test("busca filtra agentes", async ({ page }) => {
    await page.locator('input[placeholder="Buscar agente ou grupo..."]').fill("executor-padrao");
    await expect(page.getByText("@executor-padrao").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("@agente-vendas").first()).toHaveCount(0);
    await page.locator('input[placeholder="Buscar agente ou grupo..."]').fill("");
  });

  test("inspecionar abre prompt/modelo e fecha", async ({ page }) => {
    const card = page.locator("div.rounded-xl", { has: page.getByText("@executor-padrao", { exact: true }) });
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.getByRole("button", { name: "Inspecionar / Editar" }).click();
    await esperarElementoTexto(page, "Especificação do Agente: @executor-padrao");
    await page.getByRole("button", { name: "Fechar" }).click();
    await expect(page.getByText("Especificação do Agente: @executor-padrao")).toHaveCount(0);
  });

  test("modal execução dispara e fecha", async ({ page }) => {
    const card = page.locator("div.rounded-xl", { has: page.getByText("@executor-padrao", { exact: true }) });
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.getByRole("button", { name: "Executar" }).click();
    await esperarElementoTexto(page, "Executar @executor-padrao");
    await page.locator('textarea[placeholder="Descreva detalhadamente o objetivo a ser executado..."]').fill("ping web e2e");
    await page.getByRole("button", { name: "Disparar Execução" }).click();
    await expect(page.getByText("Executar @executor-padrao")).toHaveCount(0, { timeout: 10000 });
  });
});
