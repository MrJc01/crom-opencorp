import { test, expect } from "@playwright/test";
import { logado, seederEmpresaBasica, api, esperarNavegacao } from "./helpers.js";
import { rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const WS_ID = "wizard-test-e2e";
const E2E_HOME = "/tmp/opencorp-e2e";

function limparWsTeste(): void {
  rmSync(`${E2E_HOME}/workspaces/${WS_ID}`, { recursive: true, force: true });
  const wjPath = `${E2E_HOME}/workspaces.json`;
  if (existsSync(wjPath)) {
    const wj = JSON.parse(readFileSync(wjPath, "utf8"));
    wj.workspaces = (wj.workspaces ?? []).filter((w: { id: string }) => w.id !== WS_ID);
    if (wj.ativo === WS_ID) wj.ativo = "e2e-corp";
    writeFileSync(wjPath, JSON.stringify(wj, null, 2));
  }
}

test.describe("Wizard de criação de empresa", () => {
  test.beforeEach(async ({ page }) => {
    limparWsTeste();
    logado(page, "test-e2e");
    await seederEmpresaBasica(api(page), "test-e2e");
    await page.goto("/");
    await esperarNavegacao(page, "home");
  });

  test("cria empresa completa com perfil editorial → projeto.json gravado", async ({ page }) => {
    await page.click('button:has-text("Criar empresa")');
    await expect(page.locator(".wizard-box")).toBeVisible();

    // passo 1: identidade — slug automático do nome
    await page.fill("#wiz-nome", "Wizard Test E2E");
    await expect(page.locator("#wiz-id")).toHaveValue(WS_ID);
    await page.fill("#wiz-nicho", "consultoria fictícia para testes");
    await page.fill("#wiz-publico", "robôs de CI");
    await page.click('.wiz-chips .chip:has-text("direto")');
    await page.click('.wiz-chips .chip:has-text("clickbait")');
    await page.click('button:has-text("Continuar")');

    // passo 2: tipo
    await page.click('.wiz-tipo:has-text("Prestador de serviços")');
    await expect(page.locator(".wiz-tipo.ativo")).toContainText("Prestador");
    await page.click('button:has-text("Continuar")');

    // passo 3: template + tópicos sugeridos pelo tipo
    await expect(page.locator("#wiz-topicos")).toContainText("serviços e escopos");
    await page.click('button:has-text("Revisar")');

    // passo 4: revisão mostra tudo
    await expect(page.locator(".wiz-revisao")).toContainText("Wizard Test E2E");
    await expect(page.locator(".wiz-revisao")).toContainText(WS_ID);

    // voltar preserva e avançar de novo
    await page.click('button:has-text("Voltar")');
    await expect(page.locator("#wiz-topicos")).toContainText("serviços e escopos");
    await page.click('button:has-text("Revisar")');

    // cria
    const postWs = page.waitForResponse(
      (r) => r.url().includes("/workspaces") && r.request().method() === "POST",
      { timeout: 30000 },
    );
    await page.click("#wiz-criar");
    const respCriacao = await postWs;
    expect(respCriacao.status()).toBe(201);

    // ws ativo trocado (poll — o copy do template pode levar alguns segundos)
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("oc-ws")), { timeout: 20000 })
      .toBe(WS_ID);
    await expect(page).toHaveURL(/#\/tasks/);

    // projeto.json via API /files
    const resp = await page.request.get(`/files?path=.opencorp/projeto.json&workspace=${WS_ID}`, {
      headers: { authorization: "Bearer test-e2e" },
    });
    expect(resp.status()).toBe(200);
    const arquivo = await resp.json();
    const projeto = JSON.parse(arquivo.conteudo);
    expect(projeto.empresa).toBe("Wizard Test E2E");
    expect(projeto.nicho).toContain("fictícia");
    expect(projeto.tom_evitar).toEqual(["clickbait"]);
    expect(projeto.topicos_editoriais).toContain("serviços e escopos");

    // id inválido é bloqueado no passo 1
  });

  test("id inválido ( espaços/maiúsculas ) bloqueia avanço", async ({ page }) => {
    await page.click('button:has-text("Criar empresa")');
    await page.fill("#wiz-nome", "Empresa X");
    await page.fill("#wiz-id", "Empresa X!");
    await page.click('button:has-text("Continuar")');
    // continua no passo 1 (toast de erro + passo não muda)
    await expect(page.locator("#wiz-nome")).toBeVisible();
    await expect(page.locator("#wiz-erro-id")).toBeVisible();
  });

  test.afterAll(() => {
    limparWsTeste();
  });
});
