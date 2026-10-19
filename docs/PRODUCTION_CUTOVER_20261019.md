# Production cutover preparation - 19 October 2026

## Owner context and current decision

The owner clarified that the exam is next week, not tomorrow, and travel begins
the day after tomorrow. Next week's roster has not been imported into production;
no one is recording attendance today. The aim is a controlled release with time
to verify it before travel, not an exam-eve emergency deployment.

Those initial statements alone did not prove there had been no production writes
since the backup, confirm that no browser had unresolved queued marks, or waive
remaining risks. The subsequent owner decisions below are explicit. Production
database migration has now committed as reported below; application deployment
and production monitoring acceptance remain separate.

## Live database upgrade committed

On 19 October 2026 (Australia/Sydney), the owner supplied the guarded executor's
successful production result for project `mtoyhpyxqhfwhcrysqon`:

```json
{"deleteDefinitionMd5":"be3e0a522dde77ce55780f92fdb48101","auditRegressionPassed":true,"legacyCoreBypassBlocked":true}
{"migrationCount":20,"originalRowsPreserved":true,"precommitChecksPassed":true}
```

The executor completed with `Production upgrade committed`, confirming its psql
process returned success after the single-transaction commit. This is
operator-reported live evidence, not an independent agent database connection.
The `ROLLBACK` printed between regression output and final checks is the intended
rollback to the regression savepoint, not rollback of the migration transaction.
Original records, relational integrity, required RLS/catalog and monitoring
privileges, and rollback-only audit acceptance checks passed.

The first attempt failed during TLS certificate verification, before opening a
database session or executing migrations. The subsequent successful attempt
followed instructions to supply the official project CA via `-RootCertPath`,
without disabling TLS verification. The certificate's local path was not
reported and is not assumed.

Do not rerun the migration or restore the pre-upgrade backup as an application
rollback. Keep staff out until the matching production-configured application
is deployed and verified. The live domain has not been promoted by the agent at
this checkpoint. Production Vercel settings require account sign-in; a dedicated
browser tab was opened for the owner, without requesting credentials in chat.

### Subsequent explicit owner decisions

After the final read-only production integrity check returned zero for all ten
categories and total, the owner explicitly instructed rollout without treating
the unresolved iPhone and memory/load-capacity checks as blockers. They remain
unverified, owner-deferred follow-ups, not passed tests. The owner stated that
staff will not use the application until instructed. This supersedes the earlier
proposal to retain a device/capacity gate for exam use; do not reimpose that
proposal as if it had been accepted.

The owner separately selected **"Fix findings before public release"** for
dependency vulnerabilities. No security exception was accepted. Web dependency
remediation and fresh verification therefore precede public production release.
The prior application/lockfile freeze describes the preparation baseline only;
the authorized security updates require a new tested release/fallback candidate.
The guarded migration executor was not implemented before this reprioritization.
It is now implemented and privately verified as recorded below; do not run
staging-only scripts against production.

### Verified guarded upgrade procedure

`scripts/apply-production-upgrade.ps1` is the one-off executor for production
project `mtoyhpyxqhfwhcrysqon` and the verified 19 October backup. It verifies all
20 canonical migration hashes and all three backup files. The final locked
preflight compares original-column row counts and whole-table fingerprints with
the rehearsed backup; it stops rather than bypassing record drift.

All migrations, rollback-only audit acceptance tests and final preservation,
integrity, RLS/privilege/trigger checks run inside one transaction. Regression
fixtures are rolled back to a savepoint before commit. Credentials are prompted
securely if the URI has `[YOUR-PASSWORD]`, passed through temporary process
environment variables rather than Docker arguments, and TLS hostname/certificate
verification is mandatory. All Docker commands explicitly target the local
Docker Desktop Linux named pipe; Docker host/context environment overrides are
rejected before prompting for a password. The 20,000-row monitoring regression
runs only in private rehearsals, never in the production upgrade. Production
monitoring acceptance checks inspect RPC/table permissions and RLS without
inserting or pruning diagnostic events. A supplied `-RootCertPath` must be the official
project CA, not a reason to disable verification. The connection target must be
production's Session pooler on port 5432, with no URI query or fragment options.

The exact generated bundle, canonical SHA-256
`9b29d72ae907d784994b6fe16b01c872319c9e6efc4d8b45caa1e636c736fa48`, passed on a
network-disabled private restore of `production-20261019-150032`: first upgrade
and second idempotency pass preserved every original row. Deliberate data drift
was rejected. An injected failure after all migration/acceptance statements
rolled back all DDL and preserved the baseline records. Private aggregate proof:
`C:\Users\ahmad\ExamPulseBackups\application-rehearsal-c15fe50f-9163-4bc3-b2b8-3f0d1a6668fd\summary.json`.
The owned container was removed. Managed Auth/Storage was not restored by this
particular application-data test; prior managed-Auth evidence remains separate.

