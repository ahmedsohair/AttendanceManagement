import { expect, test } from "@playwright/test";

const examSessionId = "10000000-0000-4000-8000-000000000001";
const roomId = "20000000-0000-4000-8000-000000000001";
const allocationId = "70000000-0000-4000-8000-000000000001";

function lookupResult(studentId, status = "ready_to_mark") {
  if (status === "student_not_found") {
    return {
      status,
      examSessionId,
      studentId,
      message: "Student was not found in this exam session."
    };
  }
  return {
    status,
    examSessionId,
    studentId,
    message: "Student is in the correct room.",
    allocation: {
      id: allocationId,
      examSessionId,
      studentId,
      studentName: "Browser Test Student",
      roomId,
      zone: "Zone A"
    }
  };
}

async function prepareScanner(page, { abortOcrModels = true } = {}) {
  if (abortOcrModels) {
    await page.route(/paddle-model-ecology|cdn\.jsdelivr\.net.*onnxruntime/, (route) => route.abort());
  }
  await page.goto("/scan");
  await expect(page.getByRole("heading", { name: "Choose Room" })).toBeVisible();
}

async function selectFirstRoom(page) {
  await page.getByRole("button", { name: /TEST-01/ }).click();
  await expect(page.getByRole("heading", { name: "TEST-01" })).toBeVisible();
}

test("restores access-code login and assigned rooms", async ({ page }) => {
  await prepareScanner(page);
  await expect(page.getByText("Test Invigilator 01")).toBeVisible();
  await expect(page.getByRole("button", { name: /TEST-01/ })).toBeVisible();
});

test("manually looks up and marks a student without a real write", async ({ page }) => {
  let markedStudentId = "";
  await page.route("**/api/attendance/lookup", async (route) => {
    const request = route.request().postDataJSON();
    await route.fulfill({ json: { result: lookupResult(request.studentId) } });
  });
  await page.route("**/api/attendance/mark", async (route) => {
    const request = route.request().postDataJSON();
    markedStudentId = request.studentId;
    await route.fulfill({
      json: {
        event: {
          id: "71000000-0000-4000-8000-000000000001",
          roomMismatch: false,
          createdAt: new Date().toISOString()
        },
        result: lookupResult(request.studentId)
      }
    });
  });

  await prepareScanner(page);
  await selectFirstRoom(page);
  await page.getByPlaceholder("Manual student number").fill("9000990");
  await page.getByRole("button", { name: "Lookup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready to mark" })).toBeVisible();
  await page.getByRole("button", { name: "Mark Present" }).click();
  await expect(page.getByRole("heading", { name: "Ready to mark" })).toBeHidden();
  await expect.poll(() => markedStudentId).toBe("9000990");
});

test("edits a misread student number and looks it up again", async ({ page }) => {
  await page.route("**/api/attendance/lookup", async (route) => {
    const request = route.request().postDataJSON();
    const status = request.studentId === "9000990" ? "ready_to_mark" : "student_not_found";
    await route.fulfill({ json: { result: lookupResult(request.studentId, status) } });
  });

  await prepareScanner(page);
  await selectFirstRoom(page);
  await page.getByPlaceholder("Manual student number").fill("9000998");
  await page.getByRole("button", { name: "Lookup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Student not found" })).toBeVisible();
  await page.getByPlaceholder("Student number", { exact: true }).fill("9000990");
  await page.getByRole("button", { name: "Lookup Edited ID" }).click();
  await expect(page.getByRole("heading", { name: "Ready to mark" })).toBeVisible();
});

test("reports denied camera access while manual controls remain available", async ({ page, context }) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Camera permission denied by test.", "NotAllowedError");
    };
  });
  await prepareScanner(page);
  await selectFirstRoom(page);
  await expect(page.getByText(/permission|denied|not allowed/i)).toBeVisible();
  await expect(page.getByPlaceholder("Manual student number")).toBeVisible();
});

test("times out a stalled OCR model load without blocking manual entry", async ({ page }) => {
  test.setTimeout(60_000);
  await page.route("https://paddle-model-ecology.bj.bcebos.com/**", () => new Promise(() => {}));
  await prepareScanner(page, { abortOcrModels: false });
  await selectFirstRoom(page);
  await expect(page.getByText(/OCR loading timed out/i)).toBeVisible({ timeout: 50_000 });
  await expect(page.getByPlaceholder("Manual student number")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry OCR Load" })).toBeVisible();
});

test("recovers scanner state after browser back", async ({ page }) => {
  await page.route("**/api/attendance/lookup", (route) =>
    route.fulfill({ json: { result: lookupResult("9000998", "student_not_found") } })
  );
  await prepareScanner(page);
  await selectFirstRoom(page);

  await page.getByPlaceholder("Manual student number").fill("9000998");
  await page.getByRole("button", { name: "Lookup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Student not found" })).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.getByRole("heading", { name: "Student not found" })).toBeHidden();
  await expect(page.getByPlaceholder("Manual student number")).toBeVisible();

  await page.waitForTimeout(500);
  await page.evaluate(() => history.back());
  await expect(page.getByRole("heading", { name: "Choose Room" })).toBeVisible();
  await expect(page).toHaveURL(/\/scan$/);
});

test("shows offline state and reconnects", async ({ page, context }) => {
  await prepareScanner(page);
  await selectFirstRoom(page);
  await context.setOffline(true);
  await expect(page.getByText("Device offline")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/Checking backend|Backend connected/)).toBeVisible();
});
