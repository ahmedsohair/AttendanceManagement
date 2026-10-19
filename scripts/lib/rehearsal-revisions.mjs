import assert from "node:assert/strict";
import { parseArgs } from "node:util";

export function rehearsalRevisions(args) {
  const { values } = parseArgs({ args, strict: true, options: {
    "confirm-private-rehearsal": { type: "boolean" },
    "include-operations-drills": { type: "boolean" },
    "candidate-ref": { type: "string" },
    "fallback-ref": { type: "string" }
  } });
  assert(values["confirm-private-rehearsal"], "Requires --confirm-private-rehearsal; synthetic local data only");
  assert(Boolean(values["candidate-ref"]) === Boolean(values["fallback-ref"]), "Supply both --candidate-ref and --fallback-ref");
  const candidate = values["candidate-ref"] || "72d8b4e";
  const fallback = values["fallback-ref"] || "04da701";
  for (const ref of [candidate, fallback]) {
    assert(/^[A-Za-z0-9][A-Za-z0-9_./~-]{0,159}$/.test(ref) && !ref.includes(".."), "Unsafe rehearsal revision");
  }
  return { candidate, fallback };
}

export function assertInstalledRehearsalLock(workingLock, candidateLock) {
  assert.equal(workingLock.replaceAll("\r\n", "\n"), candidateLock.replaceAll("\r\n", "\n"),
    "Working dependency lock differs from the candidate; do not certify a Git export using another release's installed dependencies");
}
