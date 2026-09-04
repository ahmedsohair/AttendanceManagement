import { summarizeTelemetry } from "./telemetry-summary.ts";
import { validateScannerReport } from "./scanner-telemetry.ts";

export function evaluateOperations(input: {
  records: unknown[]; scannerReports: unknown[]; databaseMs: number; bounces: number;
  activeExams: number; truncated: boolean;
}) {
  const api = summarizeTelemetry(input.records);
  const scanner = new Map<string, { event: string; browser: string; device: string; samples: number; errors: number; durations: number[] }>();
  for (const raw of input.scannerReports) {
    const report = validateScannerReport(raw);
    if (!report) continue;
    for (const metric of report.events) {
      const key = `${metric.event}/${report.browser}/${report.device}`;
      const group = scanner.get(key) || { event: metric.event, browser: report.browser, device: report.device, samples: 0, errors: 0, durations: [] };
      group.samples++; group.errors += Number(metric.outcome === "error");
      if (metric.durationMs !== null) group.durations.push(metric.durationMs);
      scanner.set(key, group);
    }
  }
  const alerts: string[] = [];
  const requests = api.groups.reduce((n, g) => n + g.requests, 0);
  const failures = api.groups.reduce((n, g) => n + g.serverErrors, 0);
  if (!input.truncated) {
    if (api.groups.some((g) => g.route === "/api/attendance/mark" && g.requests >= 10 && g.serverErrorRate >= 0.05)) alerts.push("mark_failures");
    if (requests >= 20 && failures / requests >= 0.1) alerts.push("api_failures");
  }
  if (input.databaseMs >= 2000) alerts.push("database_slow");
  if (input.bounces > 0) alerts.push("email_bounces");
  if ([...scanner.values()].some((g) => ["boundary_error", "runtime_error", "unhandled_rejection", "ocr_init"].includes(g.event) && g.errors > 0)) alerts.push("scanner_errors");
  if (input.activeExams > 0 && requests === 0) alerts.push("telemetry_missing");
  return { api, alerts, scanner: [...scanner.values()].map(({ durations, ...group }) => {
    durations.sort((a, b) => a - b);
    return { ...group, p95: durations.length ? durations[Math.ceil(durations.length * 0.95) - 1] : null };
  }) };
}
