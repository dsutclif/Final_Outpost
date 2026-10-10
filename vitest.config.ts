import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    environment: "node",
    // Headless play-throughs and fast-check runs take seconds each; the 5 s default flakes under parallel load.
    testTimeout: 60_000,
  },
});
