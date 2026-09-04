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
- [x] Apply safe non-breaking dependency updates first (`ws` 8.21.3).
- [x] Review `sharp`, `postcss`, `protobufjs`, `ws`, and `exceljs` transitive advisories individually. Expo/native advisories are tracked separately from the web hardening scope.
- [x] Do not use `npm audit fix --force` without reviewing proposed breaking changes.
- [x] Regenerate the lockfile metadata and rerun the production build/type checks.
- [x] Record accepted build-only residual vulnerabilities with justification and review date.

Residual review (2026-08-27):

- Next.js is pinned to 15.5.21, which contains the available framework security fixes for this release line. The remaining `postcss` advisory is in Next's build pipeline, and the `sharp` advisory is in an optional dependency that is not exercised because the admin app does not use `next/image`.
- ExcelJS 4.4.0 still brings `uuid` and archive-related advisories. npm's suggested remediation downgrades ExcelJS to 3.4.0 and is not accepted. Spreadsheet values are bounded, formula injection is escaped on export, and uploaded workbooks are parsed server-side with row/cell limits.
- PaddleOCR's ONNX dependency still brings a moderate `protobufjs` advisory. The model remains browser-only and does not parse attacker-provided protobuf messages. It will be upgraded only after scanner compatibility testing.
- `npm audit` also traverses native/Expo packages in the monorepo. Those packages are excluded from this web-only phase and will be handled during the planned native rebuild.

### 1.4 Add baseline HTTP security headers

- [x] Disable `X-Powered-By`.
- [x] Add `X-Content-Type-Options: nosniff`.
- [x] Add an appropriate `Referrer-Policy`.
- [x] Prevent framing with report-only CSP `frame-ancestors` plus enforced `X-Frame-Options: DENY`.
- [x] Add a restrictive `Permissions-Policy`, allowing same-origin camera access while disabling microphone, geolocation, payment, and USB.
- [x] Introduce CSP in report-only mode first, including Supabase, jsDelivr ONNX assets, and Paddle model origins.
- [ ] Move to enforced CSP after verifying scanner, authentication, fonts, WASM, workers, and email links.

### 1.5 Rate-limit authentication surfaces

- [x] Add rate limiting to access-code verification by keyed IP and normalized-code hashes.
- [x] Add rate limiting to admin sign-in and password-reset requests.
- [x] Add temporary lockouts after repeated attempts.
- [x] Return generic credential and password-reset responses that do not disclose whether a code or email exists.
- [x] Log rate-limit events by scope and dimension without logging IPs, emails, or access codes.

Staging thresholds verified on 1 September 2026:

- Invigilator access: 120 attempts per address and 10 per normalized code in 10 minutes; a breach blocks that key for 10 minutes.
- Admin sign-in: 30 attempts per address and 8 per normalized email in 10 minutes; a breach blocks that key for 15 minutes.
- Password reset: 20 requests per address and 3 per normalized email per hour; a breach blocks that key for one hour.
- Address limits are intentionally higher to support university networks where many invigilators may share one public IP.

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

- [x] Replace the async `setInterval` loop with a self-scheduling loop or guarded timer.
- [x] Add an `ocrInFlight` guard so only one `predict()` call can run at a time.
- [x] Schedule the next scan only after the current scan completes or fails.
- [x] Prevent OCR from running while lookup, marking, review, manual mode, or navigation is active.
- [x] Measure scheduler cadence with a deterministic 200-cycle endurance test; physical OCR accuracy remains part of device acceptance.

### 2.2 Make ONNX initialization a controlled singleton

- [x] Maintain one model-loading promise per page session.
- [x] Prevent repeated taps or retries from starting parallel model loads.
- [x] Distinguish download, initialization, timeout, unsupported-browser, and memory errors.
- [x] Ensure a timeout cannot leave an untracked worker/model initialization running.
- [x] Dispose resources when leaving the scanner, including model loads that finish after unmount.
- [x] Provide `Retry OCR` and manual entry without reloading the whole page or reopening the camera.

### 2.3 Reduce iOS memory pressure

