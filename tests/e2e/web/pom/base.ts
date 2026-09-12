import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Base para os Page Objects de tests/e2e/web.
 * Regras (Playwright best practices 2026): sem asserts aqui (só waits de
 * sincronização), locators user-facing (role/label/placeholder/text),
 * sem CSS estrutural, sem estado compartilhado entre testes.
 */
export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(path: string): Promise<void> {
    await this.page.goto(path);
    await this.page.waitForLoadState("domcontentloaded");
  }

  async heading(nome: string | RegExp): Promise<Locator> {
    const h = this.page.getByRole("heading", { name: nome }).first();
    await expect(h).toBeVisible({ timeout: 15000 });
    return h;
  }
}

/** Erros de console/página coletados durante o teste (popups "bugados" = exceção JS). */
export class ConsoleWatcher {
  private erros: string[] = [];
  private stopFns: Array<() => void> = [];

  constructor(private page: Page) {}

  start(): void {
    const onConsole = (m: import("@playwright/test").ConsoleMessage) => {
      if (m.type() === "error") this.erros.push(m.text().slice(0, 300));
    };
    const onPageError = (e: Error) => {
      this.erros.push(`pageerror: ${String(e && (e as Error).message || e).slice(0, 300)}`);
    };
    this.page.on("console", onConsole);
    this.page.on("pageerror", onPageError);
    this.stopFns.push(() => {
      this.page.off("console", onConsole);
      this.page.off("pageerror", onPageError);
    });
  }

  stop(): void {
    this.stopFns.forEach((fn) => fn());
    this.stopFns = [];
  }

  /** Filtra ruídos conhecidos (favicon, extensões) — resto é bug real. */
  limpos(ignorar: RegExp[] = [/favicon|net::|Failed to load resource/i]): string[] {
    return this.erros.filter((e) => !ignorar.some((r) => r.test(e)));
  }
}
