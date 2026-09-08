import { test, expect } from "@playwright/test";
import { logado } from "./helpers.js";
import * as path from "path";

test.describe("Configuração Mobile Viewport (375x812)", () => {
  test.use({
    viewport: { width: 375, height: 812 },
  });

  const artifactDir = "/home/j/.gemini/antigravity-ide/brain/d0408a2c-5c46-4d52-ba5b-ec0f097a39a5";

  test("tab limites deve ser totalmente responsiva sem overflow horizontal", async ({ page }) => {
    logado(page, "test-e2e");
    await page.goto("/config?tab=limites", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const metrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));

    console.log("Métricas tab limites:", JSON.stringify(metrics));
    expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
    expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);

    await page.screenshot({ path: path.join(artifactDir, "mobile_limites_fixed_top.png") });

    await page.evaluate((y) => {
      const allScrollable = Array.from(document.querySelectorAll('*')).filter((el) => {
        const style = window.getComputedStyle(el);
        return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
      });
      for (const el of allScrollable) {
        el.scrollTop += y;
      }
    }, 450);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(artifactDir, "mobile_limites_fixed_card.png") });

    await page.evaluate((y) => {
      const allScrollable = Array.from(document.querySelectorAll('*')).filter((el) => {
        const style = window.getComputedStyle(el);
        return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
      });
      for (const el of allScrollable) {
        el.scrollTop += y;
      }
    }, 450);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(artifactDir, "mobile_limites_fixed_inputs.png") });
  });

  test("tab motores deve ser totalmente responsiva sem overflow horizontal", async ({ page }) => {
    logado(page, "test-e2e");
    await page.goto("/config?tab=motores", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const metrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));

    console.log("Métricas tab motores:", JSON.stringify(metrics));
    expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
    expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);

    await page.screenshot({ path: path.join(artifactDir, "mobile_motores_fixed_top.png") });

    await page.evaluate((y) => {
      const allScrollable = Array.from(document.querySelectorAll('*')).filter((el) => {
        const style = window.getComputedStyle(el);
        return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
      });
      for (const el of allScrollable) {
        el.scrollTop += y;
      }
    }, 450);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(artifactDir, "mobile_motores_fixed_detail.png") });
  });
});