- [ ] Profile model initialization and repeated predictions on representative iPhones during final device acceptance.
- [x] Reuse preprocessing buffers instead of allocating grayscale and integral arrays every scan; a 200-frame identity test verifies reuse.
- [x] Cap crop dimensions at the OCR model's 640-pixel input limit.
- [x] Avoid retaining OCR result objects or canvases after use; canvas backing storage and preprocessing buffers are released on unmount.
- [x] Test WebAssembly SIMD capability before enabling it and provide a safe fallback.
- [x] Retain single-threaded main-page worker mode until representative device tests justify changing the currently working OCR backend.

### 2.4 Harden camera lifecycle

- [x] Handle `visibilitychange`, `pagehide`, `pageshow`, and track `ended` events.
- [x] Pause OCR work when the page is backgrounded.
- [x] Detect an ended camera track when returning to the app.
- [x] Resume automatically where safe or show a clear `Restart Camera` action.
- [x] Ensure torch state is reset when the camera track changes.

### 2.5 Replace brittle browser-back trapping

- [x] Model scanner navigation explicitly as login -> room selection -> camera -> review.
- [x] On browser back from review, cancel review and resume scanning.
- [x] On browser back from camera, stop the camera and return to room selection.
- [x] Avoid repeatedly pushing guard entries that can trap browser history.
- [ ] Verify Android Chrome, Samsung Internet, and iOS Safari navigation independently.

### 2.6 Add scanner recovery UI

- [x] Add a scanner-level React error boundary.
- [x] Restore valid invigilator authentication after a recoverable remount without accepting admin sessions.
- [x] Show actionable recovery choices for scanner remount, page reload, camera restart, OCR retry, and manual entry.
- [x] Never expose React stack traces on the invigilator recovery screen.

### 2.7 Add request cancellation and timeout behavior

- [x] Add `AbortController` timeouts to login, rooms, lookup, mark, and live-state requests.
- [x] Cancel obsolete requests when the room changes, the user signs out, or a newer request supersedes an older one.
- [x] Prevent stale responses from overwriting current scanner state.
- [x] Distinguish offline, authentication-expired, conflict, timeout, cancellation, and server errors; expired sessions stop the camera and clear stale room state.

### Phase 2 Verification Evidence

- Automated scanner suite: 12 tests passing.
- Endurance: 200 self-scheduled OCR cycles complete with a maximum concurrency of one.
- Memory discipline: 200 preprocessing frames reuse the same grayscale and integral buffers.
- Request resilience: supersession, timeout, cancel-all, offline, expired-authentication, conflict, and server cases pass.
- Navigation: busy, lookup, review, camera, and room-selection back actions pass as an exhaustive state matrix.
- Production build and TypeScript validation pass.
- Staging smoke check: `/scan` HTTP 200, synthetic access-code login HTTP 200, CSP report header present, function execution in `sin1`.
- Remaining acceptance gate: representative Android and iPhone camera/background/back testing against the staging deployment.

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

- [x] Implement a PostgreSQL function that validates:
  - authenticated user and role
  - active exam status
  - room belongs to the exam
  - invigilator is assigned to the marked room
  - student allocation exists in the exam
  - expected room belongs to the same exam
  - wrong-room override semantics
- [x] Insert attendance and any required incident in one transaction.
- [x] Preserve the unique `(exam_session_id, student_id)` constraint.
- [x] Return a structured result for marked, mismatch-marked, already-marked, redirected, and not-found outcomes.
- [x] Remove redundant application-layer database round trips after the RPC is verified.

Verification completed on staging on 1 September 2026:

- Rollback-only database tests passed for correct-room marking, concurrent-safe duplicate handling, wrong-room redirect, explicit mismatch override, not-found incidents, unauthorized rooms, and closed sessions.
- The admin production build and 12-test scanner suite pass with the repository using one `mark_attendance_atomic` RPC call.
- The deployed staging scanner and synthetic access-code login return HTTP 200.

### 3.2 Add idempotency

- [x] Add a client-generated request ID to mark and redirect operations.
- [x] Store or otherwise enforce uniqueness of the request ID.
- [x] Return the original result when the same request is retried.
- [x] Distinguish a retry from a separate duplicate scan.
- [x] Verify timeout-after-commit scenarios do not create misleading failures.

Verification completed on staging on 1 September 2026:

