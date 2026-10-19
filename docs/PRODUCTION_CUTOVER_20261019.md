# Production cutover preparation - 19 October 2026

## Owner context and current decision

The owner clarified that the exam is next week, not tomorrow, and travel begins
the day after tomorrow. Next week's roster has not been imported into production;
no one is recording attendance today. The aim is a controlled release with time
to verify it before travel, not an exam-eve emergency deployment.

Those initial statements alone did not prove there had been no production writes
since the backup, confirm that no browser had unresolved queued marks, or waive
remaining risks. The subsequent owner decisions below are explicit. Production
database migration and the production application deployment have now completed
as reported below. Authenticated workflow and scheduled monitoring acceptance
remain separate from deployment success.

## Production application is deployed

### Current: corrected prefetch release 51bb652 - 20 October

After real desktop-browser model initialization/recognition/retry/lifecycle
checks and 159 passing local tests, the corrected candidate passed hosted gate
`39335059581` and was deployed to staging. The owner reported that staging worked
and explicitly requested "ok send to production".

Main was fast-forwarded without force from `738d522` to exact tested
`51bb6528438699bd2634ab477835d9f0c35e2948`. Repeat main gate `39338321599` passed
all jobs. Production project attendance-management-admin built deployment
`83vuD9cUDpjqrXX8RB7h4W2eSgk7` in 47 seconds using production settings, initially
Staged under rollback protection. After the gate passed, that exact production
build was manually promoted; Vercel confirmed Ready / Production / Current and
exampulse.xyz assigned. This was not a cross-project staging promotion.

Immutable URL: https://attendance-management-admin-chhptd9f3.vercel.app.
Current public scanner: https://exampulse.xyz/scan. Its bundle
`/_next/static/chunks/app/scan/page-651ddcf4c05df443.js` contains both prefetched
mobile-model URLs and Retry OCR, omits the rejected explicit model-asset options,
and points to production Supabase, not staging. Public scanner/login render and
HTTP checks passed: /scan and /login 200, /api/auth/me 401, /health 307 to login,
unauthenticated POST /api/operations/check 401 with no-store.

No migration, environment/credential/account/attendance change, real email,
scheduler edit or queue clearing occurred. Prior working `5e2c182`, deployment
`6W36WRbULxgjx8GysDnHrstpZz4j`, remains available for application rollback. Its
dipvm4pm2 immutable URL will continue serving old code, so current release tests
must use the public canonical scanner link above. Phone timing/memory and the
separate iPhone blank-page report are not newly resolved by these release checks.

Ignored evidence: `test-results/ocr-preparation-20261019/` contains
`corrected-prefetch-production-ready.jpg` and
`corrected-prefetch-production-login.jpg`. Full local/staging/release evidence
is in [SCANNER_PREFETCH_INCIDENT_20261019.md](SCANNER_PREFETCH_INCIDENT_20261019.md).

### Historical: prefetch release rolled back to 5e2c182

The following records the 19 October rollback checkpoint, superseded by the
corrected owner-approved release above.

After the owner reported immediate OCR failure and unusable Retry in `738d522`,
Vercel Instant Rollback restored deployment `6W36WRbULxgjx8GysDnHrstpZz4j`, release
`5e2c182`. The public canonical scanner serves its previous bundle and no prefetch
helper. No database/data/credential change occurred. GitHub main still points to
`738d522`; Vercel automatic promotion is stopped by rollback mode. Keep it stopped.
The faulty asset-override configuration was reproduced against the real SDK;
a correction and stronger real-SDK tests were initially local, not re-promoted.
Read [SCANNER_PREFETCH_INCIDENT_20261019.md](SCANNER_PREFETCH_INCIDENT_20261019.md)
before any subsequent deployment. Release entries below are historical.

### Early-download follow-up release: 738d522

The owner explicitly requested pushing the tested prefetch change for phone
testing. Current production is now `738d522b16168d4744c2ae9b941648d6968f951b`,
Vercel deployment `CDshdyXMEcKY7AuT1sd1Pysud4Z1`, Ready / Production / Current
on `https://exampulse.xyz`. Candidate gate `39245428897` and main gate
`39245689194` passed. Public login/scanner, authentication guards and compiled
prefetch-bundle checks passed; there were no database/configuration/data edits.
Prior production `5e2c182`, deployment `6W36WRbULxgjx8GysDnHrstpZz4j`, is retained
as the application fallback. Phone timing/memory and real camera/OCR acceptance
of this new optimization remain pending, not inferred from deployment success.
See [SCANNER_MODEL_PREFETCH_20261019.md](SCANNER_MODEL_PREFETCH_20261019.md)
for exact evidence and test instructions. All release history below is retained.

### Scanner follow-up release: 5e2c182

