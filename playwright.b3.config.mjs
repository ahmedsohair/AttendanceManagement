import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

for (const directory of [".", "apps/admin"]) {
  for (const name of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    if (existsSync(`${directory}/${name}`)) {
      throw new Error(`Remove ${directory}/${name} from the isolated fixture before testing.`);
    }
  }
}

const env = Object.fromEntries(Object.keys(process.env)
  .filter((key) => /SUPABASE|DATABASE|RESEND|SMTP|SCANNER_TELEMETRY/.test(key))
  .map((key) => [key, ""]));

export default defineConfig({
  testDir: "./e2e-b3",
  testMatch: "scanner.b3.spec.mjs",
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:3111", browserName: "chromium" },
  webServer: {
    command: "node apps/admin/node_modules/next/dist/bin/next dev apps/admin --hostname 127.0.0.1 --port 3111",
    url: "http://127.0.0.1:3111/scan",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      ...env,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3111/mock-supabase",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: "b3-fixture-public-key",
      NEXT_IGNORE_INCORRECT_LOCKFILE: "1",
      NEXT_TELEMETRY_DISABLED: "1"
    }
  }
});
