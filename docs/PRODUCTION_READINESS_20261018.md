# Production readiness checkpoint - 18 October 2026

## Decision

Updated 19 October: the owner explicitly authorizes rollout with physical-phone
and memory/capacity checks as non-blocking follow-ups, while requiring dependency
findings fixed before public release. These checks are deferred, not passed.
Web dependency remediation `947db8a` now passes the local zero-finding web audit,
106 web tests, clean install/type-check/production build and secret scan. Hosted
CI and both Vercel branch deployments have now passed for `01bdd3b`; the patched
private fallback and guarded upgrade rehearsals also passed. The owner has now
reported a successful live production upgrade: 20 migrations committed, original
rows preserved and integrity/catalog/audit checks passed. The production-configured
domain deployment, smoke checks and production monitoring remain outstanding. See
`PRODUCTION_CUTOVER_20261019.md` for the current owner decisions and sequence.

The initial 18 October decision was not to promote while the reported iPhone
failure awaited retest. The later explicit owner decision above supersedes that
release gate without claiming the device issue fixed.

Initial application under test: staging `9d53294`; authenticated lifecycle checks
then exercised `04da701`, which corrects error classification. Staging branch now
also contains migration preparation `e39764c`; pushing SQL files does not apply
them to Supabase. Production remains on its existing branch/deployment. No
production credentials were loaded for these checks.

## Evidence completed this checkpoint

| Check | Result and scope |
| --- | --- |
| Hosted release gate for `9d53294` | All five jobs passed, including critical audit and temporary migrations. |
| Existing web tests and build | 93 tests and build/lint/types passed with Next.js 15.5.28; see Safari trial handoff. |
| Deployed staging scanner browser suite | 8/8 passed, including synthetic login/room restore, mocked mark, edited-ID lookup, denied camera, real 45-second OCR timeout/manual recovery, Back and offline/reconnect. |
| Deployed staging API checks | 28 passed: invigilator identity/rooms/live counts, assigned-room restriction, anonymous denials, admin-only route denials, real correct/wrong-room lookups, draft rejection and input validation. |
| Production baseline backup inventory | Local folders exist for 27 August 2026; these are historical evidence, not a fresh release backup. |
| Migration-order source review | Found two final-state audit regressions; forward correction and final-state SQL tests prepared. SQL execution evidence is recorded separately below when available. |
| Authenticated synthetic admin lifecycle | Import, staffing, publication, marks/replays, override/redirect, export, closure and typed deletion/audit passed on staging. Post-migration stale-assignment rejection also passed: 409 in 630 ms with staffing and audit history unchanged. |
| Current local web suite | 95/95 passed: 14 shared, 31 API, 20 server-unit and 30 scanner tests. Type-check also passed. |
| Corrective migration CI | All five jobs passed on `72d8b4e`, including the strengthened authorization-before-lookup regression. Conflict correction is installed and HTTP-verified on staging; audit-order correction is live-regression verified as recorded below. |
| Owner-supplied staging catalog snapshot | 16/16 expected tables present with RLS enabled; all 27 expected routine names present (31 overloads); three custom triggers enabled; four legacy audited cores inaccessible to service role; zero unvalidated constraints on the inspected tables. This is catalog evidence, not full policy/body or row-integrity acceptance. |
| Owner-supplied production catalog comparison | Original seven core tables present with RLS enabled; nine hardening tables, eight added columns and all inspected hardening RPCs absent. No inspected custom audit/integrity triggers. Existing shared columns have matching types/nullability. This production baseline cannot yet support the hardened application. |
| Current production relational-integrity check | Owner reported `total: 0` after running the requested read-only validation SQL on 18 October. Accepted as operator-reported evidence; the full JSON output was not supplied. This is not backup/restore or migration rehearsal evidence. |
| Fresh production logical backup | Owner completed `production-20261018-220510`; all three file sizes and hashes independently verified locally. |
| Private application-database restore/upgrade rehearsal | Passed: seven table counts, all 20 migrations twice, exact original-column fingerprints, rollback-only audit/conflict and operations tests, zero integrity violations, and container removal. Managed Auth/Storage recovery and application rollback are not certified. See the dedicated rehearsal report. |
| Separate managed Auth data recovery | Passed on 19 October: official pinned Auth schema, all 26 backup tables and original columns restored, exact COPY round-trips, 24 foreign keys checked, sequence reconciled and migration replay fingerprints preserved. Both private containers removed. Hosted Auth settings/signing keys are outside this data-only evidence. |
| Compatible local application fallback | Passed on 19 October: independently production-built `72d8b4e` and `04da701`, real synthetic Auth/REST, preserved admin cookies and committed attendance across replacement, replay/duplicate/conflict/new-mark behavior, export, closure and audited deletion. Zero final integrity violations/emails; owned containers removed. This is not hosted deployment activation or physical-device acceptance. |
| Additional private operational drills | Seven passed on 19 October: real Chromium uncertain-commit/reload/replay and origin isolation, post-closure Retry/Acknowledge, synthetic paper reconciliation, missing-email-credentials failure, audited roster correction, and Auth ban/global sign-out/new-code recovery. See `OPERATIONAL_DRILLS_20261019.md` for platform/provider/institutional limits. |
| Current staging Health page | Read-only admin GET returned 200 with metrics and alerts enabled, no heartbeat-configuration warning, query round trip 121 ms at `2026-10-19T02:58:02.370Z`. One observation is not performance overhead or availability acceptance. |