The patched application fallback rehearsal also passed using candidate
`01bdd3b` and patched baseline `947db8a`, including the seven private operational
drills. Evidence is in the independent checkout at
`test-results/rollback-rehearsal-00328134-ac17-4288-a7f8-97b747ac8169`.
Owned containers were removed. This proves private replacement compatibility,
not production Vercel configuration or a retained hosted fallback.

GitHub run `39200974927` passed all five release jobs for `01bdd3b`. Vercel
reported successful deployments for both `exampulse-stagings` and the
`attendance-management-admin` branch preview. These are not evidence that the
production domain has been promoted. Application/shared source and dependency
lockfile remain unchanged in the subsequent executor/test/documentation work.

With staff kept out during the maintenance window, the owner can run:

```powershell
Set-Location C:\dev\AlgoAttendance
$env:SUPABASE_PRODUCTION_DB_URL = 'postgresql://postgres.mtoyhpyxqhfwhcrysqon:[YOUR-PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\apply-production-upgrade.ps1 -ConfirmProductionUpgrade
```

The placeholder is intentional: enter the password only at the secure prompt.
Do not run another backup merely to execute this command. On success, report the
final committed message before proceeding with the production-configured app
deployment. On failure, stop and inspect the error; do not skip a guard. A
connection lost while COMMIT is acknowledged can leave an unknown outcome, so
do not blindly rerun or restore a backup. This step is now completed as recorded
in the live upgrade section above; the command is retained for traceability,
not as an instruction to run it again.

## Preparation baseline and security follow-up

- Preserve production `https://exampulse.xyz`, Supabase
  `mtoyhpyxqhfwhcrysqon`. Keep staging `https://exampulse-stagings.vercel.app`,
  Supabase `bjoguceapwquyczbhlyp`, separate. Do not restore staging data into
  production or copy its keys, invigilator accounts or access codes.
- Initial preparation HEAD was `342a8e3`, seven commits ahead of its remote at
  that checkpoint. It is not the final security-remediated release SHA.
- Before the authorized security updates, application/shared source and lockfile matched tested candidate
  `72d8b4e119cbcc23d4100b3414ab70b182ce64c0`; root package changes extend
  rehearsal tests only. This is historical evidence, not the current lockfile.
- Security remediation is committed as `947db8a`. Its web production audit
  reports zero vulnerabilities, 106 web tests and the clean install/type-check/
  production build passed, and the commit passed a network-isolated secret scan.
  Read `WEB_DEPENDENCY_REMEDIATION_20261019.md` for versions, the pinned installer,
  exact verification scope and native exclusions. Freeze further product/UI and
  dependency changes while verifying this candidate.
- All 20 migration payload hashes match `PRODUCTION_MIGRATION_MANIFEST.json`
  after canonical LF normalization. Its sequence was privately rehearsed twice
  against restored production application data with exact row preservation.
  Do not run `supabase/schema.sql` or a synthetic seed over the live database.
- Existing backup `C:\Users\ahmad\ExamPulseBackups\production-20261018-220510`
  was rechecked: all three sizes and hashes match its manifest. This verifies
  stored bytes, not current database freshness. Hosted project configuration is
  not part of the logical backup.
- The owner subsequently completed cutover backup
  `C:\Users\ahmad\ExamPulseBackups\production-20261019-150032`. All three sizes
  and SHA-256 values were independently verified against both its manifest and
  the reported values. Roles and schema are byte-identical to the rehearsed
  backup. New `data.sql` is 634397 bytes, SHA-256
  `8b6eb1962d0ca2031bb4137d5a13b9b5ec09932fd1a2a9bca8db596ef99a9c7c`.
- Fresh-versus-rehearsed comparison covers all 38 COPY tables (7 public, 26 Auth,
  5 Storage): column signatures, counts and row multisets all match. Non-COPY
  executable text also matches after excluding comments, blank lines and
  dump-generated restrict/unrestrict markers. No private row values were printed.
  The changed dump hash therefore supplies no evidence of changed application
  or Auth records. Prior recovery/upgrade evidence applies to the same dumped
  schema and records; a new restore rehearsal is not required solely by this
  hash difference. This does not fence later live writes or cover hosted settings.
- Use the 19 October backup for the planned cutover; retain the 18 October backup
  and its private rehearsal evidence rather than overwriting either. Final live
  target/integrity preflight and production mutation authorization remain separate.
- The 95-test web suite, type-check and 12 rehearsal/parser/guard tests passed
  again in the independent dependency checkout. These 12 tests are helper tests,
  not a newly executed live upgrade or a repeat of the full private drills.
  See owner acceptance and operational drill reports for earlier scoped evidence.

## Release sequence and stop points

1. **Choose the release and people.** Review remaining risks below and record
   explicit decisions. Name an on-site exam-day administrator and give them
   approved recovery access/instructions before travel, without sharing secrets
   in chat or Git. Verify staff have a tested device and paper fallback.
