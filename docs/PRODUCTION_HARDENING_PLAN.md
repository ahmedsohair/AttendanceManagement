# ExamPulse Production Hardening Plan

## Purpose

This document tracks the work required to make the ExamPulse admin web app and cross-platform web scanner robust, secure, responsive, and operationally safe for real examinations. The plan is based on the production audit completed on 27 August 2026.

The work is divided into phases so that high-risk changes are isolated, tested, deployed, and observed before the next phase begins. Every implementation item should normally be delivered as its own commit unless two changes are inseparable.

## Scope Boundary

- This roadmap covers the admin web app, browser-based scanner, APIs, Supabase database, email delivery, deployment, testing, and operational monitoring.
- The browser scanner must work reliably on iOS Safari and supported Android browsers.
- Existing native mobile code is not part of this hardening program and must not block a web release.
- Native iOS and Android apps will be designed and implemented later as a separate clean-slate project.
- The future native apps should mirror the proven web scanner workflows and API contracts rather than reuse unstable legacy native implementation details.

## Success Targets

- Scanner lookup p95 below 1 second on a normal Australian mobile connection.
- Attendance marking p95 below 1 second, excluding OCR detection time.
- No duplicate attendance records under concurrent multi-device use.
- No partial imports, assignment replacements, access-code rotations, or mismatch audit records.
- Scanner remains usable after transient network, camera, tab-backgrounding, or OCR failures.
- No unauthenticated resource-intensive endpoints.
- No known high-severity runtime vulnerabilities.
- Critical workflows covered by automated integration and end-to-end tests.
- Production errors and latency regressions visible through dashboards and alerts.

## Delivery Rules

- Do not combine database migrations, dependency upgrades, scanner behavior changes, and visual changes in one deployment.
- Create a backup or recovery path before every destructive database migration.
- Apply schema changes to a non-production Supabase project first.
- Keep all migrations idempotent where practical.
- Preserve the current spreadsheet import and attendance export formats unless a change is explicitly approved.
- Preserve the unique attendance rule on `(exam_session_id, student_id)`.
- Never acknowledge attendance to the user until the server has committed it or safely persisted it in an offline outbox.
- Record baseline and post-deployment timings for every performance phase.

---

## Phase 0: Baseline, Recovery, and Change Safety

**Goal:** Establish a safe measurement and rollback foundation before changing production behavior.

### 0.1 Capture the production baseline

- [ ] Record p50, p95, and maximum duration for:
  - access-code verification
  - room loading
  - student lookup
  - attendance marking
  - room live-state refresh
  - admin dashboard loading
  - exam detail loading
- [ ] Record cold and warm Vercel function timings separately.
- [ ] Record ONNX model load time on representative Android and iPhone devices.
- [ ] Record scanner memory behavior for at least 100 consecutive scans.
- [ ] Save the measurements in `docs/performance-baseline.md`.

### 0.2 Establish database recovery

- [x] Confirm Supabase backups or point-in-time recovery availability.
- [x] Export the schema before transactional RPC work begins.
- [x] Create a documented manual export procedure for sessions, allocations, attendance, incidents, users, and assignments.
- [x] Verify that a test export can be restored into a separate project.

### 0.3 Establish a staging environment

- [x] Create a separate Supabase staging project.
- [x] Create a Vercel preview/staging environment connected only to staging Supabase.
- [x] Add representative anonymized data: 1,000 students, 10 rooms, 20 invigilators, mismatch and duplicate cases.
- [x] Ensure staging email is restricted to safe test recipients (delivery credentials are intentionally unset).

### Acceptance Criteria

- Baseline metrics are documented.
- A staging deployment can run independently of production.
- Database recovery has been tested, not merely configured.

---

## Phase 1: Immediate Security and Infrastructure Fixes

**Goal:** Remove exposed attack surfaces and eliminate the largest avoidable latency source without altering attendance behavior.

### 1.1 Align Vercel functions with Supabase

- [x] Configure staging Vercel Node.js functions to execute in Singapore (`sin1`), close to the Supabase project.
- [x] Confirm staging deployment headers no longer show execution in `iad1`.
- [x] Repeat the Phase 0 latency measurements on staging with 30 samples per operational API, including 30 real attendance writes.
- [x] Retain global CDN delivery for static assets; only server functions were moved near the database.

