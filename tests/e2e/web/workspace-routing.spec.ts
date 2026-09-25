import { expect, test } from "@playwright/test";
import { api, logado, seederEmpresaBasica } from "../helpers.js";

const TOKEN = "test-e2e";
const WORKSPACE = "e2e-corp";

test.describe("Roteamento canônico por workspace", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, TOKEN, WORKSPACE);
    await seederEmpresaBasica(api(page), TOKEN, WORKSPACE);
  });

  test("aceita deep links diretos em todos os módulos scoped", async ({ page }) => {
    const modulos = [
      "",
      "workspace",
      "tasks",
      "secretario",
      "agentes",
      "fluxos",
      "reunioes",
      "historico",
      "apps",
      "ativos",
      "notificacoes",
      "config",
    ];

    for (const modulo of modulos) {
      const path = `/w/${WORKSPACE}${modulo ? `/${modulo}` : ""}`;
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}/?$`));
      await expect(page.locator("main").first()).toBeVisible();
    }
  });

  test("rotas legadas preservam queries e aplicam defaults sem sobrescrever", async ({ page }) => {
    await page.goto("/tasks?task=tsk-123&filtro=aberto&filtro=urgente");
    await expect(page).toHaveURL(new RegExp(`/w/${WORKSPACE}/tasks\\?`));

    let url = new URL(page.url());
    expect(url.searchParams.get("task")).toBe("tsk-123");
    expect(url.searchParams.getAll("filtro")).toEqual(["aberto", "urgente"]);

    await page.goto("/agenda?origem=legado");
    await expect(page).toHaveURL(new RegExp(`/w/${WORKSPACE}/fluxos\\?`));
    url = new URL(page.url());
    expect(url.searchParams.get("origem")).toBe("legado");
    expect(url.searchParams.get("filtro")).toBe("cron");
  });

  test("trata workspace inválido, inexistente e raiz sem seleção", async ({ page, browser }) => {
    await page.goto("/w/ID_INVALIDO/tasks");
    await expect(page).toHaveURL(/\/workspaces$/);

    await page.goto("/w/workspace-inexistente/tasks");
    await expect(page.getByText("Workspace não encontrado", { exact: true })).toBeVisible();

    const contextoSemWorkspace = await browser.newContext();
    const paginaSemWorkspace = await contextoSemWorkspace.newPage();
    await paginaSemWorkspace.addInitScript((token) => {
      localStorage.setItem("oc-token", token);
    }, TOKEN);
    await paginaSemWorkspace.goto("/");
    await expect(paginaSemWorkspace).toHaveURL(/\/workspaces$/);
    await contextoSemWorkspace.close();
  });
});
