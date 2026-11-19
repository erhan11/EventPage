import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests share one Postgres database.
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/eventpage_test",
      TICKET_SIGNING_SECRET: "test-signing-secret-0123456789abcdef0123456789",
      DEV_PAYMENT_WEBHOOK_SECRET: "test-sim-secret-0123456789abcdef",
      DB_POOL_MAX: "20",
    },
  },
});
