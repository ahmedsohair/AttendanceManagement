import { expect, test } from "@playwright/test";

// Kept outside e2e/ so the existing staging suite cannot discover this local fixture.

const room = { id: "room-a", examSessionId: "exam", code: "TEST-A" };
function result(studentId, status = "ready_to_mark") {
  return {
    studentId, examSessionId: "exam", status,
    allocation: { studentId, studentName: "Synthetic Student", zone: "D", roomId: room.id },
    expectedRoom: { code: "TEST-B" },
    attendance: { createdAt: "2026-09-04T14:05:00Z" }
  };
}

async function fixture(page) {
  const writes = [];
  const lookups = [];
  const fixture = { writes, lookups, lookup: (id) => result(id), mark: () => ({ event: { id: "event", roomMismatch: false } }) };
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new Error("Camera mocked for B1"); };
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3111") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let body;
    if (url.pathname === "/api/auth/me") body = { user: { id: "mock-user", role: "invigilator", fullName: "Synthetic Invigilator" } };
    else if (url.pathname === "/api/mobile/my-rooms") body = { rooms: [room] };
    else if (url.pathname.includes("/live")) body = { recentAttendance: [], recentIncidents: [] };
    else if (url.pathname === "/api/attendance/lookup") {
      const request = route.request().postDataJSON();
      lookups.push(request);
      body = { result: await fixture.lookup(request.studentId) };
    } else if (url.pathname === "/api/attendance/mark") {
      const request = route.request().postDataJSON();
      writes.push(request);
      body = await fixture.mark(request);
    } else throw new Error(`Unexpected API: ${url.pathname}`);
    const status = url.pathname === "/api/attendance/mark" ? fixture.markStatus
      : url.pathname === "/api/attendance/lookup" ? fixture.lookupStatus : 200;
    await route.fulfill({ status: status ?? 200, json: body });
  });
  await page.goto("/scan");
  await page.getByRole("button", { name: /TEST-A/ }).click();
  await expect(page.getByText("Camera mocked for B1")).toBeVisible();
  return fixture;
}
const review = (page) => page.locator(".web-review-sheet");

