import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "./base.js";

/** Shell global: Sidebar + Topbar + troca de workspace (presente em todas as páginas). */
export class Shell extends BasePage {
  readonly sidebar: Locator;
  readonly topbarWorkspace: Locator;
  readonly badgeStream: Locator;
  readonly btnNotificacoes: Locator;

  constructor(page: Page) {
    super(page);
    this.sidebar = page.locator("#sidebar-principal");
    this.topbarWorkspace = page.locator("#select-workspace-topbar");
    this.badgeStream = page.getByRole("link", { name: /stream|offline/ }).first();
    this.btnNotificacoes = page.locator('[data-view="notificacoes"]');
  }

  async navegar(label: string | RegExp): Promise<void> {
    await this.page.getByRole("link", { name: label }).first().click();
  }

  async trocarWorkspace(wsId: string): Promise<void> {
    await this.topbarWorkspace.selectOption(wsId);
    await expect.poll(async () => this.page.evaluate(() => localStorage.getItem("oc-ws")), { timeout: 10000 }).toBe(wsId);
  }

  async abrirHoverVivo(): Promise<void> {
    await expect(this.badgeStream).toBeVisible({ timeout: 15000 });
    await this.badgeStream.hover();
    await expect(this.page.getByText("Execução em Tempo Real")).toBeVisible({ timeout: 10000 });
  }
}
