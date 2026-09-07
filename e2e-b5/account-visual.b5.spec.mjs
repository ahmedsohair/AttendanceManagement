import { expect, test } from "@playwright/test";

async function blockExternalRequests(page, api = {}) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3115") {
      return route.abort();
    }

    if (url.pathname === "/api/auth/admin-login") {
      const response = api.login || { status: 401, body: { message: "Fixture sign-in failed." } };
      return route.fulfill({ status: response.status, json: response.body });
    }

    if (url.pathname === "/api/auth/reset-password") {
      const response = api.reset || { status: 200, body: {} };
      return route.fulfill({ status: response.status, json: response.body });
    }

    return route.continue();
  });
}

async function gotoWithAuth(page, path, scenario = "session", api) {
  await blockExternalRequests(page, api);
  await page.addInitScript((initialScenario) => {
    window.__b5AuthScenario = initialScenario;
    window.__b5AuthUpdateMode = "success";
    window.__b5AuthSignOutMode = "success";
  }, scenario);
  await page.goto(path);
}

async function capture(page, name) {
  const phase = process.env.ACCOUNT_CAPTURE_PHASE || "capture";
  await page.screenshot({
    path: `test-results/account-polish-${phase}/${name}.png`,
    fullPage: true
  });
}

async function fillLogin(page) {
  await page.getByLabel("Email address", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
}

async function fillMatchingPasswords(page) {
  await page.getByLabel("New password", { exact: true }).fill("correct horse");
  await page.getByLabel("Confirm new password", { exact: true }).fill("correct horse");
}

test("capture account screen states at desktop and phone widths", async ({ page }) => {
  test.setTimeout(90000);

  for (const viewport of [
    { name: "desktop", width: 1280, height: 844 },
    { name: "phone", width: 390, height: 844 }
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await gotoWithAuth(page, "/login");
    await expect(page.getByRole("heading", { name: "Admin Sign In" })).toBeVisible();
    await capture(page, `${viewport.name}-login-ready`);

    await gotoWithAuth(page, "/login", "session", {
      login: { status: 401, body: { message: "Fixture sign-in failed." } }
    });
    await fillLogin(page);
    await page.getByLabel("Password", { exact: true }).press("Enter");
    await expect(page.locator("#admin-login-error")).toHaveText("Fixture sign-in failed.");
    await capture(page, `${viewport.name}-login-error`);

    await page.goto("/login?reset=updated");
    await expect(page.getByText("Password updated. Sign in with your new password.", { exact: true })).toBeVisible();
    await capture(page, `${viewport.name}-login-success`);

    await gotoWithAuth(page, "/reset-password");
    await expect(page.getByRole("heading", { name: "Reset Password" })).toBeVisible();
    await capture(page, `${viewport.name}-reset-ready`);

    await page.goto("/reset-password?error=Fixture%20reset%20service%20unavailable.");
    await expect(page.locator("#reset-password-error")).toHaveText("Fixture reset service unavailable.");
    await capture(page, `${viewport.name}-reset-error`);

    await gotoWithAuth(page, "/reset-password", "session", {
      reset: { status: 200, body: {} }
    });
    await page.getByLabel("Email address", { exact: true }).fill("staff@example.test");
    await page.getByRole("button", { name: "Send Reset Email" }).click();
    await expect(page.getByText("If an eligible account exists, a reset email will be sent shortly.", { exact: true })).toBeVisible();
    await capture(page, `${viewport.name}-reset-success`);

    await gotoWithAuth(page, "/update-password");
    await expect(page.getByRole("heading", { name: "Choose New Password" })).toBeVisible();
    await capture(page, `${viewport.name}-update-ready`);

    await gotoWithAuth(page, "/update-password", "stall");
    await expect(page.getByText("Checking your recovery session...", { exact: true })).toBeVisible();
    await capture(page, `${viewport.name}-update-checking`);

    await gotoWithAuth(page, "/update-password", "null");
    await expect(page.getByRole("heading", { name: "No Valid Recovery Session" })).toBeVisible();
    await capture(page, `${viewport.name}-update-missing`);

    await gotoWithAuth(page, "/update-password", "error");
    await expect(page.getByRole("heading", { name: "Unable to Verify Recovery Session" })).toBeVisible();
    await capture(page, `${viewport.name}-update-error`);

    await gotoWithAuth(page, "/update-password");
    await page.evaluate(() => { window.__b5AuthUpdateMode = "error"; });
    await fillMatchingPasswords(page);
    await page.getByRole("button", { name: "Update Password" }).click();
    await expect(page.locator("#update-password-error")).toHaveText("Fixture update failed.");
    await capture(page, `${viewport.name}-update-form-error`);

    await gotoWithAuth(page, "/update-password");
    await fillMatchingPasswords(page);
    await page.getByRole("button", { name: "Update Password" }).click();
    await expect(page.getByRole("heading", { name: "Password Updated" })).toBeVisible();
    await capture(page, `${viewport.name}-update-success`);
  }
});
