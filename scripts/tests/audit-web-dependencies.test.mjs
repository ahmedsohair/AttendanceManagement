import assert from "node:assert/strict";
import test from "node:test";
import { webAuditOutcome } from "../audit-web-dependencies.mjs";

function result(severity, status = severity ? 1 : 0) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: severity ? 1 : 0 };
  if (severity) counts[severity] = 1;
  return { status, stdout: JSON.stringify({ auditReportVersion: 2,
    metadata: { vulnerabilities: counts }, vulnerabilities: severity ? { synthetic: { severity } } : {} }) };
}

test("web audit accepts only a successful zero-finding report", () => {
  assert.equal(webAuditOutcome(result()), "pass");
  assert.equal(webAuditOutcome(result(undefined, 1)), "invalid");
  assert.equal(webAuditOutcome(result(undefined, null)), "invalid");
});

test("web audit blocks every severity, even when the subprocess claims success", () => {
  for (const severity of ["info", "low", "moderate", "high", "critical"]) {
    assert.equal(webAuditOutcome(result(severity)), "vulnerable");
    assert.equal(webAuditOutcome(result(severity, 0)), "vulnerable");
  }
});

test("web audit fails closed on unavailable services, timeouts and invalid JSON", () => {
  assert.equal(webAuditOutcome({ error: { code: "ETIMEDOUT" } }), "unavailable");
  assert.equal(webAuditOutcome({ status: 1, stdout: '{"error":{"code":"E503"}}' }), "unavailable");
  assert.equal(webAuditOutcome({ status: 0, stdout: "not-json" }), "invalid");
  assert.equal(webAuditOutcome({ status: 0, stdout: "{}" }), "invalid");
});

test("web audit rejects incomplete, inconsistent and malformed report counts", () => {
  for (const mutate of [
    report => { delete report.metadata.vulnerabilities.high; },
    report => { report.metadata.vulnerabilities.high = -1; },
    report => { report.metadata.vulnerabilities.high = "0"; },
    report => { report.metadata.vulnerabilities.total = 1; },
    report => { report.vulnerabilities = []; },
    report => { report.vulnerabilities = { hidden: {} }; },
    report => { report.auditReportVersion = 1; }
  ]) {
    const report = JSON.parse(result().stdout);
    mutate(report);
    assert.equal(webAuditOutcome({ status: 0, stdout: JSON.stringify(report) }), "invalid");
  }
});
