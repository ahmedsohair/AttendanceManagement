# Operations email investigation - 2026-10-24

## Scope and safety

Read-only inspection of production ExamPulse, Resend and cron-job.org, plus
repository code and the owner's supplied provider notices. No test checks were
invoked, emails sent, exams closed, credentials rotated, scheduler settings
changed, migrations applied or deployments performed. This note is local only.

## Confirmed findings

### Repeated missing-telemetry alerts

- Production Health reported two active exams, zero recent scanners and a
  telemetry-missing alert accepted at 2026-10-24T03:30:33Z.
- Production Exams identified both active sessions as old test exams:
  - `Test exam sohair`, 2026-10-19, session
    `d3c4c760-741a-4ba4-b06c-29bcacc5c793`.
  - `Test Exam post`, 2026-08-26, session
    `475dbe97-ab73-4d6c-8a0e-0b83e963ea20`.
- The separately labeled production smoke test was already Closed. Do not
  confuse it with the other active test sessions or delete any audit history.
- `apps/admin/src/lib/ops-policy.ts` raises `telemetry_missing` when any exam is
  active and the last 15-minute window contains no API completion reports. It
  does not check the scheduled exam date or an expected monitoring window.
- `ops_claim_alert` in `supabase/migrations/20260904_operational_monitoring.sql`
  permits a new alert after a strict 15-minute cooldown. It does not track an
  ongoing incident's initial notification versus reminder notifications.
- Resend showed pairs of delivered telemetry-missing messages about every
  half hour. A pair at 2026-10-24T03:30Z explicitly identified the environments
  as `exampulse.xyz` and `exampulse-stagings.vercel.app`.
- cron-job.org had exactly two enabled jobs, production and staging, and zero
  disabled jobs. Production job `8675994` was enabled every 15 minutes in
  Australia/Sydney. The dashboard showed both jobs running at quarter-hour
  intervals and succeeding in their latest runs.

The broad activity rule plus recurring alert claims explains idle-app warning
mail. Staging's database exam inventory was not inspected; its alert source was
confirmed from the delivered message, not inferred from production data.

### Resend usage

- Settings > Usage showed 16/100 daily and 80/3,000 monthly at inspection.
- Two environments each sending every half hour can consume about 96 emails
  in a full day even with no attendance activity. This is a rate projection,
  not a measured historical daily total.
- Recent inspected email rows were operational warnings to the configured
  operator, not invigilator assignment mail.
- Errors-only provider logs returned no results in the selected last-15-days
  view. This is not a full security audit or proof that no credential was abused.
- The owner's historical 80%-daily warning was supplied as a report; its exact
  date and historical daily counter were not independently established.

### Production cron 502

The saved response for the 2026-10-23T16:00:40Z production execution (October 24,
03:00 Australia/Sydney) was HTTP 502 with this application JSON:

```json
{"status":"delivery_unconfirmed","accepted":0,"unknown":1,"suppressed":0}
```

`apps/admin/app/api/operations/check/route.ts` returns this status if an alert
send is unconfirmed. The send has a three-second timeout, and provider rejection,
network errors and unconfirmed response bodies share that outcome. The snapshot
and claim had succeeded; this response does not establish a database or scanner
outage. The next run at 16:15Z succeeded. Its success alone does not prove that
the prior email was delivered, since a cooldown-suppressed run also returns 200.
Do not describe quota exhaustion as the confirmed cause of the 502.

## Provider notices

### Supabase public-schema default grants

The supplied notice confirms that, from October 30, newly created public-schema
tables need explicit Data API grants. Existing tables retain their grants. This
is not a breach or an automatic exposure of private tables. It also matters for
new projects, preview databases and schema resets/rebuilds.

The repository already includes explicit grants for multiple newer tables and
RPCs. A future migration/rebuild review should check each required object and
role; do not apply the email's illustrative anonymous grants indiscriminately,
restore broad defaults or disable RLS. No live permission change was made.

Official reference:
https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically

### Railway incident

No tracked Railway integration was found in this repository. Known ExamPulse
hosting is Vercel, with Supabase, Resend and cron-job.org. This does not establish
that ExamPulse credentials were never copied into another Railway project.

The supplied incident notice is consistent with Railway's official disclosure.
Remaining work: inventory secret names/services stored in the owner's Railway
projects and check for credential reuse. Any affected secret must be revoked and
reissued at its issuer, with every authorized consumer updated in a controlled
sequence. Never request secret values in chat. No rotation was performed here.

Official reference:
https://blog.railway.com/p/preliminary-report-october-security-incident

## Recommended next actions, not yet executed

These were the initial investigation recommendations. The owner subsequently
declined closing the test exams and approved the monitoring-only update below.
Do not close or modify either test exam as part of this work.

