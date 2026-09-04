# Phase 8: activation and acceptance

## Live checkpoint: 4 September 2026

- Owner reports the staging migration and seven monitoring variables saved; subsequently enabled staging alerts and redeployed for the controlled test below.
- Runtime commit `e9e41c1` pushed to `hardening/staging`. [GitHub run 33836864576](https://github.com/ahmedsohair/AttendanceManagement/actions/runs/33836864576) passed all checks, including build/tests, temporary migrations, secret scan and the critical dependency gate. GitHub exercised the live OSV fallback successfully after npm timed out.
- [Staging deployment](https://vercel.com/ahmadsohair-1977s-projects/exampulse-stagings/49oLNDGs5heo3qmwyipsjZgVev2T) reported success. No merge to `main` or production promotion performed.
- Live `/scan`: 200. Unauthenticated `/health`: 307 to login. Unauthenticated scanner telemetry: 401. Alert check while disabled: 404.
- Synthetic invigilator sign-in and existing-student lookup: successful (200). Authenticated heartbeat accepted (204), invalid telemetry rejected (422). The temporary test session was signed out. No attendance or incident mark and no email were submitted.
- Owner screenshot captured at `2026-09-04T04:32:32.981Z` confirms persisted lookup/admin-login metrics and the earlier heartbeat on `/health`. The heartbeat is correctly shown as older than 90 seconds, rather than currently active. One request per route is insufficient for performance conclusions.
- Controlled alert test: after activation, an unauthenticated check returned 401. One synthetic `boundary_error` report was accepted at `2026-09-04T04:46:10.961Z` (204); the temporary synthetic login session was signed out. Owner supplied check results: first `checked / accepted=1 / unknown=0 / suppressed=0`; second `checked / accepted=0 / unknown=0 / suppressed=1`. Owner confirmed receipt at `ahmad.sohair@gmail.com`. Live inbox delivery and immediate repeat suppression passed; this does not test sending again after cooldown expiry. No attendance records were changed.
- **Next:** establish scheduled checks and independent failure notification. Performance comparison, runbook drills and deferred physical-device acceptance remain outstanding.
- Follow-up: the monitoring-enabled 1,200-lookup test passed with zero failures (concurrent p95 440 ms, sequential p95 433 ms). Existing 70 web tests, three new persistence-boundary tests, three scheduler-process tests and type-check passed. See `PHASE_8_REMAINING_ACCEPTANCE.md` for historical baseline, test limitations and the exact external-access blockers. GitHub was inspected: no scheduler secret/enablement variable and no workflow on `main`; no scheduled operation is being claimed.

Earlier sections below describe the original local implementation boundaries; this checkpoint records subsequent staging progress.

## Implementation and safety boundaries

Local implementation now includes a protected `/health` page, bounded service-only operational storage, authenticated scanner heartbeats, API completion timing, sampled client errors/OCR timings, and a protected alert check with a shared 15-minute per-category cooldown. Monitoring is disabled by default. No production migration, deployment, account change, or real alert was performed during implementation.

API metrics cover business route handlers, not middleware rejections, server actions, framework failures before handler entry, browser-process termination, or hosting outages. Streaming export timing measures response creation, not download completion. Client events are sampled, not a crash-rate denominator. Request IDs correlate application logs and stored request observations; this does not add request-level PostgreSQL query tracing.

Diagnostic writes are scheduled using Next.js `after`, outside the attendance response path, with a three-second deadline. They are lossy, not attendance evidence. Storage failure does not fail attendance. They still consume database and hosting resources: measure the overhead on staging before enabling for an exam.

Stored diagnostics exclude student details, credentials, request bodies, raw errors and raw device/user identifiers. Heartbeats use a server-secret HMAC of user/device; counts refer to that browser's signed-in-user queue. Never interpret them as an inventory of unreachable devices. Events are capped at approximately 20,000 rows and pruned beyond 48 hours on ingestion; scanner rows are capped at 1,000 and pruned beyond 24 hours on ingestion. Idle databases retain expired rows until another ingestion. Payload cap: 10 KB. Access: service role only, with RLS; admins access the page through server authorization.

## Staging activation order

1. Keep production unchanged. Obtain a passing release gate for the intended staging commit before deployment. `npm run audit:dependencies` now uses native npm with a fresh, fail-closed OSV audit only on service/network failure; see `DEPENDENCY_AUDIT.md`. Neither network timeouts nor invalid reports count as a security pass.
2. Apply the additive migration with the existing staging-only database connection variable:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\apply-operational-monitoring-staging.ps1 -ConfirmStagingMigration
```

3. In **exampulse-stagings** only, add these environment variables. Values apply to that project's Production deployment environment, which serves the staging domain.

| Variable | Value | Type |
| --- | --- | --- |
| `OPS_MONITORING_ENABLED` | `true` | Config |
| `SCANNER_TELEMETRY_ENABLED` | `true` | Config |
| `NEXT_PUBLIC_SCANNER_TELEMETRY_ENABLED` | `true` | Config; rebuild required |
| `OPS_HEALTH_SECRET` | Independently generated random secret, 32+ characters | Secret |
| `OPS_CHECK_SECRET` | Different random secret, 32+ characters | Secret |
| `OPS_ALERTS_ENABLED` | Initially `false`, then `true` for acceptance | Config |
| `OPS_ALERT_EMAIL` | `ahmad.sohair@gmail.com` | Config or Secret |

Reuse the staging project's `RESEND_API_KEY` and verified `EMAIL_FROM`, not production keys. The operations sender uses Resend, not the optional SMTP fallback. Do not paste secrets into chat or Git. Generate secrets locally using a password manager. No admin password, invigilator code or database password is used as a monitoring secret.

4. Deploy the approved commit to staging. Open `/health` as the staging administrator. Confirm it cannot be accessed as an invigilator or without authentication. With flags off it must say disabled, not healthy. A missing migration/database failure must show unavailable, not zero errors.
5. Sign into a synthetic invigilator account, perform lookup/mark, and leave the scanner open for 60 seconds. Verify route latency appears and a recent scanner appears. Confirm pending/conflict counts against that device's queue. Close/background the device: after 90 seconds it must no longer contribute to recent-device totals. Two tabs using the same browser/user should share one heartbeat key.
6. Enable alerts and set the matching `OPS_CHECK_SECRET` in the shell. Run a check:

```powershell
$env:OPS_CHECK_URL = 'https://exampulse-stagings.vercel.app/api/operations/check'
node .\scripts\check-staging-operations.mjs
Remove-Item Env:OPS_CHECK_SECRET -ErrorAction SilentlyContinue
```

7. Configure scheduled checks only after the one-off check passes. The provided GitHub workflow is opt-in via repository variable `STAGING_OPS_CHECK_ENABLED=true` and secret `STAGING_OPS_CHECK_SECRET`. Schedules run only from the default branch and can be delayed; an unmerged staging-branch workflow is not an active scheduler. Verify actual successive runs, and enable GitHub failure notifications. For exam-day availability monitoring, use an independently scheduled uptime service that supports a secret POST header and alarms on failed/missing checks; GitHub schedules alone are not a precise five-minute SLA. Never disable Vercel deployment protection to make the scheduler work; configure its approved bypass mechanism separately if required.

## Controlled alert acceptance

Use synthetic telemetry only; do not break attendance, disable the database, or deliberately generate student errors.

- In a signed-in staging scanner browser console, submit one synthetic event to the existing authenticated receiver:

```javascript
await fetch('/api/telemetry/scanner', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ version: 1, browser: 'other', device: 'other',
    events: [{ event: 'boundary_error', outcome: 'error', durationMs: null }] })
});
```

- Run the protected check. Confirm `scanner errors` appears on Health and an alert reaches `ahmad.sohair@gmail.com`, including checking junk. Provider `accepted` alone does not meet inbox acceptance.
- Run the check again inside 15 minutes; the same category must be suppressed. Another independent category can still alert. Persistent conditions can alert again after cooldown; this is intentional.
- Verify invalid/missing scheduler authorization returns 401 with no email. Flag off returns 404. Invalid provider configuration or failed metric queries must not report success. An ambiguous provider send is recorded `unknown` and is not retried inside the cooldown.
- Record deployment SHA, UTC timestamp, check outcome, inbox confirmation and cooldown evidence without secrets. Synthetic observations expire from the 15-minute view; no business-record cleanup is needed.

Thresholds: mark 5xx >=5% with at least 10 observations in a route/region group; overall API 5xx >=10% with at least 20 observations; monitoring-query round trip >=2 seconds; at least one recent bounce/complaint; sampled boundary/runtime/rejection/OCR-init error; or active exams with no observed API requests. Quiet active exams may trigger missing telemetry without an outage. API rate alerts are suppressed when the 10,000-row dashboard window is truncated. Fatal function/hosting failures need independent uptime monitoring because this application cannot alert while unavailable.

## Rollback and completion

Disable `OPS_ALERTS_ENABLED` and the external scheduler first, then `OPS_MONITORING_ENABLED` and `SCANNER_TELEMETRY_ENABLED`. Rebuild with the public client flag off to stop reporting from new clients. Existing clients receive a harmless 404; no attendance outbox retry is created. Leave additive tables in place; do not drop business tables or revert attendance migrations. Confirm normal lookup/mark and queue behavior.

Phase 8 is **not operationally signed off** until the staging migration, live page/authorization/heartbeat checks, alert inbox/cooldown evidence, scheduler failure notification, resource comparison, and runbook rehearsals are recorded. Physical iPhone/Android testing remains owner-deferred. Refer to `EXAM_DAY_RUNBOOKS.md` for scenario-specific remaining drills, particularly existing-session containment after a code compromise. A passing local suite cannot substitute for these external checks.