**Expected result:** Large reduction in API round-trip latency without application logic changes.

### 1.2 Remove or secure legacy server OCR

- [x] Confirm `/api/ocr/student-id` is unused by all supported web scanner flows and legacy clients.
- [x] Delete the unused route and `tesseract.js` dependency.
- [x] Route hardening is not applicable because the unused endpoint was removed entirely.
- [x] Verify the removed endpoint is no longer exposed (HTTP 404 confirmed on staging), while scanner load and synthetic login still return HTTP 200.

### 1.3 Upgrade vulnerable runtime dependencies

- [x] Upgrade Next.js from 15.5.19 to 15.5.21 to resolve the framework-level advisories; PostCSS and Sharp transitive advisories remain tracked separately.
- [ ] Apply safe non-breaking dependency updates first.
- [ ] Review `sharp`, `postcss`, `protobufjs`, `ws`, `exceljs`, and Expo transitive advisories individually.
- [ ] Do not use `npm audit fix --force` without reviewing proposed breaking changes.
- [ ] Regenerate the lockfile from a clean install and rerun build/type checks.
- [ ] Record accepted build-only residual vulnerabilities with justification and review date.

### 1.4 Add baseline HTTP security headers

- [ ] Disable `X-Powered-By`.
- [ ] Add `X-Content-Type-Options: nosniff`.
- [ ] Add an appropriate `Referrer-Policy`.
- [ ] Prevent framing with CSP `frame-ancestors` or equivalent protection.
- [ ] Add a restrictive `Permissions-Policy`, allowing camera access only where required.
- [ ] Introduce CSP in report-only mode first, including Supabase and approved OCR asset origins.
- [ ] Move to enforced CSP after verifying scanner, authentication, fonts, WASM, workers, and email links.

### 1.5 Rate-limit authentication surfaces

- [ ] Add rate limiting to access-code verification by IP and normalized code fingerprint.
- [ ] Add rate limiting to admin sign-in and password-reset requests.
- [ ] Add progressive delays or temporary lockouts after repeated failures.
- [ ] Return a generic invalid-credentials response that does not disclose whether a code or email exists.
- [ ] Log rate-limit events without logging access codes.

### Acceptance Criteria

- Production functions run in the intended region.
- The legacy OCR endpoint is removed or protected.
- No known high-severity vulnerability remains in the deployed web runtime.
- Security headers pass an external header check without breaking OCR or authentication.
- Automated login-abuse tests demonstrate throttling.

### Rollback

- Region configuration can be reverted independently.
- Deploy CSP as report-only before enforcement.
- Keep dependency upgrades in separate commits so individual packages can be reverted.

---

## Phase 2: Scanner Lifecycle and Browser Resilience

**Goal:** Eliminate scanner stalls, overlapping OCR, Safari memory spikes, frozen cameras, and unrecoverable client errors.

### 2.1 Make OCR single-flight

- [ ] Replace the async `setInterval` loop with a self-scheduling loop or guarded timer.
- [ ] Add an `ocrInFlight` guard so only one `predict()` call can run at a time.
- [ ] Schedule the next scan only after the current scan completes or fails.
- [ ] Prevent OCR from running while lookup, marking, review, manual mode, or navigation is active.
- [ ] Measure scan cadence and ensure there is no regression in detection speed.

### 2.2 Make ONNX initialization a controlled singleton

- [ ] Maintain one model-loading promise per page session.
- [ ] Prevent repeated taps or retries from starting parallel model loads.
- [ ] Distinguish download, initialization, timeout, unsupported-browser, and memory errors.
- [ ] Ensure a timeout cannot leave an untracked worker/model initialization running.
- [ ] Dispose resources exactly once when signing out or leaving the scanner.
- [ ] Provide `Retry OCR` and `Continue in Manual Mode` without reloading the whole page.

### 2.3 Reduce iOS memory pressure

