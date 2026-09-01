import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao } from "./helpers.js";

const TOKEN = "test-e2e";
const AUTH = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
const ALVO = "ag-e2e-toggle";

/** Garante que o agente de teste existe e está no estado pedido (determinístico). */
async function prepararAgente(page: import("@playwright/test").Page, ativo: boolean): Promise<void> {
  const put = await page.request.put(`/agents/${ALVO}`, { headers: AUTH, data: JSON.stringify({ ativo }) });
  if (put.status() === 422) {
    const criado = await page.request.post("/agents", { headers: AUTH, data: { id: ALVO } });
    if (criado.status() >= 400 && criado.status() !== 409) throw new Error(`seed agente falhou: ${criado.status()}`);
    await page.request.put(`/agents/${ALVO}`, { headers: AUTH, data: JSON.stringify({ ativo }) });
  }
}

test.describe("Agentes — catálogo e toggle (Etapa 5)", () => {
  test.beforeEach(async ({ page }) => {
    logado(page, TOKEN);
    await seederEmpresaBasica(api(page), TOKEN);
    // catálogo presente (idempotente — ignora estado anterior da suíte)
    const semear = await page.request.post("/agents/semear-catalogo", { headers: AUTH });
    if (semear.status() !== 200) throw new Error(`semear falhou: ${semear.status()}`);
  });

  test.afterEach(async ({ page }) => {
    // agente-fixture não vaza ativo para os specs seguintes (@ palette lista só ativos)
    await page.request.put(`/agents/${ALVO}`, { headers: AUTH, data: JSON.stringify({ ativo: false }) }).catch(() => undefined);
  });

  test("Semear catálogo cria cards na seção 'Catálogo (desativados)'", async ({ page }) => {
    await esperarNavegacao(page, "agentes");
    await page.click("#btn-semear-catalogo");

    const secao = page.locator("#agentes-catalogo");
    await expect(secao.locator('[data-agente-card="agente-vendas"]')).toBeVisible({ timeout: 10000 });
    await expect(secao.locator('[data-agente-card="agente-ops"]')).toBeVisible();
    await expect(secao.locator('[data-agente-card="agente-vendas"] .badge')).toHaveText("desativado");
    await expect(page.locator("#toast-container")).toContainText("Catálogo semeado");
  });

  test("toggle desativa → card vai para Catálogo e persiste após recarregar", async ({ page }) => {
    await prepararAgente(page, true);
    await esperarNavegacao(page, "agentes");

    await page.locator(`[data-agente-card="${ALVO}"] .toggle-slider`).click();
    const card = page.locator(`#agentes-catalogo [data-agente-card="${ALVO}"]`);
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.locator(".badge")).toHaveText("desativado");
    await expect(page.locator("#toast-container")).toContainText(`"${ALVO}" desativado`);

    // persistência: recarrega e continua desativado
    await page.reload();
    await esperarNavegacao(page, "agentes");
    await expect(page.locator(`#agentes-catalogo [data-agente-card="${ALVO}"]`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`#agentes-ativos [data-agente-card="${ALVO}"]`)).toHaveCount(0);
  });

  test("toggle reativa → card volta para 'Ativos'", async ({ page }) => {
    await prepararAgente(page, false);
    await esperarNavegacao(page, "agentes");

    await expect(page.locator(`#agentes-catalogo [data-agente-card="${ALVO}"]`)).toBeVisible({ timeout: 10000 });
    await page.locator(`[data-agente-card="${ALVO}"] .toggle-slider`).click();

    await expect(page.locator(`#agentes-ativos [data-agente-card="${ALVO}"]`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`#agentes-catalogo [data-agente-card="${ALVO}"]`)).toHaveCount(0);
    await expect(page.locator("#toast-container")).toContainText(`"${ALVO}" ativado`);
  });

  test("Chamar agente desativado mostra toast de erro (409)", async ({ page }) => {
    await page.request.put("/agents/agente-vendas", { headers: AUTH, data: JSON.stringify({ ativo: false }) });
    await esperarNavegacao(page, "agentes");

    await page.locator('#agentes-catalogo [data-agente-card="agente-vendas"] button:has-text("Chamar")').click();
    await page.fill("#modal-campo", "ordem que não deve rodar");
    await page.locator(".modal-ok").click();

    await expect(page.locator("#toast-container")).toContainText("está desativado", { timeout: 10000 });
  });
});