Browser command (independent dependency checkout):
`npx.cmd --no-install playwright test --config playwright.config.mjs --retries=0`.
API check script and summary are local ignored artifacts:
`test-results/readiness-api-check.mjs` and `test-results/readiness-api-summary.json`.
Dedicated browser storage is ignored under `playwright/.auth/`; it must not be
committed, printed or shared. Its authentication is scoped to synthetic staging.
Negative mutation checks use absent record IDs. No marks, exam changes or email
sends occurred in these initial checks. No physical-device acceptance is claimed.

## Migration-order blocker

Applying the historical migration files in filename order leaves:

1. `20260903_confirm_exam_deletion.sql` replacing the audited delete function
   created by `20260903_admin_audit_events.sql`, removing its audit insertion.
2. `20260903_validate_import_counts_on_publish.sql` restoring `service_role`
   execution on the two-argument transition core, bypassing its actor/audit wrapper.

This is a reproducible ordering hazard in the release files, not evidence that
those exact definitions are present in the current live staging database. Staging
migrations were applied individually in a different historical order. The prior
CI gate applied files twice and tested monitoring but did not exercise final
admin-audit behavior, so its green result did not cover this contract.

Correction commit `5d9ffd7` adds the forward migration
`20261018_preserve_admin_audit_contract.sql`, restoring audited deletion and
revoking access to unaudited cores. Existing migration files are unchanged.
The admin-audit regression now creates disposable fixtures inside its rollback
transaction, checks six audit events, typed confirmation, rejection of a non-admin
delete, immutable history and core privilege restrictions. CI runs it after both
the first complete migration pass and the second idempotency pass.

