import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    environment: "node",
    // Headless play-throughs and fast-check runs take seconds each; the 5 s default flakes under parallel load.
    testTimeout: 60_000,
    // Bot and rating tests are long synchronous blocks; with a worker per core on a throttled laptop
    // (battery power) the worker-to-main RPC times out ("Timeout calling onTaskUpdate") even though
    // every test passes. Three workers keep the suite at about a minute and the RPC healthy.
    maxWorkers: 3,
    minWorkers: 1,
  },
});
