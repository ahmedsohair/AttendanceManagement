import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

for (const directory of [".", "apps/admin", "e2e-b5/fixture"]) {
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
  testDir: "./e2e-b5",
  testMatch: "b5.spec.mjs",
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:3115", browserName: "chromium" },
  webServer: {
    command: "node apps/admin/node_modules/next/dist/bin/next dev e2e-b5/fixture --hostname 127.0.0.1 --port 3115",
    url: "http://127.0.0.1:3115/login",
    reuseExistingServer: false,
    timeout: 180000,
    env: {
      ...env,
      NODE_PATH: path.resolve("apps/admin/node_modules"),
      NEXT_IGNORE_INCORRECT_LOCKFILE: "1",
      NEXT_TELEMETRY_DISABLED: "1"
    }
  }
});