On 19 October the owner applied the correction to staging and supplied the live
rollback-only result: `auditRegressionPassed: true`,
`legacyCoreBypassBlocked: true`, definition MD5
`5874ce7eadf7dd8cbb1f1ce0ac3f0da2`. A disposable network-disabled local PostgreSQL
check independently reproduced that exact hash using CRLF line endings and the
private reference `be3e0a522dde77ce55780f92fdb48101` using LF. The difference is
verified line-ending representation, not a different reviewed function body.
The staging audit-contract gate is complete, including authorization before
nonexistent-exam lookup. The stronger private restore/upgrade regression and
[release gate 39171044629](https://github.com/ahmedsohair/AttendanceManagement/actions/runs/39171044629)
also passed. The disposable hash-check container was removed. No production
correction or promotion has been performed.

## Resolved staging business-conflict retry

The stale assignment baseline request timed out twice at 15 seconds and again
at 90 seconds. Source inspection found intentional business exceptions using
SQLSTATE `40001` in assignment saving, code rotation and email-claim ownership.
[Supabase's troubleshooting advisory](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b)
describes a PostgREST 14 retry loop for this use of `40001`. This is a strong
explanation for the observed behavior, not a verified live PostgREST version.

The owner ran the read-only diagnostic on staging and returned:
`assignmentUsesRetryCode: true`, `assignmentBackends: []`. The old definition was
installed; no matching active backend was visible at that instant. No restart or
backend termination was performed.

Forward migration `20261018_stop_business_conflict_retries.sql` changes only the
known conflict marker in five installed routines to `PT409`. It preserves their
current definitions, signatures, security settings and grants; unexpected or
missing definitions fail the migration rather than being blindly replaced.
The final-state CI test asserts that stale staffing, mismatched access-code
operations and an unowned email claim return `PT409`, with the original six-event
audit lifecycle still intact. Both complete migration passes passed.

The owner applied the correction to staging and reported successful execution.
The repeated read-only diagnostic returned `assignmentUsesRetryCode: false` and
`assignmentBackends: []`. The agent then created one isolated, labelled draft,
committed its staffing and sent one stale-baseline HTTP request with a ten-second
bound. It returned 409 / `CONFLICT` in 630 ms with the expected refresh-before-saving
message. Fresh reads verified unchanged staffing and audit history, one allocated
student, zero attendance and zero incidents. The draft was deleted through typed
confirmation, and its deletion audit entry was verified. Fixture:
`d18cc6d7-2914-4135-b68b-f36133357456`, `READINESS CONFLICT 2026-10-18 A4498945`.
Evidence captured at `2026-10-18T10:32:04.619Z` is included in the ignored
`test-results/admin-workflow-summary.json`; that scoped workflow summary is now
complete. This does not complete all production-readiness or Phase 8 gates.

This correction has not been applied to production. Historical one-off migration
scripts can restore old definitions; apply the reviewed final corrections last
and rerun the final-state tests. If looping backends are subsequently observed,
verify their exact PIDs against matching database error logs before any
operator-approved termination.

## Authenticated lifecycle evidence

The owner signed in through a dedicated staging test browser; no password or
service-role key was shared. Tests used real HTTP APIs and exported workbooks,
not direct privileged reads or mocked attendance writes. Browser RLS correctly
restricted direct table reads even for the admin session.

- Imported two workbooks with six distinct synthetic student IDs into two rooms.
- Publication rejected missing staffing with 422; assignment save and publication
  succeeded and the rooms became visible to the synthetic invigilator.
- A mark, exact-request replay and a new duplicate request produced one mark.
  Reusing that request ID for a different student returned 409 after `04da701`.
- Wrong-room marking without override and correct-room redirection returned 422;
  explicit mismatch override created a second mark. Redirect created an incident,
  not attendance. All expected duplicate/override/redirect incidents were exported.
- Export reconciled six allocated IDs, two unique marks and four `Absent` rows.
  A helper initially expected lowercase `absent`; that assertion was corrected to
  the established product contract, with no product change.
- Closed exam rejected a fresh mark with 409 and retained both prior marks.
- A separate draft was deleted through typed confirmation; its audit event and
  the retained exam's staffing/publication/closure audit entries were verified.

Final retained synthetic exam: `066667c8-4597-4d46-875e-90e0f0e3bd42`,
`READINESS 2026-10-18 00B70D78`, closed, two marks. Deleted draft:
`0b7d623c-aa3e-44d2-86ff-344cfb4d6854`. Earlier interrupted fixtures were safely
closed and retained: `6af30afc-0861-4351-a4e0-d27502f12721` (zero marks) and
`605e0b03-8b5a-4997-942e-92b5677def9d` (one mark). No production exam, existing
seeded roster or email delivery was modified. Do not delete closed history to
clean up these fixtures. Local ignored evidence: `test-results/admin-workflow-summary.json`.

## Production database preflight

Staging baseline received from the owner, captured at
`2026-10-18T10:33:50.283561+00:00`, PostgreSQL 17.6, read-only transaction confirmed.
The snapshot itself does not encode a Supabase project reference; its staging
identity comes from the owner's workflow/context, not from the JSON alone.
The raw metadata and its environment label are retained in the ignored local
artifact `test-results/staging-catalog-snapshot-20261018.json` in the main and
independent readiness checkouts. The source attachment is
`b6631b38-a2c2-468d-bfc1-3e8bcfe00c71/Pasted text.txt`.

Catalog checks found no missing expected tables or routine names, no disabled
expected audit/integrity triggers, and no browser-role execution grants on any
listed security-definer routine. Actor-aware lifecycle wrappers remain available
to service role, while all four legacy unaudited cores and the audit-write helper
are denied to it. The immutable audit trigger is enabled. Its invoker trigger
function has default browser-role execution flags; this is not a listed
security-definer business RPC and was not classified as an audit bypass.

The four legacy-core protections are therefore already present in live staging;
do not assume the audit-order repair is missing merely because its new migration
filename has not been applied. Definition hashes are comparison signals, not
proof of exact body equivalence. The full policies, constraint/index definitions,
actor-rejection behavior and current relational data integrity are not established
by this snapshot. No additional live mutation was performed to inspect it.
Production comparison is now recorded below. Neither snapshot authorizes a
migration or establishes current business-record integrity.

### Production baseline comparison

The owner supplied the production snapshot captured at
`2026-10-18T10:46:17.518921+00:00`, PostgreSQL 17.6, with read-only transaction on.
As with staging, the project identity (`mtoyhpyxqhfwhcrysqon`) comes from the
owner's response to the project-specific request, not from a field in the JSON.
Ignored local artifacts in both checkouts:
`test-results/production-catalog-snapshot-20261018.json` and
`test-results/production-staging-catalog-diff-20261018.json`. Source attachment:
`b8184b61-6308-482b-8ec3-383e48da6816/Pasted text.txt`.

- All seven original application tables are present and have RLS enabled.
  Existing columns shared with staging have matching types and nullability;
  column ordering differences are not migration requirements.
- Nine tables are absent: `attendance_requests`, `auth_rate_limits`, `email_jobs`,
  `email_deliveries`, `email_webhook_events`, `admin_audit_events`, `ops_events`,
  `ops_scanners` and `ops_alerts`.
- `exam_sessions` lacks `import_checksum`, `import_student_count` and
  `import_room_count`. `users` lacks `pending_access_code_hash` and the four
  access-code lifecycle timestamps: created, activated, emailed and revoked.
- None of the 27 selected hardening routine names is present (31 overloads on
  staging), including atomic marking/idempotency, import/staffing/lifecycle,
  rate limits, email queue, audit pagination and operations ingestion.
- No custom trigger on the inspected application tables is present. PostgreSQL's
  internal foreign-key triggers are outside this snapshot and are not claimed
  absent. No unvalidated constraints were reported, but that does not prove
  relational-integrity rules or future migration prerequisites hold for the data.

This is an older production baseline, consistent with hardening having remained
isolated on staging. It is not evidence of deleted production records or a
failed staging migration. Do not promote the hardened application against this
database. All 20 manifest migrations are candidates for the release rehearsal;
the snapshot does not certify complete installed DDL, indexes, policies or a
safe live execution sequence. Monitoring activation remains a separate flag and
operator decision even if its database tables are included.

The owner subsequently reported `total: 0` from
`supabase/tests/validate_relational_integrity.sql` in the production SQL Editor.
That script references the seven existing tables and uses a read-only
transaction. The aggregate zero is operator-reported; no raw JSON or individual
category values were supplied, so none are fabricated in the evidence artifacts.
No production records were repaired or deleted by the agent.

The owner completed a fresh checksummed production logical backup using
`scripts/backup-supabase.ps1`. Docker Desktop must be running. In the existing
production project's Connect panel choose the Session pooler URI on port 5432,
retain `[YOUR-PASSWORD]`, and verify the username is
`postgres.mtoyhpyxqhfwhcrysqon` before assigning `SUPABASE_DB_URL` locally.
The script prompts securely for the password. Do not post the URL with a password
or any SQL backup contents in chat. Only the completion summary/manifest path is
needed. The current agent shell has no database URL. Backup directory
`production-20261018-220510` is now verified, and a network-isolated private
application-data restore/upgrade rehearsal passed. See
[PRODUCTION_UPGRADE_REHEARSAL_20261018.md](PRODUCTION_UPGRADE_REHEARSAL_20261018.md)
for exact counts, source hashes, commands, evidence paths and scope limits.
Comparing that private release reference with the supplied staging snapshot found
30/31 routine hashes identical; only the draft-deletion definition differs and
needed the reviewed audit-contract correction on staging. The owner reported
applying it on 19 October; the strengthened live rollback-only regression passed.
The resulting hash matches the reviewed definition with CRLF line endings,
independently reproduced locally. The scoped staging audit-contract check is
complete; raw definition hashes are not byte-identical across line endings.
Managed Auth data recovery and the local compatible application fallback are now
separately verified. Hosted Auth configuration recovery and the operator's target
deployment/environment selection still need confirmation before scheduling any
production change. The reviewed backup has no Storage bucket or object rows;
SQL backup does not contain file payloads.
Do not run `supabase/schema.sql`, restore synthetic staging data over production,
or execute the manifest as an unreviewed bulk migration.

Use `supabase/tests/production_readiness_snapshot.sql` separately in the staging
and production SQL editors. It uses a read-only transaction and reads catalogs,
returning table/column/RLS presence, routine signatures and definition hashes,
execution grants, trigger hashes and unvalidated constraints. It does not read
student records or mutate schema. Save both results privately with their project
references; a snapshot alone does not certify complete migration installation.

- Staging project: `bjoguceapwquyczbhlyp`.
- Production project: `mtoyhpyxqhfwhcrysqon`.
- Compare snapshots with this revision and review missing/different routines and
  grants. A differing hash is a review signal, not permission to overwrite a
  routine. Monitoring tables may be absent where monitoring is intentionally off.
- Run the existing `validate-supabase-integrity.ps1` read-only validation on both
  targets using each target's verified session-pooler connection. September's
  zero-violation report is historical evidence, not October acceptance.
- Consult `PRODUCTION_MIGRATION_MANIFEST.json` for the ordered release files and
  their SHA-256 hashes. It is an inventory, not a claim that all are missing.
- Review installed definitions/history first. Never bootstrap production with
  `supabase/schema.sql` or restore synthetic staging data over production.
- Two migrations have explicit data backfills: email-delivery template data and
  legacy import counts/checksums. Triggers, immutable audit history, renamed
  functions and changed grants also affect compatibility and rollback planning.

## Bounded rollout sequence

1. Obtain fresh, checksummed production backup with the existing backup script.
   Rehearse restoring this release backup into a separate private database before
   promotion. The August recovery exercise does not prove the current backup.
2. Capture target snapshots and relational-integrity reports. Review differences
   and select only the required migrations in manifest order, with the new audit
   and business-conflict corrections after their historical definitions. Rehearse
   the exact selected sequence against a private production-like copy with
   external email/monitoring disabled.
3. Verify synthetic staging admin import, assignment, publish, mark, export and
   close behavior on the intended deployed revision. Reconcile expected student
   IDs/counts and ensure invalid/duplicate marks cannot create duplicate rows.
4. Complete the phone gate. The compatible local fallback `04da701` now passed
   against the post-migration schema; retain/select its correctly configured
   target deployment and record the operator decision. No live staging deployment
   rollback was performed by the local rehearsal.
5. During an agreed quiet release window, apply the reviewed production database
   sequence before deploying application code that needs its RPCs. Verify the
   release gate, environment and backend identity before production promotion.
6. Check sign-in, assignments, lookup and an explicitly agreed attendance write
   fixture, plus admin reports and monitoring. Record release SHA and outcome.
   Do not send invigilator emails as a deployment test without explicit approval.

An application rollback does not undo database writes or schema changes. Preserve
additive tables and attendance data; do not drop new audit tables, remove data or
blindly roll back to the old production application after changing contracts.
Record a compatible application fallback and operator decision before promotion.

## Remaining acceptance and access

- Same-device iPhone/Safari retest is deferred; Android acceptance also remains
  open. Owner-reported OCR timeout followed by immediate successful retry is
  recorded in the Safari handoff; no timeout behavior change is part of this pass.
- Dedicated staging admin lifecycle and post-migration stale-assignment rejection
  evidence are complete as scoped above. Application-data upgrade rehearsal is
  complete, as is the separate staging audit-order body/behavior verification.
  Managed Auth row recovery and local application replacement with fallback
  `04da701` also passed separately; hosted Auth configuration recovery and the
  operator's fallback-deployment/environment selection remain open.
- Both owner-supplied catalog snapshots have been compared as scoped above.
  Current production integrity passed by owner report (`total: 0`). A fresh
  backup and private application-data restore/upgrade rehearsal are complete as
  scoped in the linked report, with Auth data recovery subsequently verified.
  Local fallback compatibility also passed. Hosted configuration recovery and
  target fallback-deployment selection remain open; no
  connection secret is available in this shell. A fresh staging integrity
  result is not inferred from production's report. Production remains unchanged.
- Scheduler execution and independent failure/recovery notification evidence,
  provider-resource observations, hosted recovery decisions, code-compromise containment
  and manual-fallback reconciliation remain the finite Phase 8 acceptance list in
  `PHASE_8_REMAINING_ACCEPTANCE.md`. They need evidence or explicit owner deferral;
  do not relabel them passed from unit tests or an HTTP 200.
- Critical dependency audit passes. Remaining non-critical advisories still need
  exposure triage or explicit release-risk decisions; see `DEPENDENCY_AUDIT.md`.

This checklist prepares a production release. It is not production deployment
authorization and does not claim that incomplete operator checks have passed.

The 19 October technical drill checkpoint is in `OPERATIONAL_DRILLS_20261019.md`.
The remaining owner actions are now consolidated in
`PHASE_8_OWNER_SIGNOFF_20261019.md`, including the owner-confirmed pending
scheduler. No additional migration is needed merely to configure that scheduler.