- Reusing the same request UUID returns the original response without adding attendance or incident rows.
- Reusing a request UUID with a changed payload is rejected, while a new UUID for the same student is classified as a separate duplicate scan.
- The web scanner retains its request UUID after timeout/error and clears it only after success or moving to the next student.
- Rollback-only atomic and idempotency database tests pass; the deployed scanner and synthetic access-code login remain healthy.

### 3.3 Strengthen relational constraints

- [x] Ensure marked and expected rooms belong to the attendance event's exam.
- [x] Ensure the student has an allocation in the same exam.
- [x] Ensure `room_mismatch`, `override_type`, expected room, and marked room remain logically consistent.
- [x] Add checks or triggers for incident room/session consistency.
- [x] Validate existing production rows before enabling new constraints.

Verification completed on staging on 1 September 2026:

- Read-only audits found zero relational-integrity violations in both staging and production; production was not modified.
- Staging rejects cross-session rooms, missing allocations, incorrect expected rooms, inconsistent mismatch flags, malformed wrong-room incidents, and incidents without their required attendance records.
- The full rollback-only atomic attendance, idempotency, and integrity-trigger suites pass with the triggers enabled.

### 3.4 Make imports atomic

- [x] Move exam session, room, and allocation creation into one transaction/RPC.
- [x] Roll back the entire import on duplicate students, invalid rooms, or allocation failure.
- [x] Return committed row counts from the database, not only parsed client counts.
- [x] Add an import checksum or summary for reconciliation.
- [x] Keep spreadsheet parsing outside the database but commit normalized rows atomically.

Verification completed on staging on 1 September 2026:

- Valid normalized imports commit the session, rooms, and allocations together and return database-confirmed counts.
- Duplicate students, unknown allocation rooms, invalid payload shapes, and a forced room-ID conflict are rejected without leaving a partial exam session.
- The API compares the committed counts and SHA-256 checksum with the normalized spreadsheet payload before reporting success.
- The admin production build passes with the repository using one `import_exam_session_atomic` RPC call.

### 3.5 Make room-assignment replacement atomic

- [x] Validate the complete room snapshot and invigilator IDs inside the transaction.
- [x] Check the optimistic concurrency snapshot/version.
- [x] Delete and insert assignments in one transaction.
- [x] Return the committed assignment snapshot to the UI.
- [x] Prevent a failed save from leaving rooms unassigned.

Verification completed on staging on 1 September 2026:

- The database validates a complete snapshot, session rooms, and invigilator roles while holding the exam-session lock.
- A stale optimistic snapshot is rejected and leaves the previously committed assignments unchanged.
- Assignment deletion and insertion occur in one transaction; validation or insert failure cannot leave rooms unassigned.
- The RPC returns the committed, sorted snapshot, which the API returns and the assignment wizard adopts as its new concurrency baseline.
- The rollback-only room-assignment tests, admin production build, and 13-test scanner regression suite pass.

### 3.6 Make access-code rotation consistent

- [x] Separate code generation from code activation.
- [x] Update authentication and application records with compensating rollback or a staged activation flow.
- [x] Never invalidate a working code merely because an email failed.
- [x] Decide whether code rotation should revoke existing sessions and implement that policy explicitly.
- [x] Record code-created, activated, emailed, and revoked timestamps without storing plaintext codes.

Verification completed on staging on 2 September 2026:

- Assignment-instruction emails no longer generate or rotate access codes; delivery failure therefore cannot invalidate a working credential.
- Replacement generation stores only a pending SHA-256 hash, and activation is a separate confirmed admin action.
- Authentication is updated before the pending hash is atomically promoted; the pending hash remains an API recovery path if final promotion must be retried.
- Code email is available only after activation and records its successful send timestamp.
- Existing authenticated scanner sessions intentionally remain active after rotation; the previous code stops working for new sign-ins.
- Rollback-only tests prove staging, failed activation, successful activation, email timestamping, and pending cancellation behavior without storing plaintext codes.
- The admin production build, 13-test scanner regression suite, deployed scanner, and original synthetic-code login pass.

### 3.7 Enforce exam state transitions

- [x] Define allowed transitions: draft -> active -> closed.
- [x] Decide whether closed -> active reopening is supported; reject it otherwise.
- [x] Require complete allocations and room assignments before publication.
- [x] Reject closing a draft unless explicitly supported.
- [x] Prevent permanent deletion of active exams.
- [x] Prefer soft deletion/archive for exams with attendance or incident history.

