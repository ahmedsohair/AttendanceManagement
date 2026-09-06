import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

for (const directory of [".", "apps/admin", "e2e-b4/fixture"]) {
  for (const name of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    if (existsSync(`${directory}/${name}`)) {
      throw new Error(`Unsafe environment file: ${directory}/${name}`);
    }
  }
}

const env = Object.fromEntries(
  Object.keys(process.env)
    .filter((key) => /SUPABASE|DATABASE|RESEND|SMTP|SCANNER_TELEMETRY/.test(key))
    .map((key) => [key, ""])
);

export default defineConfig({
  testDir: "./e2e-b4",
  testMatch: "audit.b4.spec.mjs",
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:3114", browserName: "chromium" },
  webServer: {
    command: "node apps/admin/node_modules/next/dist/bin/next dev e2e-b4/fixture --hostname 127.0.0.1 --port 3114",
    url: "http://127.0.0.1:3114/attendance",
    reuseExistingServer: false,
    timeout: 180000,
    env: {
      ...env,
      NEXT_IGNORE_INCORRECT_LOCKFILE: "1",
      NEXT_TELEMETRY_DISABLED: "1"
    }
  }
});
