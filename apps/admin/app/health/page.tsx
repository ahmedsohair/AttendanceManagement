import Link from "next/link";
import { requireAdminPageUser } from "@/lib/auth";
import { getOperationsSnapshot } from "@/lib/ops-monitoring";

export const dynamic = "force-dynamic";
export default async function HealthPage() {
  await requireAdminPageUser();
  if (process.env.OPS_MONITORING_ENABLED !== "true") return <section className="card"><h1>Operational health</h1><p>Monitoring is not enabled in this environment. No health assessment is available.</p></section>;
  let data;
  try { data = await getOperationsSnapshot(); }
  catch { return <section className="card"><h1>Operational health unavailable</h1><p>Metrics could not be loaded. This does not mean attendance has stopped. Check your hosting and database dashboards before taking action.</p><a className="button secondary" href="/health">Try again</a></section>; }
  const ms = (n: number | null) => n === null ? "Not observed" : `${n} ms`;
  return <div className="stack">
    <section className="card">
      <div className="inline-actions" style={{ justifyContent: "space-between" }}><h1>Operational health</h1><a className="button secondary" href="/health">Refresh metrics</a></div>
      <p>Last 15 minutes, captured at <time dateTime={data.capturedAt}>{data.capturedAt}</time>. Refresh to update; this is not a continuous connection monitor.</p>
      {(process.env.SCANNER_TELEMETRY_ENABLED !== "true" || (process.env.OPS_HEALTH_SECRET?.length || 0) < 32) && <p role="status">Scanner heartbeat collection is not configured. Scanner and queue totals are incomplete.</p>}
      {data.truncated && <p role="status">High volume: showing the newest 10,000 observations. API rate alerts are suppressed because the window is incomplete.</p>}
      <div className="grid compact-grid">
        {[["Active exams", data.activeCount], ["Scanners seen in 90 seconds", data.recentScanners], ["Pending marks on recent scanners", data.pending], ["Conflicts on recent scanners", data.conflicts]].map(([label, count]) => <div className="card compact-card" key={label}><div>{label}</div><strong className="metric">{count}</strong></div>)}
      </div>
      <p className="subtle">{data.staleScanners} scanners last seen 90 seconds to 24 hours ago. Offline, suspended, opted-out or crashed devices may not report. Pending counts exclude conflicts and are not a complete inventory of offline devices.</p>
      <Link href="/sessions" className="inline-link">Review exams</Link>
    </section>
    <section className="card"><h2>Recent warnings</h2>
      {data.alerts.length ? <ul>{data.alerts.map((key) => <li key={key}>{key.replaceAll("_", " ")}</li>)}</ul> : <p>No thresholds exceeded in available observations. This is not a guarantee of availability.</p>}
      <p>Monitoring query round trip: {ms(data.databaseMs)}. Includes network and pagination, not database execution time alone.</p>
      <p>Alert sending is {process.env.OPS_ALERTS_ENABLED === "true" ? "enabled; requires scheduled checks" : "disabled"}. Provider acceptance does not confirm inbox delivery.</p>
      {data.delivery.map((row) => <p key={row.key}>{row.key.replaceAll("_", " ")}: {row.state} at {row.claimed_at}</p>)}
    </section>
    <section className="card"><h2>API latency and errors</h2>
      <p>Instrumented request completions only. Missing reports are not counted as successes.</p>
      <div style={{ overflowX: "auto" }} tabIndex={0} role="region" aria-label="API metrics table"><table>
        <thead><tr>{["Route / region", "Requests", "p50", "p95", "p99", "5xx", "401 / 403 / 429"].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{data.api.groups.map((g) => <tr key={`${g.route}/${g.method}/${g.region}`}><th scope="row">{g.method} {g.route} / {g.region}</th><td>{g.requests}</td><td>{ms(g.latencyMs.p50)}</td><td>{ms(g.latencyMs.p95)}</td><td>{ms(g.latencyMs.p99)}</td><td>{g.serverErrors} ({(g.serverErrorRate * 100).toFixed(1)}%)</td><td>{g.authenticationFailures} / {g.forbidden} / {g.rateLimited}</td></tr>)}</tbody>
      </table></div>{!data.api.groups.length && <p>No API observations in this window.</p>}
    </section>
    <section className="card"><h2>Scanner observations</h2><p>Sampled client reports, not crash rates. Browser-process termination cannot reliably report an error.</p>
      <div style={{ overflowX: "auto" }} tabIndex={0} role="region" aria-label="Scanner metrics table"><table><thead><tr>{["Operation", "Browser / device", "Samples", "Errors observed", "p95"].map((h) => <th scope="col" key={h}>{h}</th>)}</tr></thead>
        <tbody>{data.scanner.map((g) => <tr key={`${g.event}/${g.browser}/${g.device}`}><th scope="row">{g.event.replaceAll("_", " ")}</th><td>{g.browser} / {g.device}</td><td>{g.samples}</td><td>{g.errors}</td><td>{ms(g.p95)}</td></tr>)}</tbody></table></div>
      {!data.scanner.length && <p>No scanner event observations in this window.</p>}
    </section>
  </div>;
}
