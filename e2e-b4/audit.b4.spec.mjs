import { test, expect } from "@playwright/test";

const widths = [390, 768, 899, 900, 910, 1440];
const pages = ["attendance", "incidents", "mismatches"];

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3114") return route.abort();
    return route.continue();
  });
});

for (const kind of pages) {
  test(`${kind} exposes named filters and a clear page heading`, async ({ page }) => {
    await page.goto(`/${kind}?examSessionId=exam-b&q=long&room=r1&sort=oldest${kind === "attendance" ? "&status=commented" : ""}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const label of ["Exam", "Search", "Room", "Sort order"]) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
    if (kind === "attendance") await expect(page.getByLabel("Attendance status", { exact: true })).toBeVisible();
    if (kind === "incidents") await expect(page.getByLabel("Incident type", { exact: true })).toBeVisible();
    for (const control of await page.locator(".audit-page input, .audit-page select, .audit-page button, .audit-page a").all()) {
      await control.focus();
      await expect(control).toBeFocused();
    }
  });

  for (const width of widths) {
    test(`${kind} contains document overflow and keeps controls reachable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${kind}?q=long`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const metrics = await page.evaluate(() => {
        const region = document.querySelector(".audit-page .table-scroll");
        const regionBox = region?.getBoundingClientRect();
        return {
          documentWidth: document.documentElement.scrollWidth,
          tableWidth: region?.scrollWidth || 0,
          tableClientWidth: region?.clientWidth || 0,
          regionRight: regionBox ? regionBox.right : 0,
          bodyWidth: document.body.scrollWidth
        };
      });
      expect(metrics.documentWidth).toBeLessThanOrEqual(width);
      expect(metrics.bodyWidth).toBeLessThanOrEqual(width);
      expect(metrics.regionRight).toBeLessThanOrEqual(width + 1);
      if (width < 1440) expect(metrics.tableWidth).toBeGreaterThan(metrics.tableClientWidth);
      await page.screenshot({ path: `test-results/b4-${kind}-${width}.png`, fullPage: true });
    });
  }
}

test("audit filters preserve GET names, clear, pagination, and browser back", async ({ page }) => {
  await page.goto("/attendance?examSessionId=exam-a&q=initial&room=r1&status=commented&sort=oldest&page=2");
  await page.getByLabel("Search", { exact: true }).fill("updated");
  await page.getByLabel("Room", { exact: true }).selectOption("r2");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/\/attendance\?examSessionId=exam-a&q=updated&room=r2&status=commented&sort=oldest$/);
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/page=2$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/attendance\?examSessionId=exam-a&q=updated&room=r2&status=commented&sort=oldest$/);
  await expect(page.getByLabel("Search", { exact: true })).toHaveValue("updated");
  await expect(page.getByLabel("Room", { exact: true })).toHaveValue("r2");
  await page.getByRole("link", { name: "Clear", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3114/attendance");
  await page.reload();
  await expect(page.getByLabel("Exam", { exact: true })).toHaveValue("active");
});

test("empty audit results keep their table region and filter controls usable", async ({ page }) => {
  for (const kind of pages) {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/${kind}?q=none`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(`No ${kind} match the current filters.`, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(page.getByRole("link", { name: "Clear", exact: true })).toBeVisible();
  }
});

test("mismatch review is an Attendance subview with scoped return context", async ({ page }) => {
  await page.goto("/mismatches?examSessionId=exam-b&q=long");
  await expect(page.getByRole("heading", { level: 1, name: "Mismatch Present" })).toBeVisible();
  await expect(page.getByText("Attendance audit / mismatch review", { exact: true })).toBeVisible();
  for (const link of await page.locator('.breadcrumbs a[href*="/attendance"], .audit-context a').all()) {
    await expect(link).toHaveAttribute("href", "/attendance?examSessionId=exam-b");
  }
  const attendanceNav = page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: /Attendance/ });
  await expect(attendanceNav).toHaveClass(/active/);
  await expect(attendanceNav).not.toHaveAttribute("aria-current", "page");
  await expect(page.locator('.breadcrumbs [aria-current="page"]')).toHaveText("Mismatch Present");
  await page.getByRole("link", { name: "Return to Attendance" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3114/attendance?examSessionId=exam-b");
  await expect(page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: /Attendance/ })).toHaveAttribute("aria-current", "page");
});