- [ ] Profile model initialization and repeated predictions on representative iPhones.
- [ ] Reuse preprocessing buffers where feasible instead of allocating large arrays every scan.
- [ ] Cap crop dimensions based on device capability.
- [ ] Avoid retaining OCR result objects or canvases after use.
- [ ] Test WebAssembly SIMD capability before enabling it and provide a safe fallback.
- [ ] Evaluate worker mode only through device testing; do not change the currently working OCR backend without evidence.

### 2.4 Harden camera lifecycle

- [ ] Handle `visibilitychange`, `pagehide`, `pageshow`, and track `ended` events.
- [ ] Pause OCR and camera work when the page is backgrounded.
- [ ] Detect a frozen or ended camera track when returning to the app.
- [ ] Resume automatically where safe or show a clear `Restart Camera` action.
- [ ] Ensure torch state is reset when the camera track changes.

### 2.5 Replace brittle browser-back trapping

- [ ] Model scanner navigation explicitly as login -> room selection -> camera -> review.
- [ ] On browser back from review, cancel review and resume scanning.
- [ ] On browser back from camera, stop the camera and return to room selection.
- [ ] Avoid repeatedly pushing guard entries that can trap browser history.
- [ ] Verify Android Chrome, Samsung Internet, and iOS Safari navigation independently.

### 2.6 Add scanner recovery UI

- [ ] Add a scanner-level React error boundary.
- [ ] Preserve authentication and selected-room context after recoverable errors.
- [ ] Show actionable recovery choices: retry action, restart camera, manual mode, room selection, or sign out.
- [ ] Never expose stack traces or raw backend errors to invigilators.

### 2.7 Add request cancellation and timeout behavior

- [ ] Add `AbortController` timeouts to login, rooms, lookup, mark, and live-state requests.
- [ ] Cancel obsolete requests when the room changes, the user signs out, or a newer request supersedes an older one.
- [ ] Prevent stale responses from overwriting current scanner state.
- [ ] Distinguish timeout, offline, authentication-expired, conflict, and server errors.

### Acceptance Criteria

- At most one OCR prediction and one lookup/mark request are active at a time.
- Scanner completes 200 consecutive scans without memory growth, duplicated lookups, or a frozen camera.
- Backgrounding and restoring the browser works on Android and iOS.
- Every simulated client exception leads to a recovery screen rather than a blank application-error page.
- Manual mode remains available even when ONNX initialization fails.

---

## Phase 3: Atomic Attendance and Database Integrity

**Goal:** Guarantee correctness under retries, concurrency, partial failures, and multiple devices.

### 3.1 Create an atomic attendance RPC

- [ ] Implement a PostgreSQL function that validates:
  - authenticated user and role
  - active exam status
  - room belongs to the exam
  - invigilator is assigned to the marked room
  - student allocation exists in the exam
  - expected room belongs to the same exam
  - wrong-room override semantics
- [ ] Insert attendance and any required incident in one transaction.
- [ ] Preserve the unique `(exam_session_id, student_id)` constraint.
- [ ] Return a structured result for marked, mismatch-marked, already-marked, redirected, and not-found outcomes.
- [ ] Remove redundant application-layer database round trips after the RPC is verified.

### 3.2 Add idempotency

- [ ] Add a client-generated request ID to mark and redirect operations.
- [ ] Store or otherwise enforce uniqueness of the request ID.
- [ ] Return the original result when the same request is retried.
- [ ] Distinguish a retry from a separate duplicate scan.
- [ ] Verify timeout-after-commit scenarios do not create misleading failures.

### 3.3 Strengthen relational constraints

- [ ] Ensure marked and expected rooms belong to the attendance event's exam.
- [ ] Ensure the student has an allocation in the same exam.
- [ ] Ensure `room_mismatch`, `override_type`, expected room, and marked room remain logically consistent.
- [ ] Add checks or triggers for incident room/session consistency.
- [ ] Validate existing production rows before enabling new constraints.

### 3.4 Make imports atomic

- [ ] Move exam session, room, and allocation creation into one transaction/RPC.
- [ ] Roll back the entire import on duplicate students, invalid rooms, or allocation failure.
- [ ] Return committed row counts from the database, not only parsed client counts.
- [ ] Add an import checksum or summary for reconciliation.
- [ ] Keep spreadsheet parsing outside the database but commit normalized rows atomically.

