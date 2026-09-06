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

async function authCounts(page) {
  return page.evaluate(() => window.__b5AuthControls.counts());
}

async function emitAuth(page, event, userId = "b5-user") {
  await page.evaluate(
    ({ eventName, id }) => window.__b5AuthControls.emit(eventName, id),
    { eventName: event, id: userId }
  );
}

async function fillMatchingPasswords(page) {
  await page.getByLabel("New password", { exact: true }).fill("correct horse");
  await page.getByLabel("Confirm new password", { exact: true }).fill("correct horse");
}

test("login and reset forms expose persistent labels, autocomplete, and linked errors", async ({ page }) => {
  await gotoWithAuth(page, "/login", "session", {
    login: { status: 401, body: { message: "Fixture sign-in failed." } }
  });
  await expect(page.getByLabel("Email address", { exact: true })).toHaveAttribute(
    "autocomplete",
    "email"
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "autocomplete",
    "current-password"
  );
  await page.getByLabel("Email address", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page.locator("#admin-login-error")).toHaveText("Fixture sign-in failed.");
  await expect(page.getByLabel("Email address", { exact: true })).toHaveAttribute(
    "aria-describedby",
    "admin-login-error"
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true"
  );

  await gotoWithAuth(page, "/reset-password", "session", {
    reset: { status: 503, body: { message: "Fixture reset service unavailable." } }
  });
  await expect(page.getByLabel("Email address", { exact: true })).toHaveAttribute(
    "autocomplete",
    "email"
  );
  await page.getByLabel("Email address", { exact: true }).fill("staff@example.test");
  await page.getByLabel("Email address", { exact: true }).press("Enter");
  await expect(page.locator("#reset-password-error")).toHaveText("Fixture reset service unavailable.");
  await expect(page.getByLabel("Email address", { exact: true })).toHaveAttribute(
    "aria-describedby",
    "reset-password-error"
  );
});

test("recovery uses a truthful terminal state for a missing session", async ({ page }) => {
  await gotoWithAuth(page, "/update-password", "null");
  await expect(page.getByRole("heading", { name: "No Valid Recovery Session" })).toBeVisible();
  await expect(
    page.getByText("No valid recovery session. Request a new password reset email.", { exact: true })
  ).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Password updated.", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Request another recovery email" })).toBeVisible();
});

test("network session checks are distinct and retryable", async ({ page }) => {
  await gotoWithAuth(page, "/update-password", "error");
  await expect(page.getByRole("heading", { name: "Unable to Verify Recovery Session" })).toBeVisible();
  await expect(page.getByText(/could not verify your recovery session/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry check" })).toBeVisible();
  await page.evaluate(() => {
    window.__b5AuthScenario = "session";
  });
  await page.getByRole("button", { name: "Retry check" }).click();
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose New Password" })).toBeVisible();
});

test("rejected and stalled checks settle, while a later recovery event wins over the old promise", async ({ page }) => {
  await gotoWithAuth(page, "/update-password", "reject");
  await expect(page.getByRole("heading", { name: "Unable to Verify Recovery Session" })).toBeVisible();
  await expect(page.getByText(/could not verify your recovery session/i)).toBeVisible();

  await gotoWithAuth(page, "/update-password", "stall");
  await expect(page.getByText("Checking your recovery session...", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unable to Verify Recovery Session" })).toBeVisible({
    timeout: 7000
  });
  await page.evaluate(() => {
    window.__b5AuthControls.emit("PASSWORD_RECOVERY", "b5-user");
    window.__b5AuthControls.resolveSession(false);
  });
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose New Password" })).toBeVisible();
});

test("a newer recovery event accepts readiness and null auth events revoke it", async ({ page }) => {
  await gotoWithAuth(page, "/update-password", "stall");
  await expect(page.getByText("Checking your recovery session...", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.__b5AuthControls))).toBe(true);
  await page.evaluate(() => window.__b5AuthControls.emit("PASSWORD_RECOVERY", "b5-user"));
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();

  await emitAuth(page, "PASSWORD_RECOVERY", null);
  await expect(page.getByRole("heading", { name: "No Valid Recovery Session" })).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);

  await emitAuth(page, "PASSWORD_RECOVERY", "b5-user");
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
});

test("password validation preserves the eight-character rule and prevents false success", async ({ page }) => {
  await gotoWithAuth(page, "/update-password");
  await page.getByLabel("New password", { exact: true }).fill("short");
  await page.getByLabel("Confirm new password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Update Password" }).click();
  await expect(page.locator("#update-password-error")).toHaveText("Use at least 8 characters for the new password.");
  expect((await authCounts(page)).updateUser).toBe(0);
  await expect(page.getByRole("heading", { name: "Password Updated" })).toHaveCount(0);

  await page.getByLabel("New password", { exact: true }).fill("long enough");
  await page.getByLabel("Confirm new password", { exact: true }).fill("different");
  await page.getByRole("button", { name: "Update Password" }).click();
  await expect(page.locator("#update-password-error")).toHaveText("Passwords do not match.");
  expect((await authCounts(page)).updateUser).toBe(0);
});

