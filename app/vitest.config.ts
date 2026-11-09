import { defineConfig } from "vitest/config";
import path from "path";
import os from "os";
import { mkdtempSync } from "fs";

export default defineConfig({
  cacheDir: mkdtempSync(path.join(os.tmpdir(), "store-vitest-")),
  // Vite8 uses Oxc; Next must retain jsx:preserve in the application tsconfig.
  oxc: { jsx: { runtime: "automatic" } },
  server: {
    host: "127.0.0.1",
    cors: false,
    hmr: false,
    fs: { strict: true },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", ...(process.env.TEST_DATABASE_ENABLED === "yes" ? ["tests/database/**/*.test.ts"] : [])],
    hookTimeout: 30000,
    testTimeout: 30000,
    api: false,
    ui: false,
    browser: { enabled: false },
    maxWorkers: 2,
    pool: "forks",
    // Vitest4 forwards these arguments to every forked worker.
    execArgv: ["--disable-proto=throw"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
