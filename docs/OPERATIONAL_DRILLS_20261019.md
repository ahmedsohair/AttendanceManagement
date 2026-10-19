# Operational recovery drills - 19 October 2026

## Result and boundaries

Seven technical drills passed against a fresh, synthetic-only private application
fixture. No hosted database, production deployment, credential, DNS entry, or
business record was modified. No real email was attempted. Institutional sign-off,
hosted provider behavior and physical iPhone/Android acceptance are not inferred.

The existing private rollback helper built candidate `72d8b4e` and fallback
`04da701` independently, applied all 20 reviewed migrations, and passed its
original authenticated replacement scenario before these additional drills.
The tested app/shared source and lockfile are identical across those revisions.
These results are not compatibility approval for arbitrary older builds.

Command from the independent dependency checkout:

```powershell
node .\scripts\rehearse-application-rollback.mjs --confirm-private-rehearsal --include-operations-drills
```

Implementation: `scripts/rehearse-private-operations.mjs`, invoked only by the
explicit additional flag. It rejects non-loopback fixture URLs. Database,
Auth v2.197.0, PostgREST v14.18 and request bridge share a network-disabled
namespace with no published ports. Next and the host gateway bind only to
loopback and use an allowlisted environment, not `.env` files. Chromium uses
synthetic camera input; requests outside the fixture's loopback origins are
blocked. No actual OCR model, phone hardware or hosting outage is involved.

## Evidence

| Drill | Verified outcome | Limit / remaining owner acceptance |
| --- | --- | --- |
| Committed response lost | The real attendance endpoint committed the browser's mark; Playwright discarded the response. IndexedDB retained the original request across reload. Replay drained the queue, returned the original event identity and left exactly one attendance event. Every observed retry used the original request ID. | Controlled Chromium response loss, not a Safari process kill or a real provider outage. |
| Offline and alternate origin | After a successful lookup, offline submission remained queued with no server mark. A page on another loopback hostname had neither that login nor its IndexedDB queue. Original-origin evidence remained intact. | Does not test real DNS, TLS, or a hosted alternate domain. Never send real users to staging as failover. |
| Post-closure queue / Retry / Acknowledge | Closing the exam before replay yielded a visible conflict without marking. Retry sent the same queued request and remained conflicted. Cancelling Acknowledge preserved the item; accepting removed only the local item and created no attendance. A synthetic screenshot was retained privately. | The production owner still decides reconciliation; acknowledgement is not attendance or a substitute for retaining unresolved evidence. |
| Mixed committed / queued / paper | A synthetic paper record was entered through the normal active-exam mark flow, without timestamp edits. Export reconciled all four student IDs, two marks and two absences, including the unresolved closed-exam item. | This is a technical scenario, not institutional permission for paper collection, retention, post-closure amendments or backdating. |
| Email credentials unavailable | With no Resend/SMTP credentials, the access-code email request failed, its delivery recorded failed, no accepted/delivered row or emailed timestamp appeared, and the existing access code still resolved. | Unconfigured-provider failure only: no simulated actual SMTP/Resend outage, throttling, bounce, recipient quarantine, retry recovery or real inbox delivery in this drill. |
| Roster correction | Duplicate input was rejected without creating an exam. An incorrect, unmarked draft was typed-deleted and audited. Reimporting the corrected workbook produced the exact intended student-ID set. | This does not authorize deleting active/closed exams or provide a bulk repair/backdated-entry feature. |
| Account containment | Normal stage/activate flow rejected the old code/password. Banning the synthetic account rejected an issued token at an app endpoint and blocked password login. Global sign-out rejected both freshly created sessions and refresh. New-code reauthentication recovered normal access without deleting audit history. | Tested on the pinned local Auth version and app `getUser` authorization path only; hosted Auth version/configuration and direct Data API JWT/RLS behavior require separate verification. |

Private ignored evidence:

`C:\dev\AlgoAttendance-scanner-security\test-results\rollback-rehearsal-122ed279-d699-4cde-9224-02366ed76a1e\summary.json`

`C:\dev\AlgoAttendance-scanner-security\test-results\rollback-rehearsal-122ed279-d699-4cde-9224-02366ed76a1e\operational-drills.json`

All browser contexts/Next processes stopped and all four owned containers were
removed. Git exports/builds remain as ignored evidence and contain dependency
junctions: do not recursively delete them or run install/prune through them.

Verification also passed all 95 existing web tests and 12 rehearsal/guard tests,
including refusal of staging/production, non-HTTP origins, embedded credentials
and URL suffixes before fixture access. The actual browser/API drills run only
with the explicit private-rehearsal flags; hosted CI runs the safe guard/parser
tests, not a production backup or these live-service fixtures.

## Account containment interpretation

Code rotation is not the whole incident procedure. Preserve affected device
queues, stop use of the exposed account, record affected assignments and review
attendance/incident history. An authorized operator must use supported Auth
controls to disable access and revoke sessions, verify rejection, then restore
legitimate access with a new code. Do not delete the user to erase evidence.
Do not temporarily unban a real account merely to copy this automated sequence;
coordinate safe access/assignment restrictions before any recovery window.

The local test deliberately banned then unbanned its synthetic user to exercise
distinct controls before global sign-out. The temporary unban is a test step,
not a universally safe production incident prescription. The newer Auth source
[checks banned users and session existence](https://github.com/supabase/auth/blob/v2.197.0/internal/api/auth.go)
when the app calls `getUser`. Supabase's
[session guidance](https://supabase.com/docs/guides/auth/sessions) separately
explains that JWT validation alone can remain valid until expiry. Direct Data API
RLS reads must therefore not be declared instantly revoked from this app-endpoint
test. Keep access/assignment restrictions until the approved revocation/expiry
condition is actually verified. Do not invent an already-tested one-click
production containment action.

## Current hosted observation

One read-only staging admin Health request at `2026-10-19T02:58:02.370Z`
returned 200, metrics available, monitoring/alerts enabled and no heartbeat
configuration warning. Monitoring-query round trip was 121 ms. This single
observation is neither a resource-overhead measurement nor an independent
availability check. Local ignored evidence: `test-results/health-readiness-20261019.json`.

Public GitHub status inspection found successful checks for the tested fallback
under both Vercel project names; links and remaining target/environment checks
are in `PHASE_8_OWNER_SIGNOFF_20261019.md`. A success status is not hosted
rollback activation or evidence of the current production backend.

## Remaining acceptance

The external scheduler is still pending by owner confirmation. Follow
`PHASE_8_OWNER_SIGNOFF_20261019.md` for actual scheduled success and independent
failure/recovery email, resource graphs/comparison or explicit owner deferral,
private hosted-recovery inventory, fallback deployment selection and
institutional procedure approval. Dependency exposure triage is separate from
remediation/risk acceptance. No production promotion or physical-device waiver
is authorized by these drills.
