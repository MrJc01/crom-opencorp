import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarElementoTexto } from "../helpers.js";
import { ConsoleWatcher } from "./pom/base.js";

const HDR = { authorization: "Bearer test-e2e", "content-type": "application/json" };

test.describe("Web Apps: criar, abrir, modos e voltar", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/apps");
    await esperarElementoTexto(page, "Mini-Apps");
  });

  test("criar mini-app e excluir via API", async ({ page }) => {
    const watcher = new ConsoleWatcher(page);
    watcher.start();
    const id = `web-mini-${Date.now().toString(36)}`;
    await page.getByRole("button", { name: "Novo Mini-App" }).first().click();
    await esperarElementoTexto(page, "Criar Novo Mini-App");
    await page.locator('input[placeholder="ex: painel-vendas ou monitor-api"]').fill(id);
    await page.locator('input[placeholder="ex: Painel de Monitoramento"]').fill(`Painel ${id}`);
    await page.getByRole("button", { name: "Criar App e Abrir" }).click();
    await expect(page.getByText(`apps/${id}/index.html`).first()).toBeVisible({ timeout: 15000 });
    watcher.stop();
    expect(watcher.limpos()).toEqual([]);
    await api(page).delete(`/apps/${id}`, { headers: HDR }).catch(() => undefined);
  });

  test("abrir app: modos Só App/Só Chat e voltar", async ({ page }) => {
    const card = page.locator("div.p-4.rounded-xl", { hasText: "Painel de Tarefas" });
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.getByRole("button", { name: "Abrir App" }).click();
    await expect(page.getByRole("button", { name: "Só App" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Só Chat" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Só App" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Voltar aos Apps" }).click();
    await esperarElementoTexto(page, "Aplicações Instaladas");
  });
});
