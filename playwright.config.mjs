import { defineConfig, devices } from "@playwright/test";

const stagingUrl = process.env.STAGING_APP_URL?.trim() || "https://exampulse-stagings.vercel.app";
if (stagingUrl !== "https://exampulse-stagings.vercel.app") {
  throw new Error(`Browser tests refused: expected the staging origin, received ${stagingUrl}.`);
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: stagingUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "authenticate",
      testMatch: /auth\.setup\.mjs/
    },
    {
      name: "desktop-chromium",
      dependencies: ["authenticate"],
      testIgnore: /auth\.setup\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/invigilator.json",
        permissions: ["camera"],
        launchOptions: {
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]
        }
      }
    }
  ]
});
