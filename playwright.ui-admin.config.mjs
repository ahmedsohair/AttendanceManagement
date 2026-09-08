import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

const baseline = process.env.UI_ADMIN_BASELINE === "1";
const source = baseline ? "C:/dev/AlgoAttendance-ui-admin-baseline" : process.cwd();
for (const root of [process.cwd(), source]) {
  for (const directory of [".", "apps/admin", "e2e-ui-admin/fixture"]) {
    for (const name of [".env", ".env.local", ".env.development", ".env.development.local"]) {
      if (existsSync(path.join(root, directory, name))) throw new Error("Unsafe fixture environment file");
    }
  }
}
const env = Object.fromEntries(Object.keys(process.env)
  .filter((key) => /SUPABASE|DATABASE|RESEND|SMTP|SCANNER_TELEMETRY/.test(key))
  .map((key) => [key, ""]));

export default defineConfig({
  testDir: "./e2e-ui-admin",
  testMatch: "workspace.spec.mjs",
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:3116", browserName: "chromium" },
  webServer: {
    command: "node apps/admin/node_modules/next/dist/bin/next dev e2e-ui-admin/fixture --hostname 127.0.0.1 --port 3116",
    url: "http://127.0.0.1:3116",
    reuseExistingServer: false,
    timeout: 180000,
    env: { ...env, UI_ADMIN_BASELINE: baseline ? "1" : "0", NODE_PATH: path.resolve("apps/admin/node_modules"), NEXT_IGNORE_INCORRECT_LOCKFILE: "1", NEXT_TELEMETRY_DISABLED: "1" }
  }
});