Implementation and verification:

- The `transition_exam_session` RPC locks the exam row and permits only draft-to-active and active-to-closed transitions.
- Publication is rejected unless the exam has rooms, every room has allocations, every allocation belongs to the same exam, and every room has an invigilator assignment.
- Closed exams cannot be reopened. Active and closed exams cannot be permanently deleted; only drafts without attendance or incident history can be deleted.
- The admin repository uses the enforced RPCs, and destructive controls expose only `Delete Draft` for eligible draft exams.
- Rollback-only staging tests verify incomplete publication failures, successful publication and closure, repeated-transition failures, reopen rejection, retained active/closed history, and valid draft deletion.
- The admin production build, 13-test scanner regression suite, deployed scanner, and synthetic invigilator login pass.

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

- [x] Persist pending attendance operations in IndexedDB before sending.
- [x] Include idempotency key, exam, room, student, source, comment, override, device, user, and queued timestamp.
- [x] Remove an item only after a confirmed server result.
- [x] Retry only retryable failures with bounded exponential backoff.
- [x] Pause retry on authentication, validation, closed-exam, or permission errors.
- [x] Display pending, syncing, failed, and conflict counts clearly.
- [x] Provide an admin/invigilator recovery view for unresolved items.

### 4.2 Communicate connectivity honestly

- [x] Replace the static `Connected` label with measured online/API state.
- [x] Show last successful server synchronization time.
- [x] Do not equate browser network status with backend reachability.
- [x] Display an explicit offline-marked/pending state instead of `Attendance marked` until durable persistence is guaranteed.

Implementation and verification:

- Every mark or redirect is written to IndexedDB before delivery with its stable request ID and complete audit metadata.
- Atomic IndexedDB leases prevent two tabs or flush loops from claiming the same item; queued work is scoped to its originating invigilator.
- Retryable network, timeout, throttling, and server failures use bounded exponential backoff. Authentication, validation, permission, and inactive-exam responses remain visible for manual recovery instead of retrying indefinitely.
- The scanner reports checking, connected, offline, unreachable, and synchronizing states separately and shows the last confirmed backend synchronization time.
- The recovery panel exposes queue counts, per-item errors, explicit retry, and guarded acknowledgement after the operator verifies the admin record.
- Nineteen scanner tests cover IndexedDB persistence across recreated outbox instances, exclusive simultaneous claims, outage/reconnection synchronization, stable idempotency keys, and retained closed-exam conflicts.
- The admin production build and TypeScript checks pass. Physical Android and iPhone outage testing remains deferred with the wider device acceptance pass.

### Acceptance Criteria

- Marks made during a controlled outage sync exactly once after reconnection.
- Closing an exam while a queue exists results in a visible conflict, not silent loss or infinite retries.
- Restarting the browser preserves pending operations.
- Two simultaneous flush attempts cannot duplicate or drop queue entries.

---

## Phase 5: Email and Operational Workflow Reliability

**Goal:** Ensure codes and assignment emails are consistent, traceable, retryable, and safe.

### 5.1 Stop rotating codes during ordinary email sends

- [x] Display and email the currently active code where policy permits, or explicitly generate/activate a new code as a separate admin action.
- [x] Do not regenerate every assigned invigilator's code when resending instructions.
- [x] Require confirmation before any action that invalidates an existing code.

### 5.2 Add email delivery records

- [x] Store recipient, exam, template version, provider message ID, requested time, accepted time, delivery status, and failure reason.
- [x] Process Resend delivery/bounce/complaint webhooks with signature verification.
- [x] Show accepted, delivered, bounced, complained, and unknown states in the admin interface.
- [x] Do not label provider acceptance as confirmed inbox delivery.

### 5.3 Make bulk email asynchronous and retryable

- [x] Replace the sequential request loop with a bounded background job or queue.
- [x] Return immediately with a job ID and progress state.
- [x] Retry transient provider failures without regenerating codes.
- [x] Allow retrying selected failed recipients.
- [x] Prevent duplicate sends through an idempotent job key.

### 5.4 Protect email reputation

- [x] Monitor SPF, DKIM, and DMARC status.
- [ ] Move DMARC from monitoring toward enforcement after reviewing reports.
- [x] Track bounce and complaint rates.
- [x] Keep a plain-text fallback and concise HTML template.
- [x] Provide a copyable manual fallback from the admin portal.

