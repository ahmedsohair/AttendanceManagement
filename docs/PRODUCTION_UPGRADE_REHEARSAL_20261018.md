# Private production application-database upgrade rehearsal

## Result and boundary

Passed on 18 October 2026 using the fresh production logical backup. This is a
seven-table application-database recovery and migration rehearsal, not a full
Supabase Auth/Storage recovery, authenticated application rollback, or production
deployment approval. Neither live Supabase project was contacted or modified.

Separate Auth data recovery and synthetic-only application fallback rehearsals
also passed on 19 October; see their evidence and scope below. These do not
constitute a hosted disaster-recovery or Vercel promotion exercise.

Backup: `C:\Users\ahmad\ExamPulseBackups\production-20261018-220510`.
All three file sizes and SHA-256 checksums were independently verified against
the manifest before use:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| roles.sql | 358 | 4350A72B5EC109888E740C17F3EB4DA2FCD95AB73AF26499538ED0BF615DB543 |
| schema.sql | 15687 | C22CF5B2EFF148578005B0E9524F0203E548780CF85CF06AC478E3CF1989D968 |
| data.sql | 634397 | D0040E10208CC683436A7D2B184C91DCFC1A2DCF4EB645DA6DCFEE2EB738DBB4 |

The source project identity is owner-selected; the existing backup manifest does
not independently encode a project reference. Its schema agrees with the supplied
seven-table production baseline. Do not interpret checksums as remote identity
attestation or a substitute for a successful restore.

## Isolation and verification

The helper never accepts a database URL or reads project credentials. It starts
a uniquely labelled Docker container, with no network and no published ports,
using the already-present image:

`public.ecr.aws/supabase/postgres@sha256:b15d862126dd2dac02da524696ccfde2dcce2ceaee0a58973b2727befe492706`

The local image is PostgreSQL 17.11; the supplied hosted snapshot is 17.6. This
is not exact hosted-platform parity. Database storage uses tmpfs; the original
backup is read only by the helper and is not changed. No application, email,
Auth server or external scheduler is started. Only private SQL tests run.

1. Restored backed-up roles/settings and application schema into an empty local
   Supabase PostgreSQL instance. Extracted only the seven public-table COPY
   blocks from the data dump; managed Auth/Storage COPY blocks were excluded.
2. Verified exact restored counts: 23 users, 6 exams, 28 rooms, 42 assignments,
   2,691 allocations, 697 attendance events and 19 incidents. The relational
   integrity check returned zero violations.
3. Verified all 20 migration source hashes against the LF-normalized manifest.
   Applied the ordered migration sequence as a single transaction, with a
   five-second lock timeout and 30-second statement timeout.
4. Compared original-column fingerprints and counts for every restored table.
   All matched exactly. New backfilled metadata columns were permitted; no
   original-column value or original record was lost or changed.
5. Ran the rollback-only admin audit/business-conflict regression. It checked
   six audited actions, typed deletion, non-admin rejection, immutable history,
   legacy-core grants and non-retrying conflict codes. No fixture escaped rollback.
6. Reapplied all 20 migrations and repeated the original-column and audit checks.
   The idempotency pass also preserved every original record and column value.
7. Ran the rollback-only operations regression and the final integrity/catalog
   checks. Integrity remained zero; all 16 expected tables had RLS enabled and
   all four legacy audited cores denied service-role execution.
8. Verified the container's ownership label and removed it. No rehearsal
   container or hosted production-data clone was left running.

Private summary, including fingerprints and catalog metadata:
`C:\Users\ahmad\ExamPulseBackups\application-rehearsal-ea61c521-c1dc-48fa-b191-0732af85427b\summary.json`.
Evidence capture began at `2026-10-18T11:13:44.645Z`.
Keep diagnostic files with the private backups; never upload backup contents or
private error logs to GitHub/CI. An earlier readiness-probe setup attempt was
discarded before application data restore; the successful run above is the
acceptance evidence. The probe supports the image's wrapped PostgreSQL process.

## Reproduction

Run from a checkout containing the reviewed manifest and migrations:

```powershell
npm.cmd run test:rehearsal
node .\scripts\rehearse-production-application-backup.mjs --confirm-private-rehearsal --backup-directory C:\Users\ahmad\ExamPulseBackups\production-20261018-220510
```

