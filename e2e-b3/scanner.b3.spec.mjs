import { expect, test } from "@playwright/test";

const room = { id: "room-a", examSessionId: "exam", code: "TEST-A" };

function result(studentId, status = "ready_to_mark") {
  return {
    studentId,
    examSessionId: "exam",
    status,
    allocation: { studentId, studentName: "Synthetic Student", zone: "D", roomId: room.id },
    expectedRoom: { code: "TEST-B" },
    attendance: { createdAt: "2026-09-04T14:05:00Z" }
  };
}

async function fixture(page, { signedOut = false } = {}) {
  const state = {
    accessLoginCalls: 0,
    authTokenCalls: 0,
    lookups: [],
    writes: [],
    signedIn: !signedOut,
    authStatus: 200,
    lookup: (id) => result(id),
    mark: () => ({ event: { id: "event", roomMismatch: false } }),
    markStatus: 200
  };

  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new Error("Camera mocked for B3");
    };
  });

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3111") {
      return route.abort();
    }

    if (url.pathname.startsWith("/mock-supabase/auth/v1/")) {
      if (url.pathname.endsWith("/logout")) {
        return route.fulfill({ status: 204, body: "" });
      }
      if (url.pathname.endsWith("/token")) {
        state.authTokenCalls += 1;
        state.signedIn = true;
        return route.fulfill({
          status: 200,
          json: {
            access_token: "b3-fixture-access-token",
            refresh_token: "b3-fixture-refresh-token",
            expires_in: 3600,
            token_type: "bearer",
            user: { id: "mock-user", aud: "authenticated", role: "authenticated" }
          }
        });
      }
      return route.fulfill({ status: 404, json: { message: "Unexpected auth fixture request." } });
    }

    if (!url.pathname.startsWith("/api/")) {
      return route.continue();
    }

    if (url.pathname === "/api/auth/me") {
      if (!state.signedIn || state.authStatus !== 200) {
        return route.fulfill({ status: 401, json: { message: "Unauthorized" } });
      }
      return route.fulfill({
        status: 200,
        json: { user: { id: "mock-user", role: "invigilator", fullName: "Synthetic Invigilator" } }
      });
    }
    if (url.pathname === "/api/mobile/access-login") {
      state.accessLoginCalls += 1;
      return route.fulfill({ status: 200, json: { email: "synthetic@example.test" } });
    }
    if (url.pathname === "/api/mobile/my-rooms") {
      return route.fulfill({ status: 200, json: { rooms: [room] } });
    }
    if (url.pathname.includes("/live")) {
      return route.fulfill({ status: 200, json: { recentAttendance: [], recentIncidents: [] } });
    }
    if (url.pathname === "/api/attendance/lookup") {
      if (state.authStatus !== 200) {
        return route.fulfill({ status: state.authStatus, json: { message: "Unauthorized" } });
      }
      const request = route.request().postDataJSON();
      state.lookups.push(request);
      return route.fulfill({ status: 200, json: { result: await state.lookup(request.studentId) } });
    }
    if (url.pathname === "/api/attendance/mark") {
      const request = route.request().postDataJSON();
      state.writes.push(request);
      return route.fulfill({
        status: state.markStatus,
        json: await state.mark(request)
      });
    }

    throw new Error(`Unexpected API: ${url.pathname}`);
  });

  await page.goto("/scan");
  return state;
}

async function openScanner(page, state = {}) {
  const fixtureState = await fixture(page, state);
  await page.getByRole("button", { name: /TEST-A/ }).click();
  await expect(page.getByText("Camera mocked for B3")).toBeVisible();
  return fixtureState;
}

async function lookup(page, id) {
  await page.getByLabel("Student number", { exact: true }).first().fill(id);
  await page.getByLabel("Student number", { exact: true }).first().press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Checking student..." })).toHaveCount(0);
}

const review = (page) => page.getByRole("dialog");