### 3.5 Make room-assignment replacement atomic

- [ ] Validate the complete room snapshot and invigilator IDs inside the transaction.
- [ ] Check the optimistic concurrency snapshot/version.
- [ ] Delete and insert assignments in one transaction.
- [ ] Return the committed assignment snapshot to the UI.
- [ ] Prevent a failed save from leaving rooms unassigned.

### 3.6 Make access-code rotation consistent

- [ ] Separate code generation from code activation.
- [ ] Update authentication and application records with compensating rollback or a staged activation flow.
- [ ] Never invalidate a working code merely because an email failed.
- [ ] Decide whether code rotation should revoke existing sessions and implement that policy explicitly.
- [ ] Record code-created, activated, emailed, and revoked timestamps without storing plaintext codes.

### 3.7 Enforce exam state transitions

- [ ] Define allowed transitions: draft -> active -> closed.
- [ ] Decide whether closed -> active reopening is supported; reject it otherwise.
- [ ] Require complete allocations and room assignments before publication.
- [ ] Reject closing a draft unless explicitly supported.
- [ ] Prevent permanent deletion of active exams.
- [ ] Prefer soft deletion/archive for exams with attendance or incident history.

### Acceptance Criteria

- Fault injection between database steps cannot leave partial state.
- Concurrent marks from multiple devices produce one attendance event and deterministic responses.
- Repeated identical requests are safe.
- Import and assignment failure tests leave the database exactly as it was before the request.
- Invalid cross-session room/student references cannot be inserted, even through the service-role path.

---

## Phase 4: Network Resilience and Offline Attendance

**Goal:** Allow exam operations to continue safely through brief connectivity loss without creating duplicates or losing audit information.

### 4.1 Build a web scanner outbox

- [ ] Persist pending attendance operations in IndexedDB before sending.
- [ ] Include idempotency key, exam, room, student, source, comment, override, device, user, and queued timestamp.
- [ ] Remove an item only after a confirmed server result.
- [ ] Retry only retryable failures with bounded exponential backoff.
- [ ] Pause retry on authentication, validation, closed-exam, or permission errors.
- [ ] Display pending, syncing, failed, and conflict counts clearly.
- [ ] Provide an admin/invigilator recovery view for unresolved items.

### 4.2 Communicate connectivity honestly

- [ ] Replace the static `Connected` label with measured online/API state.
- [ ] Show last successful server synchronization time.
- [ ] Do not equate browser network status with backend reachability.
- [ ] Display an explicit offline-marked/pending state instead of `Attendance marked` until durable persistence is guaranteed.

### Acceptance Criteria

- Marks made during a controlled outage sync exactly once after reconnection.
- Closing an exam while a queue exists results in a visible conflict, not silent loss or infinite retries.
- Restarting the browser preserves pending operations.
- Two simultaneous flush attempts cannot duplicate or drop queue entries.

---

## Phase 5: Email and Operational Workflow Reliability

**Goal:** Ensure codes and assignment emails are consistent, traceable, retryable, and safe.

### 5.1 Stop rotating codes during ordinary email sends

- [ ] Display and email the currently active code where policy permits, or explicitly generate/activate a new code as a separate admin action.
- [ ] Do not regenerate every assigned invigilator's code when resending instructions.
- [ ] Require confirmation before any action that invalidates an existing code.

### 5.2 Add email delivery records

- [ ] Store recipient, exam, template version, provider message ID, requested time, accepted time, delivery status, and failure reason.
- [ ] Process Resend delivery/bounce/complaint webhooks with signature verification.
- [ ] Show accepted, delivered, bounced, complained, and unknown states in the admin interface.
- [ ] Do not label provider acceptance as confirmed inbox delivery.

### 5.3 Make bulk email asynchronous and retryable

- [ ] Replace the sequential request loop with a bounded background job or queue.
- [ ] Return immediately with a job ID and progress state.
- [ ] Retry transient provider failures without regenerating codes.
- [ ] Allow retrying selected failed recipients.
- [ ] Prevent duplicate sends through an idempotent job key.

