import { test, expect } from "@playwright/test";
import { logado } from "./helpers.js";

test.describe("Mobile Sidebar & Workspace Switcher (375x667)", () => {
  test.use({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
  });


  test("menu lateral mobile abre expandido mesmo se desktop estiver colapsado, e permite trocar de workspace", async ({ page }) => {
    // Simula que o usuário colapsou a sidebar no desktop, usando workspace existente
    page.addInitScript(() => {
      window.localStorage.setItem("oc-token", "test-e2e");
      window.localStorage.setItem("oc-ws", "e2e-corp");
      window.localStorage.setItem("oc-sidebar-colapsada", "1");
    });

    await page.goto("/home", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // 1. Topbar deve conter o botão de abrir menu e o seletor rápido de workspace
    const btnMenu = page.locator("header button[title='Abrir navegação']");
    await expect(btnMenu).toBeVisible();

    const topbarWsSelect = page.locator("#select-workspace-topbar");
    await expect(topbarWsSelect).toBeVisible();

    // 2. Antes de abrir, a drawer móvel deve estar oculta (hidden md:flex)
    const sidebarAside = page.locator("#sidebar-principal");
    await expect(sidebarAside).toBeHidden();

    // 3. Clica no botão burger para abrir a gaveta mobile
    await btnMenu.click();
    await page.waitForTimeout(400);

    // 4. A gaveta móvel agora deve estar visível
    await expect(sidebarAside).toBeVisible();

    // Verifica que o seletor de workspace dentro da sidebar NÃO caiu no fallback de ícone estático
    const sidebarWsSelect = page.locator("#select-workspace-sidebar");
    await expect(sidebarWsSelect).toBeVisible();

    // Verifica que os textos dos itens de navegação estão visíveis (não estão colapsados)
    const textoSecretario = page.locator("#sidebar-principal a[data-view='secretario'] span").first();
    await expect(textoSecretario).toBeVisible();
    await expect(textoSecretario).toHaveText("Secretário");

    const textoTarefas = page.locator("#sidebar-principal a[data-view='tasks'] span").first();
    await expect(textoTarefas).toBeVisible();
    await expect(textoTarefas).toHaveText("Tasks");

    await page.screenshot({ path: "test-results/mobile-drawer-expanded.png" });

    // 5. Troca de workspace pelo dropdown da sidebar móvel
    const options = await sidebarWsSelect.locator("option").allTextContents();
    console.log("Opções de workspace disponíveis na sidebar:", options);

    // Seleciona uma opção diferente
    const optionValues = await sidebarWsSelect.locator("option").evaluateAll((opts) => opts.map(o => (o as HTMLOptionElement).value));
    const targetWs = optionValues.find(v => v && v !== "e2e-corp") || optionValues[0];
    await sidebarWsSelect.selectOption(targetWs);
    await page.waitForTimeout(600);

    // Ao selecionar, a drawer deve fechar automaticamente no mobile
    await expect(sidebarAside).toBeHidden();

    // 6. Teste de troca rápida de workspace diretamente pelo Topbar mobile
    await expect(topbarWsSelect).toBeVisible();
    await topbarWsSelect.selectOption("e2e-corp");
    await page.waitForTimeout(600);

    await page.screenshot({ path: "test-results/mobile-topbar-switched.png" });
  });

  test("quando não há workspace ativo no mobile, GlobalTitlebar permite abrir gaveta e selecionar workspace", async ({ page }) => {
    // Sem workspace ativo
    page.addInitScript(() => {
      window.localStorage.setItem("oc-token", "test-e2e");
      window.localStorage.removeItem("oc-ws");
      window.localStorage.setItem("oc-sidebar-colapsada", "1");
    });

    await page.goto("/home", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Auto-seleção pode já ter ativado a primeira empresa (Topbar) ou ainda
    // estar na GlobalTitlebar — ambos os estados são válidos no mobile
    const globalSelect = page.locator("#select-workspace-global");
    const topbarSelect = page.locator("#select-workspace-topbar");
    await expect(globalSelect.or(topbarSelect).first()).toBeVisible({ timeout: 10000 });

    // Burger abre a gaveta em qualquer um dos headers
    const burger = page.locator("header button[title='Abrir navegação']").first();
    await expect(burger).toBeVisible();
    await burger.click();
    await page.waitForTimeout(400);

    const sidebarAside = page.locator("#sidebar-principal");
    await expect(sidebarAside).toBeVisible();

    // Seletor da sidebar deve estar acessível
    const sidebarWsSelect = page.locator("#select-workspace-sidebar");
    await expect(sidebarWsSelect).toBeVisible();
  });
});
