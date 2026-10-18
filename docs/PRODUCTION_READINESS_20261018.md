# Production readiness checkpoint - 18 October 2026

## Decision

Not approved for production promotion. Continue the independent checks while the
reported iPhone failure awaits retest. The owner's instruction to proceed with
other checks does not classify the iPhone failure as passed or waive that gate.

Application under test: staging `9d53294`; local documentation checkpoint
`87fcea4` has the same application source. Production remains on its existing
branch/deployment. No production credentials were loaded for these checks.

## Evidence completed this checkpoint

| Check | Result and scope |
| --- | --- |
| Hosted release gate for `9d53294` | All five jobs passed, including critical audit and temporary migrations. |
| Existing web tests and build | 93 tests and build/lint/types passed with Next.js 15.5.28; see Safari trial handoff. |
| Deployed staging scanner browser suite | 8/8 passed, including synthetic login/room restore, mocked mark, edited-ID lookup, denied camera, real 45-second OCR timeout/manual recovery, Back and offline/reconnect. |
| Deployed staging API checks | 28 passed: invigilator identity/rooms/live counts, assigned-room restriction, anonymous denials, admin-only route denials, real correct/wrong-room lookups, draft rejection and input validation. |
| Production baseline backup inventory | Local folders exist for 27 August 2026; these are historical evidence, not a fresh release backup. |
| Migration-order source review | Found two final-state audit regressions; forward correction and final-state SQL tests prepared. SQL execution evidence is recorded separately below when available. |

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

The correction has not been applied to staging or production. Do not mark the
database contract accepted until the target snapshot and rollback-only tests are
verified there. Local Docker startup did not produce a usable engine; disposable
hosted PostgreSQL CI is the SQL verification path for this checkpoint.

## Production database preflight

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
   correction last. Rehearse the exact selected sequence against a private
   production-like copy with external email/monitoring disabled.
3. Verify synthetic staging admin import, assignment, publish, mark, export and
   close behavior on the intended deployed revision. Reconcile expected student
   IDs/counts and ensure invalid/duplicate marks cannot create duplicate rows.
4. Complete the phone gate and separately verify the chosen compatible rollback
   application version against the post-migration schema. No live staging
   deployment rollback is performed merely to prepare this document.
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
- Staging admin session requested through a dedicated test browser. No password
  is requested in chat. Record workflow checks only after authenticated execution.
- Production/staging catalog snapshots, fresh integrity checks and fresh backup
  need operator database access; no connection secret is available in this shell.
- Scheduler execution and independent failure/recovery notification evidence,
  provider-resource observations, rollback rehearsal, code-compromise containment
  and manual-fallback reconciliation remain the finite Phase 8 acceptance list in
  `PHASE_8_REMAINING_ACCEPTANCE.md`. They need evidence or explicit owner deferral;
  do not relabel them passed from unit tests or an HTTP 200.
- Critical dependency audit passes. Remaining non-critical advisories still need
  exposure triage or explicit release-risk decisions; see `DEPENDENCY_AUDIT.md`.

This checklist prepares a production release. It is not production deployment
authorization and does not claim that incomplete operator checks have passed.
