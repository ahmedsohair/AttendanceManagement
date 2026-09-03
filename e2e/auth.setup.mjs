import { expect, test as setup } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const authFile = "playwright/.auth/invigilator.json";
const accessCode = process.env.STAGING_INVIGILATOR_ACCESS_CODE?.trim() || "AMS-T001-0001";

setup("authenticate staging invigilator", async ({ page }) => {
  await page.goto("/scan");
  await expect(page.getByRole("heading", { name: "Invigilator Web Login" })).toBeVisible();
  await page.getByPlaceholder("AMS-XXXX-XXXX").fill(accessCode);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Choose Room" })).toBeVisible();

  await mkdir("playwright/.auth", { recursive: true });
  await page.context().storageState({ path: authFile });
});
