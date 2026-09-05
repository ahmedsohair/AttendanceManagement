import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// The isolated app imports only client components and CSS, never backend routes.
for (const directory of [".", "apps/admin", "e2e-b2/fixture"]) {
  for (const name of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    if (existsSync(`${directory}/${name}`)) throw new Error(`Unsafe environment file: ${directory}/${name}`);
  }
}
const env = Object.fromEntries(Object.keys(process.env)
  .filter((key) => /SUPABASE|DATABASE|RESEND|SMTP|SCANNER_TELEMETRY/.test(key))
  .map((key) => [key, ""]));

export default defineConfig({
  testDir: "./e2e-b2",
  testMatch: "staffing.b2.spec.mjs",
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:3112", browserName: "chromium" },
  webServer: {
    command: "node apps/admin/node_modules/next/dist/bin/next dev e2e-b2/fixture --hostname 127.0.0.1 --port 3112",
    url: "http://127.0.0.1:3112",
    reuseExistingServer: false,
    timeout: 90000,
    env: { ...env, NEXT_IGNORE_INCORRECT_LOCKFILE: "1", NEXT_TELEMETRY_DISABLED: "1" }
  }
});
