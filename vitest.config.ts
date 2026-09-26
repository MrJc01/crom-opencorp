import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@opencorp/sdk": resolve(__dirname, "src/sdk/index.ts"),
    },
  },
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    maxWorkers: 2,
    minWorkers: 1,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup/engine-stubs.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
  },
});

