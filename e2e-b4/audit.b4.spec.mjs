import { test, expect } from "@playwright/test";

const widths = [390, 768, 899, 900, 910, 1440];
const pages = ["attendance", "incidents", "mismatches"];
const emptyMessages = {
  attendance: "No attendance entries match the current filters.",
  incidents: "No incidents match the current filters.",
  mismatches: "No mismatch-present overrides match the current filters."
};

function queryFor(kind, overrides = {}) {
  const query = new URLSearchParams({
    examSessionId: "exam-b",
    q: "initial",
    room: "room-b-1",
    sort: "oldest",
    ...overrides
  });
  if (kind === "attendance") query.set("status", overrides.status || "commented");
  if (kind === "incidents") query.set("type", overrides.type || "duplicate_attempt");
  return query.toString();
}

async function expectNamedFilters(page, kind) {
  for (const label of ["Exam", "Search", "Room", "Sort order"]) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  if (kind === "attendance") {
    await expect(page.getByLabel("Attendance status", { exact: true })).toBeVisible();
  }
  if (kind === "incidents") {
    await expect(page.getByLabel("Incident type", { exact: true })).toBeVisible();
  }
}

async function expectUrlWithParams(page, pathname, query) {
  const expected = new URLSearchParams(query);
  await expect(page).toHaveURL((url) => url.pathname === pathname &&
    JSON.stringify([...url.searchParams.entries()].sort()) === JSON.stringify([...expected.entries()].sort()));
  const actual = new URL(page.url());
  expect(actual.pathname).toBe(pathname);
  expect([...actual.searchParams.entries()].sort()).toEqual([...expected.entries()].sort());
}

async function blockExternalRequests(page) {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3114") return route.abort();
    return route.continue();
  });
}

test.beforeEach(async ({ page }) => {
  await blockExternalRequests(page);
});