### 5.4 Protect email reputation

- [ ] Monitor SPF, DKIM, and DMARC status.
- [ ] Move DMARC from monitoring toward enforcement after reviewing reports.
- [ ] Track bounce and complaint rates.
- [ ] Keep a plain-text fallback and concise HTML template.
- [ ] Provide a copyable manual fallback from the admin portal.

### Acceptance Criteria

- Email failure never invalidates a previously working code.
- Resending instructions does not unexpectedly rotate credentials.
- Admin can identify exactly which recipients failed and safely retry only those recipients.
- Provider acceptance and actual delivery are represented separately.

---

## Phase 6: Admin Scalability, Validation, and UX Robustness

**Goal:** Keep the admin portal fast and predictable as historical data grows.

### 6.1 Paginate large data views

- [ ] Add server-side pagination to attendance, incidents, mismatches, sessions, and invigilators.
- [ ] Move search, room filter, status filter, and sorting into database queries.
- [ ] Avoid loading all historical allocations merely to render one filtered page.
- [ ] Keep export as a separate full-data operation.

### 6.2 Tighten input validation

- [ ] Validate UUIDs at the API boundary.
- [ ] Validate exam dates as real dates and start times as valid local times.
- [ ] Normalize room codes consistently, with a documented case/whitespace policy.
- [ ] Validate email addresses and reject control characters.
- [ ] Reject duplicate uploaded files and conflicting duplicate students with actionable file/row messages.
- [ ] Validate committed import counts before allowing publication.

### 6.3 Improve API contracts

- [ ] Define stable error codes for unauthenticated, forbidden, validation, conflict, timeout, offline, and internal errors.
- [ ] Return correct HTTP statuses: 401, 403, 404, 409, 422, 429, and 500 where appropriate.
- [ ] Keep user-safe messages separate from internal diagnostic details.
- [ ] Add a correlation/request ID to responses and logs.

### 6.4 Protect destructive operations

- [ ] Require explicit confirmation containing the exam name for permanent deletion.
- [ ] Block deletion of active exams.
- [ ] Prefer archive/soft-delete when audit history exists.
- [ ] Record the admin user and timestamp for publish, close, reopen, assignment change, code rotation, and deletion.

### Acceptance Criteria

- Admin pages remain responsive with at least 100 historical exams and 100,000 attendance rows.
- Invalid direct API requests cannot bypass UI validation.
- Destructive actions are auditable and recoverable according to policy.

---

## Phase 7: Automated Testing and Quality Gates

**Goal:** Prevent regressions in the workflows that matter during an exam.

### 7.1 Unit tests

- [ ] Student ID normalization and OCR candidate extraction.
- [ ] Spreadsheet header aliases, blank rows, duplicate IDs, limits, and malformed files.
- [ ] Attendance state transitions and mismatch rules.
- [ ] Access-code normalization, generation, and hashing.
- [ ] Report/export classification of present, mismatch-present, and absent students.

### 7.2 API integration tests

- [ ] Authentication and authorization for every route.
- [ ] Correct-room mark, wrong-room redirect, wrong-room override, duplicate and not-found cases.
- [ ] Concurrent marks from multiple devices.
- [ ] Idempotent retries after simulated timeouts.
- [ ] Closed-exam and revoked-assignment behavior.
- [ ] Atomic import and assignment rollback.
- [ ] Rate limiting and structured errors.

### 7.3 Browser end-to-end tests

- [ ] Access-code login and room loading states.
- [ ] Manual lookup and marking.
- [ ] OCR result correction and re-lookup.
- [ ] Camera denied, camera ended, tab backgrounded, model timeout, offline and reconnect cases.
- [ ] Browser back behavior at every scanner state.
- [ ] Android Chrome, Samsung Internet, and iOS Safari device tests.

### 7.4 Load and soak tests

- [ ] Simulate 20 invigilators scanning concurrently.
- [ ] Simulate 1,000 students across multiple rooms.
- [ ] Run a 200-scan-per-device soak test.
- [ ] Measure database connections, query latency, function duration, error rate, and memory.
- [ ] Define failure thresholds that block release.

