import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao } from "./helpers.js";

test.describe("Config / Settings", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("abre com 8 abas (6 settings + Secrets + Ferramentas)", async ({ page }) => {
    await page.goto("/#/config");
    await esperarNavegacao(page, "config");
    for (const aba of ["Modelos", "Orçamento", "Segurança", "Workspace", "Testes", "Scheduler", "Secrets", "Ferramentas"]) {
      await expect(page.locator(`.config-aba:has-text("${aba}")`)).toBeVisible();
    }
  });

  test("get/set budget.daily_usd via UI reflete no GET /settings", async ({ page }) => {
    await page.goto("/#/config");
    await esperarNavegacao(page, "config");

    await page.click('[data-aba="orcamento"]');
    const input = page.locator("#cfg-budget-daily_usd");
    await expect(input).toBeVisible();

    const valorNovo = "9.25";
    await input.fill(valorNovo);
    await page.locator(".cfg-campo:has(#cfg-budget-daily_usd) button:has-text('Salvar')").click();

    // badge de origem muda para global e toast aparece
    await expect(page.locator(".cfg-campo:has(#cfg-budget-daily_usd) .badge")).toHaveText(/global|workspace/, { timeout: 10000 });

    // verifica via API
    const resp = await page.request.get("/settings", { headers: { authorization: "Bearer test-e2e" } });
    const settings = await resp.json();
    const budget = settings.find((s: { chave: string }) => s.chave === "budget.daily_usd");
    expect(budget.valor).toBe(9.25);
  });

  test("campo bool salva na interação (toggle budget.pause_on_exceed)", async ({ page }) => {
    await page.goto("/#/config");
    await esperarNavegacao(page, "config");
    await page.click('[data-aba="orcamento"]');

    const input = page.locator("#cfg-budget-pause_on_exceed");
    const slider = page.locator(".toggle:has(#cfg-budget-pause_on_exceed) .toggle-slider");
    await expect(slider).toBeVisible();
    const antes = await input.isChecked();
    await slider.click();
    await page.waitForTimeout(800);

    const resp = await page.request.get("/settings", { headers: { authorization: "Bearer test-e2e" } });
    const settings = await resp.json();
    const valor = settings.find((s: { chave: string }) => s.chave === "budget.pause_on_exceed").valor;
    expect(valor).toBe(!antes);
    await slider.click(); // restaura
  });

  // P-27 — Etapa 8: o toggle Global ⇄ Workspace precisa INJETAR o escopo na request
  // (?escopo=) — sem isso o api() injeta ?workspace=<ativo> e o server devolve
  // sempre a lista mesclada, ignorando o toggle.
  test("toggle de escopo muda ?escopo= na request e a lista/badges (P-27)", async ({ page }) => {
    const hdr = { authorization: "Bearer test-e2e", "content-type": "application/json" };
    // valores DIFERENTES por escopo: global e workspace
    await page.request.put("/settings", { headers: hdr, data: { chave: "default_model", valor: "modelo-global-e2e", scope: "global" } });
    await page.request.put("/settings?workspace=e2e-corp", { headers: hdr, data: { chave: "default_model", valor: "modelo-ws-e2e", scope: "workspace" } });

    // intercepta GET /settings e registra o parâmetro escopo enviado pelo painel
    const escopos: string[] = [];
    await page.route("**/settings*", (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        escopos.push(new URL(req.url()).searchParams.get("escopo") ?? "(sem)");
      }
      void route.continue();
    });

    await page.goto("/#/config");
    await esperarNavegacao(page, "config");

    // escopo global (default): valor GLOBAL, badge 'global', request com escopo=global
    const campo = page.locator(".cfg-campo:has(#cfg-default_model)");
    await expect(campo.locator("input#cfg-default_model")).toHaveValue("modelo-global-e2e", { timeout: 10000 });
    await expect(campo.locator(".badge")).toHaveText("global");
    expect(escopos).toContain("global");

    // alterna para Workspace: valor do workspace, badge 'workspace', request escopo=workspace
    await page.click("#cfg-escopo-workspace");
    await expect(campo.locator("input#cfg-default_model")).toHaveValue("modelo-ws-e2e", { timeout: 10000 });
    await expect(campo.locator(".badge")).toHaveText("workspace");
    expect(escopos).toContain("workspace");

    // restaura valores originais (evita poluição de estado para specs seguintes)
    await page.request.put("/settings", { headers: hdr, data: { chave: "default_model", valor: "", scope: "global" } });
    await page.request.put("/settings?workspace=e2e-corp", { headers: hdr, data: { chave: "default_model", valor: "", scope: "workspace" } });
  });
});
