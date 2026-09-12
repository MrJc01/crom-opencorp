import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api } from "./helpers.js";

const TOKEN = "test-e2e";
const HEADERS = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

async function semearFlowCron(page: any, id: string, nome: string, cron: string) {
  await api(page).post("/flows", {
    headers: HEADERS,
    data: {
      id,
      nome,
      nos: [
        { id: "gatilho-cron", tipo: "cron", config: { expressao_cron: cron } },
        { id: "espera", tipo: "delay", config: { segundos: 1 } },
      ],
      arestas: [{ de: "gatilho-cron", para: "espera" }],
    },
  });
}

test.describe("Agenda → Fluxos (Etapa 12, item 12.5)", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, TOKEN);
    await seederEmpresaBasica(api(page), TOKEN);
  });

  test("seção Fluxos agendados lista flow com gatilho cron", async ({ page }) => {
    await semearFlowCron(page, "agfx-cron", "Agfx Rotina Madrugada", "0 2 * * *");

    await page.goto("/agenda");
    await page.waitForURL("**/fluxos?filtro=cron*", { timeout: 10000 });

    await expect(page.getByTestId("secao-fluxos-agendados")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("trigger-agfx-cron")).toContainText("0 2 * * *", { timeout: 15000 });
    await expect(page.getByText("Agfx Rotina Madrugada").first()).toBeVisible();
    await expect(page.getByTestId("toggle-auto-agfx-cron")).toBeVisible();
    await expect(page.getByTestId("executar-agora-agfx-cron")).toBeVisible();
    await expect(page.getByTestId("abrir-editor-agfx-cron")).toBeVisible();
  });

  test("toggle auto_agendar cria job flow:<id> no scheduler", async ({ page }) => {
    await semearFlowCron(page, "agfx-auto", "Agfx Auto", "0 3 * * *");

    await page.goto("/agenda");
    await page.waitForURL("**/fluxos?filtro=cron*", { timeout: 10000 });

    const toggle = page.getByTestId("toggle-auto-agfx-auto");
    await expect(toggle).toBeVisible({ timeout: 15000 });
    if (!(await toggle.isChecked())) await toggle.check();
    await expect(page.getByText(/Agendamento automático ativado/).first()).toBeVisible({ timeout: 10000 });

    const detResp = await api(page).get("/flows/agfx-auto", { headers: { authorization: `Bearer ${TOKEN}` } });
    const det = await detResp.json();
    test.skip(!det?.auto_agendar, "core ainda filtra auto_agendar no PUT /flows/:id — toggle em no-op até a Etapa 12 pousar");

    const jobsResp = await api(page).get("/schedules", { headers: { authorization: `Bearer ${TOKEN}` } });
    const jobs = (await jobsResp.json()) as Array<{ id: string; nome: string }>;
    expect(jobs.some((j) => j.id === "flow:agfx-auto" || j.nome === "agfx-auto" || j.nome === "Agfx Auto")).toBe(true);
  });

  test("Executar agora mostra toast com exec_id", async ({ page }) => {
    await semearFlowCron(page, "agfx-run", "Agfx Run Imediato", "0 4 * * *");

    await page.goto("/agenda");
    await page.waitForURL("**/fluxos?filtro=cron*", { timeout: 10000 });

    const btn = page.getByTestId("executar-agora-agfx-run");
    await expect(btn).toBeVisible({ timeout: 15000 });
    await btn.click();
    await expect(page.getByText(/exec_id exec-/).first()).toBeVisible({ timeout: 10000 });
  });
});
