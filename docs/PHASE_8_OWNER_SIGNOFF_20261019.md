# Phase 8 owner acceptance - 19 October 2026

## Boundary

The owner clarified that the exam is next week and travel starts the day after
tomorrow. No one is recording attendance today and the upcoming roster is not
yet in production. Controlled release preparation is recorded in
[PRODUCTION_CUTOVER_20261019.md](PRODUCTION_CUTOVER_20261019.md); this clarification
does not waive the remaining gates or authorize a particular production mutation.
The fresh cutover backup `production-20261019-150032` is now independently
checksummed and matches all 38 dumped tables' columns/row multisets from the
rehearsed backup. See the cutover report for the comparison scope and the later
successful production migration; application deployment remains separate.
The owner subsequently supplied a live production relational-integrity result
with total and all ten categories zero. They explicitly instructed rollout with
iPhone and memory/capacity checks as non-blocking, unverified follow-ups, while
requiring dependency findings fixed before public release. No security exception
was accepted; this supersedes the earlier absence of a device/capacity decision.
The authorized web fixes are now in `947db8a` with zero reported web production
vulnerabilities and passing local clean-install/build/type-check, 106 web tests
and a secret scan. Hosted CI and both Vercel branch deployments subsequently
passed for `01bdd3b`, as did the patched private fallback and guarded-upgrade
rehearsals. The owner subsequently reported the successful guarded production
database commit (20 migrations, original records preserved, precommit and audit
checks passed). Production release `d869264` has now been independently verified
Ready/Current at `exampulse.xyz`; public authorization and authenticated checker
smoke tests passed. Canonical-domain admin sign-in/reload, read-only history and
Health also passed. Production cron job `8675994` is enabled every 15 minutes;
its external manual test returned 200/checked and failure/recovery notifications
are configured. Automatic production run history, controlled attendance/write
workflows and actual delivery/webhook checks remain pending, not inferred from
deployment or a manual scheduler test.

This is the remaining operator checklist, not a new hardening phase or production
promotion authorization. The owner configured an external scheduler and reported
a successful manual test on 19 October. Independent failure/recovery emails
are now owner-confirmed, as is removal of the temporary notification-test job.
Physical iPhone/Android acceptance remains deferred, not
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

The owner agreed to a quota-conscious cadence on 19 October: every 15 minutes
normally, increased to every 5 minutes during exams. The owner subsequently
reported signing in, configuring the job and obtaining a successful manual test.
The owner replied "all good" after the request to verify two automatic runs;
their exact timestamps/job ID have not been supplied. Independent notification
acceptance is recorded below; the owner also confirmed temporary-job removal.

One environment produces 2,880 scheduled checks per 30 days at 15-minute
intervals, or 8,640 at 5-minute intervals, excluding retries and temporary tests.
Each check consumes hosting execution and downstream database resources; these
counts are not the total database request count or a measured overhead budget.
Checks do not create deployments or add deployment storage.