Staging verification completed on 3 September 2026:

- Access-code email was accepted by Resend and received by the test Hotmail mailbox.
- The signed Resend webhook recorded the provider delivery event in `email_webhook_events` and advanced the corresponding `email_deliveries` record to `delivered`.
- Both access-code email entry points use the same tracked, idempotent delivery service and distinguish provider acceptance from confirmed delivery.
- SPF and DKIM are verified for `exampulse.xyz`; DMARC remains deliberately in monitoring mode while the new domain establishes sending history.

### Acceptance Criteria

- Email failure never invalidates a previously working code.
- Resending instructions does not unexpectedly rotate credentials.
- Admin can identify exactly which recipients failed and safely retry only those recipients.
- Provider acceptance and actual delivery are represented separately.

---

## Phase 6: Admin Scalability, Validation, and UX Robustness

**Goal:** Keep the admin portal fast and predictable as historical data grows.

### 6.1 Paginate large data views

- [x] Add server-side pagination to attendance, incidents, mismatches, sessions, and invigilators.
- [x] Move search, room filter, status filter, and sorting into database queries.
- [x] Avoid loading all historical allocations merely to render one filtered page.
- [x] Keep export as a separate full-data operation.

Verification completed on staging on 3 September 2026:

- Attendance, incident, mismatch, session, and invigilator directories use bounded database pages with exact totals.
- Search, room/status/type filters, joins, and ordering execute in service-role-only database functions rather than over full browser or server datasets.
- The dashboard uses one bounded summary function and reports exact operational totals without loading every historical session, room, assignment, attendance event, or incident.
- Exam XLSX export remains an explicit full-data operation so reports are complete.
- Rollback-only database tests, admin TypeScript checks, the production build, and manual staging checks pass.

### 6.2 Tighten input validation

- [x] Validate UUIDs at the API boundary.
- [x] Validate exam dates as real dates and start times as valid local times.
- [x] Normalize room codes consistently, with a documented case/whitespace policy.
- [x] Validate email addresses and reject control characters.
- [x] Reject duplicate uploaded files and conflicting duplicate students with actionable file/row messages.
- [x] Validate committed import counts before allowing publication.

Verification completed on staging on 3 September 2026:

- Shared strict schemas reject malformed UUIDs, impossible calendar dates, invalid 24-hour times, malformed emails, control characters, oversized values, unknown fields, and invalid access-code payloads.
- Imported room codes follow one canonical policy: trim outer whitespace, collapse internal whitespace, and convert letters to uppercase.
- Multi-file imports reject byte-identical files and report both filenames and worksheet row numbers for duplicate or conflicting students.
- Publication compares committed import room/student counts with current database counts while holding the exam lock; legacy sessions received a one-time verification baseline.
- The exam setup page now loads only invigilators and the selected draft's rooms and assignments, not historical attendance, incidents, or allocations.
- Nine shared validation tests, admin/shared TypeScript checks, 21 scanner regressions, production builds, rollback-only database tests, and manual staging workflow checks pass.

### 6.3 Improve API contracts

- [x] Define stable error codes for unauthenticated, forbidden, validation, conflict, timeout, offline, and internal errors.
- [x] Return correct HTTP statuses: 401, 403, 404, 409, 422, 429, and 500 where appropriate.
- [x] Keep user-safe messages separate from internal diagnostic details.
- [x] Add a correlation/request ID to responses and logs.

Implementation evidence (2026-09-03):

- Middleware now accepts only valid UUID request IDs or creates one, forwards it to every API route, and returns it in the `x-request-id` response header.
- API failures use the stable `{ code, message, requestId }` contract while preserving the existing top-level `message` field for client compatibility.
- Scanner request errors retain server error codes and request IDs; browser timeout and offline failures use explicit `TIMEOUT` and `OFFLINE` codes.
- Known domain failures map to actionable 401/403/404/409/422/429 responses. Unknown database, workbook, and provider errors return a safe 500/503 message and log diagnostics with the request ID.
- Five API-contract tests, 22 scanner regression tests, TypeScript validation, and the production build pass.

### 6.4 Protect destructive operations