After reviewing the local preview, the owner explicitly approved direct production
rollout of the scanner startup recovery/loading UI, rather than waiting for a
separate staging/device acceptance pass. This supersedes the earlier local-only
scanner reports; it does not certify phone performance or the unresolved iPhone
blank-page/restart issue.

- Exact release SHA: `5e2c1829e396fdcac99037a12baa6f1e3d2bcbf9`.
- Pre-production hosted gate on hardening/staging: run `39240897950`, success.
  Quality/tests/build, dependency audit, secret scan and temporary migration
  validation all passed. Local candidate verification: 140 tests and build passed.
- Main was fast-forwarded from `d869264` to the exact tested SHA without force.
  Repeat main gate `39241156606` passed. No dependency/schema/config changes.
- Production Vercel deployment `6W36WRbULxgjx8GysDnHrstpZz4j`, immutable URL
  `https://attendance-management-admin-dipvm4pm2.vercel.app`, reported Ready,
  Production, Current, with `https://exampulse.xyz` assigned. Build: 1m 18s.
- Retain prior patched deployment `8EZWuRA61gymbAPFMyKX3LXGdozf`, release
  `d869264`, as the application rollback target. It was independently observed
  Ready before rollout; do not delete it. No database restore is involved.
- Canonical-domain HTTP checks after activation: GET /login and /scan 200;
  unauthenticated GET /health 307 to /login?next=%2Fhealth; GET /api/auth/me 401;
  unauthenticated POST /api/operations/check 401 with no-store.
- The actual public scanner bundle
  `/_next/static/chunks/app/scan/page-0a05b1a0ed768cc9.js` contains the preparation
  panel, real setup-stage labels, Retry action and late-load recovery copy; the
  removed progress-bar label and misleading Camera ready message are absent.
  Browser verification showed the canonical public invigilator login rendering.
- No exam/roster/account/attendance changes, real emails, migrations, credential
  changes or scheduler edits were performed for this follow-up release. The
  prior closed synthetic exam remains closed. No authenticated camera/OCR or
  real-phone acceptance is claimed from login/bundle checks; ask the owner to
  test their phone using an existing authorized room without marking students.

Proof: ignored
`test-results/production-cutover-20261019/scanner-release-ready.jpg`.
The original deployment and smoke history below remain historical evidence.

The agent verified both production monitoring secrets were saved as Secret with
Production-only scope, without revealing values. Release-gate run `39225198957`
passed for `d869264369034fb335546636cd97d273ecd78a6a` on `hardening/staging`.
With the database upgrade committed and production configuration prepared,
`main` was fast-forwarded from `be55c6f` to that exact tested SHA. No force push,
staging-data restore, or staging artifact promotion was used.

Vercel built the commit using the production project's environment and reported
deployment `8EZWuRA61gymbAPFMyKX3LXGdozf` Ready, Production, Current, with
`https://exampulse.xyz` assigned. Build duration was 1 minute 40 seconds. Its
immutable deployment URL is `https://attendance-management-admin-omc16bbgm.vercel.app`.
The deployment settings show region `sin1` and the app's Node 22.x runtime
alongside the dashboard's 24.x default. The repeat `main` release-gate run
`39225715249` also completed successfully.

Production smoke checks completed by the agent:

- `/login` and `/scan`: HTTP 200; production admin login rendered correctly.
- Unauthenticated `/health`: HTTP 307 to `/login?next=%2Fhealth`.
- Unauthenticated `/api/auth/me`: HTTP 401.
- Unauthenticated POST `/api/operations/check`: HTTP 401 with `no-store`.
- Scanner telemetry without Origin: HTTP 403; the same unauthenticated request
  with the correct Origin returned HTTP 401. Both checks blocked access; the
  origin-less rejection is not a failed authentication regression.
- Authenticated POST to the exact production `/api/operations/check` endpoint
  using the newly saved production checker secret: HTTP 200,
  `{"status":"checked","accepted":0,"unknown":0,"suppressed":0}`;
  request ID `5e4ff440-463e-45cc-95af-c668107270d1`. This verifies the configured
  checker and database query path, not inbox delivery or a running scheduler.

No production attendance marks, roster imports, assignment/account edits,
exports, or real emails were submitted during these smoke checks. Diagnostic
observations may be recorded by the enabled telemetry. Deployment proof is saved
in ignored `test-results/production-cutover-20261019/vercel-production-ready.png`.

The owner signed into the immutable production deployment URL through Vercel's
Visit link, without sharing a password. Read-only authenticated UI checks passed:
dashboard rendered, six existing sessions were listed (two active, four closed,
no drafts), the invigilator screen rendered 21 invigilators, and Health showed
persisted API observations with zero 5xx in the small current window. Health
captured `2026-10-19T08:56:17.418Z`, with monitoring query round trip 59 ms and no
threshold warnings. This is not a capacity test or a device/crash guarantee.