test("wrong-room review remains reachable on a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const f = await fixture(page);
  f.lookup = (id) => result(id, "wrong_room");
  await lookup(page, "9000992");
  const card = await review(page).locator(".web-review-card").boundingBox();
  expect(card.y).toBeGreaterThanOrEqual(0);
  expect(card.y + card.height).toBeLessThanOrEqual(667);
  const heading = review(page).getByRole("heading", { name: "Wrong room detected" });
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toBeInViewport();
  const action = review(page).getByRole("button", { name: "Mark present in TEST-A" });
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function lookup(page, id) {
  await page.getByPlaceholder("Manual student number", { exact: true }).fill(id);
  await page.getByRole("button", { name: "Lookup", exact: true }).click();
  await expect(review(page).getByRole("heading", { name: "Checking student..." })).toHaveCount(0);
}

test("edited identity requires fresh lookup; notes and canonical write survive; double click writes once", async ({ page }) => {
  const f = await fixture(page);
  await lookup(page, "9000991");
  await expect(review(page).getByText("Synthetic Student", { exact: true })).toBeVisible();
  await expect(review(page).getByText("Zone: D", { exact: true })).toBeVisible();
  await review(page).getByRole("button", { name: "Mark Present", exact: true }).evaluate((button) => {
    const propsKey = Object.keys(button).find((key) => key.startsWith("__reactProps$"));
    window.staleMark = button[propsKey].onClick;
  });
  await review(page).getByPlaceholder("Comments (optional)").fill("Retained note");
  await review(page).getByPlaceholder("Student number", { exact: true }).fill("9000992");
  await expect(review(page).getByRole("button", { name: "Mark Present", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.staleMark());
  expect(f.writes).toHaveLength(0);
  await review(page).getByPlaceholder("Student number", { exact: true }).fill("9000991");
  await expect(review(page).getByRole("button", { name: "Mark Present", exact: true })).toHaveCount(0);
  await review(page).getByPlaceholder("Student number", { exact: true }).fill("s9000992");
  await review(page).getByRole("button", { name: "Lookup Edited ID" }).click();
  await expect(review(page).getByText("Student number: 9000992", { exact: true })).toBeVisible();
  await expect(review(page).getByPlaceholder("Comments (optional)")).toHaveValue("Retained note");
  await review(page).getByRole("button", { name: "Mark Present", exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect.poll(() => f.writes.length).toBe(1);
  expect(f.writes[0]).toMatchObject({ studentId: "9000992", roomId: room.id, examSessionId: "exam", comment: "Retained note", source: "manual", action: "mark_present", overrideWrongRoom: false });
  await expect(review(page)).toHaveCount(0);
});

test("wrong-room priority and both existing write actions retain identity and note", async ({ page }) => {
  const f = await fixture(page);
  f.lookup = (id) => result(id, "wrong_room");
  for (const [label, action, overrideWrongRoom] of [["Send to TEST-B", "redirect_only", false], ["Mark present in TEST-A", "mark_present", true]]) {
    await lookup(page, "9000992");
    await expect(review(page).getByText(/Consult the room team leader/)).toBeVisible();
    await expect(review(page).getByRole("button", { name: "Send to TEST-B" })).not.toHaveClass(/secondary/);
    await expect(review(page).getByRole("button", { name: "Mark present in TEST-A" })).toHaveClass(/secondary/);
    await review(page).getByPlaceholder("Comments (optional)").fill("Team leader consulted");
    await review(page).getByRole("button", { name: label, exact: true }).click();
    await expect(review(page)).toHaveCount(0);
    expect(f.writes.at(-1)).toMatchObject({ studentId: "9000992", action, overrideWrongRoom, comment: "Team leader consulted" });
  }
});

test("duplicate and not-found cannot save draft comments; Continue Scan makes no write", async ({ page }) => {
  const f = await fixture(page);
  for (const status of ["already_marked", "student_not_found"]) {
    f.lookup = (id) => result(id);
    await lookup(page, "9000991");
    await review(page).getByPlaceholder("Comments (optional)").fill("Unsaved draft");
    f.lookup = (id) => { const value = result(id, status); delete value.allocation; return value; };
    await review(page).getByRole("button", { name: "Lookup Edited ID" }).click();
    await expect(review(page).getByText("Name unavailable", { exact: true })).toBeVisible();
    await expect(review(page).getByText("Zone unavailable", { exact: true })).toBeVisible();
    await expect(review(page).locator("textarea")).toHaveCount(0);
    await expect(review(page).getByText(/Continue Scan discards it without saving/)).toBeVisible();
    if (status === "already_marked") await expect(review(page).getByText(/5\/9\/26.*Australia\/Sydney/)).toBeVisible();
    await review(page).getByRole("button", { name: "Continue Scan" }).click();
  }
  expect(f.writes).toHaveLength(0);
});

test("cancelled delayed lookup cannot reopen review", async ({ page }) => {
  const f = await fixture(page);
  let release;
  f.lookup = (id) => new Promise((resolve) => { release = () => resolve(result(id)); });
  await page.getByPlaceholder("Manual student number").fill("9000991");
  await page.getByRole("button", { name: "Lookup", exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect.poll(() => f.lookups.length).toBe(1);
  await review(page).getByRole("button", { name: "Cancel Scan" }).click();
  f.lookup = (id) => result(id);
  await lookup(page, "9000992");
  release();
  await expect(review(page).getByText("Student number: 9000992", { exact: true })).toBeVisible();
  expect(f.writes).toHaveLength(0);
});

for (const [status, delay] of [[200, 180], [503, 450]]) {
  test(`${delay}ms reset cannot dismiss a newer lookup; committed writes retain matching outbox metadata`, async ({ page }) => {
    const f = await fixture(page);
    await page.clock.install({ time: new Date("2026-09-05T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-09-05T00:00:01Z"));
    f.markStatus = status;
    await lookup(page, "9000991");
    await review(page).getByRole("button", { name: "Mark Present", exact: true }).click();
    await expect(review(page).getByText(status === 200 ? "Attendance marked." : "Saved on this device. Attendance is pending synchronization.", { exact: true })).toBeVisible();
    await review(page).getByPlaceholder("Student number", { exact: true }).fill("9000992");
    let release;
    f.lookup = (id) => new Promise((resolve) => { release = () => resolve(result(id)); });
    await review(page).getByRole("button", { name: "Lookup Edited ID" }).click();
    await expect.poll(() => f.lookups.length).toBe(2);
    await page.clock.runFor(delay + 10);
    await expect(review(page).getByRole("heading", { name: "Checking student..." })).toBeVisible();
    release();
    await expect(review(page).getByText("Student number: 9000992", { exact: true })).toBeVisible();
    if (status === 503) {
      const items = await page.evaluate(() => new Promise((resolve, reject) => {
        const request = indexedDB.open("exampulse-scanner");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction("attendance-outbox", "readonly").objectStore("attendance-outbox").getAll();
          read.onsuccess = () => { resolve(read.result); db.close(); };
        };
      }));
      expect(items).toHaveLength(1);
      expect(items[0].request).toEqual(f.writes[0]);
      for (const key of ["studentId", "roomId", "examSessionId", "source", "userId", "deviceId", "action", "overrideWrongRoom"]) {
        expect(items[0][key]).toEqual(f.writes[0][key]);
      }
    }
    expect(f.writes).toHaveLength(1);
  });
}

test("leaving a pending write preserves its outbox completion without reopening the review", async ({ page }) => {
  const f = await fixture(page);
  let release;
  f.mark = () => new Promise((resolve) => { release = () => resolve({ event: { id: "event" } }); });
  await lookup(page, "9000991");
  await review(page).getByRole("button", { name: "Mark Present", exact: true }).click();
  await expect.poll(() => f.writes.length).toBe(1);
  // Invoke the existing room-exit action directly to cover invalidation during a write.
  await page.getByRole("button", { name: "Back", exact: true }).evaluate((button) => button.click());
  await expect(page.getByRole("heading", { name: "Choose Room" })).toBeVisible();
  release();
  await expect(review(page)).toHaveCount(0);
  await page.getByRole("button", { name: /TEST-A/ }).click();
  await expect(page.getByText("Camera mocked for B1")).toBeVisible();
  await lookup(page, "9000992");
  await expect(review(page).getByText("Student number: 9000992", { exact: true })).toBeVisible();
  expect(f.writes).toHaveLength(1);
});

test("wrong-room edit and failed re-lookup revoke both captured handlers until successful retry", async ({ page }) => {
  const f = await fixture(page);
  f.lookup = (id) => result(id, "wrong_room");
  await lookup(page, "9000991");
  await review(page).getByPlaceholder("Comments (optional)").fill("Keep through failure");
  await review(page).locator("button").evaluateAll((buttons) => {
    window.staleActions = buttons.filter((button) => /Send to|Mark present/.test(button.textContent)).map((button) => {
      const key = Object.keys(button).find((name) => name.startsWith("__reactProps$"));
      return button[key].onClick;
    });
  });
  await review(page).getByPlaceholder("Student number", { exact: true }).fill("9000992");
  await page.evaluate(async () => { for (const action of window.staleActions) await action(); });
  expect(f.writes).toHaveLength(0);
  f.lookupStatus = 500;
  await review(page).getByRole("button", { name: "Lookup Edited ID" }).click();
  await expect(review(page).getByText("Request failed.", { exact: true })).toBeVisible();
  await expect(review(page).getByRole("button", { name: /Send to|Mark present/ })).toHaveCount(0);
  await page.evaluate(async () => { for (const action of window.staleActions) await action(); });
  expect(f.writes).toHaveLength(0);
  f.lookupStatus = 200;
  await review(page).getByRole("button", { name: "Lookup Edited ID" }).click();
  await expect(review(page).getByPlaceholder("Comments (optional)")).toHaveValue("Keep through failure");
});

test("missing name and zone use explicit fallbacks without an additional identity request", async ({ page }) => {
  const f = await fixture(page);
  f.lookup = (id) => {
    const value = result(id);
    value.allocation.studentName = " ";
    value.allocation.zone = "";
    return value;
  };
  await lookup(page, "9000991");
  await expect(review(page).getByText("Name unavailable", { exact: true })).toBeVisible();
  await expect(review(page).getByText("Zone unavailable", { exact: true })).toBeVisible();
  await expect(review(page).getByRole("button", { name: "Mark Present", exact: true })).toBeEnabled();
  expect(f.lookups).toHaveLength(1);
  expect(f.writes).toHaveLength(0);
});