- [x] Require explicit confirmation containing the exam name for permanent deletion.
- [x] Block deletion of active exams.
- [x] Prefer archive/soft-delete when audit history exists.
- [x] Record the admin user and timestamp for publish, close, reopen, assignment change, code rotation, and deletion.

Implementation evidence (2026-09-03):

- Draft deletion requires the exact exam name in the UI, API request, and locked database operation; the legacy one-argument deletion function is removed.
- Only an admin actor can permanently delete a draft. Active exams must be closed, while closed exams and exams with attendance or incident history are retained.
- The append-only `admin_audit_events` ledger records actor, timestamp, action, entity, exam, and safe operation details in the same transaction as each privileged database operation.
- Service-role access to unaudited publish/close, assignment, and access-code rotation function signatures is revoked. Future closed-to-active transitions are classified as `exam_reopened`, although reopening is not currently offered by the app.
- Staging typed-deletion and immutable-audit migrations passed their rollback-only test suites on 2026-09-03.

### Acceptance Criteria

- Admin pages remain responsive with at least 100 historical exams and 100,000 attendance rows.
- Invalid direct API requests cannot bypass UI validation.
- Destructive actions are auditable and recoverable according to policy.

---

## Phase 7: Automated Testing and Quality Gates

**Goal:** Prevent regressions in the workflows that matter during an exam.

### 7.1 Unit tests

- [x] Student ID normalization and OCR candidate extraction.
- [x] Spreadsheet header aliases, blank rows, duplicate IDs, limits, and malformed files.
- [x] Attendance state transitions and mismatch rules.
- [x] Access-code normalization, generation, and hashing.
- [x] Report/export classification of present, mismatch-present, and absent students.

Implementation evidence (2026-09-03):

- OCR candidate extraction was moved from the React component into the tested scanner OCR runtime without changing behavior.
- Shared tests cover RMIT student-ID normalization and correct-room, wrong-room, redirect, override, duplicate, not-found, comments, and report classification.
- Server unit tests cover access-code normalization/generation/hashing and parse real XLSX buffers through the production ExcelJS parser.
- Spreadsheet regressions cover aliases, blank rows, row provenance, duplicate/conflicting IDs, missing columns, protected/legacy signatures, malformed content, and the 2,500-row limit.

### 7.2 API integration tests

- [x] Authentication and authorization for every route.
- [x] Correct-room mark, wrong-room redirect, wrong-room override, duplicate and not-found cases.
- [x] Concurrent marks from multiple devices.
- [x] Idempotent retries after simulated timeouts.
- [x] Closed-exam and revoked-assignment behavior.
- [x] Atomic import and assignment rollback.
- [x] Rate limiting and structured errors.

Verification evidence (2026-09-03):

- The deployed staging HTTP harness passed 19 unauthenticated-route checks, 14 invigilator-versus-admin authorization checks, and 10 functional/error-contract checks without changing application data.
- Rollback-only atomic attendance tests cover correct-room marks, wrong-room redirects and overrides, duplicate attempts, unknown students, closed exams, and revoked room access.
- Database idempotency tests reuse request identifiers after simulated client retries and reject reuse with a changed payload; scanner request tests retain the same identifier across timeout retries.
- Atomic import and room-assignment tests prove failed, conflicting, incomplete, and stale writes leave no partial committed state.
- Staging authentication rate limits were verified independently, and all tested API failures use the stable status, error-code, message, and request-ID contract.
- Two independently scheduled database sessions marked the same student concurrently: exactly one attendance event committed, the competing request returned `already_marked` with one `duplicate_attempt`, both idempotency records completed, and all test-tagged rows were removed afterward.

### 7.3 Browser end-to-end tests

- [x] Access-code login and room loading states.
- [x] Manual lookup and marking.
- [x] OCR result correction and re-lookup.
- [x] Camera denied, model timeout, offline and reconnect cases.
- [ ] Camera ended and tab background/resume behavior on physical devices.
- [x] Browser back behavior at scanner review and room states.
- [ ] Android Chrome, Samsung Internet, and iOS Safari device tests.

Automated staging evidence (2026-09-03):

