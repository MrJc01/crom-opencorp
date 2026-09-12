import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarElementoTexto } from "./helpers.js";

const HDR = { authorization: "Bearer test-e2e", "content-type": "application/json" };

test.describe("Histórico", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/historico");
    await esperarElementoTexto(page, "Histórico de Atividades");
  });

  test("timeline mostra itens (task semeada gera badge TASK)", async ({ page }) => {
    await expect(page.getByText("TASK").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Task backlog e2e").first()).toBeVisible({ timeout: 15000 });
  });

  test("filtro Tasks mostra só tasks", async ({ page }) => {
    await page.getByRole("button", { name: "Tasks" }).click();
    await page.waitForTimeout(800);
    await expect(page.getByText("TASK").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("FLUXO", { exact: true })).toHaveCount(0);
    await expect(page.getByText("EXECUÇÃO", { exact: true })).toHaveCount(0);
  });

  test("filtro Fluxos lista execução de fluxo com nós", async ({ page }) => {
    await api(page).post("/flows", {
      headers: HDR,
      data: {
        id: "flow-hist-spec",
        nome: "Flow Hist Spec",
        nos: [
          { id: "inicio", tipo: "manual", config: {} },
          { id: "gravar", tipo: "registro", config: { categoria: "documentos" } },
        ],
        arestas: [{ de: "inicio", para: "gravar" }],
      },
    });
    const run = await api(page).post("/flows/flow-hist-spec/run", {
      headers: HDR,
      data: { entrada: "spec-historico" },
    });
    expect(run.status()).toBe(202);
    const { exec_id: execId } = await run.json();

    await page.getByRole("button", { name: "Fluxos" }).click();
    await expect(page.getByText("FLUXO").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(execId).first()).toBeVisible({ timeout: 15000 });
  });
});
