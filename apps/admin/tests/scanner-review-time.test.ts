import assert from "node:assert/strict";
import test from "node:test";
import { formatScannerDuplicateTime } from "../src/lib/audit-time.ts";

test("duplicate time uses Sydney date across midnight and daylight saving transitions", () => {
  for (const [timestamp, date, time] of [
    ["2026-09-04T14:05:00Z", "5/9/26", "12:05"],
    ["2026-10-03T15:59:00Z", "4/10/26", "1:59"],
    ["2026-10-03T16:01:00Z", "4/10/26", "3:01"],
    ["2026-04-04T15:59:00Z", "5/4/26", "2:59"],
    ["2026-04-04T16:01:00Z", "5/4/26", "2:01"]
  ]) {
    const formatted = formatScannerDuplicateTime(timestamp);
    assert.ok(formatted.includes(date), formatted);
    assert.ok(formatted.includes(time), formatted);
    assert.ok(formatted.endsWith("(Australia/Sydney)"));
  }
  for (const invalid of ["", " ", "not-a-date"]) {
    assert.equal(formatScannerDuplicateTime(invalid), "Time unavailable");
  }
});