test("initial 401 stays neutral and login Enter submits access once", async ({ page }) => {
  const state = await fixture(page, { signedOut: true });
  await expect(page.getByLabel("Access code", { exact: true })).toBeVisible();
  await expect(page.getByText(/expired/i)).toHaveCount(0);

  await page.getByLabel("Access code", { exact: true }).fill("AMS-1234-5678");
  await page.getByLabel("Access code", { exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Choose Room" })).toBeVisible();
  expect(state.accessLoginCalls).toBe(1);
  expect(state.authTokenCalls).toBe(1);
});

test("manual and edited lookup Enter submit once; comment Enter remains a newline", async ({ page }) => {
  const state = await openScanner(page);
  await page.getByLabel("Student number", { exact: true }).first().fill("9000991");
  await page.getByLabel("Student number", { exact: true }).first().press("Enter");
  await expect.poll(() => state.lookups.length).toBe(1);
  await expect(review(page).getByLabel("Student number", { exact: true })).toHaveValue("9000991");

  await review(page).getByLabel("Comment (optional)", { exact: true }).fill("First line");
  await review(page).getByLabel("Comment (optional)", { exact: true }).press("Enter");
  await expect(review(page).getByLabel("Comment (optional)", { exact: true })).toHaveValue("First line\n");
  expect(state.lookups).toHaveLength(1);

  await review(page).getByLabel("Student number", { exact: true }).fill("9000992");
  await review(page).getByLabel("Student number", { exact: true }).press("Enter");
  await expect.poll(() => state.lookups.length).toBe(2);
  expect(state.lookups[1].studentId).toBe("9000992");
});

test("each review outcome exposes its own accessible dialog name", async ({ page }) => {
  const state = await openScanner(page);
  const outcomes = [
    ["ready_to_mark", "Ready to mark"],
    ["wrong_room", "Wrong room detected"],
    ["already_marked", "Already marked"],
    ["student_not_found", "Student not found"]
  ];

  for (const [status, heading] of outcomes) {
    state.lookup = (id) => {
      const value = result(id, status);
      if (status === "student_not_found") delete value.allocation;
      return value;
    };
    await lookup(page, "9000991");
    await expect(page.getByRole("dialog", { name: heading })).toBeVisible();
    if (status === "already_marked" || status === "student_not_found") {
      await review(page).getByRole("button", { name: "Continue Scan" }).click();
    } else {
      await review(page).getByRole("button", { name: "Cancel review" }).click();
    }
    await expect(review(page)).toHaveCount(0);
  }
});

test("native review dialog names every state, contains focus, and restores manual focus on cancel", async ({ page }) => {
  const state = await openScanner(page);
  await lookup(page, "9000991");

  await expect(review(page)).toHaveAttribute("aria-labelledby", "scanner-review-title");
  await expect(review(page)).toHaveAttribute("aria-describedby", "scanner-review-context");
  expect(await review(page).evaluate((dialog) => dialog.matches(":modal"))).toBe(true);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("scanner-review-title");

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press(index % 2 ? "Shift+Tab" : "Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("dialog") !== null)).toBe(true);
  }

  await review(page).getByRole("button", { name: "Cancel review" }).click();
  await expect(review(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("scanner-manual-student-id");
  await expect(page.getByText("Scan cancelled. Continue with the next student.")).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test("Escape and browser Back use one cancellation path and stale lookup cannot reopen review", async ({ page }) => {
  const state = await openScanner(page);
  let release;
  state.lookup = (id) => new Promise((resolve) => {
    release = () => resolve(result(id));
  });

  await page.getByLabel("Student number", { exact: true }).first().fill("9000991");
  await page.getByLabel("Student number", { exact: true }).first().press("Enter");
  await expect(review(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(review(page)).toHaveCount(0);
  release();
  await page.waitForTimeout(50);
  expect(state.lookups).toHaveLength(1);

  state.lookup = (id) => result(id);
  await lookup(page, "9000992");
  await page.evaluate(() => window.history.back());
  await expect(review(page)).toHaveCount(0);
  await expect(page.getByText("Scan cancelled. Continue with the next student.")).toBeVisible();
  expect(await page.getByText("Scan cancelled. Continue with the next student.", { exact: true }).count()).toBe(1);
});

test("Escape and Cancel review wait while a submitted mark is in flight", async ({ page }) => {
  const state = await openScanner(page);
  let release;
  state.mark = () => new Promise((resolve) => {
    release = () => resolve({ event: { id: "event", roomMismatch: false } });
  });

  await lookup(page, "9000991");
  await review(page).getByRole("button", { name: "Mark Present", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  await review(page).getByRole("button", { name: "Cancel review" }).click();
  await expect(review(page)).toBeVisible();
  await expect(page.getByText("Attendance is still being submitted. Please wait.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(review(page)).toBeVisible();
  expect(state.writes).toHaveLength(1);

  release();
  await expect(page.getByText("Attendance marked.")).toBeVisible();
  await expect(review(page)).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
});

test("later 401 explains established-session expiry instead of looking signed out", async ({ page }) => {
  const state = await openScanner(page);
  state.authStatus = 401;
  await page.getByLabel("Student number", { exact: true }).first().fill("9000991");
  await page.getByLabel("Student number", { exact: true }).first().press("Enter");
  await expect(page.getByRole("heading", { name: "Invigilator Web Login" })).toBeVisible();
  await expect(page.getByText("Your invigilator session has expired. Sign in again to continue.")).toBeVisible();
});