2. **Establish a quiet maintenance window.** Keep imports, code rotation, email
   jobs, administrative edits and attendance writes stopped through migration
   and application verification. Confirm unresolved device queues are accounted
   for. "No attendance today" alone does not fence every writer. Do not weaken
   authentication/RLS or silently introduce a broad maintenance feature.
3. **Verify target and the cutover backup (completed).** The 19 October backup
   above is checksummed and the owner supplied zero live integrity violations.
   Do not repeat it merely because a new PowerShell session was opened; reassess
   freshness only if there are subsequent writes or material delay. Use production's own Session
   pooler URI from Connect; never infer its region/host from staging. Keep the
   password out of chat and files. The existing backup helper prompts when its
   URI contains `[YOUR-PASSWORD]`:

   ```powershell
   Set-Location C:\dev\AlgoAttendance
   powershell -ExecutionPolicy Bypass -File .\scripts\backup-supabase.ps1
   ```

   This command needs `SUPABASE_DB_URL` already set in that PowerShell session.
   Do not run it blindly if the value is missing or its project is unverified.
   Verify new checksums and compare the current schema/counts/integrity with the
   rehearsed baseline. Stop for drift requiring a new rehearsal. The existing
   backup may be used only after its freshness is established, not assumed.
4. **Stage a compatible patched fallback and deployment configuration.** Identify
   the actual production Vercel project/domain and retain a deployment using
   patched security baseline `947db8a` with production-specific configuration.
   The older `04da701` rehearsal used the vulnerable dependency tree and is now
   historical evidence only, not an approved security fallback. A current private
   rehearsal has passed as recorded above; hosted retention/configuration
   verification remains necessary.
   Verify Vercel Root Directory `apps/admin` before using its npm 12 install
   command, which resolves the workspace root through `--prefix ../..`.
   Verify server/public Supabase targets, publishable
   and server-only keys, base URLs, Auth redirects, email sender/provider and
   regional settings. Never use old production `main` as an assumed post-upgrade
   fallback. Do not promote an arbitrary staging deployment with baked-in keys.
5. **Run final release gates before mutation.** Commit/review the selected
   release and require CI for its final SHA: quality/build, secret scan,
   dependency gate and temporary migration validation. No `--force` dependency
   upgrades or disabled audit gates. Obtain explicit approval for the production
   migration command and target; do not adapt a staging-only wrapper by removing
   its target guard. Use the purpose-built guarded executor recorded above.
6. **Apply the reviewed sequence and verify.** Use the transaction/timeouts and
   final correction ordering already rehearsed. Preserve all historical data;
   stop on errors rather than skipping statements, terminating sessions or
   guessing a repair. Run final integrity, audit/privilege and conflict checks.
   Record pre/post counts and original-column preservation evidence. Only then
   activate the selected production application against that database.
7. **Smoke-test and reopen deliberately.** Verify production admin/invigilator
   login, room assignment, normal lookup/mark/idempotent replay, wrong-room and
   closed-exam protection, export, and allowed email delivery. Any synthetic
   production smoke fixture or real email needs explicit authorization and must
   remain identifiable; never mix it with next week's exam. Verify phone/manual
   recovery and production monitoring with production-specific scoped secrets.
   Staging's scheduler does not monitor production automatically.
8. **Import the real roster after release acceptance.** Reconcile allocation and
   room counts, verify invigilator access, conduct a staff rehearsal before
   departure and freeze unrelated deployments through the exam. Confirm the
   on-site administrator knows escalation, paper records and queue reconciliation.

## Remaining decisions are not silently waived

- Physical iPhone failure has not been retested successfully; Android/iPhone
  acceptance is explicitly owner-deferred as a non-blocking rollout follow-up.
  Manual entry cannot rescue a terminated browser; tested alternate devices
  remain the recommended exam-day precaution, not a passed acceptance claim.
- Staging database memory commitment exceeded its displayed limit, with swap
  occupied. No stuck transactions or full postmaster restart were shown, but
  capacity under the intended exam workload and monitoring overhead are not
  verified. The owner explicitly permits rollout with this unresolved risk;
  low-traffic Vercel screenshots do not close it technically.
- The owner required dependency fixes before public release. The historical
  exposures in `DEPENDENCY_EXPOSURE_20261019.md` are remediated for web production
  dependencies: the new all-severity web audit reports zero, clean installation,
  tests/build, hosted CI and patched private fallback passed. Native non-critical
  findings remain outside this web release's verification scope.
- Hosted account-containment/credential-recovery behavior, hosted fallback
  selection and institutional reconciliation approval remain separate from
  private synthetic rehearsals. Use the finite owner checklist rather than
  declaring these passed from a local test.

If a hard gate fails, retain the maintenance boundary, investigate and set a new
cutover time. An application fallback must preserve newer attendance/audit data
and the upgraded schema. A database restore is not an automatic rollback and
must never discard writes or unresolved device queues to make a release pass.
