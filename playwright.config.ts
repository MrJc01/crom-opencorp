import { defineConfig, devices } from "@playwright/test";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fakeOpencodePath = resolve(__dirname, "tests", "fixtures", "fake-opencode.mjs");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4399",
    headless: true,
    trace: "on-first-retry",
  },
  webServer: {
    command: "node bin/opencorp.mjs serve --port 4399 --token test-e2e --foreground",
    url: "http://127.0.0.1:4399/health",
    reuseExistingServer: !process.env.CI,
    env: {
      OPENCORP_HOME: "/tmp/opencorp-e2e",
      OPENCODE_SERVER_BIN: fakeOpencodePath,
    },
    timeout: 60_000,
  },
  globalSetup: "./tests/e2e/global-setup.ts",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});