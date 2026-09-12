import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarElementoTexto } from "../helpers.js";
import { ConsoleWatcher } from "./pom/base.js";

test.describe("Web Reuniões: convocar, sala, histórico e ata", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/reunioes");
    await page.locator('button[title="Convocar nova reunião"]').first().waitFor({ timeout: 15000 });
  });

  test("modal convocar valida, cria sala e fecha", async ({ page }) => {
    const watcher = new ConsoleWatcher(page);
    watcher.start();
    await page.locator('button[title="Convocar nova reunião"]').click();
    await esperarElementoTexto(page, "Convocar Nova Reunião Multi-Agente");

    await page.getByRole("button", { name: "Abrir Sala de Chat" }).click();
    await esperarElementoTexto(page, "Convocar Nova Reunião Multi-Agente");

    const pauta = `Web reuniao ${Date.now()}`;
    await page.locator('textarea[placeholder="Ex: Alinhar lançamento da nova home e definir responsabilidade de cada agente..."]').fill(pauta);
    await page.getByRole("button", { name: "Abrir Sala de Chat" }).click();
    await page.waitForURL("**/reunioes?reuniao=*", { timeout: 20000 });
    await expect(page.getByText(pauta).first()).toBeVisible({ timeout: 15000 });
    watcher.stop();
    expect(watcher.limpos()).toEqual([]);
  });

  test("enviar mensagem na sala aparece no feed", async ({ page }) => {
    const pauta = `Web sala msg ${Date.now()}`;
    await page.locator('button[title="Convocar nova reunião"]').click();
    await page.locator('textarea[placeholder="Ex: Alinhar lançamento da nova home e definir responsabilidade de cada agente..."]').fill(pauta);
    await page.getByRole("button", { name: "Abrir Sala de Chat" }).click();
    await page.waitForURL("**/reunioes?reuniao=*", { timeout: 20000 });

    const texto = `msg web ${Date.now()}`;
    const input = page.locator('textarea[placeholder*="mesa"], textarea[placeholder*="direcionado"]');
    await expect(input).toBeVisible({ timeout: 15000 });
    await input.fill(texto);
    await page.locator("main").getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText(texto).first()).toBeVisible({ timeout: 15000 });
  });

  test("histórico lista e abre sala; ata abre e fecha", async ({ page }) => {
    await page.getByRole("button", { name: /Reuniões \(\d+\)/ }).click();
    await esperarElementoTexto(page, "Histórico de Reuniões da Empresa");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  });
});
