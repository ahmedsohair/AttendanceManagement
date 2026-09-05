import { test, expect } from "@playwright/test";

const baseline = [{ roomId: "r1", invigilatorIds: ["u1", "u2"] }, { roomId: "r2", invigilatorIds: ["u1"] }];
const users = (ids) => [
  { id: "u1", fullName: "One", email: "one@example.test", role: "invigilator", assignedRoomIds: ids },
  { id: "u2", fullName: "Two", email: "two@example.test", role: "invigilator", assignedRoomIds: [] }
];
const patch = (page, value) => page.evaluate((value) => window.setStaffingFixture(value), value);
const one = (page) => page.getByRole("checkbox", { name: "One one@example.test" });
const two = (page) => page.getByRole("checkbox", { name: "Two two@example.test" });

test.beforeEach(async ({ page }) => {
  // Any unmocked API or external request fails closed. There are no live credentials.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3112" || url.pathname.startsWith("/api/")) return route.abort();
    return route.continue();
  });
  await page.goto("/");
  await page.waitForFunction(() => typeof window.setStaffingFixture === "function");
  await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeDisabled();
});

test("seeded selections, badges, summary and saved baseline agree; committed response drives next save", async ({ page }) => {
  await expect(one(page)).toBeChecked();
  await expect(two(page)).toBeChecked();
  await expect(page.getByText("2 of 2 room(s) have staff assigned.")).toBeVisible();
  await expect(page.getByRole("button", { name: /R1 Room One 2 assigned/ })).toBeVisible();
  await page.getByRole("button", { name: "Continue To Review" }).click();
  await expect(page.locator(".review-room-row").first()).toContainText("One");
  await expect(page.locator(".review-room-row").first()).toContainText("Two");
  await page.getByRole("button", { name: /R1 Room One/ }).click();
  const calls = [];
  const committed = [{ roomId: "r1", invigilatorIds: ["u1"] }, { roomId: "r2", invigilatorIds: ["u1", "u2"] }];
  await page.route("**/api/exam-sessions/exam-a/assignments", async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({ json: { roomAssignments: committed } });
  });
  await two(page).uncheck();
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect(page.getByText("Room assignments saved.", { exact: true })).toBeVisible();
  expect(calls[0].expectedRoomAssignments).toEqual(baseline);
  await expect(page.getByRole("button", { name: /R2 Room Two 2 assigned/ })).toBeVisible();
  await two(page).check();
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[1].expectedRoomAssignments).toEqual(committed);
});

test("dirty refresh keeps edits and baseline; conflict stops save-and-publish without losing edits", async ({ page }) => {
  await two(page).uncheck();
  await patch(page, { initialInvigilators: users(["r2"]) });
  await expect(page.getByText(/original save baseline have been kept/)).toBeVisible();
  await expect(one(page)).toBeChecked();
  let body, publishes = 0;
  await page.route("**/api/exam-sessions/exam-a/assignments", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 409, json: { message: "Assignments changed. Reload and try again." } });
  });
  await page.route("**/api/exam-sessions/exam-a/publish", async (route) => { publishes++; await route.abort(); });
  await page.getByRole("button", { name: "Save & Publish Exam" }).click();
  await expect(page.getByText("Assignments changed. Reload and try again.")).toBeVisible();
  expect(body.expectedRoomAssignments).toEqual(baseline);
  expect(publishes).toBe(0);
  await expect(two(page)).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeEnabled();
});

test("clean refresh adopts one snapshot; exam change resets dirty state and selection", async ({ page }) => {
  await patch(page, { initialInvigilators: users(["r2"]) });
  await expect(one(page)).not.toBeChecked();
  await expect(two(page)).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeDisabled();
  await one(page).check();
  await patch(page, { sessionId: "exam-b", initialInvigilators: users([]) });
  await expect(one(page)).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeDisabled();
});