### 7.5 CI quality gates

- [ ] Type-check admin and shared web packages.
- [ ] Run unit and integration tests.
- [ ] Build the admin production bundle.
- [ ] Run dependency and secret scanning.
- [ ] Validate migrations against a temporary database.
- [ ] Prevent deployment when critical checks fail.

### Acceptance Criteria

- Critical attendance workflows cannot be merged without automated coverage.
- Concurrency, offline, and rollback tests pass consistently.
- CI produces a reproducible release result from a clean checkout.

---

## Phase 8: Observability and Operational Readiness

**Goal:** Detect failures before invigilators report them and make incidents diagnosable.

### 8.1 Structured telemetry

- [ ] Add structured server logs with request ID, route, duration, result code, region, and safe contextual identifiers.
- [ ] Never log access codes, passwords, tokens, full spreadsheet contents, or unnecessary student data.
- [ ] Add client error tracking for scanner crashes and unhandled promise rejections.
- [ ] Track OCR load, initialization, prediction, lookup, mark, sync, and camera recovery timings.

### 8.2 Dashboards and alerts

- [ ] Dashboard p50/p95/p99 lookup and mark latency.
- [ ] Dashboard API error rates and authentication failures.
- [ ] Dashboard OCR load failures by browser/device.
- [ ] Alert on elevated mark failures, database latency, function errors, email bounces, and scanner crashes.
- [ ] Create an exam-day health view showing active sessions, connected scanners, pending offline marks, and recent failures.

### 8.3 Operational runbooks

- [ ] Scanner unavailable or model CDN unavailable.
- [ ] Supabase paused, degraded, or unreachable.
- [ ] Vercel deployment/domain failure.
- [ ] Email delivery failure.
- [ ] Incorrect roster import.
- [ ] Invigilator code compromise.
- [ ] Pending offline marks after exam closure.
- [ ] Manual attendance fallback and later reconciliation.

### Acceptance Criteria

- A production error can be traced from the user-visible request ID to server and database activity.
- Alerts fire during controlled failure tests.
- Exam-day operators have a documented fallback for every critical dependency.

---

## Recommended Execution Sequence

1. Phase 0: baseline and staging.
2. Phase 1.1: region alignment as an isolated deployment.
3. Phase 1.2-1.5: immediate security hardening.
4. Phase 2: scanner lifecycle and iOS/browser reliability.
5. Phase 3: transactional database correctness and idempotency.
6. Phase 7 core tests for attendance and transactions, developed alongside Phase 3.
7. Phase 4: offline resilience.
8. Phase 5: email workflow reliability.
9. Phase 6: admin scale and validation.
10. Phase 7 remaining browser/load tests and CI gates.
11. Phase 8: complete observability and runbooks.

## Release Checkpoint After Every Phase

- [ ] Relevant automated tests pass.
- [ ] Admin production build passes.
- [ ] TypeScript checks pass for admin and shared web packages.
- [ ] Database migrations were tested in staging.
- [ ] Security and privacy impact reviewed.
- [ ] Performance compared with the Phase 0 baseline.
- [ ] Manual Android and iPhone scanner smoke tests pass.
- [ ] Rollback procedure verified.
- [ ] Deployment commit and production outcome recorded below.

## Deployment Log

| Phase | Commit | Staging verified | Production deployed | Result / notes |
| --- | --- | --- | --- | --- |
| 0 | `b1511d2` | Yes | No runtime change | Recovery tested; isolated staging seeded and verified. |
| 1 | `352af9e`, `9256bc8` | Yes, region alignment and legacy OCR removal | No | Staging functions execute in `sin1`; 150-request acceptance run passed. Removed OCR endpoint returns 404 while scanner and login remain healthy. |
| 2 |  |  |  |  |
| 3 |  |  |  |  |
| 4 |  |  |  |  |
| 5 |  |  |  |  |
| 6 |  |  |  |  |
| 7 |  |  |  |  |
| 8 |  |  |  |  |

## Current Status

- [x] Production audit completed.
- [x] Admin production build passes.
- [x] Admin TypeScript checks pass.
- [x] Supabase table connectivity verified.
- [x] Phase 0 started.
