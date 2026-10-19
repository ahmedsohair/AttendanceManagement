import assert from "node:assert/strict";
import test from "node:test";
import { rehearsalRevisions, assertInstalledRehearsalLock } from "../lib/rehearsal-revisions.mjs";

test("private fallback revisions require confirmation and paired overrides", () => {
  assert.throws(() => rehearsalRevisions([]), /Requires/);
  assert.throws(() => rehearsalRevisions(["--confirm-private-rehearsal", "--candidate-ref", "HEAD"]), /both/);
  assert.deepEqual(rehearsalRevisions(["--confirm-private-rehearsal"]), { candidate: "72d8b4e", fallback: "04da701" });
  assert.deepEqual(rehearsalRevisions(["--confirm-private-rehearsal", "--candidate-ref", "HEAD", "--fallback-ref", "abc1234"]),
    { candidate: "HEAD", fallback: "abc1234" });
});

test("private fallback refuses unsafe revisions and unknown arguments", () => {
  for (const ref of ["--help", "a b", "a..b", "https://example.test", "HEAD:package.json", "a;echo", "a".repeat(161)]) {
    assert.throws(() => rehearsalRevisions(["--confirm-private-rehearsal", "--candidate-ref", ref, "--fallback-ref", "HEAD"]));
  }
  assert.throws(() => rehearsalRevisions(["--confirm-private-rehearsal", "--database-url", "synthetic"]));
});

test("fallback lock guard accepts line-ending changes but rejects different dependencies", () => {
  assert.doesNotThrow(() => assertInstalledRehearsalLock('{\r\n"probe":1\r\n}\r\n', '{\n"probe":1\n}\n'));
  assert.throws(() => assertInstalledRehearsalLock('{"version":"patched"}', '{"version":"old"}'), /differs/);
});
