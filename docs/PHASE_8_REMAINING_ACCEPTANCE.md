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
- Deployment: actual rollback rehearsal remains pending; no deployment rollback or alternate-origin migration was attempted.
- Compromised code: existing-session containment remains a real gap. Do not claim password/code rotation revokes already-issued sessions. A disposable staging account and authorized operator access are needed to test the supported containment procedure without disrupting test users.
- Manual fallback: institutional owner approval and mixed paper/queued/committed reconciliation tabletop remain pending; they cannot be certified by an agent-only unit test.

## Performance acceptance

Repeat the existing 1,000-lookup/20-worker plus 200-sequential-lookup staging test with monitoring enabled. Compare with the owner's earlier baseline, but label the result historical, not a controlled on/off experiment. Client RSS is load-generator memory, not Vercel or PostgreSQL resource consumption. Provider CPU/connections/function-duration evidence and a matched on/off comparison require operator dashboard/configuration access. Do not toggle production or assert resource overhead from request latency alone.

Completed on 4 September 2026 with monitoring enabled: 1,000 concurrent lookups, zero failures, p50 343 ms / p95 440 ms / p99 503 ms / maximum 645 ms; 200 sequential lookups, zero failures, p50 359 ms / p95 433 ms / p99 505 ms / maximum 694 ms. Both existing release gates passed. Historical owner baseline: concurrent p95 613 ms / p99 1540 ms; sequential p95 536 ms / p99 1049 ms. No latency regression observed in this comparison; no causal overhead claim. Load-generator RSS growth was +29 MiB during concurrency and -29 MiB during soak. No attendance writes. Machine-readable evidence: `test-results/staging-load-summary.json` (local ignored artifact).

## Completion rule

Close only evidence-backed items. Scheduling/notification evidence, provider overhead evidence and the remaining live/operator rehearsals still need completion or explicit owner deferral. Do not silently reclassify those as passed or introduce further product work into this phase.