- Playwright restores a real staging invigilator session and verifies assigned-room loading in desktop Chromium.
- Browser tests intercept attendance lookup and mark responses, covering manual lookup, successful marking, misread-ID correction, and re-lookup without writing attendance data.
- Camera denial leaves manual controls available and now displays the startup error; offline/online transitions recover the backend indicator.
- A deliberately stalled production OCR model request reaches the real 45-second timeout, leaves manual entry usable, and exposes the OCR retry control.
- Browser back cancels an open review and then returns to room selection without leaving `/scan`.
- Hardware camera termination, true mobile background/resume behavior, and browser-specific Android/iOS behavior remain explicit physical-device acceptance checks because headless fake media does not reproduce those lifecycle events faithfully.

### 7.4 Load and soak tests

- [x] Simulate 20 invigilators scanning concurrently.
- [x] Simulate 1,000 students across multiple rooms.
- [x] Run a 200-scan-per-device soak test.
- [x] Measure request latency, error rate, and load-client memory.
- [ ] Record provider-side database connections and Vercel function duration from their dashboards.
- [x] Define failure thresholds that block release.

Staging load evidence captured on 3 September 2026:

- The read-only harness performed 1,000 unique student lookups across 10 rooms through 20 concurrent authenticated invigilator workers with zero failures. Latency was 385 ms p50, 613 ms p95, 1,540 ms p99, and 3,894 ms maximum; process RSS decreased by 4 MiB.
- A representative authenticated device session then performed 200 sequential student lookups with zero failures. Latency was 396 ms p50, 536 ms p95, 1,049 ms p99, and 1,119 ms maximum; process RSS grew by 6 MiB.
- Concurrent release gates are zero errors, p95 at most 1,500 ms, p99 at most 3,000 ms, maximum request time at most 10 seconds, and RSS growth at most 128 MiB. Soak gates are zero errors, p95 at most 1,000 ms, p99 at most 2,000 ms, maximum request time at most 10 seconds, and RSS growth at most 64 MiB.
- The workload issued no attendance writes. Atomic and true concurrent mark behavior remains covered by the separate database and HTTP concurrency tests.
- Database connection peaks and provider-measured function duration require timestamp-correlated Supabase and Vercel dashboard evidence; they are not exposed to the staging application key.

### 7.5 CI quality gates

- [x] Type-check admin and shared web packages.
- [x] Run unit and integration tests.
- [x] Build the admin production bundle.
- [x] Run dependency and secret scanning.
- [x] Validate migrations against a temporary database.
- [ ] Prevent deployment when critical checks fail.

CI evidence captured on 3 September 2026:

- GitHub Actions workflow `Web release gate` runs on pushes and pull requests targeting `main` or `hardening/staging`.
- The hosted run for commit `86b854a` passed web type-checking, 49 unit/integration regressions, the admin production build, critical runtime dependency audit, full-history Gitleaks scanning, and the aggregate release gate.
- A disposable PostgreSQL 17 service recreates the minimum Supabase role/auth primitives, applies the base schema and all 17 migrations in filename order, reapplies every migration to verify idempotency, and confirms all seven core application tables exist.
- The critical audit gate reports existing lower-severity transitive advisories but blocks any critical runtime advisory. Unsafe forced downgrades remain prohibited.
- Playwright was upgraded from 1.51.1 to 1.55.1 to remove its browser-download certificate advisory; all eight staging browser tests passed afterward.
- On 4 September 2026, the owner confirmed adding `Release gate` to the staging project's Vercel Deployment Checks. Promotion enforcement still needs verification; repository branch protection is a separate setting and has not been confirmed.

### Acceptance Criteria

- Critical attendance workflows cannot be merged without automated coverage.
- Concurrency, offline, and rollback tests pass consistently.
- CI produces a reproducible release result from a clean checkout.

---

## Phase 8: Observability and Operational Readiness

**Goal:** Detect failures before invigilators report them and make incidents diagnosable.

### 8.1 Structured telemetry

First implementation slice (4 September 2026):