test("rapid submits call update once and clear secrets only after actual success", async ({ page }) => {
  await gotoWithAuth(page, "/update-password");
  await page.evaluate(() => {
    window.__b5AuthUpdateMode = "pending";
  });
  await fillMatchingPasswords(page);
  await page.evaluate(() => {
    const form = document.querySelector("form");
    form?.requestSubmit();
    form?.requestSubmit();
  });
  await expect(page.getByRole("button", { name: "Updating..." })).toBeDisabled();
  expect((await authCounts(page)).updateUser).toBe(1);
  await page.evaluate(() => window.__b5AuthControls.resolveUpdate("success"));
  await expect(page.getByRole("heading", { name: "Password Updated" })).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Confirm new password", { exact: true })).toHaveCount(0);
});

test("failed updates keep the form and do not announce completion", async ({ page }) => {
  await gotoWithAuth(page, "/update-password");
  await page.evaluate(() => {
    window.__b5AuthUpdateMode = "error";
  });
  await fillMatchingPasswords(page);
  await page.getByRole("button", { name: "Update Password" }).click();
  await expect(page.locator("#update-password-error")).toHaveText("Fixture update failed.");
  await expect(page.getByRole("heading", { name: "Password Updated" })).toHaveCount(0);
  await expect(page.getByLabel("New password", { exact: true })).toHaveValue("correct horse");
});

test("pending update is invalidated by sign-out and cannot surface stale success", async ({ page }) => {
  await gotoWithAuth(page, "/update-password");
  await page.evaluate(() => {
    window.__b5AuthUpdateMode = "pending";
  });
  await fillMatchingPasswords(page);
  await page.getByRole("button", { name: "Update Password" }).click();
  await expect(page.getByRole("button", { name: "Updating..." })).toBeDisabled();
  await emitAuth(page, "SIGNED_OUT", null);
  await expect(page.getByRole("heading", { name: "No Valid Recovery Session" })).toBeVisible();
  await page.evaluate(() => window.__b5AuthControls.resolveUpdate("success"));
  await expect(page.getByRole("heading", { name: "Password Updated" })).toHaveCount(0);
  await expect(page.getByText("No valid recovery session.", { exact: false })).toBeVisible();
});

test("unmount cleanup ignores a late session result", async ({ page }) => {
  await gotoWithAuth(page, "/update-password", "stall");
  await page.getByRole("link", { name: "Request another recovery email" }).click();
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.evaluate(() => window.__b5AuthControls.resolveSession(false));
  await expect(page.getByRole("heading", { name: "Reset Password" })).toBeVisible();
});

test("successful recovery preserves guarded sign-out and return-to-sign-in navigation", async ({ page }) => {
  await gotoWithAuth(page, "/update-password");
  await fillMatchingPasswords(page);
  await page.getByRole("button", { name: "Update Password" }).click();
  await expect(page.getByRole("heading", { name: "Password Updated" })).toBeVisible();
  await page.getByRole("button", { name: "Return to Sign In" }).click();
  await expect(page).toHaveURL(/\/login\?reset=updated$/);
  await expect(page.getByRole("heading", { name: "Admin Sign In" })).toBeVisible();
});

test("account and staff fields remain named and usable at phone and desktop widths", async ({ page }) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await gotoWithAuth(page, "/login");
    await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    await gotoWithAuth(page, "/update-password");
    await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm new password", { exact: true })).toHaveAttribute(
      "autocomplete",
      "new-password"
    );

    await page.goto("/invigilators");
    await expect(page.getByLabel("Search invigilators", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Sort staff", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Email address", { exact: true }).first()).toHaveAttribute(
      "autocomplete",
      "email"
    );
    await expect(page.getByLabel("Full name (optional)", { exact: true })).toHaveAttribute(
      "autocomplete",
      "name"
    );
    const labels = await page.locator("label[for]").evaluateAll((elements) =>
      elements.every((label) => Boolean(document.getElementById(label.htmlFor)))
    );
    expect(labels).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test("invigilator search stays a native GET and edit disclosure keeps associated fields", async ({ page }) => {
  await gotoWithAuth(page, "/invigilators");
  await page.getByLabel("Search invigilators", { exact: true }).fill("Alex");
  await page.getByLabel("Sort staff", { exact: true }).selectOption("name_desc");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/\/invigilators\?q=Alex&sort=name_desc$/);
  await expect(page.getByText("Alex Fixture", { exact: true })).toBeVisible();

  const editDisclosure = page.locator("details.inline-details").filter({ hasText: "Edit invigilator" }).first();
  await editDisclosure.locator("summary").click();
  await expect(editDisclosure.getByLabel("Email address", { exact: true })).toBeVisible();
  await expect(editDisclosure.getByLabel("Full name", { exact: true })).toBeVisible();
});