for (const [label, value, message] of [
  ["zero rooms", { rooms: [], populatedRoomIds: [] }, /No rooms available/],
  ["zero allocations", { populatedRoomIds: [] }, /2 room\(s\) have no student allocations/],
  ["one empty room", { populatedRoomIds: ["r1"] }, /1 room\(s\) have no student allocations/],
  ["unknown allocations", { populatedRoomIds: null }, /not been checked/],
  ["missing staff", { initialInvigilators: users(["r1"]) }, /still need staff/]
]) {
  test(`${label} cannot publish and explains prerequisites`, async ({ page }) => {
    if (label === "unknown allocations") await page.evaluate(() => window.setStaffingFixture({ populatedRoomIds: undefined }));
    else await patch(page, value);
    await expect(page.getByRole("button", { name: "Publish Exam", exact: true })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: message }).first()).toBeVisible();
    if (label === "zero rooms") {
      await expect(page.getByText("All rooms assigned", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Continue To Review" })).toBeDisabled();
      await expect(page.getByRole("link", { name: "Import roster as a new draft" })).toHaveAttribute("href", "/sessions/new");
    }
  });
}

test("pending save prevents edits and duplicate requests; malformed success never publishes", async ({ page }) => {
  let finish, count = 0, publishes = 0;
  await page.route("**/api/exam-sessions/exam-a/assignments", async (route) => {
    count++;
    await new Promise((resolve) => { finish = resolve; });
    await route.fulfill({ json: { roomAssignments: [] } });
  });
  await page.route("**/api/exam-sessions/exam-a/publish", async (route) => { publishes++; await route.abort(); });
  await two(page).uncheck();
  await page.getByRole("button", { name: "Save & Publish Exam" }).click();
  await expect(one(page)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeDisabled();
  await expect.poll(() => count).toBe(1);
  finish();
  await expect(page.getByText(/committed assignment snapshot is incomplete/)).toBeVisible();
  expect(publishes).toBe(0);
  await expect(two(page)).not.toBeChecked();
});

test("HTTP HTML failure and network failure stay on editor; followed 303 HTML succeeds after save", async ({ page }) => {
  await page.route("**/api/exam-sessions/exam-a/publish", (route) => route.fulfill({ status: 503, contentType: "text/html", body: "Unavailable" }));
  await page.getByRole("button", { name: "Publish Exam", exact: true }).click();
  await expect(page.getByText("Request failed.", { exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  await page.route("**/api/exam-sessions/exam-a/publish", (route) => route.abort());
  await page.getByRole("button", { name: "Publish Exam", exact: true }).click();
  await expect(page.locator(".toast-message")).toContainText(/fetch|network/i);
  const sequence = [];
  await page.route("**/api/exam-sessions/exam-a/assignments", (route) => {
    sequence.push("save");
    return route.fulfill({ json: { roomAssignments: route.request().postDataJSON().roomAssignments } });
  });
  await page.route("**/api/exam-sessions/exam-a/publish", (route) => {
    sequence.push("publish");
    return route.fulfill({ status: 303, headers: { location: "/sessions/exam-a" } });
  });
  await two(page).uncheck();
  await page.getByRole("button", { name: "Save & Publish Exam" }).click();
  await expect(page).toHaveURL(/\/sessions\/exam-a$/);
  expect(sequence).toEqual(["save", "publish"]);
});

test("active remains editable, closed is read-only without publication controls", async ({ page }) => {
  await patch(page, { sessionStatus: "active", mode: "manage" });
  await expect(page.getByRole("button", { name: /Publish Exam/ })).toHaveCount(0);
  await two(page).uncheck();
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  await patch(page, { sessionStatus: "closed" });
  await page.getByRole("button", { name: /R1 Room One/ }).click();
  await expect(one(page)).toBeDisabled();
  await expect(two(page)).toBeChecked();
  await expect(page.getByRole("button", { name: "Save Changes" })).toHaveCount(0);
  await expect(page.getByText("Closed exam assignments")).toBeVisible();
});

for (const phase of ["assignments", "publish"]) {
  test(`scope change during ${phase} cannot publish or navigate the new exam`, async ({ page }) => {
    let finish, calls = 0, subsequentPublishes = 0;
    const path = `**/api/exam-sessions/exam-a/${phase}`;
    await page.route(path, async (route) => {
      calls++;
      await new Promise((resolve) => { finish = resolve; });
      await route.fulfill(phase === "assignments" ? { json: { roomAssignments: route.request().postDataJSON().roomAssignments } } : { contentType: "text/html", body: "Published" });
    });
    if (phase === "assignments") {
      await two(page).uncheck();
      await page.route("**/api/exam-sessions/exam-a/publish", async (route) => { subsequentPublishes++; await route.abort(); });
    }
    await page.getByRole("button", { name: phase === "assignments" ? "Save & Publish Exam" : "Publish Exam", exact: true }).click();
    await expect.poll(() => calls).toBe(1);
    await patch(page, { sessionId: "exam-b", sessionName: "New exam" });
    await expect(page.getByText("New exam is currently draft.")).toBeVisible();
    const response = page.waitForResponse(path);
    finish();
    await (await response).finished();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(subsequentPublishes).toBe(0);
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeDisabled();
  });
}

test("setup labels persist, file guidance and import error are associated; search and creation stay named", async ({ page }) => {
  for (const label of ["Exam name", "Exam date", "Exam start time", "Roster files", "Search invigilators"]) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  await page.getByLabel("Exam name", { exact: true }).fill("Fixture exam");
  await page.getByLabel("Exam date").fill("2026-09-05");
  await page.getByLabel("Exam start time").fill("09:00");
  await page.getByLabel("Roster files").setInputFiles({ name: "fixture.csv", mimeType: "text/csv", buffer: Buffer.from("invalid") });
  await expect(page.getByLabel("Roster files")).toHaveAccessibleDescription(/student_id.*student_name.*room.*zone/);
  await page.route("**/api/exam-sessions/import", (route) => route.fulfill({ status: 400, json: { message: "Missing required columns." } }));
  await page.getByRole("button", { name: "Upload Exam Spreadsheet(s)" }).click();
  await expect(page.getByLabel("Roster files")).toHaveAccessibleDescription(/Missing required columns/);
  await page.getByRole("button", { name: "Add New Invigilator" }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Full name (optional)", { exact: true })).toBeVisible();
  await page.getByLabel("Email address", { exact: true }).fill("existing@example.test");
  await page.route("**/api/invigilators", (route) => route.fulfill({ status: 400, json: { message: "Email address is already in use." } }));
  await page.getByRole("button", { name: "Create & Add To R1" }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveAccessibleDescription(/already in use/);
  await page.getByLabel("Search invigilators").fill("two@");
  await expect(two(page)).toBeVisible();
  await expect(one(page)).toHaveCount(0);
});

for (const width of [390, 768, 899, 900, 910, 1440]) {
  test(`assignment controls fit ${width}px with long content`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await patch(page, { initialInvigilators: [
      { id: "u1", fullName: "LongName".repeat(12), email: `${"long".repeat(20)}@example.test`, role: "invigilator", assignedRoomIds: ["r1", "r2"] }
    ], rooms: [
      { id: "r1", examSessionId: "exam-a", code: "R1", displayName: "LongRoom".repeat(15) },
      { id: "r2", examSessionId: "exam-a", code: "R2", displayName: "Room Two" }
    ] });
    await page.getByRole("button", { name: "Add New Invigilator" }).click();
    await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    for (const control of await page.locator(".assignment-workflow button, .assignment-workflow input").all()) {
      const bounds = await control.boundingBox();
      if (bounds) {
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      }
    }
    await page.getByRole("button", { name: "Continue To Review" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/b2-review-${width}.png`, fullPage: true });
  });
}