1. Obtain owner confirmation before closing only the two identified obsolete
   production test exams; preserve all records. Inspect staging's active tests
   separately before changing their statuses.
2. Keep the scheduled checks and other useful alerts operating. Design a bounded
   expected-activity rule for missing telemetry, with explicit timezone and exam
   window semantics. Do not simply assume every published exam must generate
   continuous traffic or silently turn off monitoring.
3. Add persistent-incident deduplication and controlled reminders, with tests for
   quiet periods, future/past exams, genuine activity followed by missing data,
   recovery, concurrent checks and ambiguous provider sends.
4. Preserve privacy-safe provider failure classification so rejected, timed-out
   and accepted requests can be distinguished without logging credentials or
   student data. Do not automatically retry ambiguous sends with a new identity.
5. Complete Railway shared-secret inventory and Supabase future-migration grant
   verification as separate work from the alert-noise fix.

No operational change or release is approved merely by this investigation note.

## Owner-approved monitoring-only implementation (local, not deployed)

The owner requested that the existing test exams remain Active. All exams,
attendance data, scanner functionality, credentials and scheduler configuration
remain unchanged. The application-only update needs no database migration or new
environment variable.

- `telemetry_missing` now requires an Active exam plus a valid, non-cancelled
  scanner lookup, mark or sync observation with zero valid API completion reports
  in the same 15-minute window. Idle heartbeats and camera/OCR events alone are
  not evidence that API traffic should exist. The rule uses observed requests,
  not scheduled dates, and therefore needs no timezone/end-time assumption.
- Truncated windows do not raise missing-telemetry alerts, since API records may
  have been excluded from the bounded snapshot.
- Only missing-telemetry notifications are capped at one claim per rolling
  24 hours per database/environment. First claims retain the existing atomic RPC;
  reminders compare-and-swap the previous claim ID and timestamp in `ops_alerts`.
  This uses existing service-role SELECT/UPDATE privileges and the non-null UUID
  claim column. Concurrent requests cannot overwrite a newer claim.
- Both accepted and unconfirmed attempts consume that cooldown. A failed or
  ambiguous send is not automatically retried. Recovery does not reset this
  24-hour budget, so a new telemetry-gap condition inside the budget is also
  suppressed. This is bounded reminder handling, not a new incident-lifecycle
  state machine.
- All other alert thresholds, category cooldowns, authentication, privacy
  boundaries, diagnostic retention and scheduler intervals remain unchanged.
- Existing history is not reset. Previously accepted telemetry claims start the
  new 24-hour cooldown when the application update is deployed.

Limitations: client reports remain sampled/best-effort. A failed/offline request
can provide activity evidence but does not establish a server outage. Complete
loss of both API and scanner reporting cannot be diagnosed from silence. Keep
independent scheduler failure notifications enabled. This change is not proof of
capacity, availability or credential safety.

Local verification covers quiet Active exams, idle heartbeats, camera/OCR-only
activity, valid/invalid/cancelled scanner requests, incomplete windows, first
claims, the exact 24-hour boundary, concurrent requests, stale snapshots, database
failure, ambiguous sends and preservation of the other category policies. Tests
use synthetic dependencies with no provider or production database access.

Release status: not committed, pushed or deployed by this implementation task.
Production and staging continue running their previous alert policy until an
approved deployment. Do not trigger real alert emails merely to test the update.

### Verification results

- `npm.cmd run typecheck:web`: passed.
- Admin `test:api`: 38 passed, including the new policy and atomic reminder tests.
- Admin `test:scanner`: 83 passed when run separately.
- Shared package tests: 14 passed in the aggregate run.
- `git diff --check`: passed.
- `npm.cmd run test:web`: not green. It stopped in the server-unit suite with
  three dependency-compatibility failures, so its scanner stage did not run.
  An isolated rerun of `dependency-compatibility.test.mjs` reproduced the Next
  version mismatch (installed 15.5.21 versus required 15.5.28) and the ExcelJS UUID
  assertion failure; its other two tests passed on that rerun.
- Package manifests, lockfile and dependency-compatibility tests were not
  modified. Dependencies were not installed, pruned or updated. Resolve the
  installation mismatch in an isolated verification environment using the
  repository's approved install process before treating this as release-ready.
- No live browser, database-claim or provider-send acceptance test was performed
  for the new code. No production build was attempted against local env files.

## Release authorization - 2026-10-24

The owner subsequently requested deployment ("done lets deploy"). The approved
scope is the monitoring-only update above, with all test exams left Active.
No credential, scheduler or business-data change is included. Verify the candidate
with the existing hosted Web release gate's isolated checkout and pinned
Node/npm install, rather than reinstalling through the old local dependency tree.
Production rollout and final hosted evidence must be recorded separately once
verified; this authorization alone does not establish that deployment succeeded.
