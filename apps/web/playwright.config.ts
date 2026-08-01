import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig } from "@playwright/test";

const coordinationFile = join(tmpdir(), `lumina-status-e2e-${process.pid}-${randomUUID()}.json`);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  globalTeardown: "./tests/e2e/support/status-stub-global-teardown.ts",
  retries: process.env.CI ? 2 : 0,
  metadata: {
    luminaE2eCoordinationFile: coordinationFile,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "node tests/e2e/support/status-stub-harness.mjs",
    env: {
      LUMINA_E2E_COORDINATION_FILE: coordinationFile,
    },
    gracefulShutdown: {
      signal: "SIGTERM",
      timeout: 5_000,
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:3000",
  },
});