Docker Desktop and the pinned image must already be available. The helper
verifies checksums, requires the exact seven-table backup inventory, refuses
unexpected public tables and incomplete COPY blocks, and leaves production data
out of standard output. Windows PowerShell UTF-8 BOM manifests are supported.
The unit tests run in CI; the real backup is never used by hosted CI.

## Remaining release gates

- Compared the private release catalog with the supplied staging snapshot:
  30 of 31 inspected routine definition hashes match exactly. Only
  `delete_draft_exam_session(uuid,text,uuid)` differs: staging
  `2b36cb9ecde092957e27c53cf229b9c9`, release reference
  `be3e0a522dde77ce55780f92fdb48101`. The release includes the explicit early
  administrator check from `20261018_preserve_admin_audit_contract.sql`.
  The initial staging snapshot already had audit insertion and legacy-core
  revocations, but lacked this early authorization check. This did not imply
  that existing staging deletion lacked audit records.
  On 19 October the owner reported applying that correction to staging. The
  updated `supabase/tests/admin_audit_events_staging.sql` now also checks that a
  non-admin actor is rejected before lookup of a nonexistent exam, then emits a
  compact JSON result before rolling back. A fresh private rehearsal passed this
  stronger test on both migration passes. The owner then supplied the live result:
  `auditRegressionPassed: true`, `legacyCoreBypassBlocked: true`,
  `deleteDefinitionMd5: 5874ce7eadf7dd8cbb1f1ce0ac3f0da2`.
  A separate disposable, network-disabled PostgreSQL definition-only check
  reproduced this exact MD5 with CRLF and the private reference MD5 with LF.
  No backup data was loaded for that comparison; its container was removed.
  Local ignored evidence: `test-results/delete-definition-line-endings-20261019.json`
  in `C:\dev\AlgoAttendance-scanner-security`.
  The scoped live staging audit-contract gate is complete. No production
  migration is authorized by this result.
- The application-data rehearsal did not restore managed Auth records. A separate
  official-schema Auth data rehearsal passed on 19 October, as recorded below.
  Hosted provider configuration and signing-key recovery are not certified by
  restoring database rows. No production password reset, token replay or real
  email was attempted.
- Existing-column preservation alone is not a functional rollback test. A
  separate synthetic-only application replacement test passed for fallback
  `04da701`, as recorded below. Hosted rollback activation/environment identity
  and operator authorization remain separate. Application rollback does not undo
  database writes or schema changes.
- Phone acceptance and the operational owner checks in the readiness/Phase 8
  documents remain open. Do not promote to production based on this pass alone.
- Recheck live integrity and capture a fresh release-window backup if production
  changes after this rehearsal. Do not restore this backup over either existing
  live project or bootstrap production using `supabase/schema.sql`.

## Managed Auth recovery evidence - 19 October

