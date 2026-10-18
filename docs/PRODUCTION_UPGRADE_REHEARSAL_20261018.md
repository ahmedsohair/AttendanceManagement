# Private production application-database upgrade rehearsal

## Result and boundary

Passed on 18 October 2026 using the fresh production logical backup. This is a
seven-table application-database recovery and migration rehearsal, not a full
Supabase Auth/Storage recovery, authenticated application rollback, or production
deployment approval. Neither live Supabase project was contacted or modified.

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
  Staging already has audit insertion and legacy-core revocations, but its delete
  definition has not been aligned with this final correction. Apply the reviewed
  correction to staging and verify its definition/rollback-only tests before
  declaring exact target parity. This comparison does not authorize applying it
  to production or imply that existing staging deletion lacked audit records.
- The dump includes Auth users, sessions, identities and other managed records,
  but its schema file does not contain their complete managed schemas. This
  rehearsal does not restore or certify those records. A matching private
  Supabase managed-schema recovery exercise is still needed for full recovery
  acceptance. No Auth password reset, token replay or real email was attempted.
- Existing-column preservation is not a functional test of a rollback build.
  Identify and exercise the chosen application fallback against the upgraded
  database before a production rollout. Application rollback does not undo data.
- Phone acceptance and the operational owner checks in the readiness/Phase 8
  documents remain open. Do not promote to production based on this pass alone.
- Recheck live integrity and capture a fresh release-window backup if production
  changes after this rehearsal. Do not restore this backup over either existing
  live project or bootstrap production using `supabase/schema.sql`.
