import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // integration-pipeline requires a live PostgreSQL instance.
    // Run it explicitly with: pnpm --filter @clawdiators/api test:integration
    exclude: ["**/node_modules/**", "tests/integration-pipeline.test.ts"],
  },
});
