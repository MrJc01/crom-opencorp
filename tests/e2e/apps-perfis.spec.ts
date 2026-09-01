import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao } from "./helpers.js";

const TOKEN = "test-e2e";
const NOMES_CRIADOS = ["app:vps:e2e-vps", "app:custom:e2e-custom", "app:vps:e2e-api"];

async function abrirAbaPerfis(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await esperarNavegacao(page, "home");
  await page.goto("/#/apps");
  await esperarNavegacao(page, "apps");
  await page.click('.ui-tab:has-text("Configurar apps")');
  await expect(page.locator("#app-perfil-novo")).toBeVisible();
}

test.describe("Apps — Configurar apps (perfis de secrets)", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, TOKEN);
    await seederEmpresaBasica(api(page), TOKEN);
  });

  test.afterEach(async ({ page }) => {
    for (const nome of NOMES_CRIADOS) {
      await page.request.delete("/secrets/" + encodeURIComponent(nome), {
        headers: { authorization: `Bearer ${TOKEN}` },
      });
    }
  });

  test("criar perfil VPS pela UI → aparece na lista com badge do tipo", async ({ page }) => {
    await abrirAbaPerfis(page);
    await page.click("#app-perfil-novo");
    await page.fill("#app-perfil-id", "e2e-vps");
    await page.fill("#app-perfil-campo-rotulo", "VPS de produção e2e");
    await page.fill("#app-perfil-campo-host", "203.0.113.55");
    await page.fill("#app-perfil-campo-usuario", "deploy");
    await page.click("#app-perfil-salvar");

    const linha = page.locator('.secret-row[data-perfil="app:vps:e2e-vps"]');
    await expect(linha).toBeVisible({ timeout: 10000 });
    await expect(linha.locator(".badge-pipeline")).toHaveText("vps");
    await expect(linha.locator(".badge-ok")).toHaveText("definido");
  });

  test("form do cartão exibe o banner de atenção permanente", async ({ page }) => {
    await abrirAbaPerfis(page);
    await page.click("#app-perfil-novo");
    await page.selectOption("#app-perfil-tipo", "cartao");
    const banner = page.locator("#app-perfil-banner-cartao");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("NÃO testado corretamente ainda");
    await expect(banner).toContainText("nunca número completo nem CVV");
  });

  test("criar perfil custom e excluir com modal → some da lista", async ({ page }) => {
    await abrirAbaPerfis(page);
    await page.click("#app-perfil-novo");
    await page.selectOption("#app-perfil-tipo", "custom");
    await page.fill("#app-perfil-id", "e2e-custom");
    await page.fill("#app-perfil-campo-rotulo", "Info livre e2e");
    await page.fill("#app-perfil-campo-conteudo", "conteudo-custom-e2e");
    await page.click("#app-perfil-salvar");
    await expect(page.locator('.secret-row[data-perfil="app:custom:e2e-custom"]')).toBeVisible({ timeout: 10000 });

    await page.click('button[aria-label="Excluir app:custom:e2e-custom"]');
    await expect(page.locator(".modal-ok")).toBeVisible();
    await page.locator(".modal-ok").click();
    await expect(page.locator('.secret-row[data-perfil="app:custom:e2e-custom"]')).toBeHidden({ timeout: 10000 });
  });

  test("via API: GET /secrets lista nome/tipo_app mas NUNCA o valor", async ({ page }) => {
    const valor = JSON.stringify({
      rotulo: "Perfil API e2e",
      host: "198.51.100.7",
      usuario: "root",
      senha: "senha-super-secreta-e2e-xyz",
    });
    const put = await page.request.put("/secrets/app%3Avps%3Ae2e-api", {
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      data: JSON.stringify({ valor }),
    });
    expect(put.status()).toBe(200);

    const resp = await page.request.get("/secrets", { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(resp.status()).toBe(200);
    const corpo = await resp.text();
    const lista = JSON.parse(corpo) as Array<{ nome: string; tipo_app: string | null }>;
    const entrada = lista.find((s) => s.nome === "app:vps:e2e-api");
    expect(entrada).toBeDefined();
    expect(entrada!.tipo_app).toBe("vps");
    expect(corpo).not.toContain("senha-super-secreta-e2e-xyz");
    expect(corpo).not.toContain("198.51.100.7");
  });
});
