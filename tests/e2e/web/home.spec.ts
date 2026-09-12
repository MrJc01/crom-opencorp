import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarElementoTexto } from "../helpers.js";
import { ConsoleWatcher } from "./pom/base.js";
import { Shell } from "./pom/shell.js";

test.describe("Web Home: tabs, modal task, comando, aprovações", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarElementoTexto(page, "Painel de Operações");
  });

  test("as 7 abas trocam o conteúdo (?aba=)", async ({ page }) => {
    const watcher = new ConsoleWatcher(page);
    watcher.start();
    const abas: Array<[string, string]> = [
      ["Visão Geral", "Feed de Execuções Recentes"],
      ["Ao Vivo", "Últimas Execuções de Background"],
      ["Secretário", "Sessões & Chats com o Secretário"],
      ["Tasks", "Tarefas em Andamento"],
      ["Falhas", "Falhas Recentes"],
      ["Agendamentos", "Linha do Tempo de Agendamentos"],
      ["Fluxos", "Fluxos & Automações"],
    ];
    for (const [aba, prova] of abas) {
      await page.getByRole("button", { name: new RegExp(`^${aba}`) }).click();
      await esperarElementoTexto(page, prova);
    }
    watcher.stop();
    expect(watcher.limpos()).toEqual([]);
  });

  test("modal Nova Task: abre, valida, cria e fecha", async ({ page }) => {
    const titulo = `Web nova task ${Date.now()}`;
    await page.getByRole("button", { name: "Nova Task" }).first().click();
    await esperarElementoTexto(page, "Criar Nova Tarefa");
    // sem título não cria
    await page.getByRole("button", { name: "Criar Tarefa" }).click();
    await expect(page.getByText("Criar Nova Tarefa")).toBeVisible();
    await page.locator('input[placeholder="Ex: Auditoria editorial dos últimos artigos"]').fill(titulo);
    await page.getByRole("button", { name: "Criar Tarefa" }).click();
    await expect(page.getByText("Criar Nova Tarefa")).toHaveCount(0, { timeout: 10000 });
    // Confere no kanban com busca (a seção da home mostra só as 6 primeiras)
    await page.goto("/tasks");
    await page.locator('input[placeholder="Buscar tarefas..."]').fill(titulo);
    await expect(page.getByText(titulo).first()).toBeVisible({ timeout: 10000 });
  });

  test("comando ! mostra saída; texto navega ao secretário", async ({ page }) => {
    const input = page.locator('input[placeholder="Digite uma instrução para o Secretário ou ! comando no terminal..."]');
    await input.fill("!task list");
    await input.press("Enter");
    await expect(page.getByText("Task backlog e2e").first()).toBeVisible({ timeout: 25000 });

    await input.fill("resumo web e2e");
    await input.press("Enter");
    await page.waitForURL("**/secretario?ordem=*", { timeout: 10000 });
  });

  test("shell: trocar workspace pelo topbar atualiza tudo", async ({ page }) => {
    const shell = new Shell(page);
    await shell.trocarWorkspace("outro-ws");
    await expect(page.locator("#select-workspace-topbar")).toHaveValue("outro-ws");
    await shell.trocarWorkspace("e2e-corp");
  });

  test("hover do badge stream abre card sem erros", async ({ page }) => {
    const watcher = new ConsoleWatcher(page);
    watcher.start();
    const shell = new Shell(page);
    await shell.abrirHoverVivo();
    await page.mouse.move(640, 10);
    await page.waitForTimeout(600);
    watcher.stop();
    expect(watcher.limpos()).toEqual([]);
  });
});