for (const kind of pages) {
  test(`${kind} real page exposes named filters, columns, and a clear page heading`, async ({ page }) => {
    await page.goto(`/${kind}?${queryFor(kind, { q: "long" })}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNamedFilters(page, kind);
    await expect(page.locator(".table tbody tr")).toHaveCount(50);
    await expect(page.locator(".table th", { hasText: "Comment" })).toBeVisible();
    await expect(page.locator(".table th", { hasText: "Expected Room" })).toBeVisible();
    await expect(page.locator(".table")).toContainText("R1");
    await expect(page.locator(".table")).toContainText("R2");
    for (const control of await page.locator(".audit-page input, .audit-page select, .audit-page button, .audit-page a").all()) {
      await control.focus();
      await expect(control).toBeFocused();
    }
  });

  for (const width of widths) {
    test(`${kind} real page contains document overflow and keeps controls reachable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${kind}?${queryFor(kind, { q: "long" })}`);
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
      await page.screenshot({ path: `test-results/b4-real-${kind}-${width}.png`, fullPage: true });
    });
  }
}

test("real audit pages preserve GET filters, Clear, Next, Previous, and Browser Back", async ({ page }) => {
  for (const kind of pages) {
    const path = `/${kind}`;
    await page.goto(`${path}?${queryFor(kind)}`);
    await page.getByLabel("Search", { exact: true }).fill("updated");
    await page.getByLabel("Room", { exact: true }).selectOption("room-b-2");
    if (kind === "attendance") {
      await page.getByLabel("Attendance status", { exact: true }).selectOption("mismatch");
    }
    if (kind === "incidents") {
      await page.getByLabel("Incident type", { exact: true }).selectOption("student_not_found");
    }
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    const appliedQuery = queryFor(kind, {
      q: "updated",
      room: "room-b-2",
      ...(kind === "attendance" ? { status: "mismatch" } : {}),
      ...(kind === "incidents" ? { type: "student_not_found" } : {})
    });
    await expectUrlWithParams(page, path, appliedQuery);
    const clearLink = page.getByRole("link", { name: "Clear", exact: true });
    await clearLink.click();
    await expectUrlWithParams(page, path, "");
    await page.reload();
    await expect(page.getByLabel("Exam", { exact: true })).toHaveValue("active");

    await page.goto(`${path}?${appliedQuery}`);
    const nextLink = page.getByRole("link", { name: "Next", exact: true });
    const nextHref = await nextLink.getAttribute("href");
    expect(nextHref).toContain("page=2");
    await nextLink.click();
    await expectUrlWithParams(page, path, `${appliedQuery}&page=2`);
    await expect(page.getByRole("link", { name: "Previous", exact: true })).toBeVisible();
    const previousHref = await page.getByRole("link", { name: "Previous", exact: true }).getAttribute("href");
    expect(previousHref).toContain(path);
    await page.getByRole("link", { name: "Previous", exact: true }).click();
    await expectUrlWithParams(page, path, appliedQuery);
    const backPage = await page.context().newPage();
    await blockExternalRequests(backPage);
    await backPage.goto(path);
    await backPage.getByLabel("Exam", { exact: true }).selectOption("exam-b");
    await backPage.getByLabel("Search", { exact: true }).fill("updated");
    await backPage.getByLabel("Room", { exact: true }).selectOption("room-b-2");
    await backPage.getByLabel("Sort order", { exact: true }).selectOption("oldest");
    if (kind === "attendance") {
      await backPage.getByLabel("Attendance status", { exact: true }).selectOption("mismatch");
    }
    if (kind === "incidents") {
      await backPage.getByLabel("Incident type", { exact: true }).selectOption("student_not_found");
    }
    await backPage.getByRole("button", { name: "Apply", exact: true }).click();
    await expectUrlWithParams(backPage, path, appliedQuery);
    await backPage.goBack({ waitUntil: "load" });
    await expectUrlWithParams(backPage, path, "");
    await backPage.close();
  }
});

test("real audit pages keep empty results usable", async ({ page }) => {
  for (const kind of pages) {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/${kind}?q=none`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(emptyMessages[kind], { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(page.getByRole("link", { name: "Clear", exact: true })).toBeVisible();
  }
});

for (const kind of pages) {
  test(`${kind} table overflow is keyboard reachable and pans with ArrowRight`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/${kind}?${queryFor(kind, { q: "long" })}`);
    const clear = page.getByRole("link", { name: "Clear", exact: true });
    const scrollRegion = page.locator(".table-scroll");
    await clear.focus();
    await page.keyboard.press("Tab");
    await expect(scrollRegion).toHaveAttribute("tabindex", "0");
    await expect(scrollRegion).toHaveAttribute("aria-label", /table/i);
    await expect(scrollRegion).toBeFocused();
    const before = await scrollRegion.evaluate((element) => element.scrollLeft);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => scrollRegion.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
  });
}

test("mismatch real page is an Attendance subview with direct and exam-scoped parent context", async ({ page }) => {
  await page.goto("/mismatches?q=long");
  await expect(page.getByRole("heading", { level: 1, name: "Mismatch Present" })).toBeVisible();
  await expect(page.getByText("Attendance audit / mismatch review", { exact: true })).toBeVisible();
  await expect(page.locator('.breadcrumbs a[href*="/attendance"]')).toHaveAttribute("href", "/attendance?examSessionId=active");
  await expect(page.getByRole("link", { name: "Return to Attendance" })).toHaveAttribute("href", "/attendance?examSessionId=active");
  const attendanceNav = page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: /Attendance/ });
  await expect(attendanceNav).toHaveClass(/active/);
  await expect(attendanceNav).not.toHaveAttribute("aria-current", "page");
  await expect(page.locator('.breadcrumbs [aria-current="page"]')).toHaveText("Mismatch Present");

  await page.goto("/mismatches?examSessionId=exam-b&q=long");
  await expect(page.locator('.breadcrumbs a[href*="/attendance"]')).toHaveAttribute("href", "/attendance?examSessionId=exam-b");
  await expect(page.getByRole("link", { name: "Return to Attendance" })).toHaveAttribute("href", "/attendance?examSessionId=exam-b");
  await page.getByRole("link", { name: "Return to Attendance" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3114/attendance?examSessionId=exam-b");
  await expect(page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: /Attendance/ })).toHaveAttribute("aria-current", "page");
});
