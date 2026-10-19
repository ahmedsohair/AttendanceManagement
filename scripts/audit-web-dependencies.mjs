import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

export function webAuditOutcome(result) {
  if (result.error) return "unavailable";
  let report;
  try { report = JSON.parse(result.stdout); } catch { return "invalid"; }
  if (report?.error) return "unavailable";
  const counts = report?.metadata?.vulnerabilities;
  const severities = ["info", "low", "moderate", "high", "critical"];
  if (report?.auditReportVersion !== 2 || !counts ||
      ![...severities, "total"].every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0) ||
      counts.total !== severities.reduce((sum, key) => sum + counts[key], 0) ||
      !report.vulnerabilities || typeof report.vulnerabilities !== "object" ||
      Array.isArray(report.vulnerabilities) || Object.keys(report.vulnerabilities).length !== counts.total) {
    return "invalid";
  }
  if (counts.total > 0) return "vulnerable";
  return result.status === 0 ? "pass" : "invalid";
}

function main() {
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error("Run through npm run audit:web.");
  const result = spawnSync(process.execPath, [npm, "audit", "--workspace", "@algo-attendance/admin",
    "--include-workspace-root=false", "--omit=dev", "--json", "--audit-level=low",
    "--fetch-timeout=15000", "--fetch-retries=0"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)), encoding: "utf8",
    timeout: 45000, maxBuffer: 8 * 1024 * 1024, windowsHide: true
  });
  const outcome = webAuditOutcome(result);
  if (outcome !== "pass") throw new Error(`Web production dependency audit blocked: ${outcome}. No findings or transport failures are waived.`);
  console.log("Web production dependency audit passed: zero reported vulnerabilities across all severities.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
