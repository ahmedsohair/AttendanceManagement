import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => {
    const request = route.request();
    if (new URL(request.url()).origin !== "http://127.0.0.1:3116" || !["GET", "HEAD", "OPTIONS"].includes(request.method())) return route.abort();
    return route.continue();
  });
});

test("capture workspace baseline and refined states", async ({ page, context }) => {
  test.setTimeout(120000);
  const phase = process.env.UI_ADMIN_BASELINE === "1" ? "before" : "after";
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const state of ["populated", "empty"]) {
      await context.addCookies([{ name: "ui-fixture-state", value: state, url: "http://127.0.0.1:3116" }]);
      for (const route of ["/", "/sessions"]) {
        await page.goto(route);
        await expect(page.getByRole("heading", { name: route === "/" ? "Active Exams" : "Exam Sessions", exact: true })).toBeVisible();
        await page.screenshot({ path: `test-results/admin-workspace-${phase}/${width}-${state}-${route === "/" ? "dashboard" : "sessions"}.png`, fullPage: true });
      }
    }
  }
});

for (const width of [320, 390, 768, 1280]) {
  for (const path of ["/", "/sessions"]) {
    test(`workspace fits ${width}px on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.getByRole("button", { name: "Sign Out", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const nav = page.getByRole("navigation", { name: "Admin navigation", exact: true });
      for (const name of ["Dashboard", "Exams", "Invigilators", "Attendance", "Incidents", "Health"]) {
        await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
        await expect(nav.getByRole("link", { name, exact: true })).toBeInViewport();
      }
      await expect(nav.getByRole("link", { name: path === "/" ? "Dashboard" : "Exams", exact: true })).toHaveAttribute("aria-current", "page");
    });
  }
}

test("exam search and sort remain native GET and preserve section pagination", async ({ page }) => {
  await page.goto("/sessions");
  await expect(page.locator('input[name="q"]')).toHaveAccessibleName(/search/i);
  await expect(page.locator('select[name="sort"]')).toHaveAccessibleName(/sort/i);
  await page.locator('input[name="q"]').fill("2026");
  await page.locator('select[name="sort"]').selectOption("oldest");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/q=2026.*sort=oldest/);
  const active = page.getByRole("navigation", { name: "Active exams pages" });
  await active.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/activePage=2/);
  await page.getByRole("navigation", { name: "Draft exams pages" }).getByRole("link", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/draftPage=2/);
  const query = new URL(page.url()).searchParams;
  expect(query.get("q")).toBe("2026");
  expect(query.get("sort")).toBe("oldest");
  expect(query.get("activePage")).toBe("2");
  await page.getByRole("link", { name: "Clear", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3116/sessions");
});

test("exam table remains keyboard-scrollable and pages have a primary heading", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/sessions");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const scroll = page.locator(".table-scroll").first();
  await expect(scroll).toHaveAttribute("tabindex", "0");
  await expect(scroll).toHaveAttribute("role", "region");
  await expect(scroll).toHaveAccessibleName(/exam/i);
  await scroll.focus();
  await expect(scroll).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => scroll.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
});

test("close and typed-delete confirmations still prevent cancelled submissions", async ({ page }) => {
  let writes = 0;
  page.on("request", request => { if (request.method() === "POST") writes++; });
  await page.goto("/sessions");
  page.once("dialog", dialog => { expect(dialog.type()).toBe("confirm"); return dialog.dismiss(); });
  await page.getByRole("button", { name: "Close Exam", exact: true }).first().click();
  page.once("dialog", dialog => { expect(dialog.type()).toBe("prompt"); return dialog.accept("wrong exam name"); });
  await page.getByRole("button", { name: "Delete Draft", exact: true }).first().click();
  expect(writes).toBe(0);
  await expect(page).toHaveURL("http://127.0.0.1:3116/sessions");
  await expect(page.getByRole("link", { name: "Export XLSX", exact: true }).first()).toHaveAttribute("href", "/api/reports/closed-1/export");
});

test("contextual attendance navigation does not claim mismatches is the same page", async ({ page }) => {
  await page.goto("/mismatches");
  const attendance = page.getByRole("navigation", { name: "Admin navigation", exact: true }).getByRole("link", { name: "Attendance", exact: true });
  await expect(attendance).toHaveClass(/active/);
  await expect(attendance).not.toHaveAttribute("aria-current", "page");
});

test("confirmed delete retains the exact name and endpoint contract in the mock", async ({ page }) => {
  await page.goto("/sessions");
  const button = page.getByRole("button", { name: "Delete Draft", exact: true }).first();
  const form = button.locator("xpath=ancestor::form");
  await expect(form).toHaveAttribute("action", "/api/exam-sessions/draft-1/delete");
  const requests = [];
  await page.route("**/api/exam-sessions/draft-1/delete", async route => {
    requests.push({ method: route.request().method(), body: route.request().postData() });
    return route.fulfill({ status: 200, contentType: "text/html", body: "Mock deletion accepted; no data changed." });
  });
  page.once("dialog", dialog => dialog.accept("Algorithms and Analysis - Undergraduate and Postgraduate Final Examination 1"));
  await button.click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].method).toBe("POST");
  expect(new URLSearchParams(requests[0].body).get("confirmationName")).toBe("Algorithms and Analysis - Undergraduate and Postgraduate Final Examination 1");
});