The Auth data check used a separate private migration-only process, not a hosted
production-data clone. Supabase's
[official Docker configuration](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)
specifies `supabase/gotrue:v2.197.0`; its
[migration command](https://github.com/supabase/auth/blob/v2.197.0/cmd/migrate_cmd.go)
applies the embedded Auth schema migrations. Image digest:
`supabase/gotrue@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b`.

`scripts/rehearse-managed-auth-backup.mjs` verified the three source backup
checksums, built the official Auth schema in a fresh network-disabled database,
and checked that all 26 backed-up Auth tables and every original column existed
before restoring anything. No fabricated schema or silently skipped table was
used. Exact PostgreSQL COPY round-trips passed for every original row and column:
22 users, 22 identities, 21 sessions, 21 MFA authentication-method claims,
42 refresh tokens and four flow-state records; all other reviewed Auth tables
were empty. All 24 Auth foreign keys were checked explicitly after restoring with
replication triggers disabled. The refresh-token sequence was reconciled to its
restored maximum. Replaying the official Auth schema migrator preserved all
original-column fingerprints. Source backup checksums still matched afterward.

Both containers were ownership-verified and removed. Neither had published
ports; the migrator shared the database's network-disabled namespace. No Auth
server was started and no production session was replayed. Private evidence:
`C:\Users\ahmad\ExamPulseBackups\auth-rehearsal-f470cf38-1ff2-420d-8185-2eef54b1dc03\summary.json`.
An earlier identical data round-trip also passed in
`auth-rehearsal-9e283a83-61a7-47ee-96cf-5ed58918f74f`.

The source identity cross-check found all 22 Auth users have public profiles.
There is one additional public admin profile without a matching Auth user in
the original backup. This is pre-existing source data, not migration data loss;
no account was created, deleted or repaired to hide the difference. All public
profiles are preserved by the separate application-data rehearsal.

Reproduce after pulling the two pinned images:

```powershell
npm.cmd run test:rehearsal
node .\scripts\rehearse-managed-auth-backup.mjs --confirm-private-rehearsal --backup-directory C:\Users\ahmad\ExamPulseBackups\production-20261018-220510
```

The reviewed backup also has zero rows in each of its five Storage COPY blocks,
including buckets and objects. There are no backed-up Storage objects to recover
in this inventory; this does not certify Storage schema recreation or recovery
of files from any future populated bucket. A SQL dump is not a blob backup.

The Auth data-recovery gate is complete within this scope. Hosted Auth settings,
email/provider secrets, redirect allowlists and signing keys are outside this
logical backup and need the operator's private recovery inventory. Do not put
those secrets or production password hashes/tokens in repository files or CI.

## Application fallback evidence - 19 October

`scripts/rehearse-application-rollback.mjs` passed a real local production-build
replacement test from candidate `72d8b4e119cbcc23d4100b3414ab70b182ce64c0` to
fallback `04da701a5caecc90c84b74ce29d5ee5beda9dca0`. Both Git exports were
independently built, linted and type-checked with Next.js 15.5.28. Their admin
application, shared source and dependency lockfile are identical; intervening
commits changed migrations, test tooling and documentation. Therefore this proves
restart/fallback compatibility for this application baseline, not compatibility
of arbitrary older builds or a rollback of the newer database contracts.

The fallback floor includes the safe business-error classification fix. The old
production `main` build is not an approved post-upgrade fallback. Reverting to a
build merely because it previously served production is not safe after this
database upgrade.

This test used no production backup data or credentials. It created fresh
synthetic Auth users and four allocations in two rooms, applied all 20 reviewed
migrations, and ran the candidate against real local Auth and PostgREST services.
Database, Auth, REST and the request bridge shared a network-disabled namespace
and had no published ports. The Windows Next processes and bridge gateway bound
only to `127.0.0.1`, used an allowlisted process environment, and read no `.env`
files. The gateway forwards only to the private namespace's fixed Auth/REST
loopback endpoints. No Resend/SMTP credential was supplied.

Verified sequence:

1. Candidate admin password login set real session cookies; cookie identity,
   exam publication and the first invigilator attendance commit passed.
2. Stopped the candidate and started the separately built fallback on the same
   local application origin without changing schema or clearing Auth state.
3. Original admin cookies remained valid, and the committed attendance count and
   complete row fingerprint were unchanged.
4. Replaying the original mark returned its original event ID. A fresh duplicate
   returned `already_marked`; changed-student reuse of the original request ID
   returned 409. Lookup and a new student's attendance mark succeeded.
5. Wrong-room marking without explicit override returned 422; explicit override
   succeeded. Export contained four register entries and exactly three marks.
6. Closing the exam returned 303; a new mark after closure returned 409 without
   increasing the three attendance rows. Typed draft deletion was audited.
7. Final relational-integrity violations and queued email deliveries were both
   zero. Both Next processes stopped and all four owned containers were removed.

Private ignored evidence:
`C:\dev\AlgoAttendance-scanner-security\test-results\rollback-rehearsal-2bfa905b-1512-4f8f-9a7b-04a3d3b69b74\summary.json`.
Candidate build ID: `NzIqw1wKJh3bs3F4S-u3R`; fallback: `BBHTRYzMuUMi-oywYaiFX`.
Earlier harness setup attempts failed before the candidate application scenario
and removed their own containers; they are not acceptance evidence.

Reproduce from the independent installed-dependency checkout after pulling all
four digest-pinned images named in the helper:

```powershell
node .\scripts\rehearse-application-rollback.mjs --confirm-private-rehearsal
```

The helper never installs/prunes dependencies or changes live deployments. Git
exports/builds remain in ignored `test-results` for evidence and contain dependency
junctions: do not recursively delete them or run dependency cleanup through them.
They are not distributable Vercel artifacts. Before promotion, the authorized
operator must select/retain a deployment built from the tested fallback with the
correct target environment, retain the original origin, and record the release
decision. No hosted rollback, DNS/TLS change, alternate-origin queue migration,
physical phone acceptance or production Auth-provider recovery is claimed here.
