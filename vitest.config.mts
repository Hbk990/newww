import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Unit tests only — `src/**` and nothing else.
 *
 * The Playwright specs under `e2e/` are also called tests and would otherwise
 * be collected here, where they fail immediately for want of a browser. The
 * two runners are kept to separate directories rather than separate globs so
 * that adding a file cannot accidentally hand it to the wrong one.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    // The `@/` alias from tsconfig.json, restated: Vitest reads its own
    // resolver, not the TypeScript path mapping.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
