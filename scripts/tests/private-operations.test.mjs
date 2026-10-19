import assert from "node:assert/strict";
import test from "node:test";
import { assertPrivateFixtureUrls } from "../rehearse-private-operations.mjs";

test("private operational drills accept only the intended loopback origins", () => {
  assert.doesNotThrow(() => assertPrivateFixtureUrls("http://127.0.0.1:31234", "http://127.0.0.1:31235"));
});

test("private operational drills reject staging and production before any fixture access", () => {
  for (const url of ["https://exampulse.xyz", "https://exampulse-stagings.vercel.app", "https://bjoguceapwquyczbhlyp.supabase.co", "http://localhost:3000", "http://127.0.0.1.example.com"]) {
    assert.throws(() => assertPrivateFixtureUrls("http://127.0.0.1:3000", url), /private loopback/);
  }
});

test("private operational drills reject unsafe schemes, credentials and URL suffixes", () => {
  for (const url of ["file://127.0.0.1", "https://127.0.0.1", "http://user:password@127.0.0.1", "http://127.0.0.1/path", "http://127.0.0.1?target=other", "http://127.0.0.1#fragment"]) {
    assert.throws(() => assertPrivateFixtureUrls(url), /private loopback/);
  }
});
