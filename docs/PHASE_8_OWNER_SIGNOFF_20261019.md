# Phase 8 owner acceptance - 19 October 2026

## Boundary

This is the remaining operator checklist, not a new hardening phase or production
promotion authorization. The owner confirmed the external scheduler is still
pending on 19 October. Physical iPhone/Android acceptance remains deferred, not
passed. Technical drill results belong in `PHASE_8_REMAINING_ACCEPTANCE.md`;
unit tests and private services cannot sign off external dashboards or
institutional procedure.

Staging means Vercel project **exampulse-stagings**, serving
`https://exampulse-stagings.vercel.app`, with Supabase **bjoguceapwquyczbhlyp**.
That Vercel project's **Production environment** still serves staging, not the
real production app. Real production remains `https://exampulse.xyz`, Supabase
**mtoyhpyxqhfwhcrysqon**. Do not swap their variables or restore synthetic data
into either hosted database.

## 1. Schedule and verify the staging monitor

Owner action in [cron-job.org Console](https://console.cron-job.org/):

- Use the owner's verified account email; intended recipient is
  `ahmad.sohair@gmail.com`.
- Create one job named `ExamPulse staging operations`.
- URL: `https://exampulse-stagings.vercel.app/api/operations/check`.
- Method: **POST**; empty request body; every **5 minutes**.
- Set custom header **Authorization** to **Bearer** followed by one space and
  the existing saved **staging OPS_CHECK_SECRET**. Do not include quotes, place
  it in the URL, use a Supabase key, or paste it in chat.
- Enable failure notification after the first failure, recovery notification,
  and notification if the provider disables the job. Turn off saved response
  bodies if the UI offers it. No public status page.
- Keep Vercel protection intact. If it blocks this request, record its status
  and stop; do not disable protection or guess a bypass credential.

Acceptance: record two successive **scheduled**, not only manual, executions
with UTC timestamps and HTTP 200. The operations endpoint returns 401 for wrong
authorization, 404 when disabled, 502 for uncertain alert delivery and 503 for
configuration/monitoring failure. Investigate those statuses; do not relabel
them successful. Record only job ID, timestamps, status and duration, never
headers or secret-bearing screenshots.

The [provider FAQ](https://cron-job.org/en/faq/) documents free service, custom
headers, POST methods, notifications, a 30-second execution bound and possible
schedule delays/automatic disablement. It also says its requests do not verify
TLS certificates: this job is not proof of correct TLS/certificate monitoring
or a five-minute SLA. Review job history for missing runs; a provider cannot
reliably notify about its own complete outage.

## 2. Verify independent failure and recovery email

Do not alter the working job. Make a temporary, clearly named notification-test
job against the same staging endpoint, with an intentionally invalid dummy
Authorization header, every minute. Enable first-failure/recovery notification.
It must return 401 without invoking application alert delivery.

Wait for a scheduled failure and confirm the **scheduler's** failure email
arrives. Then point only the temporary job at
`https://exampulse-stagings.vercel.app/scan`, remove its dummy header, and wait
for a scheduled 200 and the provider recovery email. This avoids a second real
operations checker. Remove the temporary job afterward; retain the real job.
If deployment protection prevents 200, stop rather than weaken protection.

Evidence: failure/recovery UTC timestamps, HTTP statuses and owner inbox
confirmation. Previously received ExamPulse alert email is not this independent
provider-notification test. No student data or production failure is needed.

## 3. Resource acceptance

Owner/dashboard access is needed for Vercel function duration/errors and
Supabase CPU/connections. The historical monitoring-enabled load test passed;
client RSS and application round-trip time do not measure provider resource use.

Choose a quiet staging window. Capture provider graphs/timestamps around the
existing read-only 1,000-lookup/20-worker plus 200-sequential-lookup test. To
establish causal monitoring overhead, compare matched monitoring-on/off runs
on staging only, with the same deployed application/workload and documented
flags. No production toggle or new attendance fixture is necessary. Any public
client flag change needs a rebuild; do not assume toggling a server flag changes
already-open clients. Coordinate the real scheduler during an intentionally
disabled-monitor test so expected 404s are not mistaken for an incident.

Record errors/timeouts, latency percentiles, CPU/connection saturation and
function durations. The owner must either accept evidence-based resource
behavior or explicitly defer the controlled comparison with a recorded release
risk. No numerical CPU/connection budget is invented by this checklist.

## 4. Private hosted-recovery inventory and fallback target

Confirm privately, without showing values to the agent:

- Account recovery/MFA and dashboard access for GitHub, Vercel, Supabase and
  Resend; restricted locations for the verified backup and saved credentials.
- Environment variable names, target project/environment, region and domains;
  working secret values in the owner's password manager, not repository files.
- Supabase Auth site URL/redirect allowlist, enabled providers and their secret
  references, signup/email settings, Auth hooks if any, and intended JWT/session
  behavior. Logical database dumps do not restore this project configuration.
- Resend sender-domain/DNS configuration, API-key/webhook references, and the
  independent monitoring job. No secret rotation or DNS change is implied.
- Recovery decision for sessions when signing keys/project identity cannot be
  retained: require reauthentication and preserve unresolved browser queues.
  Do not promise existing tokens will survive a new-project restore or require
  exporting managed private signing keys as a prerequisite.

Local compatible fallback is
`04da701a5caecc90c84b74ce29d5ee5beda9dca0`; it is not the old production `main`.
Public GitHub status inspection on 19 October found successful Vercel checks:

- [Staging deployment BvnDyeRsZuTKMi1tkTdsgAPSmtG9](https://vercel.com/ahmadsohair-1977s-projects/exampulse-stagings/BvnDyeRsZuTKMi1tkTdsgAPSmtG9).
- [Attendance project deployment A4y5fYvWjZVS7sUXoDH167PD5Yed](https://vercel.com/ahmadsohair-1977s-projects/attendance-management-admin/A4y5fYvWjZVS7sUXoDH167PD5Yed).

Those are **discovery candidates only**. A GitHub success status does not verify
retention, current alias, deployment environment or database configuration.
Inspect and retain/select the correct target deployment before a release;
do not promote either link merely because it is listed. An application rollback
must not undo database migrations, audit history or newer attendance writes.

## 5. Operator procedure and release decision

Review `EXAM_DAY_RUNBOOKS.md` with the institutional owner/room leader. Approve
where paper fallback records live, who checks identity/exceptions, who compares
student-ID sets and queued/committed marks, and how unresolved post-closure
items are retained/escalated. Synthetic reconciliation does not replace this
approval or authorize backdated SQL edits.

Record whether physical phone tests and any remaining hosted drill are completed
or explicitly deferred, with reason/owner. Review dependency triage and make
any required risk decision; a passing critical-only dependency gate is not
acceptance of all high/moderate findings. No checkbox here authorizes production
migrations or promotion. Those require a separate agreed release window,
fresh-enough backup, target verification and post-deploy smoke checks.

## Evidence reply format

Only report items actually completed. No secrets or student data:

```text
Scheduler: job ID; two scheduled UTC timestamps; status/duration
Independent notification: failure email received; recovery email received; test job removed
Resources: dashboard time window and workload; accepted / explicitly deferred with reason
Recovery inventory: stored privately and verified; any missing configuration
Fallback: project, deployment ID, commit, environment/backend verified
Institutional procedure: approving owner/date; unresolved items retained
Physical devices: passed with device/OS/browser, or still deferred
Dependency risk: accepted decisions / required fixes, with owner/date
```