Initially the canonical `exampulse.xyz` browser tab was signed out because
authentication cookies are host-specific. The owner subsequently signed into
the actual public domain. The agent independently verified its authenticated
dashboard, session persistence after reload, and protected Health page.
At `2026-10-19T09:21:07.976Z`, Health displayed two active exams, no scanner
observations, no threshold warnings, monitoring query round trip 56 ms, and two
admin-login observations with zero 5xx. Attendance history rendered a 51-row
table (header included; not the total record count) and incidents a 17-row table
(header included). No student names, access codes or individual attendance
records were printed for these read-only checks. No cookies or tokens were
copied between origins.

Invigilator/attendance write workflows and real delivery/webhook acceptance
were initially pending; the later controlled smoke results below supersede
that checkpoint within their stated scope. After the owner signed into
cron-job.org, read-only dashboard inspection found only the existing staging
job, with recent successful scheduled runs. The owner first chose to configure
production themselves, then explicitly requested that the agent do it.

After explicit action-time owner approval to store the existing production
checker token with cron-job.org and enable the job, the agent created the
separate enabled job `ExamPulse production operations`, ID `8675994`:
`https://console.cron-job.org/jobs/8675994`.
Target `https://exampulse.xyz/api/operations/check`,
POST, empty body, every 15 minutes in Australia/Sydney, 30-second timeout,
response history enabled, failure notification after one failure, recovery
notification enabled, existing all-channel notification selection, and no
redirect-as-success setting. The production Authorization header was populated
from the existing private production file without printing its token. No token
was regenerated, stored in Git, or put into a URL. The saved settings and
failure/recovery notification checkboxes were independently re-opened and
verified. The staging job is unchanged.

The external provider's manual test passed on 19 October at
`2026-10-19T09:26:07Z` (20:26:07 Australia/Sydney), HTTP 200, duration 2.82 s,
`{"status":"checked","accepted":0,"unknown":0,"suppressed":0}`;
request ID `0feec514-37f5-48c4-b311-106b9e8897b1`. No alert email was sent by this
test. The saved UI listed next scheduled executions at 20:30 and 20:45 Sydney.
Two actual scheduled production successes were subsequently observed:

- Scheduled `2026-10-19T09:30:00Z` (20:30 Sydney), executed 20:30:30,
  displayed jitter 30.61 s, duration 1.29 s, Successful / HTTP 200.
- Scheduled `2026-10-19T09:45:00Z` (20:45 Sydney), executed 20:45:19,
  displayed jitter 19.42 s, duration 2.88 s, Successful / HTTP 200.

The automatic scheduling check is complete. Production-job failure/recovery
inbox delivery is not claimed from these successful runs. The same account's
staging notification evidence remains separate.
Proof: ignored `test-results/production-cutover-20261019/cron-production-test-ok.png`.
Do not present deployment success as full workflow acceptance or infer that
staging's scheduler monitors production.

## Controlled production workflow acceptance

The owner explicitly approved a new synthetic exam, the limited invigilator
`ahmad.sohair+exampulse-smoke@gmail.com`, its access-code email, fake attendance
and closure with labeled history retained. Existing exams, rosters and staff
were not edited. No credential was printed or added to Git.

- Test exam: **PRODUCTION SMOKE TEST - 2026-10-19 - NOT A REAL EXAM**,
  ID `b6e92109-28a5-48fe-9e9f-606e80ba5b79`, date 19 October, start 20:30 Sydney.
- Created **PRODUCTION SMOKE TEST - Invigilator** through the normal admin UI.
  The provider accepted its access-code email; the owner confirmed inbox receipt
  and that its scanner link targets `https://exampulse.xyz/scan`. This is actual
  inbox confirmation, not a claim that provider webhook tracking was configured.
- CSV import produced four synthetic allocations and two rooms, `SMOKE-A` and
  `SMOKE-B`. Saved assignments to only the new test account and published through
  the normal review flow. Scanner login showed only those two test rooms.
- Manual lookup/mark of synthetic `9991001` in `SMOKE-A` synchronized normally
  at `2026-10-19T09:39:06.874732Z`. A repeated lookup showed Already marked and
  no Mark Present action; export confirms only one attendance row for that ID.
  This checks duplicate UI behavior, not a newly forced network replay drill.
- Synthetic `9991003` reported Wrong room detected with expected `SMOKE-B`.
  The explicit Mark present in SMOKE-A action recorded a mismatch at
  `2026-10-19T09:39:33.542247Z`, retaining its original allocation and adding one
  `wrong_room_present_override` incident. Neither action used a real student.
- The public-domain admin report showed two attendance records, one mismatch
  and one incident. An XLSX export contained Summary, Register, Attendance and
  Incidents sheets: four distinct allocated IDs, two recorded attendees and two
  absent students. Expected-room and actual-room counts reconciled separately.
