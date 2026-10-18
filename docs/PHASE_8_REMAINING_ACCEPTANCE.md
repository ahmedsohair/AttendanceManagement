# Phase 8 remaining acceptance

## Boundary

This is the finite outstanding acceptance list, not a new hardening phase. Production remains unchanged. Physical Android/iPhone acceptance is owner-deferred. Local production environment files must not be used for experiments.

## Scheduled checks and independent notifications

Read-only GitHub inspection on 4 September 2026 confirmed: default branch `main`; no Actions secrets; no `STAGING_OPS_CHECK_ENABLED` variable; monitoring workflow absent from `main`. Consequently there is no verified active GitHub scheduler. Do not merge the application into production just to enable scheduling.

An external scheduler avoids that dependency. Suggested free option: [cron-job.org](https://cron-job.org/en/), whose [FAQ](https://cron-job.org/en/faq/) documents custom methods/headers and failure email notifications. Account creation and storing the staging-only bearer secret with this third party require the owner's action/approval. No account or job has been created by the agent.

Configure one job, not both GitHub and an external scheduler:

- Target: `https://exampulse-stagings.vercel.app/api/operations/check`
- Method: POST; empty body; every five minutes.
- Header name: `Authorization`; value: `Bearer ` followed by the saved staging `OPS_CHECK_SECRET`. Never put it in the URL.
- Enable failure and recovery notifications to the owner's verified account email, `ahmad.sohair@gmail.com`.
- No public status page or public response history; do not share secret-bearing screenshots.
- Keep deployment protection intact. If it rejects the scheduler, stop and configure a scoped approved bypass rather than disabling protection.

Acceptance: observe two actual scheduled successful runs, not only manual tests. Rehearse notification failure with a temporary separate job using an intentionally invalid authorization value against the same staging endpoint (expected 401), leaving the real job unchanged. Confirm the provider's failure email actually arrives, then remove the temporary job. This tests the external notification path without breaking the application. Check scheduled history for missing runs; notifications about failed HTTP requests do not prove detection of the scheduler's own outage.

## Recovery evidence and limits

The existing 70-test web suite passed on 4 September; three new real-source persistence tests and three scheduler-process tests also passed. Type-check passed. Tests use isolated dependencies/fake IndexedDB, not production services.

- OCR: initialization error classification, prediction recovery and 200-frame reuse passed. Browser model-download blocking/manual fallback and physical crash recovery are not established by these tests.
- Database/network: offline queue persistence/reconnect, request timeout/cancellation and terminal closed-exam conflict tests passed. A full browser committed-but-response-lost rehearsal remains unverified.
- Monitoring: actual persistence function defers database access until the after-response callback; scheduler/database failures do not escape; storage identifiers are HMAC digests. Protected endpoint tests cover provider failure and unavailable metrics. These are controlled dependency tests, not a live database outage.
- Email: real alert inbox and immediate repeat suppression passed. Scheduler CLI exits nonzero for unavailable/unauthorized/ambiguous delivery, malformed results and network failure, and refuses production URLs. Provider/invigilator-email fallback and scheduler notification acceptance are separate.
- Roster: malformed workbook, duplicate student rows and canonicalization tests passed. An operator correction/reconciliation exercise remains pending.
- Deployment: local application replacement/fallback compatibility passed on 19 October with real synthetic Auth/REST and preserved committed attendance. Hosted rollback activation, target deployment/environment selection and alternate-origin behavior were not exercised; see the October report.
- Compromised code: existing-session containment remains a real gap. Do not claim password/code rotation revokes already-issued sessions. A disposable staging account and authorized operator access are needed to test the supported containment procedure without disrupting test users.
- Manual fallback: institutional owner approval and mixed paper/queued/committed reconciliation tabletop remain pending; they cannot be certified by an agent-only unit test.

## Performance acceptance

Repeat the existing 1,000-lookup/20-worker plus 200-sequential-lookup staging test with monitoring enabled. Compare with the owner's earlier baseline, but label the result historical, not a controlled on/off experiment. Client RSS is load-generator memory, not Vercel or PostgreSQL resource consumption. Provider CPU/connections/function-duration evidence and a matched on/off comparison require operator dashboard/configuration access. Do not toggle production or assert resource overhead from request latency alone.

Completed on 4 September 2026 with monitoring enabled: 1,000 concurrent lookups, zero failures, p50 343 ms / p95 440 ms / p99 503 ms / maximum 645 ms; 200 sequential lookups, zero failures, p50 359 ms / p95 433 ms / p99 505 ms / maximum 694 ms. Both existing release gates passed. Historical owner baseline: concurrent p95 613 ms / p99 1540 ms; sequential p95 536 ms / p99 1049 ms. No latency regression observed in this comparison; no causal overhead claim. Load-generator RSS growth was +29 MiB during concurrency and -29 MiB during soak. No attendance writes. Machine-readable evidence: `test-results/staging-load-summary.json` (local ignored artifact).

## Completion rule

Close only evidence-backed items. Scheduling/notification evidence, provider overhead evidence and the remaining live/operator rehearsals still need completion or explicit owner deferral. Do not silently reclassify those as passed or introduce further product work into this phase.

## October production-readiness checkpoint

See [PRODUCTION_READINESS_20261018.md](PRODUCTION_READINESS_20261018.md) for current
staging API/scanner/admin lifecycle evidence and the two forward database
corrections. Their final-state CI regression passed. The owner installed the
business-conflict correction on staging; its bounded stale-assignment HTTP retest
passed with 409 in 630 ms and unchanged staffing/audit history. The separate
audit-order correction also passed the owner's live rollback-only regression on
19 October, with the definition-hash difference independently verified as CRLF
versus LF. A green disposable-database job alone is not evidence that Supabase
received a migration. Physical acceptance and the
remaining operator rehearsals above are not waived.

The owner's 18 October staging catalog snapshot has now been reviewed: all 16
expected tables have RLS enabled, all expected routine names are present, the
three audit/integrity triggers are enabled, and all four legacy audited cores
deny service-role execution. Full audit-body/behavior and fresh relational-integrity
validation remain separate from this catalog check.

The owner's production catalog snapshot has also been compared. It has the seven
original core tables with RLS enabled but none of the inspected hardening RPCs;
nine newer tables and eight newer columns are absent. The hardened application
must not be promoted against that baseline. Fresh aggregate production integrity
validation, backup/private restore and upgrade/rollback rehearsal are next; no
production migration has been applied or authorized by the snapshot exchange.

The owner subsequently reported production relational-integrity `total: 0` from
the requested read-only SQL. Record this as operator-reported evidence, not a raw
JSON artifact or a restore/migration pass. Fresh production backup and private
restore/upgrade rehearsal are next; the agent has no production database URL.

The fresh backup `production-20261018-220510` has now been independently
checksummed. A network-isolated Docker rehearsal restored all seven application
tables, applied all 20 migrations twice, preserved all original-column
fingerprints/counts, and passed audit/conflict/operations/integrity tests. The
container was removed. See `PRODUCTION_UPGRADE_REHEARSAL_20261018.md` for evidence
and scope: managed Auth/Storage records were not restored, and application
rollback behavior was not exercised. Those remaining gates are not closed by
the application-data rehearsal.

On 19 October the owner reported applying the final audit-contract correction to
staging. The test now verifies authorization before nonexistent-exam lookup and
returns a compact JSON summary before rolling back. The stronger private
rehearsal passed; the owner subsequently supplied a passing live staging result
for audit behavior and legacy-core denial. The reported definition MD5
`5874ce7eadf7dd8cbb1f1ce0ac3f0da2` was reproduced locally from the reviewed
function using CRLF; LF reproduces the private reference hash. This scoped
audit-contract gate is closed. All five release-gate jobs on `72d8b4e` passed.
The subsequent managed Auth data rehearsal passed against the verified backup:
all 26 Auth tables and original columns restored, exact COPY round-trips,
24 foreign keys, generated sequence reconciliation and official migrator replay
with original fingerprints preserved. Both network-isolated containers were
removed. No production session was replayed or hosted database changed. Hosted
Auth configuration/signing-key recovery remains outside these data-only checks;
see the linked rehearsal report for private evidence and limits.

The local application fallback rehearsal also passed on 19 October: candidate
`72d8b4e` was stopped and separately built fallback `04da701` started against the
same fully migrated synthetic database. Existing admin cookies/attendance were
preserved; replay/duplicate/conflict handling, new marks, wrong-room controls,
export, closure and audited deletion passed, with zero final integrity violations
and no queued email. All private services stopped. The two revisions have
identical application/shared source and lockfile, so this is a bounded baseline
fallback test, not approval for arbitrary older revisions or database downgrade.
Hosted deployment/environment selection and operator authorization remain
separate. Production `main` is not an approved post-upgrade fallback. No live
deployment, provider configuration, DNS or business data was changed.