- Lookup and mark completion logs now emit allowlisted JSON with `event`, `requestId`, canonical `route`, `method`, `status`, `code`, `durationMs`, and `region`.
- Shared 5xx API handling no longer logs raw exception objects. Error records intentionally omit raw messages, stacks, request bodies, credentials, query strings, and student identifiers.
- Dynamic route identifiers are replaced by `:id`, and unknown paths/field values fail closed. Generated request IDs remain stable across repeated calls for the same Request object even without middleware.
- New tests cover correlation stability, field allowlisting, and rejection of sensitive/unknown telemetry values. Remaining API route timing, other logging call sites, client tracking, dashboards, and alerts are not yet complete.
- Local follow-up: access-code login, assigned-room loading, and room live-state refresh now use the same privacy-safe request timing format. Rate-limit early returns and caught errors retain their result codes; room identifiers and query strings are excluded. Added scanner route/error classification coverage. This slice is not pushed or deployed while the dependency-audit gate is unresolved; Phase 8 remains incomplete.

- [ ] Add structured server logs with request ID, route, duration, result code, region, and safe contextual identifiers.
- [ ] Never log access codes, passwords, tokens, full spreadsheet contents, or unnecessary student data.
- [ ] Add client error tracking for scanner crashes and unhandled promise rejections.
- [ ] Track OCR load, initialization, prediction, lookup, mark, sync, and camera recovery timings.

Local privacy follow-up (not deployed): assignment-email fallback failures no longer log recipient addresses or raw provider exceptions. Assignment-email completion logs distinguish queued (202), partial failure (207), unavailable (503), and validation/authentication outcomes. Admin response contents and delivery behaviour are unchanged. Other logging sites and monitoring remain to be completed.

### 8.2 Dashboards and alerts

- [ ] Dashboard p50/p95/p99 lookup and mark latency.
- [ ] Dashboard API error rates and authentication failures.
- [ ] Dashboard OCR load failures by browser/device.
- [ ] Alert on elevated mark failures, database latency, function errors, email bounces, and scanner crashes.
- [ ] Create an exam-day health view showing active sessions, connected scanners, pending offline marks, and recent failures.

### 8.3 Operational runbooks

Documentation checkpoint (4 September 2026): `docs/EXAM_DAY_RUNBOOKS.md` now covers all eight scenarios below, including owners, immediate fallback, recovery checks, privacy/environment safeguards, and rehearsal gaps. This is documentation-only; no controlled drills or production changes were performed. The boxes remain open until operational verification, including existing-session containment for compromised codes, is complete. Phase 8 is not complete.

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
| 2 | `128fdd1`, `6939bfe`, `b62e8e6`, `bab059e` | Automated suite/build/API smoke passed; physical devices pending | No | Implementation complete. Awaiting representative Android and iPhone acceptance before Phase 3 is activated. |
| 3 | `8e62a55` through `fd4842e` | Sections 3.1-3.7 database tests, admin build, scanner regressions, and deployed login smoke passed | No | Atomic attendance, idempotency, integrity, imports, room assignments, staged access-code rotation, and enforced exam lifecycle complete on staging. |
| 4 | `ab2ce7b` through `b35cd3a` | Automated IndexedDB persistence, simultaneous-claim, outage/reconnect, conflict, scanner regression, type, build, deployed scanner, and login checks passed; physical devices pending | No | Durable scanner outbox, safe retry classification, truthful connectivity state, and in-scanner recovery controls complete on staging. |
| 5 |  |  |  |  |
| 6 |  |  |  |  |
| 7 |  |  |  |  |
| 8 |  |  |  |  |

## Current Status

- [x] Production audit completed.
- [x] Admin production build passes.
- [x] Admin TypeScript checks pass.
- [x] Supabase table connectivity verified.
- [x] Phase 0 recovery and staging foundations established.
- [x] Phase 1 immediate hardening completed on staging.
- [x] Phase 2 implementation completed on staging.
- [ ] Phase 2 physical Android and iPhone acceptance completed (explicitly deferred by the project owner on 1 September 2026).
- [x] Phase 3 activated for staging-only development by project-owner exception; production remains unchanged.
- [x] Phase 3 transactional database correctness completed and verified on staging; production remains unchanged.
- [x] Phase 4 network-resilience implementation completed and verified on staging; physical device outage acceptance remains deferred.
- [x] Phase 5 email reliability implementation and end-to-end staging delivery tracking completed.
- [ ] Phase 5 DMARC enforcement completed after sufficient monitoring data is reviewed (intentionally deferred while the sending domain is new).
- [x] Phase 6.1 admin pagination and bounded dashboard queries completed and verified on staging.
- [x] Phase 6.2 strict API, import, and publication validation completed and verified on staging.