- The test exam is now **Closed**. A second XLSX export has identical sheet
  records to the active-exam export; ZIP-level file hashes differ. Independent
  ExcelJS assertions passed for every count, ID, override and before/after row.
  Active export SHA-256 `6c9e552012ea5a1a25eb1ba2c839c61996d7f778af5a314f220cfb62dade1fad`;
  closed export SHA-256 `ebb47efc3a6b12fe3024ded02a734bb5eafac487254d299a0cc32bcd8228723d`.
- After closure the owner signed in with the test email's code. The agent
  independently verified **No active rooms assigned**, then signed the account
  out and verified the empty login form. A stale-client post-closure mutation
  was not submitted in this live pass; its server rejection has separate private
  rehearsal evidence. Do not call this a new production 409-response test.

The synthetic exam, account, assignments and audit history are intentionally
retained, not deleted. No queued test mark remained after synchronization.
The real exam roster is still an owner preparation task. Freeze unrelated
deployments, reconcile that import and confirm on-site/paper recovery ownership
before inviting staff. Physical-device and capacity follow-ups remain explicitly
owner-deferred, not newly passed by this small desktop smoke test.

Ignored local evidence under `test-results/production-cutover-20261019/`:
`production-synthetic-exam-closed.png`, `production-synthetic-closed-no-rooms.png`,
`cron-production-two-scheduled-successes.png`, both synthetic exports and
`verify-synthetic-exports.cjs`. The verifier passed at `2026-10-19T09:45:27.379Z`.

### Import fixture limitation, not a silent compatibility pass

An initial artifact-tool XLSX fixture failed validation before any exam was
created. Its XML uses namespace-prefixed elements (`x:workbook` / `x:worksheet`);
the deployed ExcelJS reader independently failed with an undefined `sheets`
error, then the existing CSV fallback produced a misleading Row 22 / cell-length
message. The five-row synthetic fixture was therefore imported as supported
CSV. No application code or dependencies were changed during this smoke test.
The app-generated XLSX exports read successfully. This does not certify import
of every valid namespace-prefixed XLSX; retain reader/error-classification
compatibility as a follow-up and validate the owner's actual roster format.

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
is deployed and verified. Application deployment and its initial public/monitoring
smoke checks subsequently passed as recorded above; authenticated workflow and
scheduler checks remain outstanding. Production Vercel settings were inspected
after the owner signed into a dedicated tab, without sharing credentials.

### Production Vercel configuration inspection

After the owner signed in, the agent verified the actual production project is
`attendance-management-admin`, ID `prj_BUz1WBp22FSITsDwW3CiRszSe0sP`, serving
`exampulse.xyz`. At the initial inspection the active deployment was historical
`be55c6f` on `main`; it has since been replaced by the release recorded above. The existing
project is connected to `ahmedsohair/AttendanceManagement` with root directory
`apps/admin`, Next.js preset, no dashboard build/install override, and outside-root
files enabled. The dashboard default Node version is 24.x; the reviewed app's
`engines.node` requires 22.x. Verify the actual new deployment's runtime/build
settings rather than assuming the dashboard default was used.

Both public and server Supabase URL values were inspected through the project
UI and point to `https://mtoyhpyxqhfwhcrysqon.supabase.co`. Existing publishable
and service-role keys are present, as are mail/base-URL configuration and Resend/
SMTP credentials. Their secret values were not revealed, copied from staging,
or replaced. Presence alone is not live authentication/mail acceptance.

The agent saved five new non-secret variables, scoped only to Production:
`OPS_MONITORING_ENABLED=true`, `SCANNER_TELEMETRY_ENABLED=true`,
`NEXT_PUBLIC_SCANNER_TELEMETRY_ENABLED=true`, `OPS_ALERTS_ENABLED=true`, and
`OPS_ALERT_EMAIL=ahmad.sohair@gmail.com`. The UI confirmed success and that a new
deployment is required. They are now included in the production release above.

`scripts/prepare-production-monitoring-secrets.ps1` generated two distinct
32-byte random production-only secrets into an owner-only ACL-protected file
outside Git. Values were not printed or stored in documentation. The owner was
asked to import `OPS_HEALTH_SECRET` and `OPS_CHECK_SECRET` into this project's
Production environment as Secret. Both saves were subsequently independently
verified in the UI, and the authenticated checker passed on production. The
production scheduler is now configured and its external manual test passed as
recorded above; actual scheduled-run history still needs observation. Do not reuse the
staging secrets or modify staging's scheduled job to guess a production secret.
The current private file is under `C:\Users\ahmad\ExamPulseSecrets`; retain it
securely for the production scheduler setup. Do not generate replacements
accidentally after saving the initial values.

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
