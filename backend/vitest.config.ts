import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    isolate: true,
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    clearMocks: true,
    restoreMocks: true
  }
});
