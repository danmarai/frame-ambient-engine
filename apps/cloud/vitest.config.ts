import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 10000,
    setupFiles: ["src/__tests__/setup.ts"],
  },
});