Owner action in [cron-job.org Console](https://console.cron-job.org/):

- Use the owner's verified account email; intended recipient is
  `ahmad.sohair@gmail.com`.
- Create one job named `ExamPulse staging operations`.
- URL: `https://exampulse-stagings.vercel.app/api/operations/check`.
- Method: **POST**; empty request body; every **15 minutes** normally. Change the
  same job to every **5 minutes** during exams; restore 15 minutes afterward.
  Do not create a duplicate operations-check job for the faster cadence.
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

Owner-reported manual test evidence: 2026-10-19T03:29:09Z, HTTP 200,
`{"status":"checked","accepted":0,"unknown":0,"suppressed":0}`,
request ID `eae35761-53b7-478c-b0d1-345b32d43ed7` and matched path
`/api/operations/check`. This confirms the manual request passed authentication
and completed the check without an alert send or suppression. It is not evidence
of two scheduled runs, inbox delivery or general application availability.

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

19 October acceptance evidence: the supplied execution-history screenshot for
`ExamPulse notification test` shows automatic 401 failures at displayed times
14:34:14 (886 ms) and 14:35:21 (776 ms), then 200 recovery at 14:36:14 (1.57 s).
The screenshot does not establish its configured timezone; these are displayed
times, not independently verified UTC timestamps. The owner explicitly confirmed
receipt of both failure and recovery emails. Independent notification behavior
has passed. The owner subsequently confirmed deletion of the temporary one-minute
job; the real operations job remains the intended 15-minute monitor. Scheduler
setup and notification acceptance are closed on owner-reported evidence, with
the missing real-job timestamps/ID retained as a documentation limitation.

## 3. Resource acceptance

Owner/dashboard access is needed for Vercel function duration/errors and
Supabase CPU/connections. The historical monitoring-enabled load test passed;
client RSS and application round-trip time do not measure provider resource use.

19 October owner-supplied staging database screenshots cover displayed
13:39-14:39; the disk tooltip identifies Australia/Sydney, corresponding to
02:39-03:39 UTC. This is an observational baseline, not a controlled load test:

- CPU headline 0.46%, mostly idle with short spikes visibly below 25%.
- Connections hover value 7 at 14:15, with visible bars around 6-8 against a
  displayed limit of 60; no connection saturation is visible in this window.
- Database approximately 0.03 GB; disk tooltip total 260.97 MB of 1.93 GB
  (13.2%), including database 29.72 MB, WAL 64 MB and system 167.25 MB.
- Disk IOPS and throughput headline zero, with very low plotted activity.
- Follow-up tooltips at 13:53 Australia/Sydney (02:53 UTC) confirm used RAM
  217.2 MB, cache/buffers 179.06 MB and free 10.25 MB, total 406.51 MB.
  Swap is separately reported as 274.29 MB (67.47%); this percentage matches
  the RAM total denominator, not a supplied swap capacity. Do not interpret it
  as 67.47% of the swap partition or apply a swap-capacity threshold to it.
- At the same timestamp, committed memory is 1.32 GB against a 1.20 GB
  commit limit (110.35%, using the chart's unrounded values). The previously
  displayed 1.18 GB was not this peak. The exceedance is now confirmed, but
  promised memory is not actual resident usage and does not prove an OOM kill.
- The screenshots do not prove active swap churn, an out-of-memory event, a
  leak, exam-load headroom, or causal overhead from the monitoring scheduler.
  No matched monitoring-on/off comparison supplied.
- Follow-up owner-executed read-only `pg_stat_activity` aggregate, excluding
  its own backend and non-client backends, shows five sessions: authenticator
  idle 2, supabase_admin idle 2, pgbouncer idle 1. All longest-idle-transaction
  values are NULL and no idle-in-transaction group appears. There is no evidence
  of stuck transactions in this snapshot. Ordinary idle sessions are not grounds
  for termination; this result does not establish historical memory allocation.
- The corrected owner-supplied PostgreSQL log-viewer screenshot covers displayed
  13:49-13:57 on 19 October, including the 13:53 spike, and returns "No results
  found". The earlier 13:47-13:52 screenshot excluded the spike. The corrected
  result supplies no log evidence of an OOM or restart, but does not certify
  complete log coverage or absence of either event. The log viewer's timezone
  was not independently confirmed from these screenshots.
- The owner-reported read-only UTC `pg_postmaster_start_time()` result is
  `2026-10-18 07:46:48.227202`, preceding the 19 October 02:53 UTC spike by
  approximately 19 hours. This excludes a full postmaster-process restart during
  the spike for the queried instance, but not individual backend failures or
  crash recovery under a surviving postmaster. It does not resolve capacity.
- Owner-supplied Vercel Observability overview for `exampulse-stagings`, its
  Production environment, and Last 12 hours displays function errors 0%,
  timeouts 0%, total active CPU 3.78 s, outgoing fast data transfer 789 kB and
  incoming 115 kB. Traffic appears sparse. No exact window boundaries, sample
  counts or function-duration percentiles are visible. Active CPU is not
  wall-clock response latency. This is not a controlled load/on-off comparison
  or a time-aligned confirmation of the database spike's impact.
- The next Functions screenshot selects 19 October 09:00-09:30 (timezone not
  shown), not the requested database-spike window. It reports 15 invocations,
  0% errors, 0% timeouts, average memory 223 MB / 2.05 GB, P75 active CPU
  115 ms, P75 CPU throttle 10.7% and cold starts 13.3%. Listed invocations are
  `/api/auth/me` 2, `/login` 7, `/reset-password` 5 and `/_not-found` 1.
  No attendance lookup/mark or operations-check route is visible; duration and
  TTFB metrics are locked. This supplies no scanner-latency percentile evidence.
  Nonzero throttling is observed, not diagnosed as user-visible delay. Vercel
  function memory and Supabase database memory are different resource pools.
  The owner's "everything looks good" assessment is not treated as explicit
  deferral or acceptance of the unresolved memory/load-capacity risk.

Resource acceptance remains open for memory investigation and workload
correlation. Do not run an additional stress test or change compute/Postgres
settings based solely on this snapshot. Current aggregate client-session review
is complete, the supplied log window returned no entries, and startup-time
evidence excludes a full postmaster restart during the spike. The Vercel overview
has no displayed function errors/timeouts; function-level duration details and
time-aligned workload evidence are still absent. Preserve the unresolved
memory-headroom warning for a bounded capacity review. Current session counts
cannot reconstruct historical processes or memory allocations.
Supabase distinguishes resident usage/cache from promised memory in its
[reports documentation](https://supabase.com/docs/guides/observability/reports),
and notes that high usage alone need not mean unhealthy memory in its
[RAM guidance](https://supabase.com/docs/guides/troubleshooting/exhaust-ram).

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

The earlier local fallback
`04da701a5caecc90c84b74ce29d5ee5beda9dca0` used the old dependency lock and is now
historical evidence, not an approved security-remediated fallback. Patched
baseline `947db8a` requires its own private/hosted verification and production
configuration; old production `main` remains unsuitable after the schema upgrade.
Public GitHub status inspection on 19 October found successful Vercel checks:

- [Staging deployment BvnDyeRsZuTKMi1tkTdsgAPSmtG9](https://vercel.com/ahmadsohair-1977s-projects/exampulse-stagings/BvnDyeRsZuTKMi1tkTdsgAPSmtG9).
- [Attendance project deployment A4y5fYvWjZVS7sUXoDH167PD5Yed](https://vercel.com/ahmadsohair-1977s-projects/attendance-management-admin/A4y5fYvWjZVS7sUXoDH167PD5Yed).

Those old-revision links are **historical discovery candidates only**, not the
new patched fallback. A GitHub success status does not verify
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
Scheduler: job ID; configured interval; two scheduled UTC timestamps; status/duration
Independent notification: failure email received; recovery email received; test job removed
Resources: dashboard time window and workload; accepted / explicitly deferred with reason
Recovery inventory: stored privately and verified; any missing configuration
Fallback: project, deployment ID, commit, environment/backend verified
Institutional procedure: approving owner/date; unresolved items retained
Physical devices: passed with device/OS/browser, or still deferred
Dependency risk: accepted decisions / required fixes, with owner/date
```
