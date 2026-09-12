import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarElementoTexto } from "./helpers.js";

test.describe("Home / Painel de Operações", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarElementoTexto(page, "Painel de Operações");
  });

  test("KPIs de operação aparecem (Custo, Tasks, Agentes, Fluxos, Saúde)", async ({ page }) => {
    await esperarElementoTexto(page, "Custo do Dia");
    await esperarElementoTexto(page, "Tasks em Aberto");
    await esperarElementoTexto(page, "Agentes Prontos");
    await esperarElementoTexto(page, "Fluxos Ativos");
    await esperarElementoTexto(page, "Saúde do Sistema");
  });

  test("abas navegam: Fluxos mostra automações e últimas execuções", async ({ page }) => {
    await page.getByRole("button", { name: /Fluxos/ }).click();
    await esperarElementoTexto(page, "Fluxos & Automações");
    await page.getByRole("button", { name: /Visão Geral/ }).click();
    await esperarElementoTexto(page, "Feed de Execuções Recentes");
  });

  test("Nova Task abre o modal de criação e Cancelar fecha", async ({ page }) => {
    await page.getByRole("button", { name: "Nova Task" }).first().click();
    await esperarElementoTexto(page, "Criar Nova Tarefa");
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByText("Criar Nova Tarefa")).toHaveCount(0);
  });

  test("comando rápido com texto → navega ao Secretário com a ordem", async ({ page }) => {
    await page.locator('input[placeholder="Digite uma instrução para o Secretário ou ! comando no terminal..."]').fill("preparar resumo e2e");
    await page.locator('input[placeholder="Digite uma instrução para o Secretário ou ! comando no terminal..."]').press("Enter");
    await page.waitForURL("**/secretario?ordem=*", { timeout: 10000 });
  });

  test("atalhos do sistema levam a Agenda e Fluxos", async ({ page }) => {
    await esperarElementoTexto(page, "Agenda 24h");
    await esperarElementoTexto(page, "Fluxos de Trabalho");
    await esperarElementoTexto(page, "Apps & Secrets");
    await esperarElementoTexto(page, "Segurança & Regras");
  });
});
