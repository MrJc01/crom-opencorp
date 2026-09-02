import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao } from "./helpers.js";

test.describe("Config / Settings", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("abre com 10 abas (6 settings + Secrets + Ferramentas + Opencode + Chaves · opencode)", async ({ page }) => {
    await page.goto("/#/config");
    await esperarNavegacao(page, "config");
    for (const aba of ["Modelos", "Orçamento", "Segurança", "Workspace", "Testes", "Scheduler", "Secrets", "Ferramentas", "Opencode", "Chaves · opencode"]) {
      await expect(page.getByRole("tab", { name: aba, exact: true })).toBeVisible();
    }
  });

  test("aba Chaves de API: escopo workspace (configurado) com herança do global", async ({ page }) => {
    await page.route((url) => url.pathname.endsWith("/provider-keys"), async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
          global: { existe: true, chaves: [{ provider: "opencode-go", tipo: "api", preview: "sk-0Nwo…bNgw" }], path: "~/.opencorp/opencode-data/opencode/auth.json" },
          workspace: { id: "e2e-corp", existe: true, chaves: [{ provider: "openrouter", tipo: "api", preview: "sk-or-v…Xyz9" }], herdadas: [{ provider: "opencode-go", tipo: "api", preview: "sk-0Nwo…bNgw" }] },
        }) });
        return;
      }
      if (route.request().method() === "PUT") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, provider: "openrouter", escopo: "workspace", preview: "sk-or-v…Xyz9" }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, escopo: "workspace" }) });
    });
    await page.goto("/#/config");
    await esperarNavegacao(page, "config");
    // usa o seletor de escopo SUPERIOR da view (Global × Workspace) — a aba obedece a ele
    await page.click("#cfg-escopo-workspace");
    await page.click('.config-aba:has-text("Chaves · opencode")');
    // workspace configurado → abre no escopo workspace
    await expect(page.locator(".approval-row", { hasText: "openrouter" })).toBeVisible();
    await expect(page.locator(".approval-row", { hasText: "openrouter" })).toContainText("sk-or-v…Xyz9");
    await expect(page.locator(".approval-row", { hasText: "opencode-go" })).toContainText("herdada"); // herdado do global
    await expect(page.locator(".approval-row").first()).not.toContainText("sk-0Nwoztb6Z0MUAOqxfYf66ADvaZR3uN1KIMwlxq0NkezTef8KdvF4gHQme8XRbNgw");
    // salvar nova chave no escopo workspace
    await page.fill("#cfg-chave-provider", "openrouter");
    await page.fill("#cfg-chave-valor", "sk-or-v1-test-1234567890");
    await page.click('button:has-text("Salvar chave no workspace")');
    await expect(page.locator("#cfg-chave-provider")).toBeVisible();
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

  // Aba Opencode — interceptamos GET/PUT /opencode-config para o teste ser
  // determinístico (não depende de ~/.opencorp/opencode-home existir na máquina).
  test("aba Opencode: carrega JSON do GET e salva via PUT (toast ok)", async ({ page }) => {
    const configFake = { $schema: "https://opencode.ai/config.json", model: "opencode/e2e-model" };
    const caminhoFake = "/fake/opencode-home/opencode.json";
    const puts: unknown[] = [];
    await page.route((url) => url.pathname.endsWith("/opencode-config"), async (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ config: configFake, path: caminhoFake }) });
        return;
      }
      puts.push(req.postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, path: caminhoFake }) });
    });

    await page.goto("/#/config");
    await esperarNavegacao(page, "config");
    await page.click('[data-aba="opencode"]');

    const ta = page.locator("#cfg-opencode-json");
    await expect(ta).toContainText('"model": "opencode/e2e-model"');
    // caminho do arquivo exibido + aviso de reinício
    await expect(page.locator(".card:has(#cfg-opencode-json)")).toContainText(caminhoFake);
    await expect(page.locator(".card:has(#cfg-opencode-json)")).toContainText("alterações valem após reiniciar o secretário");

    await ta.fill('{ "model": "opencode/e2e-novo" }');
    await page.locator(".card:has(#cfg-opencode-json) button:has-text('Salvar')").click();
    await expect(page.locator("#toast-container")).toContainText("Config do opencode salva", { timeout: 10000 });
    expect(puts).toHaveLength(1);
    expect((puts[0] as { config?: unknown }).config).toEqual({ model: "opencode/e2e-novo" });
  });

  test("aba Opencode: JSON inválido não dispara PUT", async ({ page }) => {
    const puts: unknown[] = [];
    await page.route((url) => url.pathname.endsWith("/opencode-config"), async (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ config: { model: "m" }, path: "/fake/opencode.json" }) });
        return;
      }
      puts.push(req.postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto("/#/config");
    await esperarNavegacao(page, "config");
    await page.click('[data-aba="opencode"]');
    const ta = page.locator("#cfg-opencode-json");
    await expect(ta).toBeVisible();

    await ta.fill("{ isto não é json");
    await page.locator(".card:has(#cfg-opencode-json) button:has-text('Salvar')").click();
    await expect(page.locator("#toast-container")).toContainText("JSON inválido", { timeout: 10000 });
    expect(puts).toHaveLength(0);
  });
});
